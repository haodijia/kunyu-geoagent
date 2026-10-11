"""Checkpoint structure comes from the prompt saved with its actual request."""

from kunyu.agent.prompt_files import render_prompt


def checkpoint_headings(instruction: str) -> list[str]:
    headings = [line for line in instruction.splitlines() if line.startswith("## ")]
    if not headings or len(set(headings)) != len(headings):
        raise ValueError("Compaction prompt requires unique Markdown section headings.")
    return headings


def frame_summary(summary: str, template: str) -> str:
    return render_prompt(template, summary=summary)
