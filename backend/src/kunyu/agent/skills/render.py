"""Prompt rendering keeps catalog summaries separate from loaded instructions."""

from html import escape

from kunyu.agent.prompts.loader import prompt_text
from kunyu.agent.skills.definitions import (
    DirectoryResourceBase,
    OpaqueResourceBase,
    SkillDefinition,
    SkillSummary,
    UrlResourceBase,
)


def catalog_description(value: str, max_length: int) -> str:
    if type(max_length) is not int or max_length < 3:
        raise ValueError("Catalog description length must be an integer of at least 3.")
    value.encode("utf-8")
    normalized = " ".join(value.split())
    length = sum(2 if ord(char) > 0xFFFF else 1 for char in normalized)
    if length <= max_length:
        return normalized
    prefix, units = [], 0
    for char in normalized:
        size = 2 if ord(char) > 0xFFFF else 1
        if units + size > max_length - 3:
            break
        prefix.append(char)
        units += size
    return "".join(prefix) + "..."


def catalog_entries(
    skills: tuple[SkillSummary, ...], max_length: int
) -> list[dict[str, str]]:
    return [
        {
            "name": skill.name,
            "description": catalog_description(skill.description, max_length),
        }
        for skill in skills
    ]


def render_catalog(entries: list[dict[str, str]]) -> str:
    lines = [
        f'<skill name="{escape(entry["name"], quote=True)}">'
        f"{escape(entry['description'])}</skill>"
        for entry in entries
    ]
    return prompt_text("context.yaml", "skill_catalog", entries="\n".join(lines))


def render_skill(skill: SkillDefinition) -> str:
    summary = skill.summary
    base = summary.resource_base
    if base is None:
        resource_hint = prompt_text(
            "context.yaml", "skill_provider", provider=escape(summary.provider)
        )
    elif isinstance(base, DirectoryResourceBase):
        resource_hint = prompt_text(
            "context.yaml", "skill_directory", path=escape(base.path)
        )
    elif isinstance(base, UrlResourceBase):
        resource_hint = prompt_text("context.yaml", "skill_url", url=escape(base.url))
    elif isinstance(base, OpaqueResourceBase):
        resource_hint = prompt_text(
            "context.yaml", "skill_resources", description=escape(base.description)
        )
    else:
        raise TypeError("Unknown skill resource location.")
    return prompt_text(
        "context.yaml",
        "skill_content",
        name=escape(summary.name, quote=True),
        resources=resource_hint,
        instructions=skill.content,
    )
