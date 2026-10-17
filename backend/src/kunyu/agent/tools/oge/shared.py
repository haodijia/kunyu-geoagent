"""Common read-only OGE tool scope and validation."""

from collections.abc import Mapping

from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    ToolCall,
    ToolExecutionError,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.application.analysis.oge import OgeService
from kunyu.domain.conversation.agent_context import (
    RunContextRepository,
    RunContextSource,
)
from kunyu.domain.geospatial.oge import OgeError


class OgeTool[T: ToolArguments]:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: OgeService,
        name: str,
        arguments: type[T],
    ) -> None:
        self._run_id, self._contexts, self._service = run_id, contexts, service
        self._arguments = arguments
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
            timeout_ms=30_000,
            timeout_error_code="OGE_TIMEOUT",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    def parse(self, call: ToolCall) -> tuple[T, RunContextSource]:
        require_bound_call(call, self._run_id, self.spec.name)
        return (
            validate_model(self.spec.name, self._arguments, call.arguments),
            load_source(self._contexts, self._run_id),
        )


def oge_tool_error(error: OgeError) -> ToolExecutionError:
    return ToolExecutionError(str(error), code=error.code)
