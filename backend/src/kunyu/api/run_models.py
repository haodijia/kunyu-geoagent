from datetime import datetime
from typing import Literal

from pydantic import BaseModel, JsonValue

from kunyu.agent.runtime.tool_content import ToolContentBlock
from kunyu.domain.model_images import ModelImageInput
from kunyu.domain.model_reasoning import ReasoningParameters
from kunyu.domain.runs import Run, RunDetails, RunModelSnapshot, ToolCall


class ToolCallResponse(BaseModel):
    id: str
    session_id: str
    run_id: str
    message_id: str
    step: int
    attempt: int
    provider_call_id: str
    batch_index: int
    name: str
    arguments: dict[str, JsonValue]
    status: Literal["pending", "running", "completed", "failed", "cancelled"]
    result: JsonValue | None
    content: tuple[ToolContentBlock, ...]
    error_code: str | None
    error_summary: str | None
    created_at: datetime
    updated_at: datetime
    updated_sequence: int

    @classmethod
    def from_domain(cls, tool: ToolCall) -> "ToolCallResponse":
        return cls(
            id=tool.id,
            session_id=tool.session_id,
            run_id=tool.run_id,
            message_id=tool.message_id,
            step=tool.step,
            attempt=tool.attempt,
            provider_call_id=tool.provider_call_id,
            batch_index=tool.batch_index,
            name=tool.name,
            arguments=tool.arguments,
            status=tool.status.value,
            result=tool.result,
            content=tool.content,
            error_code=tool.error_code,
            error_summary=tool.error_summary,
            created_at=tool.created_at,
            updated_at=tool.updated_at,
            updated_sequence=tool.updated_sequence,
        )


class TurnBudgetResponse(BaseModel):
    max_model_calls: int
    model_calls: int
    max_tool_calls: int
    tool_calls: int
    max_active_milliseconds: int
    active_milliseconds: int
    max_output_codepoints: int
    output_codepoints: int
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None


class StepModelResponse(BaseModel):
    connection_id: str
    provider_type: str
    protocol: Literal["openai_compatible", "deepseek_messages", "openai_responses"]
    base_url: str
    auth_mode: Literal["api_key", "none"]
    model_id: str
    reasoning_effort: str | None
    reasoning_parameters: ReasoningParameters
    connection_revision: int
    max_tokens_field: Literal["max_tokens", "max_completion_tokens"]
    include_usage: bool
    max_output_tokens: int
    image_input: ModelImageInput

    @classmethod
    def from_domain(cls, snapshot: RunModelSnapshot) -> "StepModelResponse":
        return cls(
            connection_id=snapshot.connection_id,
            provider_type=snapshot.provider_type.value,
            protocol=snapshot.protocol.value,
            base_url=snapshot.base_url,
            auth_mode=snapshot.auth_mode.value,
            model_id=snapshot.model_id,
            reasoning_effort=snapshot.reasoning_effort,
            reasoning_parameters=snapshot.reasoning_parameters,
            connection_revision=snapshot.connection_revision,
            max_tokens_field=snapshot.max_tokens_field.value,
            include_usage=snapshot.include_usage,
            max_output_tokens=snapshot.max_output_tokens,
            image_input=snapshot.image_input,
        )


class AgentTurnResponse(BaseModel):
    id: str
    session_id: str
    user_message_id: str
    state: Literal[
        "ready",
        "model_running",
        "tool_running",
        "waiting_confirmation",
        "waiting_input",
        "interrupted",
        "completed",
        "failed",
        "cancelled",
    ]
    step: int
    attempt: int
    resume_phase: Literal["model", "tool"]
    next_tool_index: int
    requires_resume: bool
    queue_sequence: int | None
    pending_confirmation_id: str | None
    pause_reason: str | None
    model_snapshot: StepModelResponse
    map_context: dict[str, JsonValue]
    scene: dict[str, JsonValue] | None
    budget: TurnBudgetResponse
    tool_calls: list[ToolCallResponse]
    created_at: datetime
    updated_at: datetime
    updated_sequence: int

    @classmethod
    def from_domain(
        cls,
        run: Run,
        snapshot: RunModelSnapshot,
        tool_calls: tuple[ToolCall, ...],
    ) -> "AgentTurnResponse":
        return cls(
            id=run.id,
            session_id=run.session_id,
            user_message_id=run.user_message_id,
            state=run.state.value,
            step=run.step,
            attempt=run.attempt,
            resume_phase=run.resume_phase.value,
            next_tool_index=run.next_tool_index,
            requires_resume=run.requires_resume,
            queue_sequence=run.queue_sequence,
            pending_confirmation_id=run.pending_confirmation_id,
            pause_reason=run.pause_reason,
            model_snapshot=StepModelResponse.from_domain(snapshot),
            map_context=snapshot.map_context,
            scene=snapshot.scene,
            budget=TurnBudgetResponse(
                max_model_calls=run.budget.max_model_calls,
                model_calls=run.budget.model_calls,
                max_tool_calls=run.budget.max_tool_calls,
                tool_calls=run.budget.tool_calls,
                max_active_milliseconds=run.budget.max_active_milliseconds,
                active_milliseconds=run.budget.active_milliseconds,
                max_output_codepoints=run.budget.max_output_codepoints,
                output_codepoints=run.budget.output_codepoints,
                input_tokens=run.budget.input_tokens,
                output_tokens=run.budget.output_tokens,
                total_tokens=run.budget.total_tokens,
            ),
            tool_calls=[ToolCallResponse.from_domain(item) for item in tool_calls],
            created_at=run.created_at,
            updated_at=run.updated_at,
            updated_sequence=run.updated_sequence,
        )

    @classmethod
    def from_details(cls, details: RunDetails) -> "AgentTurnResponse":
        return cls.from_domain(
            details.run,
            details.model_snapshot,
            details.tool_calls,
        )
