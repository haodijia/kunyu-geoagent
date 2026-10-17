"""Full metadata for one OGE image; absent images are explicit failures."""

from kunyu.agent.runtime.contracts.tools import ToolCall, ToolResult
from kunyu.agent.tools.oge.arguments import ImageArguments
from kunyu.agent.tools.oge.shared import OgeTool, oge_tool_error
from kunyu.agent.tools.shared import tool_result
from kunyu.application.analysis.oge import OgeService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.oge import OgeError


class ImageDetailTool(OgeTool[ImageArguments]):
    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: OgeService
    ) -> None:
        super().__init__(
            run_id, contexts, service, "oge_get_image_detail", ImageArguments
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        arguments, _ = self.parse(call)
        try:
            return tool_result(await self._service.image_detail(arguments.image_id))
        except OgeError as error:
            raise oge_tool_error(error) from None
