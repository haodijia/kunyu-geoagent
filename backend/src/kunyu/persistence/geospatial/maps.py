"""Persist layer contents and styles; camera and focus belong to the client."""

from sqlalchemy import select, text

from kunyu.domain.geospatial.analysis import (
    AnalysisError,
    LayerStyleWrite,
    MapLayer,
    MapPresentation,
)
from kunyu.domain.geospatial.imagery import candidate_bounds
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
from kunyu.persistence.records.geospatial import MapLayerRecord


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
    ) -> MapPresentation:
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
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            if target == "candidates":
                layers = add_image_layers(tx, candidates)
                if image_id is not None:
                    selected = next(
                        layer for layer in layers if layer.image["image_id"] == image_id
                    )
                    retain_image_layer(tx, selected)
                    bounds = None if selected.bounds is None else tuple(selected.bounds)
            else:
                add_output_layer(tx, session_id, output)
            publish(self.database, tx, session_id, "map/changed", request_id, 1)
        return MapPresentation(
            request_id=request_id,
            target=target,
            reference_id=reference_id,
            image_id=image_id,
            open_map=open_map,
            focus=focus,
            bounds=bounds,
        )

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
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = add_output_layer(tx, session_id, output)
            publish(self.database, tx, session_id, "map/changed", row.id, row.revision)
            return MapLayer.model_validate(row)

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
            publish(self.database, tx, session_id, "map/changed", layer_id, revision)
