"""Resolve image IDs from the session's committed imagery search results."""

from sqlalchemy import func, select

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.oge import OgeImageRecord
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.analysis_shared import require_session
from kunyu.persistence.records.execution import ToolCallRecord


class ImageryRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, session_id: str, image_ids: list[int]) -> tuple[OgeImageRecord, ...]:
        images = func.json_each(ToolCallRecord.result, "$.images").table_valued(
            "value", joins_implicitly=True
        )
        with self.database.sessions() as transaction:
            require_session(transaction, session_id)
            records = transaction.scalars(
                select(images.c.value)
                .select_from(ToolCallRecord, images)
                .where(
                    ToolCallRecord.session_id == session_id,
                    ToolCallRecord.name == "oge_search_images",
                    ToolCallRecord.status == "completed",
                    func.json_extract(images.c.value, "$.imageId").in_(image_ids),
                )
                .order_by(ToolCallRecord.updated_sequence.desc())
            )
            found = {}
            for value in records:
                image = OgeImageRecord.model_validate_json(value)
                found.setdefault(image.imageId, image)
        missing = [image_id for image_id in image_ids if image_id not in found]
        if missing:
            raise AnalysisError(
                "IMAGES_NOT_FOUND",
                f"Images were not found in this session's search results: {missing}.",
                404,
            )
        return tuple(found[image_id] for image_id in image_ids)
