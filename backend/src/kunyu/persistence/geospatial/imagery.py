"""Read candidate sets from the existing durable tool-result projection."""

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.imagery import ImageCandidates
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.analysis_shared import require_session
from kunyu.persistence.records.execution import ToolCallRecord


class ImageryRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, session_id: str, candidate_set_id: str) -> ImageCandidates:
        if not candidate_set_id.startswith("candidates_"):
            raise AnalysisError(
                "CANDIDATES_NOT_FOUND", "Unknown image candidate set.", 404
            )
        with self.database.sessions() as transaction:
            require_session(transaction, session_id)
            row = transaction.get(
                ToolCallRecord, candidate_set_id.removeprefix("candidates_")
            )
            if (
                row is None
                or row.session_id != session_id
                or row.name != "oge_search_images"
                or row.status != "completed"
            ):
                raise AnalysisError(
                    "CANDIDATES_NOT_FOUND",
                    "Image candidates were not found in this session.",
                    404,
                )
            if (
                not isinstance(row.result, dict)
                or "candidate_set_id" not in row.result
                or row.result["candidate_set_id"] != candidate_set_id
            ):
                raise AnalysisError(
                    "INVALID_CANDIDATES",
                    "The committed image search result is inconsistent.",
                )
            return ImageCandidates(
                id=candidate_set_id, session_id=session_id, images=row.result["images"]
            )
