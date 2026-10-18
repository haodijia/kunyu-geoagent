"""Required, independently persisted UI and compaction projections of a tool result."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, TypeAdapter

from kunyu.agent.runtime.contracts.tool_content import ToolContent
from kunyu.domain.conversation.attachments import ImageAttachment
from kunyu.domain.geospatial.analysis import MapPresentation


class OutputValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class TextDisplay(OutputValue):
    kind: Literal["text", "code"] = "text"
    summary: str = Field(min_length=1, max_length=240)
    text: str


class DataDisplay(OutputValue):
    kind: Literal["read", "search", "file_change", "image_read", "todos"]
    summary: str = Field(min_length=1, max_length=240)
    data: JsonValue
    text: str
    images: tuple[ImageAttachment, ...] = ()


class ImagesDisplay(OutputValue):
    kind: Literal["images"] = "images"
    summary: str = Field(min_length=1, max_length=240)
    images: tuple[ImageAttachment, ...] = Field(min_length=1)
    description: str


class AnalysisDisplay(OutputValue):
    kind: Literal["analysis"] = "analysis"
    summary: str = Field(min_length=1, max_length=240)
    job_id: str = Field(min_length=1)


class MapDisplay(OutputValue):
    kind: Literal["map"] = "map"
    summary: str = Field(min_length=1, max_length=240)
    presentation: MapPresentation


class StatusDisplay(OutputValue):
    kind: Literal["none", "subagent"]
    summary: str = Field(min_length=1, max_length=240)


type ToolDisplay = Annotated[
    TextDisplay
    | DataDisplay
    | ImagesDisplay
    | AnalysisDisplay
    | MapDisplay
    | StatusDisplay,
    Field(discriminator="kind"),
]
TOOL_DISPLAY = TypeAdapter(ToolDisplay)


class ToolCompaction(OutputValue):
    summary: str = Field(min_length=1, max_length=240)
    content: ToolContent
