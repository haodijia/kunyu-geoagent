"""Guarded workspace text mutations and canonical model/diff result separation."""

from collections.abc import Mapping

from pydantic import Field, model_validator

from kunyu.agent.filesystem import FilesystemHooks
from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.tools import ToolCall, ToolResult, ToolRiskLevel, ToolSpec
from kunyu.agent.scope import AgentScopes
from kunyu.agent.tools.file_diff import compute_hunk_diffs
from kunyu.agent.tools.files_shared import (
    filesystem_scope,
    tool_filesystem_error,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.filesystem import (
    Filesystem,
    FilesystemError,
    FsEditRequest,
    FsObservation,
)
from kunyu.integrations.filesystem_operation import filesystem_operation


class _WriteArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)
    content: str


class _EditArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)
    old_string: str = Field(min_length=1)
    new_string: str
    replace_all: bool = False

    @model_validator(mode="after")
    def require_change(self):
        if self.old_string == self.new_string:
            raise ValueError("old_string and new_string must differ")
        return self


class FileMutationTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        filesystem: Filesystem,
        hooks: FilesystemHooks,
        scopes: AgentScopes,
        *,
        name: str,
    ) -> None:
        if name not in {"write", "edit"}:
            raise ValueError("Unknown filesystem mutation tool.")
        self._run_id, self._contexts, self._filesystem = run_id, contexts, filesystem
        self._hooks, self._scopes = hooks, scopes
        self._arguments = _WriteArguments if name == "write" else _EditArguments
        self.spec = ToolSpec(
            name=name,
            description="Create or fully replace a UTF-8 text file."
            if name == "write"
            else "Edit an existing UTF-8 text file by replacing literal text. Read first; old_string must match exactly once unless replace_all is true.",
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L1,
            execution="exclusive",
            presentation="write",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        actor = self._scopes.for_session(source.session.id)
        path = arguments.file_path
        try:
            target = self._filesystem.resolve(path, filesystem_scope(source))
            path = target.display_path
            # Intent is captured before entering the worker; observed state belongs
            # to the live session and all notification dispatch stays on its loop.
            if isinstance(arguments, _WriteArguments):
                intent = self._hooks.writing(target, actor)
                operation = lambda cancelled: self._filesystem.write_text(
                    target, arguments.content, intent, cancelled
                )
            else:
                version = self._hooks.editing(target, actor)
                edit = FsEditRequest(
                    arguments.old_string, arguments.new_string, arguments.replace_all
                )
                operation = lambda cancelled: self._filesystem.edit_text(
                    target, edit, version, cancelled
                )
            outcome = await filesystem_operation(operation)
            self._hooks.observe(
                target, FsObservation("present", outcome.version), actor
            )
            # Observe immediately after publication, before computing display metadata.
            diffs = (
                await filesystem_operation(
                    lambda cancelled: compute_hunk_diffs(
                        path, outcome.before, outcome.after, cancelled
                    )
                )
                if outcome.before is not None
                else [{"path": path, "old_text": None, "new_text": outcome.after}]
            )
            if self.spec.name == "write":
                verb = "Created" if outcome.operation == "create" else "Updated"
                text = f"<path>{path}</path>\n<type>file</type>\n<content>\n{verb} file\n</content>"
            else:
                text = (
                    f"The file {path} has been updated. All occurrences were successfully replaced."
                    if arguments.replace_all
                    else f"The file {path} has been updated successfully."
                )
            return ToolResult(
                content=(TextBlock(text=text),),
                result={"path": path, "operation": outcome.operation, "diffs": diffs},
            )
        except FilesystemError as error:
            raise tool_filesystem_error(error, path) from error
