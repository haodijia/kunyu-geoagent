"""Persistent map presentation with optimistic revisions and output references."""

from sqlalchemy import select, text

from kunyu.domain.geospatial.analysis import (
    AnalysisError,
    LayerStyleWrite,
    MapCamera,
    MapLayer,
    MapPresentation,
    MapState,
    MapViewport,
    MapViewWrite,
)
from kunyu.domain.geospatial.imagery import candidate_bounds
from kunyu.domain.geospatial.map_context import ImageSelectionReference
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.analysis import AnalysisRepository
from kunyu.persistence.geospatial.analysis_shared import publish, require_session
from kunyu.persistence.geospatial.imagery import ImageryRepository
from kunyu.persistence.geospatial.map_layers import (
    add_image_layers,
    add_output_layer,
    normalize_positions,
    ordered_layers,
    require_layer,
    retain_image_layer,
)
from kunyu.persistence.records.geospatial import MapLayerRecord, MapStateRecord


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
                layers = add_image_layers(tx, candidates)
                if image_id is not None:
                    selected = next(
                        layer for layer in layers if layer.image["image_id"] == image_id
                    )
                    retain_image_layer(tx, selected)
                    bounds = None if selected.bounds is None else tuple(selected.bounds)
                    changes.update(
                        selected_layer_id=selected.id,
                        image_selection=ImageSelectionReference(
                            candidate_set_id=reference_id, image_id=image_id
                        ),
                    )
            else:
                selected = add_output_layer(tx, session_id, output)
                changes.update(selected_layer_id=selected.id)
            changes["presentation"] = changes["presentation"].model_copy(
                update={"bounds": bounds}
            )
            value = current.model_copy(update=changes)
            row.value = value.model_dump(mode="json")
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", request_id, value.revision
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

    def layer(self, session_id: str, layer_id: str) -> MapLayer:
        with self.database.sessions() as tx:
            require_session(tx, session_id)
            return MapLayer.model_validate(require_layer(tx, session_id, layer_id))

    def add(self, session_id: str, output_id: str) -> MapLayer:
        output = self.outputs.output(session_id, output_id)
        self.state(session_id)
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = add_output_layer(tx, session_id, output)
            publish(self.database, tx, session_id, "map/changed", row.id, row.revision)
            return MapLayer.model_validate(row)

    def select(
        self, session_id: str, layer_id: str, *, focus: bool = False
    ) -> MapState:
        self.state(session_id)
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            layer = require_layer(tx, session_id, layer_id)
            row = tx.get(MapStateRecord, session_id)
            current = MapState.model_validate(row.value)
            changes = {"selected_layer_id": layer_id, "revision": current.revision + 1}
            if focus:
                if layer.bounds is None:
                    raise AnalysisError(
                        "NO_LAYER_BOUNDS",
                        "The layer has no verified geographic bounds.",
                        422,
                    )
                changes.update(
                    focus_layer_id=layer_id, focus_revision=current.focus_revision + 1
                )
            elif layer.image is not None:
                retain_image_layer(tx, layer)
                changes.update(
                    image_selection=ImageSelectionReference(
                        candidate_set_id=layer.image["candidate_set_id"],
                        image_id=layer.image["image_id"],
                    )
                )
            value = current.model_copy(update=changes)
            row.value = value.model_dump(mode="json")
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", layer_id, value.revision
            )
            return value

    def style(
        self, session_id: str, layer_id: str, update: LayerStyleWrite
    ) -> MapLayer:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = require_layer(tx, session_id, layer_id)
            if row.revision != update.expected_revision:
                raise AnalysisError(
                    "MAP_CONFLICT",
                    "Map layer changed; refresh before applying the style.",
                )
            ordered = ordered_layers(tx, session_id)
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
            row = require_layer(tx, session_id, layer_id)
            if row.revision != expected_revision:
                raise AnalysisError(
                    "MAP_CONFLICT", "Map layer changed; refresh before removing it."
                )
            revision = row.revision + 1
            tx.delete(row)
            tx.flush()
            normalize_positions(tx, session_id)
            state = tx.get(MapStateRecord, session_id)
            if state is not None:
                current = MapState.model_validate(state.value)
                changes = {"revision": current.revision + 1}
                if current.selected_layer_id == layer_id:
                    changes["selected_layer_id"] = None
                if current.focus_layer_id == layer_id:
                    changes["focus_layer_id"] = None
                if (
                    row.image is not None
                    and current.image_selection is not None
                    and (
                        current.image_selection.candidate_set_id
                        == row.image["candidate_set_id"]
                        and current.image_selection.image_id == row.image["image_id"]
                    )
                ):
                    changes["image_selection"] = None
                state.value = current.model_copy(update=changes).model_dump(mode="json")
            tx.flush()
            publish(self.database, tx, session_id, "map/changed", layer_id, revision)
