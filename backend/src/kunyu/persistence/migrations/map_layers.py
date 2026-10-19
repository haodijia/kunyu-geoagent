"""One-time conversion of source imagery and outputs to the shared layer stack."""

import json

from sqlalchemy import Connection, select
from sqlalchemy.orm import Session

from kunyu.domain.geospatial.imagery import ImageCandidates
from kunyu.persistence.geospatial.map_layers import add_image_layers, retain_image_layer
from kunyu.persistence.records.execution import ToolCallRecord
from kunyu.persistence.records.geospatial import MapLayerRecord, MapStateRecord


def migrate_map_layers(connection: Connection) -> None:
    previous = connection.exec_driver_sql("SELECT * FROM map_layers").mappings().all()
    bounds = {
        row.id: json.loads(row.bounds)
        for row in connection.exec_driver_sql("SELECT id, bounds FROM analysis_outputs")
    }
    connection.exec_driver_sql("ALTER TABLE map_layers RENAME TO map_layers_previous")
    MapLayerRecord.__table__.create(connection)
    for row in previous:
        connection.execute(
            MapLayerRecord.__table__.insert().values(
                **dict(row),
                image=None,
                temporary=False,
                bounds=bounds[row.output_id],
            )
        )
    connection.exec_driver_sql("DROP TABLE map_layers_previous")
    with (
        Session(connection, join_transaction_mode="create_savepoint") as tx,
        tx.begin(),
    ):
        for state in tx.scalars(select(MapStateRecord)):
            value = dict(state.value)
            layers = list(
                tx.scalars(
                    select(MapLayerRecord).where(
                        MapLayerRecord.session_id == state.session_id
                    )
                )
            )
            output_layers = {row.output_id: row.id for row in layers}
            value["selected_layer_id"] = output_layers.get(
                value.pop("selected_output_id")
            )
            value["focus_layer_id"] = output_layers.get(value.pop("focus_output_id"))
            candidate_set = value.pop("candidate_set_id")
            image_id = value.pop("selected_image_id")
            value["image_selection"] = None
            if candidate_set is not None:
                search = tx.get(
                    ToolCallRecord, candidate_set.removeprefix("candidates_")
                )
                if search is None or search.session_id != state.session_id:
                    raise ValueError("The stored map image search is missing.")
                candidates = ImageCandidates(
                    id=candidate_set,
                    session_id=state.session_id,
                    images=search.result["images"],
                )
                added = add_image_layers(tx, candidates)
                if image_id is not None:
                    chosen = next(
                        row for row in added if row.image["image_id"] == image_id
                    )
                    retain_image_layer(tx, chosen)
                    value["image_selection"] = {
                        "candidate_set_id": candidate_set,
                        "image_id": image_id,
                    }
                    if value["selected_layer_id"] is None:
                        value["selected_layer_id"] = chosen.id
            state.value = value
    connection.exec_driver_sql("PRAGMA user_version = 7")
