"""Resolve names to OGE codes without sending the whole region tree to the model."""

from kunyu.agent.tools.outputs.oge import REGIONS

from kunyu.agent.runtime.contracts.tools import ToolCall, ToolResult
from kunyu.agent.tools.oge.arguments import FindRegionsArguments
from kunyu.agent.tools.oge.shared import OgeTool, oge_tool_error
from kunyu.agent.tools.shared import tool_result
from kunyu.application.analysis.oge import OgeService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.oge import OgeError


class FindRegionsTool(OgeTool[FindRegionsArguments]):
    output_contract = REGIONS

    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: OgeService
    ) -> None:
        super().__init__(
            run_id, contexts, service, "oge_find_regions", FindRegionsArguments
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        arguments, _ = self.parse(call)
        try:
            return tool_result(
                await self._service.find_regions(
                    arguments.query,
                    arguments.parent_name,
                    arguments.match_mode,
                    arguments.offset,
                    arguments.limit,
                )
            )
        except OgeError as error:
            raise oge_tool_error(error) from None
