"""Skill catalog queries and management of application-owned user bundles."""

import asyncio
import logging
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.skills.filesystem import parse_skill, read_text
from kunyu.agent.skills.registry import (
    SkillDefinition,
    SkillSummary,
    validate_skill_name,
)
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.sessions import SessionRepository

logger = logging.getLogger(__name__)
MAX_BUNDLE_BYTES = 10 * 1024 * 1024
MAX_BUNDLE_FILES = 200


class SkillConflictError(ValueError):
    pass


class SkillManagementService:
    def __init__(
        self, context: Context, sessions: SessionRepository, directory: Path
    ) -> None:
        self._context = context
        self._sessions = sessions
        self.directory = directory.resolve()
        self._mutation_lock = asyncio.Lock()

    def _view(self, session_id: str | None) -> tuple[Context, str]:
        if session_id is None:
            return self._context, ""
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        return self._context.require(s.SCOPES).for_session(
            session_id
        ), session.workspace_id

    async def list(self, session_id: str | None) -> tuple[SkillSummary, ...]:
        context, workspace_id = self._view(session_id)
        return await context.require(s.SKILLS).list(context, workspace_id=workspace_id)

    async def get(self, name: str) -> SkillDefinition:
        return await self._context.require(s.SKILLS).get(
            self._context, name, workspace_id=""
        )

    def editable(self, summary: SkillSummary) -> bool:
        return (
            summary.source == "user"
            and Path(summary.locator) == self.directory / summary.name / "SKILL.md"
        )

    async def raw(self, definition: SkillDefinition) -> str:
        return await asyncio.to_thread(read_text, Path(definition.summary.locator))

    async def save(self, name: str, content: str, *, create: bool) -> SkillDefinition:
        async with self._mutation_lock:
            return await self._save_definition(name, content, create=create)

    async def _save_definition(
        self, name: str, content: str, *, create: bool
    ) -> SkillDefinition:
        validate_skill_name(name)
        path = self.directory / name / "SKILL.md"
        definition = parse_skill(content, path, "user", 400)
        if definition.summary.name != name:
            raise ValueError("Skill name must match its frontmatter name.")
        if create:
            if any(skill.name == name for skill in await self.list(None)):
                raise SkillConflictError(f"Skill '{name}' already exists.")
        else:
            existing = await self.get(name)
            if not self.editable(existing.summary):
                raise SkillConflictError(
                    "This skill is read-only; edit its source directory."
                )
        await asyncio.to_thread(self._save, path, content, create)
        logger.info("Saved user skill %s", name)
        return definition

    def _save(self, path: Path, content: str, create: bool) -> None:
        path.parent.mkdir(parents=True, exist_ok=not create)
        temporary = path.parent / "SKILL.md.tmp"
        try:
            temporary.write_text(content, encoding="utf-8")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    async def import_bundle(self, source_path: str) -> SkillDefinition:
        async with self._mutation_lock:
            return await self._import_bundle(source_path)

    async def _import_bundle(self, source_path: str) -> SkillDefinition:
        source = Path(source_path).expanduser().resolve(strict=True)
        instructions = source / "SKILL.md" if source.is_dir() else source
        definition = await asyncio.to_thread(
            lambda: parse_skill(read_text(instructions), instructions, "user", 400)
        )
        name = definition.summary.name
        if any(skill.name == name for skill in await self.list(None)):
            raise SkillConflictError(f"Skill '{name}' already exists.")
        await asyncio.to_thread(self._import, source, name)
        logger.info("Imported user skill %s from %s", name, source)
        return await self.get(name)

    def _import(self, source: Path, name: str) -> None:
        files = list(source.rglob("*")) if source.is_dir() else [source]
        if any(path.is_symlink() for path in files):
            raise ValueError("Skill imports must not contain symbolic links.")
        regular_files = [path for path in files if path.is_file()]
        if any(not path.is_file() and not path.is_dir() for path in files):
            raise ValueError("Skill imports only accept regular files and directories.")
        if (
            len(regular_files) > MAX_BUNDLE_FILES
            or sum(path.stat().st_size for path in regular_files) > MAX_BUNDLE_BYTES
        ):
            raise ValueError("Skill imports must contain at most 200 files and 10 MiB.")
        self.directory.mkdir(parents=True, exist_ok=True)
        destination = self.directory / name
        if destination.exists():
            raise SkillConflictError(f"Skill '{name}' already exists.")
        with TemporaryDirectory(
            prefix="skill-import-", dir=self.directory
        ) as temporary:
            staged = Path(temporary) / name
            if source.is_dir():
                shutil.copytree(source, staged)
            else:
                staged.mkdir()
                shutil.copyfile(source, staged / "SKILL.md")
            staged.rename(destination)

    async def delete(self, name: str) -> None:
        async with self._mutation_lock:
            await self._delete(name)

    async def _delete(self, name: str) -> None:
        definition = await self.get(name)
        if not self.editable(definition.summary):
            raise SkillConflictError(
                "This skill is read-only; remove it from its source directory."
            )
        await asyncio.to_thread(shutil.rmtree, Path(definition.summary.resource_base))
        logger.info("Deleted user skill %s", name)
