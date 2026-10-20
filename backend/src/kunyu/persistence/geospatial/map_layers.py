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


def add_output_layer(
    tx: Session, session_id: str, output: AnalysisOutput
) -> MapLayerRecord:
    layers = ordered_layers(tx, session_id)
    existing = next((row for row in layers if row.output_id == output.id), None)
    if existing is not None:
        if not existing.visible:
            existing.visible = True
            existing.revision += 1
        return existing
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
    tx.flush()
    return row


def add_image_layers(
    tx: Session, session_id: str, images: tuple[OgeImageRecord, ...]
) -> None:
    layers = ordered_layers(tx, session_id)
    for image in images:
        existing = next(
            (
                row
                for row in layers
                if row.image is not None and row.image["image_id"] == image.imageId
            ),
            None,
        )
        if existing is not None:
            if not existing.visible:
                existing.visible = True
                existing.revision += 1
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
    tx.flush()
