"""Discover live operator metadata without registering hundreds of tools."""

from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.oge import OPERATOR, OPERATORS
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.oge import OgeError
from kunyu.integrations.oge.execution import ExecutionGateway


class SearchArguments(ToolArguments):
    query: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
        pattern=r"\S",
        description="Keywords to match. Omit to list the complete operator catalog.",
    )
    limit: int | None = Field(
        default=None,
        ge=1,
        description="Maximum matches to return. Omit to return all matches.",
    )


class DefinitionArguments(ToolArguments):
    name: str = Field(min_length=1, max_length=200)


class OperatorTool(BaseTool):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        gateway: ExecutionGateway,
        *,
        name: str,
    ) -> None:
        self.output_contract = {
            "oge_search_operators": OPERATORS,
            "oge_get_operator_definition": OPERATOR,
        }[name]
        self._run_id, self._contexts, self._gateway = run_id, contexts, gateway
        self._arguments = (
            SearchArguments if name == "oge_search_operators" else DefinitionArguments
        )
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
            timeout_ms=120_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        load_source(self._contexts, self._run_id)
        args = validate_model(self.spec.name, self._arguments, call.arguments)
        try:
            subject, base = await self._gateway.subject()
            if isinstance(args, DefinitionArguments):
                value = await self._gateway.request(
                    "GET",
                    "/computation-api/process/info",
                    subject,
                    base,
                    params={"processName": args.name},
                )
                if (
                    not isinstance(value, dict)
                    or value.get("name") != args.name
                    or not isinstance(value.get("args"), list)
                ):
                    raise AnalysisError(
                        "OGE_OPERATOR_NOT_FOUND",
                        "No matching operator definition returned.",
                    )
                # Sample scripts are optional and can be large; schemas are never truncated.
                definition = {
                    key: value[key]
                    for key in (
                        "name",
                        "alias",
                        "description",
                        "descriptionEn",
                        "type",
                        "args",
                        "output",
                    )
                    if key in value
                }
                sample = value.get("sampleCode")
                if isinstance(sample, str):
                    definition["sampleCode"] = sample[:4000]
                    definition["sample_code_truncated"] = len(sample) > 4000
                return tool_result(definition)
            rows = []
            page = 1
            while True:
                value = await self._gateway.request(
                    "POST",
                    "/model/listByTags4Catalog",
                    subject,
                    base,
                    body={"pageNum": page, "pageSize": 1000},
                )
                if (
                    not isinstance(value, dict)
                    or not isinstance(value.get("records"), list)
                    or not isinstance(value.get("pages"), int)
                ):
                    raise AnalysisError(
                        "OGE_PROTOCOL_ERROR", "Invalid OGE operator catalog."
                    )
                rows.extend(value["records"])
                if page >= value["pages"]:
                    break
                page += 1
                if page > 10:
                    raise AnalysisError(
                        "OGE_CATALOG_TOO_LARGE",
                        "Operator catalog exceeds 10,000 entries.",
                    )
            query = args.query.strip().casefold() if args.query is not None else ""
            words = query.split()
            matches = [
                row
                for row in rows
                if isinstance(row, dict)
                and all(
                    word
                    in " ".join(
                        str(row.get(key, ""))
                        for key in (
                            "name",
                            "alias",
                            "description",
                            "descriptionEn",
                            "catalogName",
                        )
                    ).casefold()
                    for word in words
                )
            ]
            matches.sort(
                key=lambda row: (
                    str(row.get("name", "")).casefold() != query,
                    str(row.get("name", "")),
                )
            )
            return tool_result(
                {
                    "operators": [
                        {
                            key: str(row.get(key) or "")[:240]
                            for key in ("name", "alias", "catalogName", "description")
                        }
                        for row in matches[: args.limit]
                    ],
                },
                max_bytes=1024 * 1024,
            )
        except (OgeError, AnalysisError) as error:
            raise ToolExecutionError(str(error), code=error.code) from None
