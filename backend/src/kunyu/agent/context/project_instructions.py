"""Optional AGENTS.md snapshots over the managed filesystem's accessed directories."""

from contextlib import closing
from html import escape
from threading import Event

from kunyu.agent.context.runtime_context import snapshot_payload
from kunyu.agent.prompts.loader import prompt_text
from kunyu.agent.runtime.events.session import ContextInjectedPayload
from kunyu.domain.conversation.agent_context import RunContextSource
from kunyu.domain.workspaces.filesystem import (
    Filesystem,
    FilesystemError,
    FilesystemScope,
    FsTarget,
)
from kunyu.integrations.filesystem.operation import filesystem_operation

MAX_INSTRUCTION_BYTES = 128 * 1024


def instruction_targets(
    source: RunContextSource, filesystem: Filesystem
) -> tuple[FsTarget, ...]:
    scope = FilesystemScope(source.workspace.id, source.session.id)
    paths = {"/workspace/AGENTS.md"}
    for run in source.reduced_session.runs:
        if run.created_sequence > source.run.created_sequence:
            continue
        for call in run.tool_calls:
            if (
                call.name not in {"read", "write", "edit", "read_image"}
                or call.status != "completed"
            ):
                continue
            path = call.arguments["file_path"]
            if not isinstance(path, str):
                raise TypeError("A completed file tool must own a text file_path.")
            if path.startswith("/attachments/"):
                continue
            target = filesystem.resolve(path, scope)
            for depth in range(1, len(target.parts)):
                paths.add(
                    "/workspace/" + "/".join((*target.parts[:depth], "AGENTS.md"))
                )
    return tuple(
        filesystem.resolve(path, scope)
        for path in sorted(paths, key=lambda path: (path.count("/"), path))
    )


def read_instructions(
    targets: tuple[FsTarget, ...], filesystem: Filesystem, cancelled: Event
) -> list[dict[str, str]]:
    files = []
    size = 0
    for target in targets:
        before = filesystem.stat(target, cancelled)
        if before is None:
            continue
        if before.kind != "file":
            raise FilesystemError(
                "FS_NOT_REGULAR_FILE",
                f"Project instructions must be a regular file: {target.display_path}",
            )
        chunks = []
        with closing(filesystem.stream_text(target, cancelled)) as stream:
            for chunk in stream:
                size += len(chunk.encode("utf-8"))
                if size > MAX_INSTRUCTION_BYTES:
                    raise FilesystemError(
                        "FS_TOO_LARGE",
                        "Project instructions exceed the 128 KiB context limit.",
                    )
                chunks.append(chunk)
        if filesystem.stat(target, cancelled) != before:
            raise FilesystemError(
                "FS_STALE_VERSION",
                f"Project instructions changed during reading: {target.display_path}",
            )
        files.append(
            {
                "path": target.display_path,
                "version": before.version,
                "content": "".join(chunks),
            }
        )
    return files


async def project_instruction_payload(
    source: RunContextSource, filesystem: Filesystem
) -> ContextInjectedPayload | None:
    targets = instruction_targets(source, filesystem)
    files = await filesystem_operation(
        lambda cancelled: read_instructions(targets, filesystem, cancelled)
    )
    previous = any(
        item.producer == "agent-instructions" for item in source.injected_context
    )
    if not files and not previous:
        return None
    content = (
        prompt_text(
            "context.yaml",
            "project_instructions",
            instructions="\n\n".join(
                prompt_text(
                    "context.yaml",
                    "project_instruction_file",
                    path=escape(file["path"], quote=True),
                    instructions=file["content"],
                )
                for file in files
            ),
        )
        if files
        else prompt_text("context.yaml", "project_instructions_cleared")
    )
    return snapshot_payload(
        source,
        "agent-instructions",
        content,
        files=[{"path": file["path"], "version": file["version"]} for file in files],
    )


def clear_project_instructions(
    source: RunContextSource,
) -> ContextInjectedPayload | None:
    if not any(
        item.producer == "agent-instructions" for item in source.injected_context
    ):
        return None
    return snapshot_payload(
        source,
        "agent-instructions",
        prompt_text("context.yaml", "project_instructions_cleared"),
        files=[],
    )
