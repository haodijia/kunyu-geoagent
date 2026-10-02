"""Local skill bundles, strict YAML metadata and bounded resource reads."""

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

import yaml

from kunyu.agent.skills.registry import (
    SkillDefinition,
    SkillSummary,
    validate_skill_name,
)

logger = logging.getLogger(__name__)
MAX_SKILL_BYTES = 128 * 1024


@dataclass(frozen=True, slots=True)
class SkillRoot:
    path: Path
    source: str
    rank: int


def read_text(path: Path) -> str:
    if not path.is_file():
        raise ValueError(f"Skill resources must be regular files: {path}")
    with path.open("rb") as file:
        content = file.read(MAX_SKILL_BYTES + 1)
    if len(content) > MAX_SKILL_BYTES:
        raise ValueError(f"Skill file exceeds the 128 KiB limit: {path}")
    return content.decode("utf-8")


def parse_skill(raw: str, path: Path, source: str, rank: int) -> SkillDefinition:
    if len(raw.encode("utf-8")) > MAX_SKILL_BYTES:
        raise ValueError("Skill instructions exceed the 128 KiB limit.")
    lines = raw.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"Skill file requires YAML frontmatter: {path}")
    closing = next(
        (index for index in range(1, len(lines)) if lines[index].strip() == "---"),
        None,
    )
    if closing is None:
        raise ValueError(f"Skill frontmatter is not closed: {path}")
    metadata = yaml.safe_load("".join(lines[1:closing]))
    if not isinstance(metadata, dict):
        raise ValueError(f"Skill frontmatter must be a mapping: {path}")  # noqa: TRY004 -- invalid document, not a caller type error
    name = metadata.get("name")
    description = metadata.get("description")
    if (
        not isinstance(name, str)
        or not isinstance(description, str)
        or not description.strip()
    ):
        raise ValueError(f"Skill frontmatter requires name and description: {path}")
    validate_skill_name(name)
    for key in (
        "disableModelInvocation",
        "userInvocable",
        "disable_model_invocation",
        "user_invocable",
    ):
        if key in metadata:
            raise ValueError(f"Unsupported skill invocation field '{key}': {path}")
    if len(description) > 2000:
        raise ValueError(f"Skill description exceeds 2000 characters: {path}")
    for key in ("disable-model-invocation", "user-invocable"):
        if key in metadata and not isinstance(metadata[key], bool):
            raise ValueError(f"Skill frontmatter '{key}' must be a boolean: {path}")
    content = "".join(lines[closing + 1 :]).strip()
    if not content:
        raise ValueError(f"Skill instructions must not be empty: {path}")
    return SkillDefinition(
        SkillSummary(
            name=name,
            description=description.strip(),
            source=source,
            locator=str(path),
            rank=rank,
            resource_base=str(path.parent),
            model_invocable=not metadata.get("disable-model-invocation", False),
            user_invocable=metadata.get("user-invocable", True),
        ),
        content,
    )


class FilesystemSkillProvider:
    def __init__(self, data_directory: Path, bundled_directory: Path) -> None:
        self.data_directory = data_directory.resolve()
        self._bundled_directory = bundled_directory.resolve()

    def roots(self, workspace_id: str) -> tuple[SkillRoot, ...]:
        roots = []
        if workspace_id:
            if Path(workspace_id).name != workspace_id or workspace_id in {".", ".."}:
                raise ValueError("Invalid workspace identifier for skills.")
            roots.append(
                SkillRoot(
                    self.data_directory / "workspaces" / workspace_id / "skills",
                    "workspace",
                    100,
                )
            )
        roots.extend(
            (
                SkillRoot(self.data_directory / "skills", "user", 400),
                SkillRoot(Path.home() / ".agents" / "skills", "user-agents", 500),
                SkillRoot(self._bundled_directory, "bundled", 600),
            )
        )
        return tuple(roots)

    async def list(self, *, workspace_id: str) -> tuple[SkillSummary, ...]:
        return await asyncio.to_thread(self._list, workspace_id)

    def _list(self, workspace_id: str) -> tuple[SkillSummary, ...]:
        summaries = []
        for root in self.roots(workspace_id):
            if not root.path.exists():
                continue
            names: set[str] = set()
            for entry in sorted(root.path.iterdir()):
                path = entry / "SKILL.md" if entry.is_dir() else entry
                if not path.is_file() or (not entry.is_dir() and entry.suffix != ".md"):
                    continue
                try:
                    definition = parse_skill(
                        read_text(path), path.resolve(), root.source, root.rank
                    )
                    if definition.summary.name in names:
                        raise ValueError(
                            f"Duplicate skill name in {root.path}: {definition.summary.name}"
                        )
                    names.add(definition.summary.name)
                    summaries.append(definition.summary)
                except (OSError, UnicodeError, ValueError, yaml.YAMLError):
                    logger.exception("Cannot discover skill %s", path)
                    raise
        return tuple(summaries)

    async def get(self, summary: SkillSummary, *, workspace_id: str) -> SkillDefinition:
        path = Path(summary.locator)
        roots = self.roots(workspace_id)
        if not any(
            root.source == summary.source and path.is_relative_to(root.path.resolve())
            for root in roots
        ):
            raise ValueError("Skill instructions are outside their source directory.")
        return await asyncio.to_thread(
            lambda: parse_skill(read_text(path), path, summary.source, summary.rank)
        )


def read_resource(summary: SkillSummary, relative_path: str) -> str:
    base = Path(summary.resource_base).resolve()
    relative = Path(relative_path)
    path = (base / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to(base):
        raise ValueError("Skill resources must stay inside the skill directory.")
    return read_text(path)
