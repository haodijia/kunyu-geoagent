"""Paginated imagery discovery with compact, typed image summaries."""

from kunyu.agent.runtime.tools import ToolCall, ToolResult
from kunyu.agent.tools.oge.arguments import SearchImagesArguments
from kunyu.agent.tools.oge.shared import OgeTool, oge_tool_error
from kunyu.agent.tools.shared import tool_result
from kunyu.application.oge import OgeService
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.oge import OgeError


class SearchImagesTool(OgeTool[SearchImagesArguments]):
    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: OgeService
    ) -> None:
        super().__init__(
            run_id, contexts, service, "oge_search_images", SearchImagesArguments
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        arguments, _ = self.parse(call)
        try:
            page = await self._service.search_images(arguments.form())
        except OgeError as error:
            raise oge_tool_error(error) from None
        return tool_result(
            {
                "page": page.currentPage,
                "page_size": page.pageSize,
                "total": page.total,
                "pages": page.pages,
                "next_page": page.currentPage + 1
                if page.currentPage < page.pages
                else None,
                "images": [image.model_dump(mode="json") for image in page.records],
            }
        )
