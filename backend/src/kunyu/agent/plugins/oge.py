"""Expose OGE's account service and scoped, read-only discovery tools."""

from functools import partial

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.tools.oge.find_regions import FindRegionsTool
from kunyu.agent.tools.oge.image_detail import ImageDetailTool
from kunyu.agent.tools.oge.image_preview import ImagePreviewTool
from kunyu.agent.tools.oge.my_data import ListMyDataTool, MyDataDetailTool
from kunyu.agent.tools.oge.search_images import SearchImagesTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.application.analysis.oge import OgeService
from kunyu.integrations.oge.client import OgeClient
from kunyu.persistence.geospatial.oge import OgeAccountStore


class OgePlugin:
    name = "oge"
    requires = (s.DATABASE, s.HTTP_CLIENT, s.TOOLS, s.CONTEXTS, s.ATTACHMENTS)
    provides = (s.OGE,)

    async def apply(self, context: Context) -> None:
        service = OgeService(
            OgeClient(context.require(s.HTTP_CLIENT)),
            OgeAccountStore(context.require(s.DATABASE)),
        )
        context.provide(s.OGE, service)
        for name, tool in (
            ("oge_find_regions", FindRegionsTool),
            ("oge_search_images", SearchImagesTool),
            ("oge_get_image_detail", ImageDetailTool),
            ("oge_list_my_data", ListMyDataTool),
            ("oge_get_my_data_detail", MyDataDetailTool),
        ):
            context.require(s.TOOLS).register(
                context,
                name,
                ToolRegistration(
                    partial(
                        tool,
                        contexts=context.require(s.CONTEXTS),
                        service=service,
                    )
                ),
            )
        context.require(s.TOOLS).register(
            context,
            "oge_get_image_preview",
            ToolRegistration(
                partial(
                    ImagePreviewTool,
                    contexts=context.require(s.CONTEXTS),
                    service=service,
                    attachments=context.require(s.ATTACHMENTS),
                )
            ),
        )
