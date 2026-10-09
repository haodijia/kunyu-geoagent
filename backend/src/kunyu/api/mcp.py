"""Authenticated MCP configuration and connection controls; no credential readback."""

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent.mcp.plugin import McpManager
from kunyu.api.errors import ApiError
from kunyu.domain.mcp import McpSecrets, McpServerConfig
from kunyu.persistence.mcp import McpBusyError, McpConflictError, McpRevisionError

router = APIRouter(prefix="/api/v1/mcp-servers", tags=["mcp"])


def manager(request: Request) -> McpManager:
    return request.app.state.mcp_manager


Manager = Annotated[McpManager, Depends(manager)]


class McpUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config: McpServerConfig
    expected_revision: int = Field(ge=1, strict=True)


class McpSecretsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    secrets: McpSecrets
    expected_revision: int = Field(ge=1, strict=True)


class McpOAuthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1, strict=True)


class McpOAuthCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    flow_id: str = Field(min_length=1, max_length=64)


@asynccontextmanager
async def mutation(service: McpManager, name: str, *, require_idle: bool = True):
    import asyncio

    async with service.locks.setdefault(name, asyncio.Lock()):
        try:
            if require_idle:
                service.repository.require_idle()
            yield
        except McpBusyError as error:
            raise ApiError(409, "MCP_BUSY", str(error)) from error
        except McpRevisionError as error:
            raise ApiError(409, "MCP_CONFIG_CHANGED", str(error)) from error
        except McpConflictError as error:
            raise ApiError(409, "MCP_NAME_EXISTS", str(error)) from error
        except LookupError as error:
            raise ApiError(404, "MCP_NOT_FOUND", str(error)) from error
        except ValueError as error:
            raise ApiError(422, "MCP_INVALID_CONFIG", str(error)) from error


@router.get("")
def list_servers(service: Manager):
    return [service.view(name) for name in service.repository.names()]


@router.post("", status_code=201)
async def create_server(body: McpServerConfig, service: Manager):
    async with mutation(service, body.name):
        service.repository.save(body, create=True)
        await service.activate(body.name)
        return service.view(body.name)


@router.put("/{name}")
async def update_server(name: str, body: McpUpdateRequest, service: Manager):
    if body.config.name != name:
        raise ApiError(422, "MCP_INVALID_CONFIG", "MCP namespaces cannot be renamed.")
    async with mutation(service, name):
        await cancel_current_login(service, name)
        service.repository.save(
            body.config, create=False, expected_revision=body.expected_revision
        )
        await service.activate(name)
        return service.view(name)


@router.put("/{name}/secrets")
async def set_secrets(name: str, body: McpSecretsRequest, service: Manager):
    async with mutation(service, name):
        await cancel_current_login(service, name)
        service.repository.set_secrets(name, body.secrets, body.expected_revision)
        await service.activate(name)
        return service.view(name)


@router.post("/{name}/reconnect")
async def reconnect(name: str, service: Manager):
    async with mutation(service, name):
        await cancel_current_login(service, name)
        row = service.repository.get(name)
        service.repository.save(
            row["config"].model_copy(update={"enabled": True}),
            create=False,
            expected_revision=row["revision"],
        )
        await service.activate(name)
        return service.view(name)


@router.delete("/{name}", status_code=204)
async def delete_server(name: str, service: Manager):
    async with mutation(service, name):
        await cancel_current_login(service, name)
        connection = service.connections.pop(name, None)
        if connection is not None:
            await connection.stop()
        service.repository.delete(name)
    return Response(status_code=204)


async def cancel_current_login(service: McpManager, name: str) -> None:
    attempt = service.oauth.attempts.get(name)
    if attempt is not None:
        await attempt.cancel()


@router.post("/{name}/oauth/login")
async def oauth_login(name: str, body: McpOAuthRequest, service: Manager):
    async with mutation(service, name):
        if service.repository.get(name)["revision"] != body.expected_revision:
            raise McpRevisionError(
                "OAuth configuration changed; reload before signing in."
            )
        return await service.oauth.begin(name)


@router.post("/{name}/oauth/cancel")
async def oauth_cancel(name: str, body: McpOAuthCancelRequest, service: Manager):
    async with mutation(service, name, require_idle=False):
        await service.oauth.cancel(name, body.flow_id)
        return service.view(name)


@router.post("/{name}/oauth/logout")
async def oauth_logout(name: str, body: McpOAuthRequest, service: Manager):
    async with mutation(service, name):
        row = service.repository.get(name)
        if row["config"].auth_mode != "oauth":
            raise ValueError("This MCP server does not use OAuth.")
        if row["revision"] != body.expected_revision:
            raise McpRevisionError(
                "OAuth configuration changed; reload before signing out."
            )
        await cancel_current_login(service, name)
        service.oauth.repository.clear(name, body.expected_revision)
        await service.activate(name)
        return service.view(name)
