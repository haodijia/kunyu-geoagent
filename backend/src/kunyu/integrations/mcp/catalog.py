"""Complete, validated MCP tool generations and exact wire/public identities."""

import hashlib
import json
import re

from jsonschema import Draft202012Validator
from mcp import Client

MAX_CATALOG_TOOLS = 2000
MAX_CATALOG_BYTES = 2 * 1024 * 1024


def public_tool_name(server: str, raw: str) -> str:
    # Harness protocol aliases, never filesystem names (MIT; licenses/DeepSeek-LICENSE.txt).
    joined = f"mcp__{server}__{raw}"
    normalized = re.sub(r"[^A-Za-z0-9_-]", "_", joined)
    if normalized == joined and len(normalized) <= 64:
        return normalized
    suffix = hashlib.sha256(f"{server}\0{raw}".encode()).hexdigest()[:12]
    return f"{normalized[:51]}_{suffix}"


def validate_schema(schema: dict) -> None:
    Draft202012Validator.check_schema(schema)

    def check(value: object) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"$ref", "$dynamicRef"} and (
                    not isinstance(child, str) or not child.startswith("#")
                ):
                    raise ValueError("MCP schemas cannot resolve external references.")
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)

    check(schema)


async def discover_catalog(client: Client, server: str) -> dict:
    tools = []
    cursor = None
    cursors = set()
    names = set()
    public_names = set()
    if client.server_capabilities.tools is not None:
        while True:
            page = await client.list_tools(cursor=cursor, cache_mode="refresh")
            for tool in page.tools:
                if not tool.name or len(tool.name) > 512 or tool.name in names:
                    raise ValueError(
                        "MCP returned invalid or duplicate tool identities."
                    )
                public_name = public_tool_name(server, tool.name)
                if public_name in public_names:
                    raise ValueError("MCP public tool identities collide.")
                names.add(tool.name)
                public_names.add(public_name)
                validate_schema(tool.input_schema)
                if tool.output_schema is not None:
                    validate_schema(tool.output_schema)
                value = tool.model_dump(mode="json", by_alias=True, exclude_none=True)
                value["public_name"] = public_name
                tools.append(value)
            if (
                len(tools) > MAX_CATALOG_TOOLS
                or len(json.dumps(tools, ensure_ascii=False).encode())
                > MAX_CATALOG_BYTES
            ):
                raise ValueError("MCP tool catalog exceeds its limits.")
            cursor = page.next_cursor
            if cursor is None:
                break
            if cursor in cursors or not page.tools:
                raise ValueError("MCP tool pagination does not advance.")
            cursors.add(cursor)
    instructions = client.instructions
    if instructions is not None and len(instructions.encode()) > 32768:
        raise ValueError("MCP instructions exceed their limit.")
    return {
        "tools": sorted(tools, key=lambda item: item["name"]),
        "instructions": instructions,
        "server_info": client.server_info.model_dump(
            mode="json", by_alias=True, exclude_none=True
        )
        if client.server_info is not None
        else None,
        "capabilities": client.server_capabilities.model_dump(
            mode="json", by_alias=True, exclude_none=True
        ),
        "protocol_version": client.protocol_version,
    }
