"""Register analysis orchestration and map tools without a second Agent loop."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.tools.maps.tools import MapTool
from kunyu.agent.tools.oge.ndvi import NdviTool
from kunyu.agent.tools.oge.results import ResultTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.application.analysis import AnalysisService
from kunyu.application.analysis_supervisor import AnalysisSupervisor
from kunyu.integrations.analysis_raster import AnalysisRaster
from kunyu.integrations.oge.execution import ExecutionGateway
from kunyu.persistence.analysis import AnalysisRepository
from kunyu.persistence.maps import MapRepository
from kunyu.persistence.oge import OgeAccountStore


class AnalysisPlugin:
    name = "analysis"
    requires = (
        s.DATABASE,
        s.HTTP_CLIENT,
        s.TOOLS,
        s.CONTEXTS,
        s.ATTACHMENTS,
        s.JOBS,
        s.SCOPES,
    )
    provides = (s.ANALYSIS, s.MAPS)

    async def apply(self, context: Context) -> None:
        database = context.require(s.DATABASE)
        repository = AnalysisRepository(database)
        service = AnalysisService(
            repository,
            ExecutionGateway(
                context.require(s.HTTP_CLIENT), OgeAccountStore(database.path.parent)
            ),
            AnalysisRaster(database.path.parent),
        )
        maps = MapRepository(database, repository)
        context.provide(s.ANALYSIS, service)
        context.provide(s.MAPS, maps)
        supervisor = AnalysisSupervisor(service)
        supervisor.start()
        context.effect(supervisor.stop, before_children=True)
        tools = context.require(s.TOOLS)
        contexts = context.require(s.CONTEXTS)
        tools.register(
            context,
            "oge_calculate_ndvi",
            ToolRegistration(
                partial(
                    NdviTool,
                    contexts=contexts,
                    service=service,
                    jobs=context.require(s.JOBS),
                    scopes=context.require(s.SCOPES),
                )
            ),
        )
        for name in ("oge_download_preview", "oge_download_result"):
            tools.register(
                context,
                name,
                ToolRegistration(
                    partial(
                        ResultTool,
                        contexts=contexts,
                        service=service,
                        attachments=context.require(s.ATTACHMENTS),
                        name=name,
                    )
                ),
            )
        for name in (
            "map_get_context",
            "map_add_layer",
            "map_fit_bounds",
            "map_set_layer_style",
        ):
            tools.register(
                context,
                name,
                ToolRegistration(
                    partial(MapTool, contexts=contexts, maps=maps, name=name)
                ),
            )
