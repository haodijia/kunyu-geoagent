"""Regression checks for one-shot OAuth callbacks and durable credential boundaries."""

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from kunyu.agent.mcp.oauth import McpOAuthManager
from kunyu.domain.mcp import McpServerConfig
from kunyu.integrations.mcp.oauth_callback import OAuthCallback, OAuthDenied
from kunyu.integrations.mcp.oauth_storage import StoredOAuthStorage
from kunyu.persistence.database import Database
from kunyu.persistence.mcp import McpRepository, McpRevisionError
from kunyu.persistence.mcp_oauth import McpOAuthRepository
from mcp.shared.auth import OAuthClientMetadata


def test_callback_rejects_wrong_state_and_replay_without_consuming_code():
    async def run():
        callback = OAuthCallback()
        uri = await callback.open(0)
        callback.state = "expected-state"
        try:
            async with httpx.AsyncClient() as browser:
                assert (
                    await browser.get(
                        uri, params={"state": "wrong", "code": "untrusted"}
                    )
                ).status_code == 400
                assert not callback.result.done()
                assert (
                    await browser.get(
                        uri, params={"state": "expected-state", "code": "accepted"}
                    )
                ).status_code == 200
                assert (await callback.result).code == "accepted"
                assert (
                    await browser.get(
                        uri, params={"state": "expected-state", "code": "replayed"}
                    )
                ).status_code == 400
        finally:
            await callback.close()
        with pytest.raises(OSError):
            await asyncio.open_connection("127.0.0.1", callback.port)

    asyncio.run(run())


def test_denied_callback_does_not_return_an_authorization_code():
    async def run():
        callback = OAuthCallback()
        uri = await callback.open(0)
        callback.state = "expected-state"
        try:
            async with httpx.AsyncClient() as browser:
                assert (
                    await browser.get(
                        uri,
                        params={"state": "expected-state", "error": "access_denied"},
                    )
                ).status_code == 200
            with pytest.raises(OAuthDenied):
                await callback.result
        finally:
            await callback.close()

    asyncio.run(run())


def test_expired_credentials_stay_expired_after_reopening_and_stale_writes_fail(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("KUNYU_APP_DATA_DIR", str(tmp_path))
    database = Database.open()
    config = McpServerConfig(
        name="geo",
        transport="streamable-http",
        url="https://geo.example/mcp",
        auth_mode="oauth",
        oauth={},
    )
    repo, oauth = McpRepository(database), McpOAuthRepository(database)
    repo.save(config, create=True)
    metadata = OAuthClientMetadata(
        client_name="Kunyu", redirect_uris=["http://127.0.0.1:12345/oauth/callback"]
    )
    expiry = datetime.now(UTC) - timedelta(seconds=10)
    value = {
        "tokens": {
            "access_token": "private-access",
            "token_type": "Bearer",
            "expires_in": 3600,
            "refresh_token": "private-refresh",
        },
        "client_info": {
            "client_id": "client",
            **metadata.model_dump(mode="json", exclude_none=True),
        },
        "client_metadata": metadata.model_dump(mode="json", exclude_none=True),
        "expires_at": expiry,
        "discovery": {
            "auth_server_url": None,
            "oauth_metadata": None,
            "protected_resource_metadata": None,
        },
    }
    oauth.commit("geo", config.url, 1, value)
    database.close()
    database = Database.open()
    try:
        repo, oauth = McpRepository(database), McpOAuthRepository(database)
        storage = StoredOAuthStorage(oauth, "geo", config.url, 2)
        assert asyncio.run(storage.get_tokens()).expires_in == 0
        manager = McpOAuthManager(SimpleNamespace(repository=repo))
        try:
            provider = manager.auth_for(config, 2)
            assert provider.context.token_expiry_time == expiry.timestamp()
            assert "private-access" not in str(manager.view(config))
            with pytest.raises(McpRevisionError):
                oauth.commit("geo", config.url, 1, value)
            assert (
                oauth.get("geo", config.url)["tokens"]["access_token"]
                == "private-access"
            )
        finally:
            asyncio.run(manager.close())
    finally:
        database.close()
