"""Explicit MCP configuration, separate from credentials and live connection state."""

import re
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator


class McpValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class McpReconnect(McpValue):
    enabled: bool = Field(default=True, strict=True)
    initial_delay_ms: int = Field(default=500, ge=1, le=300_000, strict=True)
    max_delay_ms: int = Field(default=30_000, ge=1, le=300_000, strict=True)
    max_attempts: int = Field(default=10, ge=1, le=100, strict=True)

    @model_validator(mode="after")
    def validate_delay(self) -> Self:
        if self.initial_delay_ms > self.max_delay_ms:
            raise ValueError("Initial reconnect delay exceeds its maximum.")
        return self


class McpServerConfig(McpValue):
    name: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    transport: Literal["stdio", "streamable-http"]
    url: str | None = Field(default=None, max_length=2048)
    command: str | None = Field(default=None, min_length=1, max_length=4096)
    args: tuple[str, ...] = ()
    cwd: str | None = Field(default=None, max_length=4096)
    enabled: bool = Field(default=False, strict=True)
    tool_timeout_ms: int = Field(default=60_000, ge=1000, le=300_000, strict=True)
    read_only_tools: tuple[str, ...] = ()
    reconnect: McpReconnect = Field(default_factory=McpReconnect)

    @model_validator(mode="after")
    def validate_transport(self) -> Self:
        if self.transport == "stdio":
            if self.url is not None or self.command is None:
                raise ValueError("Stdio requires a command and no HTTP URL.")
            if not self.command.strip():
                raise ValueError("MCP command must be nonempty.")
            if (
                self.cwd is not None
                and not self.cwd.startswith(("/", "\\"))
                and not re.match(r"^[A-Za-z]:[\\/]", self.cwd)
            ):
                raise ValueError("MCP working directory must be absolute.")
        else:
            if (
                self.url is None
                or self.command is not None
                or self.args
                or self.cwd is not None
            ):
                raise ValueError("HTTP requires a URL and no process configuration.")
            parsed = urlsplit(self.url)
            if any(character.isspace() for character in self.url) or "\0" in self.url:
                raise ValueError("MCP URL contains invalid characters.")
            if (
                parsed.scheme not in {"http", "https"}
                or parsed.hostname is None
                or parsed.username is not None
                or parsed.password is not None
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    "MCP URL must be an HTTP endpoint without credentials or query parameters."
                )
            _ = parsed.port
        if any(
            "\0" in value for value in (*self.args, self.command or "", self.cwd or "")
        ):
            raise ValueError("MCP process arguments cannot contain NUL.")
        if len(self.args) > 100 or any(len(arg) > 8192 for arg in self.args):
            raise ValueError("MCP process arguments exceed their limits.")
        if len(set(self.read_only_tools)) != len(self.read_only_tools) or any(
            not item or len(item) > 512 for item in self.read_only_tools
        ):
            raise ValueError("Read-only tools must have unique exact upstream names.")
        return self


class McpSecrets(McpValue):
    headers: dict[str, str] = Field(default_factory=dict)
    env: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_secrets(self) -> Self:
        reserved = {
            "host",
            "connection",
            "content-length",
            "content-type",
            "accept",
            "mcp-session-id",
            "mcp-protocol-version",
            "last-event-id",
        }
        if len(self.headers) > 30 or len(self.env) > 50:
            raise ValueError("Too many MCP credentials.")
        if len({key.lower() for key in self.headers}) != len(self.headers):
            raise ValueError("HTTP headers must be unique irrespective of case.")
        for key, value in self.headers.items():
            if (
                not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}", key)
                or key.lower() in reserved
                or any(char in value for char in "\r\n\0")
                or len(value) > 8192
            ):
                raise ValueError("Invalid MCP HTTP credential header.")
        for key, value in self.env.items():
            if (
                not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", key)
                or "\0" in value
                or len(value) > 8192
            ):
                raise ValueError("Invalid MCP environment credential.")
        return self
