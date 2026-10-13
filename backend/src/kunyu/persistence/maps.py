"""Persistent map presentation with optimistic revisions and output references."""

from uuid import uuid4

from sqlalchemy import select, text

from kunyu.domain.analysis import (
    AnalysisError,
    LayerStyleWrite,
    MapCamera,
    MapLayer,
    MapState,
    MapViewport,
    MapViewWrite,
)
from kunyu.persistence.analysis import AnalysisRepository
from kunyu.persistence.analysis_models import MapLayerRecord, MapStateRecord
from kunyu.persistence.analysis_shared import publish, require_session
from kunyu.persistence.database import Database


class MapRepository:
    def __init__(self, database: Database, outputs: AnalysisRepository) -> None:
        self.database, self.outputs = database, outputs

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
            if current.revision != update.expected_revision:
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
