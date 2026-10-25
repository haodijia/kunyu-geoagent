"""Publish local view revisions of an immutable raster, without remote computation."""

import logging
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event

from pydantic import ValidationError
from sqlalchemy import select, text

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.raster import RasterPresentation, RasterView
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.geospatial.raster_manifest import prepare_manifest
from kunyu.persistence.geospatial.analysis import AnalysisRepository, output_value
from kunyu.persistence.geospatial.analysis_shared import publish, require_workspace
from kunyu.persistence.records.geospatial import AnalysisOutputRecord, MapLayerRecord

logger = logging.getLogger(__name__)


class RasterViewService:
    def __init__(self, repository: AnalysisRepository, raster):
        self.repository, self.raster = repository, raster

    def replace(
        self,
        workspace_id: str,
        output_id: str,
        revision: int,
        views: list[RasterView],
        default_view: str,
        cancelled: Event,
    ) -> dict:
        output = self.repository.workspace_output(workspace_id, output_id)
        if output.revision != revision:
            raise AnalysisError(
                "STALE_RESULT", "成果视图已变化，请重新读取后修改。", 409
            )
        try:
            presentation = RasterPresentation.model_validate(
                {
                    "bands": [
                        {
                            key: band[key]
                            for key in ("index", "name", "title", "description", "unit")
                        }
                        for band in output.metadata["bands"]
                    ],
                    "views": [view.model_dump(mode="json") for view in views],
                    "default_view": default_view,
                }
            )
        except ValidationError as error:
            raise AnalysisError("INVALID_VIEWS", str(error), 422) from error
        source, preview = self.repository.files(workspace_id, output_id)
        old_directory = (self.raster.root / preview).parent.resolve()
        cache_root = self.raster.root / workspace_id / ".cache" / "results"
        if not old_directory.is_relative_to(cache_root):
            raise AnalysisError("INVALID_VIEW_PATH", "视图缓存路径越界。", 409)
        parent = old_directory.parent
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        destination = parent / f"views-v{revision + 1}"
        committed = False
        with TemporaryDirectory(prefix="view-render-", dir=parent) as temporary:
            staged = Path(temporary) / "views"
            metadata = prepare_manifest(
                self.raster.path(source), staged, presentation, cancelled
            )
            try:
                with self.repository.database.sessions.begin() as tx:
                    tx.execute(text("BEGIN IMMEDIATE"))
                    require_workspace(tx, workspace_id)
                    row = tx.get(AnalysisOutputRecord, output_id)
                    if row is None or row.workspace_id != workspace_id:
                        raise AnalysisError("NOT_FOUND", "成果已删除。", 404)
                    if row.revision != revision:
                        raise AnalysisError(
                            "STALE_RESULT", "成果视图已变化，请重新读取后修改。", 409
                        )
                    layers = list(
                        tx.scalars(
                            select(MapLayerRecord).where(
                                MapLayerRecord.output_id == output_id
                            )
                        )
                    )
                    definitions = {view.id: view for view in views}
                    if any(layer.view_id not in definitions for layer in layers):
                        raise AnalysisError(
                            "VIEW_IN_USE",
                            "要移除的视图仍被地图引用，请先移除对应图层。",
                            409,
                        )
                    if destination.exists():
                        raise AnalysisError(
                            "VIEW_DIRECTORY_EXISTS",
                            "目标视图缓存目录已存在，请检查上次保存状态。",
                            409,
                        )
                    check_cancelled(cancelled, "publish raster views")
                    os.replace(staged, destination)
                    row.raster_metadata = metadata
                    row.preview_file = str(
                        (destination / f"{default_view}.png").relative_to(
                            self.raster.root
                        )
                    )
                    row.revision += 1
                    sessions = {layer.session_id for layer in layers}
                    if row.session_id is not None:
                        sessions.add(row.session_id)
                    for session_id in sessions:
                        publish(
                            self.repository.database,
                            tx,
                            session_id,
                            "analysis/output",
                            row.id,
                            row.revision,
                        )
                    for layer in layers:
                        layer.title = definitions[layer.view_id].title
                        layer.revision += 1
                        publish(
                            self.repository.database,
                            tx,
                            layer.session_id,
                            "map/changed",
                            layer.id,
                            layer.revision,
                        )
                    tx.flush()
                    result = output_value(row).model_dump(mode="json")
                committed = True
            finally:
                if not committed and destination.exists() and not staged.exists():
                    os.replace(destination, staged)
        for view in output.metadata["views"]:
            old = old_directory / f"{view['id']}.png"
            try:
                old.unlink()
            except OSError:
                logger.exception("Could not clean obsolete raster view preview %s", old)
        try:
            old_directory.rmdir()
        except OSError:
            # Only prune directories which contain no unrelated files.
            logger.info("Previous view directory retained: %s", Path(preview).parent)
        return result
