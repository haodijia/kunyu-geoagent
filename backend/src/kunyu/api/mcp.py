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


@asynccontextmanager
async def mutation(service: McpManager, name: str):
    import asyncio

    async with service.locks.setdefault(name, asyncio.Lock()):
        try:
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
        service.repository.save(
            body.config, create=False, expected_revision=body.expected_revision
        )
        await service.activate(name)
        return service.view(name)


@router.put("/{name}/secrets")
async def set_secrets(name: str, body: McpSecretsRequest, service: Manager):
    async with mutation(service, name):
        service.repository.set_secrets(name, body.secrets, body.expected_revision)
        await service.activate(name)
        return service.view(name)


@router.post("/{name}/reconnect")
async def reconnect(name: str, service: Manager):
    async with mutation(service, name):
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
        connection = service.connections.pop(name, None)
        if connection is not None:
            await connection.stop()
        service.repository.delete(name)
    return Response(status_code=204)
