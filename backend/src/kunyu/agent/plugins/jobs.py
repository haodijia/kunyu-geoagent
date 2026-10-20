"""Generic job provider, model tools and harness-style completion delivery."""

import json
from functools import partial

from kunyu.agent.core import services as s
from kunyu.agent.core.scope import Context
from kunyu.agent.orchestration.jobs import JobRegistry
from kunyu.agent.prompts.loader import read_prompt
from kunyu.agent.runtime.contracts.context import PromptSection
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.workflow.jobs import JobTool
from kunyu.domain.execution.jobs import JobSnapshot
from kunyu.domain.execution.run_acceptance import ModelSelection, RunAcceptanceRequest
from kunyu.persistence.execution.jobs import SQLAlchemyJobStore


class JobsPlugin:
    name = "jobs-local"
    requires = (s.DATABASE, s.PROJECTIONS)
    provides = (s.JOBS,)

    async def apply(self, context: Context) -> None:
        jobs = JobRegistry(SQLAlchemyJobStore(context.require(s.DATABASE)))
        context.provide(s.JOBS, jobs)
        context.effect(jobs.close, before_children=True)


class JobToolsPlugin:
    name = "tool-jobs"
    requires = (s.JOBS, s.TOOLS, s.PROMPTS, s.CONTEXTS, s.AGENTS, s.SCHEDULER)
    provides = ()

    async def apply(self, context: Context) -> None:
        jobs, contexts = context.require(s.JOBS), context.require(s.CONTEXTS)

        async def deliver(owner: str, job: JobSnapshot) -> None:
            directory = context.require(s.AGENTS)
            agent = directory.get(owner)
            if agent is None or not agent.ctx.active:
                return
            turns = agent.turns()
            if not turns:
                raise RuntimeError("An owned job has no originating turn.")
            source = contexts.get(turns[-1].run.id)
            if source is None:
                raise RuntimeError("The job owner's model context is missing.")
            model = source.run.model_snapshot
            content = f"Background job {job.id} ({job.kind}: {job.label}) finished with status {job.status}. Read its output with job_output."
            if job.error is not None:
                content += f" Stage: {job.stage}. Error {job.error.code}: {job.error.message}. Full log: {job.log_file_path}."
            # Admission chooses busy next-step injection or idle followup under one lock.
            await context.require(s.SCHEDULER).notify(
                RunAcceptanceRequest(
                    session_id=owner,
                    idempotency_key=f"job-notice:{job.id}",
                    normalized_body=json.dumps(
                        {"source": "tool-jobs", "content": content}
                    ),
                    content=content,
                    source="tool-jobs",
                    model_selection=ModelSelection(
                        model.connection_id, model.model_id, model.reasoning_effort
                    ),
                    map_context=source.run.map_snapshot,
                ),
                lambda: agent.ctx.active and not jobs.store.delivered(job.id, owner),
            )

        jobs.attach_controller(deliver)
        context.effect(jobs.close, before_children=True)
        context.require(s.PROMPTS).register(
            context,
            PromptSection(
                "tool:jobs",
                65,
                lambda source: read_prompt("jobs.md"),
            ),
        )
        for name in ("job_output", "job_list", "job_kill"):
            context.require(s.TOOLS).register(
                context,
                name,
                ToolRegistration(
                    partial(JobTool, jobs=jobs, contexts=contexts, name=name),
                ),
            )
