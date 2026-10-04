"""Convert flat assistant facts to indexed content and opaque replay envelopes."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, run_id, event_type, payload FROM session_events "
            "WHERE event_type IN ('request.header', 'model.attempt.finished', "
            "'tool.requested', 'message.assistant.delta', 'message.assistant.reasoning.delta') "
            "ORDER BY session_id, sequence"
        )
    ).all()
    calls: dict[tuple, list[dict]] = {}
    delivered: dict[tuple, int] = {}
    for _, run_id, kind, raw in rows:
        payload = json.loads(raw)
        key = (run_id, payload["step"], payload["attempt"])
        if kind == "tool.requested":
            calls.setdefault(key, []).append(
                {
                    "type": "tool-call",
                    "id": payload["provider_call_id"],
                    "name": payload["name"],
                    "arguments": json.dumps(
                        payload["arguments"], ensure_ascii=False, separators=(",", ":")
                    ),
                }
            )
        elif kind in {"message.assistant.delta", "message.assistant.reasoning.delta"}:
            delivered[key] = delivered.get(key, 0) + len(payload["text"])
    for identity, run_id, kind, raw in rows:
        if kind not in {"request.header", "model.attempt.finished"}:
            continue
        payload = json.loads(raw)
        key = (run_id, payload["step"], payload["attempt"])
        if kind == "request.header":
            for message in payload["messages"]:
                blocks = []
                reason = message.pop("reasoning_content", None)
                if reason:
                    blocks.append({"type": "reasoning", "text": reason})
                if message["content"]:
                    blocks.append({"type": "text", "text": message["content"]})
                for call in message.pop("tool_calls", []):
                    blocks.append(
                        {
                            "type": "tool-call",
                            "id": call["call_id"],
                            "name": call["name"],
                            "arguments": json.dumps(
                                call["arguments"],
                                ensure_ascii=False,
                                separators=(",", ":"),
                            ),
                        }
                    )
                message["content"], message["replay_state"] = blocks, None
        else:
            payload["blocks"] = _convert(
                payload, calls.get(key, []), delivered.get(key, 0)
            )
            payload["replay_state"] = None
        connection.execute(
            sa.text(
                "UPDATE session_events SET payload = :payload WHERE id = :identity"
            ),
            {
                "payload": json.dumps(payload, ensure_ascii=False, allow_nan=False),
                "identity": identity,
            },
        )


def _convert(payload: dict, calls: list[dict], limit: int) -> list[dict]:
    partials: dict[tuple, dict] = {}
    tool_ids: dict[str, tuple] = {}

    def ensure(kind: str, old_index: int) -> tuple[int, dict]:
        key = (kind, old_index)
        if key not in partials:
            partials[key] = (
                {"type": kind, "text": ""}
                if kind != "tool-call"
                else {"type": kind, "id": "", "name": "", "arguments": ""}
            )
        return tuple(partials).index(key), partials[key]

    for record in payload["stream"]:
        kind = record["type"]
        if kind == "chunk":
            chunk = record["chunk"]
            if chunk["type"] == "finish":
                chunk["replay_state"] = None
                continue
            if chunk["type"] == "usage":
                continue
            if chunk["type"] == "tool-call":
                key = tool_ids.get(chunk["call_id"], ("tool-call", len(tool_ids)))
                index, block = ensure(*key)
                arguments = chunk["arguments"]
                if block["arguments"]:
                    if json.loads(block["arguments"]) != json.loads(arguments):
                        raise ValueError(
                            "Historical tool fragments differ from their completed arguments."
                        )
                    arguments = block["arguments"]
                block.update(
                    id=chunk["call_id"],
                    name=chunk["name"],
                    arguments=arguments,
                )
                record["chunk"] = {
                    "type": "block-end",
                    "index": index,
                    "block": dict(block),
                }
                continue
            block_kind = (
                "tool-call"
                if chunk["type"] == "tool-call-delta"
                else chunk["type"].removesuffix("-delta")
            )
            old = chunk["index"]
            index, block = ensure(block_kind, old)
            chunk["index"] = index
            if block_kind == "tool-call":
                tool_ids[chunk["id"]] = (block_kind, old)
                block["id"] = chunk["id"]
                if chunk["name"] is not None:
                    block["name"] = chunk["name"]
                block["arguments"] += chunk["arguments_delta"]
            else:
                block["text"] += chunk["text"]
        else:
            block_kind = {
                "text-chunks": "text",
                "reasoning-chunks": "reasoning",
                "tool-call-chunks": "tool-call",
            }[kind]
            old = record["index"]
            index, block = ensure(block_kind, old)
            record["index"] = index
            if block_kind == "tool-call":
                tool_ids[record["id"]] = (block_kind, old)
                block["id"] = record["id"]
                if record["name"] is not None:
                    block["name"] = record["name"]
                block["arguments"] += "".join(record["args"])
            else:
                block["text"] += "".join(record["texts"])
    interrupted = (
        payload["outcome"] not in {"stop", "tool_calls", "length"}
        or payload["error_code"] == "OUTPUT_LIMIT"
    )
    result = []
    for block in partials.values():
        if block["type"] == "tool-call":
            if interrupted or payload["outcome"] == "length":
                continue
        else:
            if payload["error_code"] == "OUTPUT_LIMIT":
                block["text"] = block["text"][:limit]
                limit -= len(block["text"])
                if not block["text"]:
                    continue
            if interrupted and not block["text"].strip():
                continue
        result.append(block)
    if payload["stream_origin"] == "buffered" and payload["outcome"] == "tool_calls":
        result.extend(calls)
    return result


def downgrade() -> None:
    raise RuntimeError("Content blocks cannot be downgraded.")
