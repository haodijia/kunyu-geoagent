"""Foreground ripgrep discovery with canonical text and separate search cards."""

import logging
import os
from collections.abc import Mapping
from pathlib import Path

from pydantic import Field, field_validator

from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.files_shared import (
    filesystem_scope,
    tool_filesystem_error,
)
from kunyu.agent.tools.search_results import (
    MAX_MATCHES,
    MAX_PATHS,
    cap_metadata,
    display_path,
    format_matches,
    grouped_matches,
    parse_matches,
    sample_paths,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.filesystem import FilesystemError
from kunyu.integrations.filesystem_operation import filesystem_operation
from kunyu.integrations.search_storage import SEARCH_DIRECTORY, WorkspaceSearchStorage
from kunyu.integrations.subprocess import LocalSubprocess

logger = logging.getLogger(__name__)


class _SearchArguments(ToolArguments):
    pattern: str = Field(min_length=1)
    path: str | None = Field(default=None, min_length=1, max_length=4096)

    @field_validator("path")
    @classmethod
    def nonblank_path(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("path must not be blank")
        return value


class _GlobArguments(_SearchArguments):
    @field_validator("pattern")
    @classmethod
    def nonblank_pattern(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("pattern must not be blank")
        return value


class _GrepArguments(_SearchArguments):
    include: str | None = Field(default=None, min_length=1)

    @field_validator("include")
    @classmethod
    def single_positive_glob(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.strip() or value.startswith("!"):
            raise ValueError("include must be one positive glob")
        depth = 0
        for character in value:
            if character == "{":
                depth += 1
            elif character == "}":
                depth = max(0, depth - 1)
            elif character == "," and depth == 0:
                raise ValueError("include must be one glob, not a comma-separated list")
        return value


class SearchTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        subprocess: LocalSubprocess,
        storage: WorkspaceSearchStorage,
        *,
        name: str,
    ) -> None:
        if name not in {"glob", "grep"}:
            raise ValueError("Unknown search tool.")
        self._run_id, self._contexts = run_id, contexts
        self._subprocess, self._storage = subprocess, storage
        self._arguments = _GlobArguments if name == "glob" else _GrepArguments
        self.spec = ToolSpec(
            name=name,
            description=(
                "Find files by glob in /workspace, including hidden and ignored files except VCS internals. Sorted by modification time; over 100 results are sampled across top-level entries."
                if name == "glob"
                else "Search file contents with a ripgrep regular expression in /workspace. Defaults to ignore and hidden-file rules; a positive include glob overrides those rules for matching files. Retains up to 250 matches with 2000-byte line previews."
            ),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
            timeout_ms=30_000,
            timeout_error_code="SEARCH_ABORTED",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, self._arguments, call.arguments)
        scope = filesystem_scope(load_source(self._contexts, self._run_id))
        binary = os.environ.get("KUNYU_RIPGREP_PATH")
        if not binary or not Path(binary).is_absolute():
            raise ToolExecutionError(
                "The packaged ripgrep executable is not configured.",
                code="SEARCH_FAILED",
            )
        try:
            with self._storage.root(scope, arguments.path) as (cwd, root, descriptor):
                argv = [binary, "--no-config"]
                if self.spec.name == "glob":
                    argv.extend(
                        (
                            "--files",
                            f"--glob={arguments.pattern}",
                            "--sort=modified",
                            "--no-ignore",
                            "--hidden",
                        )
                    )
                    for name in (".git", ".svn", ".hg", ".bzr", ".jj", ".sl"):
                        argv.extend((f"--glob=!**/{name}", f"--glob=!**/{name}/**"))
                else:
                    argv.extend(("--json", f"--regexp={arguments.pattern}"))
                    if arguments.include is not None:
                        argv.append(f"--glob={arguments.include}")
                # Recovery artifacts never enter future searches, even with --hidden.
                argv.extend((f"--glob=!{SEARCH_DIRECTORY}/**", "--", root))
                output = await self._subprocess.run(
                    tuple(argv),
                    descriptor,
                    stdout_max_bytes=20_000_000,
                    stderr_max_bytes=65_536,
                )
            if output.exit_code not in {0, 1}:
                excerpt = (
                    output.stderr.decode("utf-8", errors="replace")
                    .strip()
                    .replace(str(cwd), "/workspace")
                )
                if output.stderr_truncated:
                    excerpt += " [stderr truncated]"
                code = (
                    "SEARCH_INVALID_PATTERN"
                    if "regex parse error" in excerpt.lower()
                    or "error parsing glob" in excerpt.lower()
                    else "SEARCH_FAILED"
                )
                raise ToolExecutionError(
                    f"{self.spec.name} search failed (exit {output.exit_code}): {excerpt}",
                    code=code,
                )
            if output.stdout_truncated:
                raise ToolExecutionError(
                    "Search raw output exceeded 20000000 bytes; narrow pattern, path, or include and retry.",
                    code="SEARCH_RAW_OUTPUT_OVERFLOW",
                )
            text = output.stdout.decode("utf-8")
            locator = None
            if self.spec.name == "glob":
                paths = [display_path(line) for line in text.splitlines() if line]
                page = paths
                rendered = "\n".join(paths) if paths else "No files found"
                if len(paths) > MAX_PATHS:
                    page, shown, total = sample_paths(paths, root)
                    locator = await filesystem_operation(
                        lambda cancelled: self._storage.save(
                            scope, "glob", "\n".join(paths), cancelled
                        )
                    )
                    basis = (
                        "."
                        if total == len(paths)
                        else f", sampled across {shown} of the {total} top-level entries this pattern matched instead of taken in modification-time order."
                    )
                    if total != len(paths) and shown < total:
                        basis += " Narrow path to inspect a specific subtree."
                    rendered = (
                        "\n".join(page)
                        + f"\n\n(Showing {len(page)} of {len(paths)} paths{basis} Full sorted result stored at: {locator}. Use read with this file_path to retrieve the complete result.)"
                    )
                metadata = {
                    "shape": "paths",
                    "paths": list(page),
                    "truncated": len(paths) > MAX_PATHS,
                    "total": len(paths),
                }
            else:
                matches = parse_matches(text)
                page_matches = matches[:MAX_MATCHES]
                noun = "match" if len(matches) == 1 else "matches"
                rendered = (
                    f"Found {len(matches)} {noun}\n\n{format_matches(matches)}"
                    if matches
                    else "No matches found"
                )
                if len(matches) > MAX_MATCHES:
                    locator = await filesystem_operation(
                        lambda cancelled: self._storage.save(
                            scope, "grep", rendered, cancelled
                        )
                    )
                    rendered = f"Found {len(page_matches)} of {len(matches)} matches\n\n{format_matches(page_matches)}\n\n(Full grep result stored at: {locator}. Use read with this file_path to retrieve the complete result.)"
                metadata = {
                    "shape": "matches",
                    "files": grouped_matches(page_matches),
                    "truncated": len(matches) > MAX_MATCHES,
                    "total": len(matches),
                }
            metadata["artifact_path"] = locator
            return ToolResult(
                content=(TextBlock(text=rendered),), result=cap_metadata(metadata)
            )
        except FilesystemError as error:
            raise tool_filesystem_error(
                error, arguments.path or "/workspace"
            ) from error
        except (OSError, UnicodeError, ValueError) as error:
            logger.exception("Search %s in run %s failed", self.spec.name, self._run_id)
            detail = error.strerror if isinstance(error, OSError) else str(error)
            raise ToolExecutionError(
                f'{self.spec.name} could not search "{arguments.path or "/workspace"}": {detail}',
                code="SEARCH_FAILED",
            ) from error
