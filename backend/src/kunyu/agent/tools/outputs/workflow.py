"""Workflow output policies preserve outcomes and continuation references."""

from kunyu.agent.runtime.contracts.tool_output import (
    DataDisplay,
    StatusDisplay,
    TextDisplay,
)
from kunyu.agent.runtime.contracts.tools import ToolOutputContract
from kunyu.agent.tools.outputs.shared import (
    agent_content,
    compact,
    label,
    object_result,
    text,
)


def todo_display(result):
    return DataDisplay(
        kind="todos",
        summary=label("todos"),
        data=object_result(result),
        text=text(result),
    )


def todo_compact(result):
    return compact(label("todos"), object_result(result))


TODO = ToolOutputContract(agent_content, todo_display, todo_compact)


def question_display(result):
    return StatusDisplay(kind="none", summary=label("answered"))


def question_compact(result):
    return compact(label("answered"), object_result(result))


QUESTIONS = ToolOutputContract(agent_content, question_display, question_compact)


def plan_display(result):
    return TextDisplay(summary=label("plan"), text=label("plan"))


def plan_compact(result):
    return compact(label("plan"), object_result(result))


PLAN = ToolOutputContract(agent_content, plan_display, plan_compact)


def delegate_display(result):
    return StatusDisplay(kind="subagent", summary=label("children"))


def delegate_compact(result):
    return compact(label("children"), object_result(result))


DELEGATE = ToolOutputContract(agent_content, delegate_display, delegate_compact)


def control_display(result):
    return TextDisplay(summary=label("agent_control"), text=text(result))


def control_compact(result):
    return compact(label("agent_control"), object_result(result))


AGENT_CONTROL = ToolOutputContract(agent_content, control_display, control_compact)


def jobs_display(result):
    if not isinstance(result.result, list):
        raise TypeError("Job list requires a list result.")
    return TextDisplay(
        summary=label("jobs", count=len(result.result)),
        text="\n".join(
            row["label"]
            + " · "
            + label("job", status=label("job_state_" + row["status"]))
            + (
                " · "
                + label(
                    "job_error",
                    stage=label("job_stage_" + row["stage"]),
                    code=row["error"]["code"],
                    message=row["error"]["message"],
                )
                if row["error"] is not None
                else ""
            )
            for row in result.result
        ),
    )


def jobs_compact(result):
    return compact(jobs_display(result).summary, result.result)


JOBS = ToolOutputContract(agent_content, jobs_display, jobs_compact)


def job_display(result):
    data = object_result(result)
    error = data["job"]["error"]
    return TextDisplay(
        summary=label("job", status=label("job_state_" + data["job"]["status"])),
        text=label(
            "job_error",
            stage=label("job_stage_" + data["job"]["stage"]),
            code=error["code"],
            message=error["message"],
        )
        if error is not None
        else label("job", status=label("job_state_" + data["job"]["status"])),
    )


def job_compact(result):
    data = object_result(result)
    return compact(job_display(result).summary, data)


JOB = ToolOutputContract(agent_content, job_display, job_compact)


def skill_display(result):
    return TextDisplay(kind="code", summary=label("skill"), text=text(result))


def skill_compact(result):
    data = object_result(result)
    return compact(
        label("skill"),
        {
            "reload_required": True,
            "resource": {
                key: data[key]
                for key in ("name", "source", "provider", "resource_base", "path")
                if key in data
            },
        },
    )


SKILL = ToolOutputContract(agent_content, skill_display, skill_compact)


def memory_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("memory", count=data["returned_count"]),
        text="\n".join(row["content"] for row in data["items"]),
    )


def memory_compact(result):
    data = object_result(result)
    return compact(memory_display(result).summary, data)


MEMORY = ToolOutputContract(agent_content, memory_display, memory_compact)


def saved_display(result):
    return TextDisplay(summary=label("memory_saved"), text=label("memory_saved"))


def saved_compact(result):
    return compact(label("memory_saved"), object_result(result))


MEMORY_SAVED = ToolOutputContract(agent_content, saved_display, saved_compact)
