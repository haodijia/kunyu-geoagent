"""Run projection snapshot; derived exclusively from committed events."""

from kunyu.agent.runtime.projection.run_state import (
    ReducedAssistant,
    ReducedBudget,
    ReducedConfirmation,
    ReducedRun,
    ReducedToolCall,
    _State,
)


def _freeze(state: _State) -> ReducedRun:
    budget = state.budget
    return ReducedRun(
        run_id=state.run_id,
        session_id=state.session_id,
        user_message_id=state.user_message_id,
        state=state.state,
        step=state.step,
        attempt=state.attempt,
        resume_phase=state.resume_phase,
        next_tool_index=state.next_tool_index,
        requires_resume=state.requires_resume,
        queue_sequence=state.queue_sequence,
        pending_confirmation_id=state.pending_confirmation_id,
        pending_question_id=state.pending_question_id,
        questions=tuple(state.questions.values()),
        pause_reason=state.pause_reason,
        model_snapshot=state.model_snapshot,
        request_snapshot=state.request_snapshot,
        admitted_steps=frozenset(state.admitted_steps),
        decisions=tuple(state.decisions),
        map_snapshot=state.map_snapshot,
        scene_snapshot=state.scene_snapshot,
        budget=ReducedBudget(
            model_calls=budget.model_calls,
            tool_calls=budget.tool_calls,
            max_active_milliseconds=budget.max_active_milliseconds,
            active_milliseconds=budget.active_milliseconds,
            output_codepoints=budget.output_codepoints,
            input_tokens=budget.input_tokens,
            output_tokens=budget.output_tokens,
            total_tokens=budget.total_tokens,
        ),
        assistants=tuple(
            ReducedAssistant(
                message_id=item.message_id,
                source_model=item.source_model,
                step=item.step,
                attempt=item.attempt,
                content=item.content,
                reasoning_content=item.reasoning_content,
                blocks=item.blocks,
                replay_state=item.replay_state,
                status=item.status,
                finish_reason=item.finish_reason,
                created_at=item.created_at,
                updated_at=item.updated_at or item.created_at,
                created_sequence=item.created_sequence,
                updated_sequence=item.updated_sequence,
            )
            for item in sorted(
                state.assistants.values(), key=lambda value: value.created_sequence
            )
        ),
        tool_calls=tuple(
            ReducedToolCall(
                tool_call_id=item.tool_call_id,
                provider_call_id=item.provider_call_id,
                message_id=item.message_id,
                step=item.step,
                attempt=item.attempt,
                batch_index=item.batch_index,
                name=item.name,
                arguments=item.arguments,
                status=item.status,
                result=item.result,
                content=item.content,
                error_code=item.error_code,
                error_summary=item.error_summary,
                created_at=item.created_at,
                updated_at=item.updated_at or item.created_at,
                created_sequence=item.created_sequence,
                updated_sequence=item.updated_sequence,
            )
            for item in sorted(
                state.tools.values(), key=lambda value: value.created_sequence
            )
        ),
        confirmations=tuple(
            ReducedConfirmation(
                confirmation_id=item.confirmation_id,
                tool_call_id=item.tool_call_id,
                workspace_id=item.workspace_id,
                name=item.name,
                arguments=item.arguments,
                summary=item.summary,
                side_effect=item.side_effect,
                execution=item.execution,
                binding=item.binding,
                status=item.status,
                decided_at=item.decided_at,
                created_at=item.created_at,
                updated_at=item.updated_at or item.created_at,
                created_sequence=item.created_sequence,
                updated_sequence=item.updated_sequence,
            )
            for item in sorted(
                state.confirmations.values(),
                key=lambda value: value.created_sequence,
            )
        ),
        created_at=state.created_at,
        updated_at=state.updated_at,
        created_sequence=state.created_sequence,
        updated_sequence=state.updated_sequence,
    )
