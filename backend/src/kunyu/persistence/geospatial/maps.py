"""Persist layer contents and styles; camera and focus belong to the client."""

from sqlalchemy import select, text

from kunyu.domain.geospatial.analysis import (
    AnalysisError,
    LayerStyleWrite,
    MapLayer,
)
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.analysis import AnalysisRepository, output_value
from kunyu.persistence.geospatial.analysis_shared import publish, require_session
from kunyu.persistence.geospatial.imagery import ImageryRepository
from kunyu.persistence.geospatial.map_layers import (
    add_image_layers,
    add_output_layers,
    normalize_positions,
    ordered_layers,
    require_layer,
)
from kunyu.persistence.records.geospatial import AnalysisOutputRecord, MapLayerRecord


class MapRepository:
    def __init__(self, database: Database, outputs: AnalysisRepository) -> None:
        self.database, self.outputs = database, outputs
        self.imagery = ImageryRepository(database)

    def present(
        self,
        session_id: str,
        request_id: str,
        *,
        image_ids: list[int] | None = None,
        output_ids: list[str] | None = None,
    ) -> list[MapLayer]:
        if (image_ids is None) == (output_ids is None):
            raise AnalysisError(
                "INVALID_TARGET", "Supply exactly one of image_ids or output_ids.", 422
            )
        ids = image_ids if image_ids is not None else output_ids
        if not ids or len(set(ids)) != len(ids):
            raise AnalysisError(
                "INVALID_TARGET", "Resource IDs must be nonempty and unique.", 422
            )
        images = None if image_ids is None else self.imagery.get(session_id, image_ids)
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            session = require_session(tx, session_id, writable=True)
            if images is not None:
                layers = add_image_layers(tx, session_id, images)
            else:
                outputs = {
                    row.id: row
                    for row in tx.scalars(
                        select(AnalysisOutputRecord).where(
                            AnalysisOutputRecord.workspace_id == session.workspace_id,
                            AnalysisOutputRecord.id.in_(output_ids),
                        )
                    )
                }
                missing = [
                    identity for identity in output_ids if identity not in outputs
                ]
                if missing:
                    raise AnalysisError(
                        "OUTPUTS_NOT_FOUND",
                        f"Outputs were not found in this workspace: {missing}.",
                        404,
                    )
                layers = add_output_layers(
                    tx,
                    session_id,
                    tuple(output_value(outputs[identity]) for identity in output_ids),
                )
            publish(self.database, tx, session_id, "map/changed", request_id, 1)
            return [MapLayer.model_validate(row) for row in layers]

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
            row = add_output_layers(tx, session_id, (output,))[0]
            publish(self.database, tx, session_id, "map/changed", row.id, row.revision)
            return MapLayer.model_validate(row)

    def style(
        self, session_id: str, layer_id: str, update: LayerStyleWrite
    ) -> MapLayer:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = require_layer(tx, session_id, layer_id)
            changes = update.model_dump(exclude_none=True)
            if all(getattr(row, key) == value for key, value in changes.items()):
                return MapLayer.model_validate(row)
            if update.position is not None and update.position != row.position:
                ordered = ordered_layers(tx, session_id)
                if update.position >= len(ordered):
                    raise AnalysisError(
                        "INVALID_POSITION", "Layer position is outside the stack.", 422
                    )
                ordered.remove(row)
                ordered.insert(update.position, row)
                for position, item in enumerate(ordered):
                    if item.position != position:
                        item.position = position
                        if item is not row:
                            item.revision += 1
            for key, value in changes.items():
                setattr(row, key, value)
            row.revision += 1
            tx.flush()
            publish(
                self.database, tx, session_id, "map/changed", layer_id, row.revision
            )
            return MapLayer.model_validate(row)

    def remove(self, session_id: str, layer_id: str) -> None:
        with self.database.sessions.begin() as tx:
            tx.execute(text("BEGIN IMMEDIATE"))
            require_session(tx, session_id, writable=True)
            row = require_layer(tx, session_id, layer_id)
            revision = row.revision + 1
            tx.delete(row)
            tx.flush()
            normalize_positions(tx, session_id)
            publish(self.database, tx, session_id, "map/changed", layer_id, revision)
