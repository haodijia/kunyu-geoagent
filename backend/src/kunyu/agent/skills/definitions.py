"""Provider-neutral skill metadata and explicit resource locations."""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

SKILL_NAME_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
MAX_SKILL_BYTES = 128 * 1024


class DirectoryResourceBase(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    kind: Literal["directory"] = "directory"
    path: str = Field(min_length=1)


class UrlResourceBase(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    kind: Literal["url"] = "url"
    url: str = Field(min_length=1)


class OpaqueResourceBase(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    kind: Literal["opaque"] = "opaque"
    description: str = Field(min_length=1)


type SkillResourceBase = Annotated[
    DirectoryResourceBase | UrlResourceBase | OpaqueResourceBase,
    Field(discriminator="kind"),
]


def validate_skill_name(name: str) -> None:
    if (
        not isinstance(name, str)
        or len(name) > 200
        or re.fullmatch(SKILL_NAME_PATTERN, name) is None
    ):
        raise ValueError(
            "Skill names must use lowercase letters, digits and hyphens, up to 200 characters."
        )


def validate_resource_path(path: str) -> None:
    if (
        not isinstance(path, str)
        or not path
        or len(path) > 1000
        or "\\" in path
        or "\0" in path
        or ":" in path.split("/")[0]
        or PurePosixPath(path).is_absolute()
        or any(part in {"", ".", ".."} for part in path.split("/"))
    ):
        raise ValueError("Skill resources require a relative path without traversal.")


def validate_skill_text(content: str) -> None:
    if not isinstance(content, str) or len(content.encode("utf-8")) > MAX_SKILL_BYTES:
        raise ValueError("Skill text must be UTF-8 within the 128 KiB limit.")


@dataclass(frozen=True, slots=True)
class SkillSummary:
    name: str
    description: str
    source: str
    provider: str
    locator: object
    rank: int
    resource_base: SkillResourceBase | None = None
    path: str | None = None
    model_invocable: bool = True
    user_invocable: bool = True
    when_to_use: str | None = None


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    summary: SkillSummary
    content: str


@dataclass(frozen=True, slots=True)
class SkillRegistration:
    name: str
    description: str
    content: str
    source: str = "runtime"
    resource_base: SkillResourceBase | None = None
    resources: Mapping[str, str] = field(default_factory=dict)
    model_invocable: bool = True
    user_invocable: bool = True
    when_to_use: str | None = None
