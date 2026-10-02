"""Discover session commands, invoke exact handlers and download session logs."""

import io
import json
from typing import Literal
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent import services as s
from kunyu.agent.session_agent import SessionAgent
from kunyu.api.agent_dependencies import AgentDirectoryDependency
from kunyu.api.errors import ApiError
from kunyu.api.messages import AppendMessageRequest, EventResponse
from kunyu.domain.run_acceptance import ModelSelection, RunAcceptanceRequest
from kunyu.persistence.models import SessionRecord, WorkspaceRemovalRecord

router = APIRouter(prefix="/api/v1/sessions/{session_id}", tags=["commands"])


class CommandDescriptorResponse(BaseModel):
    definition_id: str
    name: str
    description: str
    input_hint: str | None
    kind: Literal["execute", "skill"]


class ExecuteCommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command_id: UUID
    line: str = Field(min_length=1, max_length=32768)
    message: AppendMessageRequest | None = None


class CommandResultResponse(BaseModel):
    kind: Literal["success", "error"]
    text: str
    source_event_sequence: int | None


def _session(
    agents: AgentDirectoryDependency, session_id: str, *, writable: bool = False
) -> tuple[SessionAgent, str]:
    agent = agents.for_session(session_id)
    with agent.ctx.require(s.DATABASE).sessions() as database_session:
        record = database_session.get(SessionRecord, session_id)
        if record is None:
            raise ApiError(404, "NOT_FOUND", "Session not found.")
        if writable and (
            record.archive is not None
            or database_session.get(WorkspaceRemovalRecord, record.workspace_id)
            is not None
        ):
            raise ApiError(409, "SESSION_ARCHIVED", "The session is read-only.")
        workspace_id = record.workspace_id
    return agent, workspace_id


@router.get("/commands", response_model=list[CommandDescriptorResponse])
async def list_commands(session_id: str, agents: AgentDirectoryDependency):
    agent, workspace_id = _session(agents, session_id)
    definitions = agent.ctx.require(s.COMMANDS).list(agent)
    rows = [
        CommandDescriptorResponse(
            definition_id=item.definition_id,
            name=item.name,
            description=item.description,
            input_hint=item.input_hint,
            kind="execute",
        )
        for item in definitions
    ]
    names = {item.name for item in definitions} | {"model"}
    skills = await agent.ctx.require(s.SKILLS).list(
        agent.ctx, workspace_id=workspace_id
    )
    for skill in skills:
        if not skill.user_invocable:
            continue
        if skill.name in names:
            raise ApiError(
                409,
                "COMMAND_CONFLICT",
                f"Skill command /{skill.name} conflicts with an installed command.",
            )
        rows.append(
            CommandDescriptorResponse(
                definition_id=f"skill/{skill.name}",
                name=skill.name,
                description=skill.description,
                input_hint="<任务需求>",
                kind="skill",
            )
        )
    return rows


@router.post("/commands", response_model=CommandResultResponse)
async def execute_command(
    session_id: str, body: ExecuteCommandRequest, agents: AgentDirectoryDependency
):
    agent, _ = _session(agents, session_id, writable=True)
    message = None
    if body.message is not None:
        request = body.message
        message = RunAcceptanceRequest(
            session_id=session_id,
            idempotency_key=str(body.command_id),
            normalized_body=json.dumps(
                body.model_dump(mode="json"), ensure_ascii=False, sort_keys=True
            ),
            content=request.content,
            model_selection=ModelSelection(
                request.model_selection.connection_id,
                request.model_selection.model_id,
                request.model_selection.reasoning_effort,
            ),
            map_context=request.map_context.model_dump(mode="json"),
        )
    try:
        result = await agent.ctx.require(s.COMMANDS).execute(
            agent, str(body.command_id), body.line, message
        )
    except ValueError as error:
        raise ApiError(422, "INVALID_COMMAND", str(error)) from error
    return CommandResultResponse(
        kind=result.kind,
        text=result.text,
        source_event_sequence=result.source_event_sequence,
    )


@router.get("/commands/export")
async def export_log(session_id: str, agents: AgentDirectoryDependency) -> Response:
    agent, _ = _session(agents, session_id)
    events = await agent.ctx.require(s.EVENTS).list_after(session_id, 0)
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "session.jsonl",
            "\n".join(
                EventResponse.from_domain(event).model_dump_json() for event in events
            )
            + "\n",
        )
    return Response(
        output.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="session-log.zip"'},
    )
