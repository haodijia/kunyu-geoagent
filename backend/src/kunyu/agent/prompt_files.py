"""Load deployment-authored prompt text; code supplies only structured values."""

import re
from functools import cache
from pathlib import Path

import yaml

PROMPT_DIRECTORY = Path(__file__).parent / "prompts"
_VARIABLE = re.compile(r"\{\{([^{}]*)\}\}")


@cache
def read_prompt(name: str) -> str:
    content = (PROMPT_DIRECTORY / name).read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError(f"Prompt must not be empty: {name}")
    return content


@cache
def _prompt_entries(name: str) -> dict[str, str]:
    entries = yaml.safe_load(read_prompt(name))
    if not isinstance(entries, dict) or any(
        not isinstance(key, str) or not isinstance(value, str) or not value.strip()
        for key, value in entries.items()
    ):
        raise ValueError(f"Prompt catalog must map names to nonempty text: {name}")
    return entries


def prompt_template(catalog: str, key: str) -> str:
    return _prompt_entries(catalog)[key].strip()


def render_prompt(template: str, **values: str) -> str:
    variables = set(_VARIABLE.findall(template))
    if variables != values.keys():
        raise ValueError("Prompt variables do not match the supplied values.")
    return _VARIABLE.sub(lambda match: values[match[1]], template)


def prompt_text(catalog: str, key: str, **values: str) -> str:
    return render_prompt(prompt_template(catalog, key), **values)


def tool_description(name: str) -> str:
    return prompt_text("tools.yaml", name)
