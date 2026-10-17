"""Authenticated discovery of the user's uploaded OGE assets."""

from kunyu.agent.runtime.contracts.tools import ToolCall, ToolResult
from kunyu.agent.tools.oge.arguments import ListMyDataArguments, MyDataDetailArguments
from kunyu.agent.tools.oge.shared import OgeTool, oge_tool_error
from kunyu.agent.tools.shared import tool_result
from kunyu.application.analysis.oge import OgeService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.oge import OgeError


class ListMyDataTool(OgeTool[ListMyDataArguments]):
    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: OgeService
    ) -> None:
        super().__init__(
            run_id, contexts, service, "oge_list_my_data", ListMyDataArguments
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        arguments, _ = self.parse(call)
        try:
            page = await self._service.list_my_data(arguments.body())
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
                "assets": [
                    {
                        **asset.model_dump(mode="json"),
                        "reference": f"Personal:Asset:{asset.assetUuid}",
                    }
                    for asset in page.records
                ],
            }
        )


class MyDataDetailTool(OgeTool[MyDataDetailArguments]):
    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: OgeService
    ) -> None:
        super().__init__(
            run_id, contexts, service, "oge_get_my_data_detail", MyDataDetailArguments
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        arguments, _ = self.parse(call)
        try:
            return tool_result(await self._service.my_data_detail(arguments.asset_uuid))
        except OgeError as error:
            raise oge_tool_error(error) from None
