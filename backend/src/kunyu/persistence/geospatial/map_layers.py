"""Shared layer storage for computed outputs and searchable source imagery."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from kunyu.domain.geospatial.analysis import AnalysisError, AnalysisOutput
from kunyu.domain.geospatial.imagery import layer_image, ring_bounds
from kunyu.domain.geospatial.oge import OgeImageRecord
from kunyu.persistence.records.geospatial import MapLayerRecord


def ordered_layers(tx: Session, session_id: str) -> list[MapLayerRecord]:
    return list(
        tx.scalars(
            select(MapLayerRecord)
            .where(MapLayerRecord.session_id == session_id)
            .order_by(MapLayerRecord.position, MapLayerRecord.id)
        )
    )


def require_layer(tx: Session, session_id: str, layer_id: str) -> MapLayerRecord:
    row = tx.get(MapLayerRecord, layer_id)
    if row is None or row.session_id != session_id:
        raise AnalysisError("NOT_FOUND", "Map layer was not found.", 404)
    return row


def normalize_positions(tx: Session, session_id: str) -> None:
    tx.flush()
    for position, row in enumerate(ordered_layers(tx, session_id)):
        if row.position != position:
            row.position = position
            row.revision += 1


def add_output_layers(
    tx: Session, session_id: str, outputs: tuple[AnalysisOutput, ...]
) -> list[MapLayerRecord]:
    layers = ordered_layers(tx, session_id)
    existing = {row.output_id: row for row in layers if row.output_id is not None}
    presented = []
    for output in outputs:
        row = existing.get(output.id)
        if row is None:
            row = MapLayerRecord(
                id=f"layer_{uuid4()}",
                session_id=session_id,
                output_id=output.id,
                image=None,
                bounds=list(output.bounds),
                title=output.title,
                visible=True,
                opacity=0.85,
                position=len(layers),
                revision=1,
            )
            tx.add(row)
            layers.append(row)
            existing[output.id] = row
        elif not row.visible:
            row.visible = True
            row.revision += 1
        presented.append(row)
    tx.flush()
    return presented


def add_image_layers(
    tx: Session, session_id: str, images: tuple[OgeImageRecord, ...]
) -> list[MapLayerRecord]:
    layers = ordered_layers(tx, session_id)
    existing = {row.image["image_id"]: row for row in layers if row.image is not None}
    presented = []
    for image in images:
        row = existing.get(image.imageId)
        if row is not None:
            if not row.visible:
                row.visible = True
                row.revision += 1
            presented.append(row)
            continue
        source = layer_image(image)
        bounds = ring_bounds(source.footprint)
        row = MapLayerRecord(
            id=f"layer_{uuid4()}",
            session_id=session_id,
            output_id=None,
            image=source.model_dump(mode="json"),
            bounds=None if bounds is None else list(bounds),
            title=f"{image.productName} · {image.phenomenonTime[:10]}",
            visible=True,
            opacity=1,
            position=len(layers),
            revision=1,
        )
        tx.add(row)
        layers.append(row)
        existing[image.imageId] = row
        presented.append(row)
    tx.flush()
    return presented
