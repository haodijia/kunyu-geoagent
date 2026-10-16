"""Persistent map presentation with optimistic revisions and output references."""

from uuid import uuid4

from sqlalchemy import select, text

from kunyu.domain.analysis import (
    AnalysisError,
    LayerStyleWrite,
    MapCamera,
    MapLayer,
    MapPresentation,
    MapState,
    MapViewport,
    MapViewWrite,
)
from kunyu.domain.imagery import candidate_bounds
from kunyu.persistence.analysis import AnalysisRepository
from kunyu.persistence.analysis_models import MapLayerRecord, MapStateRecord
from kunyu.persistence.analysis_shared import publish, require_session
from kunyu.persistence.database import Database
from kunyu.persistence.imagery import ImageryRepository


class MapRepository:
    def __init__(self, database: Database, outputs: AnalysisRepository) -> None:
        self.database, self.outputs = database, outputs
        self.imagery = ImageryRepository(database)

    def present(
        self,
        session_id: str,
        request_id: str,
        target: str,
        reference_id: str,
        *,
        open_map: bool,
        focus: bool,
        image_id: int | None = None,
    ) -> MapState:
        if target == "candidates":
            candidates = self.imagery.get(session_id, reference_id)
            if image_id is not None and not any(
                image.imageId == image_id for image in candidates.images
            ):
                raise AnalysisError(
                    "INVALID_IMAGE", "The image is not part of this candidate set.", 422
                )
            bounds = candidate_bounds(candidates)
        elif target == "output":
            if image_id is not None:
                raise AnalysisError(
                    "INVALID_TARGET", "Output presentation cannot select an image.", 422
                )
            output = self.outputs.output(session_id, reference_id)
            bounds = output.bounds
            self.add(session_id, reference_id)
        else:
            raise AnalysisError(
                "INVALID_TARGET", "Unsupported map presentation target.", 422
            )
        self.state(session_id)
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapStateRecord, session_id)
            current = MapState.model_validate(row.value)
            if (
                current.presentation is not None
                and current.presentation.request_id == request_id
            ):
                return current
            changes = {
                "revision": current.revision + 1,
                "presentation": MapPresentation(
                    request_id=request_id,
                    target=target,
                    reference_id=reference_id,
                    image_id=image_id,
                    open_map=open_map,
                    focus=focus,
                    bounds=bounds,
                ),
            }
            if target == "candidates":
                changes.update(candidate_set_id=reference_id)
                if current.candidate_set_id != reference_id or image_id is not None:
                    changes.update(selected_image_id=image_id)
            else:
                changes.update(selected_output_id=reference_id)
            value = current.model_copy(update=changes)
            row.value = value.model_dump(mode="json")
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", request_id, value.revision
            )
            return value

    def choose_image(
        self,
        session_id: str,
        candidate_set_id: str,
        image_id: int | None,
    ) -> MapState:
        candidates = self.imagery.get(session_id, candidate_set_id)
        if image_id is not None and not any(
            image.imageId == image_id for image in candidates.images
        ):
            raise AnalysisError(
                "INVALID_IMAGE", "The image is not part of this candidate set.", 422
            )
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapStateRecord, session_id)
            if row is None:
                raise AnalysisError(
                    "MAP_NOT_INITIALIZED",
                    "Present image candidates before selecting one.",
                )
            current = MapState.model_validate(row.value)
            if current.candidate_set_id != candidate_set_id:
                raise AnalysisError(
                    "MAP_CONFLICT",
                    "Image candidates changed; refresh before selecting.",
                )
            value = current.model_copy(
                update={"selected_image_id": image_id, "revision": current.revision + 1}
            )
            row.value = value.model_dump(mode="json")
            tx.flush()
            publish(
                self.database,
                tx,
                session_id,
                "map/changed",
                candidate_set_id,
                value.revision,
            )
            return value

    def receipt(
        self, session_id: str, request_id: str, status: str, error: str | None
    ) -> MapState:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapStateRecord, session_id)
            if row is None:
                raise AnalysisError(
                    "MAP_NOT_INITIALIZED", "No presentation is pending."
                )
            current = MapState.model_validate(row.value)
            if (
                current.presentation is None
                or current.presentation.request_id != request_id
            ):
                raise AnalysisError(
                    "MAP_CONFLICT", "A different map presentation is now active."
                )
            if (
                current.presentation.status == status
                and current.presentation.error == error
            ):
                return current
            presentation = current.presentation.model_copy(
                update={"status": status, "error": error}
            )
            value = current.model_copy(
                update={"presentation": presentation, "revision": current.revision + 1}
            )
            row.value = value.model_dump(mode="json")
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", request_id, value.revision
            )
            return value

    def has_image_selection(self, session_id: str) -> bool:
        """Approval validation reads facts without acquiring a nested write lock."""
        with self.database.sessions() as tx:
            require_session(tx, session_id)
            row = tx.get(MapStateRecord, session_id)
            return (
                row is not None
                and MapState.model_validate(row.value).selected_image_id is not None
            )

    def state(self, session_id: str) -> MapState:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id)
            row = tx.get(MapStateRecord, session_id)
            if row is None:
                value = MapState(
                    session_id=session_id,
                    revision=1,
                    viewport=MapViewport(),
                    camera=MapCamera(),
                )
                row = MapStateRecord(
                    session_id=session_id, value=value.model_dump(mode="json")
                )
                tx.add(row)
                return value
            return MapState.model_validate(row.value)

    def view(self, session_id: str, update: MapViewWrite) -> MapState:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapStateRecord, session_id)
            if row is None:
                raise AnalysisError(
                    "MAP_NOT_INITIALIZED", "Read map state before writing its view."
                )
            current = MapState.model_validate(row.value)
            if current.view_revision != update.expected_view_revision:
                raise AnalysisError(
                    "MAP_CONFLICT",
                    "Map state changed; refresh before applying the view.",
                )
            if update.applied_focus_revision > current.focus_revision:
                raise AnalysisError(
                    "MAP_CONFLICT", "Focus request changed; refresh the map."
                )
            value = current.model_copy(
                update={
                    "viewport": update.viewport,
                    "camera": update.camera,
                    "revision": current.revision + 1,
                    "view_revision": current.view_revision + 1,
                    "applied_focus_revision": update.applied_focus_revision,
                }
            )
            row.value = value.model_dump(mode="json")
            return value

    def layers(self, session_id: str) -> list[MapLayer]:
        with self.database.sessions() as tx:
            require_session(tx, session_id)
            return [
                MapLayer.model_validate(row)
                for row in tx.scalars(
                    select(MapLayerRecord)
                    .where(MapLayerRecord.session_id == session_id)
                    .order_by(MapLayerRecord.position, MapLayerRecord.id)
                )
            ]

    def add(self, session_id: str, output_id: str) -> MapLayer:
        output = self.outputs.output(session_id, output_id)
        self.state(session_id)
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            existing = tx.scalar(
                select(MapLayerRecord).where(
                    MapLayerRecord.session_id == session_id,
                    MapLayerRecord.output_id == output_id,
                )
            )
            if existing is not None:
                return MapLayer.model_validate(existing)
            row = MapLayerRecord(
                id=f"layer_{uuid4()}",
                session_id=session_id,
                output_id=output.id,
                title=output.title,
                visible=True,
                opacity=0.85,
                position=len(self.layers(session_id)),
                revision=1,
            )
            tx.add(row)
            tx.flush()
            publish(self.database, tx, session_id, "map/changed", row.id, 1)
            return MapLayer.model_validate(row)

    def select(
        self, session_id: str, output_id: str, *, focus: bool = False
    ) -> MapState:
        self.outputs.output(session_id, output_id)
        self.state(session_id)
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapStateRecord, session_id)
            current = MapState.model_validate(row.value)
            changes = {
                "selected_output_id": output_id,
                "revision": current.revision + 1,
            }
            if focus:
                changes.update(
                    focus_output_id=output_id, focus_revision=current.focus_revision + 1
                )
            value = current.model_copy(update=changes)
            row.value = value.model_dump(mode="json")
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", session_id, value.revision
            )
            return value

    def style(
        self, session_id: str, layer_id: str, update: LayerStyleWrite
    ) -> MapLayer:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapLayerRecord, layer_id)
            if row is None or row.session_id != session_id:
                raise AnalysisError("NOT_FOUND", "Map layer was not found.", 404)
            if row.revision != update.expected_revision:
                raise AnalysisError(
                    "MAP_CONFLICT",
                    "Map layer changed; refresh before applying the style.",
                )
            ordered = list(
                tx.scalars(
                    select(MapLayerRecord)
                    .where(MapLayerRecord.session_id == session_id)
                    .order_by(MapLayerRecord.position, MapLayerRecord.id)
                )
            )
            if update.position >= len(ordered):
                raise AnalysisError(
                    "INVALID_POSITION", "Layer position is outside the stack.", 422
                )
            ordered.remove(row)
            ordered.insert(update.position, row)
            for position, item in enumerate(ordered):
                if item is not row and item.position != position:
                    item.position = position
                    item.revision += 1
                if item is row:
                    item.position = position
            row.visible, row.opacity = update.visible, update.opacity
            row.revision += 1
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", layer_id, row.revision
            )
            return MapLayer.model_validate(row)

    def remove(self, session_id: str, layer_id: str, expected_revision: int) -> None:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = tx.get(MapLayerRecord, layer_id)
            if row is None or row.session_id != session_id:
                raise AnalysisError("NOT_FOUND", "Map layer was not found.", 404)
            if row.revision != expected_revision:
                raise AnalysisError(
                    "MAP_CONFLICT", "Map layer changed; refresh before removing it."
                )
            revision = row.revision + 1
            tx.delete(row)
            tx.flush()
            ordered = tx.scalars(
                select(MapLayerRecord)
                .where(MapLayerRecord.session_id == session_id)
                .order_by(MapLayerRecord.position, MapLayerRecord.id)
            )
            for position, item in enumerate(ordered):
                if item.position != position:
                    item.position = position
                    item.revision += 1
            tx.flush()
            publish(self.database, tx, session_id, "map/changed", layer_id, revision)
