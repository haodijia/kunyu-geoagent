"""Register analysis orchestration and map tools without a second Agent loop."""

import asyncio
from functools import partial

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.orchestration.analysis_jobs import AnalysisJobs
from kunyu.agent.tools.maps.results import ResultTool
from kunyu.agent.tools.maps.tools import MapTool
from kunyu.agent.tools.oge.execute_code import ExecuteCodeTool
from kunyu.agent.tools.oge.operators import OperatorTool
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.application.analysis.analysis import AnalysisService
from kunyu.application.analysis.analysis_supervisor import AnalysisSupervisor
from kunyu.application.analysis.map_capture import MapCaptureService
from kunyu.application.analysis.results import ResultService
from kunyu.integrations.geospatial.analysis_raster import AnalysisRaster
from kunyu.integrations.oge.execution import ExecutionGateway
from kunyu.persistence.geospatial.analysis import AnalysisRepository
from kunyu.persistence.geospatial.maps import MapRepository


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
        s.OGE,
    )
    provides = (s.ANALYSIS, s.MAPS, s.MAP_CAPTURES)

    async def apply(self, context: Context) -> None:
        database = context.require(s.DATABASE)
        repository = AnalysisRepository(database)
        service = AnalysisService(
            repository,
            ExecutionGateway(
                context.require(s.HTTP_CLIENT), context.require(s.OGE).auth
            ),
            AnalysisRaster(database.path.parent),
        )
        maps = MapRepository(database, repository)
        context.provide(s.ANALYSIS, service)
        context.provide(s.MAPS, maps)
        captures = MapCaptureService()
        context.provide(s.MAP_CAPTURES, captures)
        supervisor = AnalysisSupervisor(service)
        supervisor.start()
        context.effect(supervisor.stop, before_children=True)
        producer = AnalysisJobs(
            service, context.require(s.JOBS), context.require(s.SCOPES)
        )
        recovery = asyncio.create_task(producer.resume(), name="resume-analysis-jobs")

        async def stop_recovery() -> None:
            if not recovery.done():
                recovery.cancel()
            try:
                await recovery
            except asyncio.CancelledError:
                pass

        context.effect(stop_recovery, before_children=True)
        tools = context.require(s.TOOLS)
        contexts = context.require(s.CONTEXTS)
        tools.register(
            context,
            "oge_execute_code",
            ToolRegistration(
                partial(
                    ExecuteCodeTool,
                    contexts=contexts,
                    service=service,
                    producer=producer,
                    jobs=context.require(s.JOBS),
                )
            ),
        )
        for name in ("oge_search_operators", "oge_get_operator_definition"):
            tools.register(
                context,
                name,
                ToolRegistration(
                    partial(
                        OperatorTool,
                        contexts=contexts,
                        gateway=service.gateway,
                        name=name,
                    )
                ),
            )
        for name in ("result_get_info", "map_sample_raster", "map_region_statistics"):
            tools.register(
                context,
                name,
                ToolRegistration(
                    partial(
                        ResultTool,
                        contexts=contexts,
                        service=ResultService(service),
                        name=name,
                    )
                ),
            )
        for name in (
            "map_get_context",
            "map_present",
            "map_set_layer_style",
        ):
            tools.register(
                context,
                name,
                ToolRegistration(
                    partial(
                        MapTool,
                        contexts=contexts,
                        maps=maps,
                        captures=captures,
                        attachments=context.require(s.ATTACHMENTS),
                        name=name,
                    )
                ),
            )
