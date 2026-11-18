"""Field evidence explicitly recorded against one mapped object."""

from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from kunyu.domain.conversation.attachments import MAX_ATTACHMENTS, ImageAttachment
from kunyu.domain.geospatial.object_review import ReviewObjectReference

FIELD_OBSERVATION = "field-observation"


class RecordFieldObservation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: UUID
    reference: ReviewObjectReference
    observed_at: AwareDatetime
    note: str = Field(default="", max_length=2000)
    photo_ids: tuple[UUID, ...] = Field(default=(), max_length=MAX_ATTACHMENTS)

    @model_validator(mode="after")
    def has_evidence(self):
        if not self.note and not self.photo_ids:
            raise ValueError("A field observation requires a note or a photo.")
        return self


class FieldObservation(BaseModel):
    id: UUID
    reference: ReviewObjectReference
    observed_at: AwareDatetime
    note: str
    photos: tuple[ImageAttachment, ...]
