"""One-time schema 5 -> 6 conversion; runtime only accepts the new contract."""

import json

from sqlalchemy import Connection

from kunyu.agent.runtime.contracts.tool_content import TOOL_CONTENT_ADAPTER
from kunyu.agent.runtime.contracts.tools import ToolResult
from kunyu.agent.tools.outputs import filesystem, maps, mcp, oge, workflow


CONTRACTS = {
    "read": filesystem.READ,
    "read_image": filesystem.IMAGE,
    "glob": filesystem.SEARCH,
    "grep": filesystem.SEARCH,
    "write": filesystem.MUTATION,
    "edit": filesystem.MUTATION,
    "memory_read": workflow.MEMORY,
    "memory_write": workflow.MEMORY_SAVED,
    "skill": workflow.SKILL,
    "skill_resource": workflow.SKILL,
    "todo_write": workflow.TODO,
    "ask_user_question": workflow.QUESTIONS,
    "exit_plan_mode": workflow.PLAN,
    "subagent": workflow.DELEGATE,
    "wait_subagents": workflow.CHILDREN,
    "cancel_subagent": workflow.CHILDREN,
    "subagent_result": workflow.REPORT,
    "job_output": workflow.JOB,
    "job_list": workflow.JOBS,
    "job_kill": workflow.JOB,
    "oge_find_regions": oge.REGIONS,
    "oge_search_images": oge.IMAGERY,
    "oge_get_image_detail": oge.IMAGE_DETAIL,
    "oge_get_image_preview": oge.IMAGE_PREVIEW,
    "oge_list_my_data": oge.ASSETS,
    "oge_get_my_data_detail": oge.ASSET,
    "oge_search_operators": oge.OPERATORS,
    "oge_get_operator_definition": oge.OPERATOR,
    "oge_execute_code": oge.ANALYSIS,
    "oge_download_preview": oge.PREVIEW,
    "oge_download_result": oge.DOWNLOAD,
    "map_get_context": maps.CONTEXT,
    "map_present": maps.PRESENT,
    "map_set_layer_style": maps.STYLE,
    "list_mcp_resources": mcp.MCP,
    "list_mcp_resource_templates": mcp.MCP,
    "read_mcp_resource": mcp.MCP,
}


def migrate_tool_outputs(connection: Connection) -> None:
    connection.exec_driver_sql("ALTER TABLE tool_calls ADD COLUMN display JSON")
    connection.exec_driver_sql("ALTER TABLE tool_calls ADD COLUMN compact JSON")
    calls = {
        row.id: row.name
        for row in connection.exec_driver_sql("SELECT id, name FROM tool_calls")
    }
    events = connection.exec_driver_sql(
        "SELECT session_id, sequence, payload FROM session_events WHERE event_type = 'tool.completed'"
    ).all()
    for session_id, sequence, payload in events:
        value = json.loads(payload)
        call_id = value["tool_call_id"]
        name = calls[call_id]
        contract = mcp.MCP if name.startswith("mcp__") else CONTRACTS[name]
        result = ToolResult(
            result=value["result"],
            content=TOOL_CONTENT_ADAPTER.validate_python(value["content"]),
        )
        value["display"] = contract.frontend(result).model_dump(mode="json")
        value["compact"] = contract.compact(result).model_dump(mode="json")
        connection.exec_driver_sql(
            "UPDATE session_events SET payload = ? WHERE session_id = ? AND sequence = ?",
            (json.dumps(value, ensure_ascii=False), session_id, sequence),
        )
        connection.exec_driver_sql(
            "UPDATE tool_calls SET display = ?, compact = ? WHERE id = ?",
            (
                json.dumps(value["display"], ensure_ascii=False),
                json.dumps(value["compact"], ensure_ascii=False),
                call_id,
            ),
        )
    connection.exec_driver_sql("PRAGMA user_version = 6")
