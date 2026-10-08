"""Prompt rendering keeps catalog summaries separate from loaded instructions."""

from html import escape

from kunyu.agent.skills.registry import SkillDefinition, SkillSummary


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
    return (
        "<system-reminder>\n"
        "This is the complete current skill catalog and replaces earlier catalogs. "
        "Skills are task instructions, not executable tools. When a task names or "
        "clearly matches a skill, call skill with its exact name before following it. "
        "A directly invoked skill already supplies its full <skill_content> instructions; "
        "follow them without calling skill again for that skill. "
        "Read referenced text resources with skill_resource only when needed.\n"
        "<available_skills>\n" + "\n".join(lines) + "\n</available_skills>\n"
        "</system-reminder>"
    )


def render_skill(skill: SkillDefinition) -> str:
    summary = skill.summary
    return (
        f'<skill_content name="{escape(summary.name, quote=True)}">\n'
        "<skill_resources>\n"
        f"Resource base: {escape(summary.resource_base)}\n"
        "Use skill_resource with this skill name and a relative path to read "
        "explicitly referenced text resources. Loading a skill does not execute "
        "scripts or install dependencies.\n"
        "</skill_resources>\n<skill_instructions>\n"
        + skill.content
        + "\n</skill_instructions>\n</skill_content>"
    )
