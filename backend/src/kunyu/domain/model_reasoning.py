"""Declared thinking controls and immutable, exact per-request parameters."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator

LEVELS = ("off", "minimal", "low", "medium", "high", "xhigh", "max", "on")
type ReasoningValue = Annotated[str, Field(min_length=1, max_length=64, strict=True)]


class ReasoningValueModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class ModelReasoningSettings(ReasoningValueModel):
    mode: Literal["none", "effort", "thinking", "deepseek", "kimi", "zai"]
    levels: dict[str, ReasoningValue | None]
    default_level: str | None

    @model_validator(mode="after")
    def validate_levels(self) -> Self:
        if self.mode == "none":
            if self.levels or self.default_level is not None:
                raise ValueError("Unconfigured thinking cannot declare levels.")
            return self
        if not self.levels or any(level not in LEVELS for level in self.levels):
            raise ValueError("Thinking controls require supported level identities.")
        if self.default_level is not None and self.default_level not in self.levels:
            raise ValueError("The thinking default must name an offered level.")
        for level, value in self.levels.items():
            if value is not None and (value != value.strip() or not value.strip()):
                raise ValueError(
                    "Thinking request values must be nonempty and trimmed."
                )
            if value is None and (level != "off" or self.mode != "effort"):
                raise ValueError("Only an effort off level may omit its request value.")
            if self.mode in {"thinking", "kimi", "zai"} and (
                level not in {"off", "on"}
                or value != ("disabled" if level == "off" else "enabled")
            ):
                raise ValueError(
                    "Thinking switches declare off/disabled or on/enabled."
                )
            if self.mode == "deepseek" and (
                (level == "off" and value != "disabled")
                or (level != "off" and value not in {"low", "high", "max"})
            ):
                raise ValueError("DeepSeek levels require disabled, low, high or max.")
        return self


class ThinkingParameters(ReasoningValueModel):
    type: Literal["enabled", "disabled"]
    keep: Literal["all"] | None = None
    clear_thinking: bool | None = None


class EffortParameters(ReasoningValueModel):
    effort: ReasoningValue


class ReasoningParameters(ReasoningValueModel):
    thinking: ThinkingParameters | None = None
    reasoning_effort: ReasoningValue | None = None
    reasoning: EffortParameters | None = None
    output_config: EffortParameters | None = None

    @model_validator(mode="after")
    def validate_combination(self) -> Self:
        if self.reasoning is not None and (
            self.thinking is not None
            or self.reasoning_effort is not None
            or self.output_config is not None
        ):
            raise ValueError(
                "Responses reasoning cannot contain Chat or Messages fields."
            )
        if self.output_config is not None and self.reasoning_effort is not None:
            raise ValueError("Effort cannot name two protocol fields.")
        if (
            self.thinking is not None
            and self.thinking.type == "disabled"
            and (self.output_config is not None or self.reasoning_effort is not None)
        ):
            raise ValueError("Disabled thinking cannot declare an effort.")
        return self

    @model_serializer
    def payload(self) -> dict:
        result = {}
        for name in ("thinking", "reasoning_effort", "reasoning", "output_config"):
            value = getattr(self, name)
            if value is not None:
                result[name] = (
                    value.model_dump(mode="json", exclude_none=True)
                    if isinstance(value, BaseModel)
                    else value
                )
        return result


def require_reasoning_protocol(
    protocol: str, settings: ModelReasoningSettings | None
) -> None:
    if settings is None or settings.mode == "none":
        return
    if protocol == "deepseek_messages" and settings.mode != "deepseek":
        raise ValueError("Messages thinking must use the DeepSeek control format.")
    if protocol == "openai_responses" and settings.mode != "effort":
        raise ValueError("Responses thinking must use effort controls.")


def reasoning_parameters(
    protocol: str,
    provider: str,
    selected: str | None,
    settings: ModelReasoningSettings | None,
) -> ReasoningParameters:
    require_reasoning_protocol(protocol, settings)
    if settings is None:
        # This is the actual protocol default, not a model-name capability guess.
        if protocol == "deepseek_messages":
            mode, value = (
                "deepseek",
                "disabled" if selected == "off" else selected or "high",
            )
        elif selected is None:
            return ReasoningParameters()
        elif protocol == "openai_compatible" and provider == "deepseek":
            mode, value = "deepseek", "disabled" if selected == "off" else selected
        else:
            mode, value = "effort", selected
    else:
        if settings.mode == "none":
            if selected is not None:
                raise ValueError("This model does not offer thinking controls.")
            return ReasoningParameters()
        level = selected if selected is not None else settings.default_level
        if level is None:
            return ReasoningParameters()
        if level not in settings.levels:
            raise ValueError(
                "The selected thinking level is not offered by this model."
            )
        mode, value = settings.mode, settings.levels[level]
    if value is None:
        return ReasoningParameters()
    if mode == "effort":
        return (
            ReasoningParameters(reasoning=EffortParameters(effort=value))
            if protocol == "openai_responses"
            else ReasoningParameters(reasoning_effort=value)
        )
    enabled = value != "disabled"
    thinking = ThinkingParameters(
        type="enabled" if enabled else "disabled",
        keep="all" if enabled and mode == "kimi" else None,
        clear_thinking=False if enabled and mode == "zai" else None,
    )
    if mode == "deepseek" and enabled:
        if value not in {"low", "high", "max"}:
            raise ValueError("DeepSeek thinking effort is unsupported.")
        return (
            ReasoningParameters(
                thinking=thinking, output_config=EffortParameters(effort=value)
            )
            if protocol == "deepseek_messages"
            else ReasoningParameters(thinking=thinking, reasoning_effort=value)
        )
    return ReasoningParameters(thinking=thinking)


def require_parameter_protocol(protocol: str, parameters: ReasoningParameters) -> None:
    fields = set(parameters.payload())
    allowed = (
        {"reasoning"}
        if protocol == "openai_responses"
        else {"thinking", "output_config"}
        if protocol == "deepseek_messages"
        else {"thinking", "reasoning_effort"}
    )
    if not fields <= allowed:
        raise ValueError("Frozen thinking parameters do not match their protocol.")
