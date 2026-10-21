"""Compose HTTP feature routers in one place."""

from fastapi import APIRouter

from kunyu.api.conversation.attachments import router as attachments_router
from kunyu.api.conversation.commands import router as commands_router
from kunyu.api.conversation.messages import router as messages_router
from kunyu.api.conversation.sessions import router as sessions_router
from kunyu.api.execution.agent import router as agent_router
from kunyu.api.execution.confirmations import router as confirmations_router
from kunyu.api.execution.jobs import router as jobs_router
from kunyu.api.execution.plans import router as plans_router
from kunyu.api.execution.questions import router as questions_router
from kunyu.api.execution.subagents import router as subagents_router
from kunyu.api.geospatial.analysis import router as analysis_router
from kunyu.api.geospatial.assessments import router as assessments_router
from kunyu.api.geospatial.map_capture import router as map_capture_router
from kunyu.api.geospatial.map_locations import router as map_locations_router
from kunyu.api.settings.mcp import router as mcp_router
from kunyu.api.settings.models.routes import router as model_connections_router
from kunyu.api.settings.oge import router as oge_router
from kunyu.api.settings.skills import router as skills_router
from kunyu.api.system.routes import router as system_router
from kunyu.api.system.storage import router as storage_router
from kunyu.api.workspaces.files import router as workspace_files_router
from kunyu.api.workspaces.references import router as workspace_references_router
from kunyu.api.workspaces.routes import router as workspaces_router

router = APIRouter()
router.include_router(system_router)
router.include_router(storage_router)
router.include_router(model_connections_router)
router.include_router(oge_router)
router.include_router(analysis_router)
router.include_router(assessments_router)
router.include_router(map_capture_router)
router.include_router(map_locations_router)
router.include_router(jobs_router)
router.include_router(mcp_router)
router.include_router(confirmations_router)
router.include_router(questions_router)
router.include_router(plans_router)
router.include_router(agent_router)
router.include_router(commands_router)
router.include_router(skills_router)
router.include_router(subagents_router)
router.include_router(workspaces_router)
router.include_router(workspace_files_router)
router.include_router(workspace_references_router)
router.include_router(sessions_router)
router.include_router(messages_router)
router.include_router(attachments_router)
