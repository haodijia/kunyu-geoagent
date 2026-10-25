"""Remove a result family and its exact registered files with rollback staging."""

import errno
import logging
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import delete, select, text

from kunyu.application.workspaces.files import require_active_workspace
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.map_layers import normalize_positions
from kunyu.persistence.records.geospatial import AnalysisOutputRecord, MapLayerRecord

logger = logging.getLogger(__name__)


class ResultRemovalService:
    def __init__(self, database: Database) -> None:
        self.database = database
        self.root = (database.path.parent / "workspaces").resolve()

    def remove(self, workspace_id: str, output_id: str) -> dict:
        moved: list[tuple[Path, Path]] = []
        # Staging stays on the workspace filesystem so renames are atomic.
        with TemporaryDirectory(prefix="result-removal-", dir=self.root) as temporary:
            try:
                with self.database.sessions.begin() as tx:
                    tx.execute(text("BEGIN IMMEDIATE"))
                    require_active_workspace(tx, workspace_id)
                    rows = list(
                        tx.scalars(
                            select(AnalysisOutputRecord).where(
                                AnalysisOutputRecord.workspace_id == workspace_id
                            )
                        )
                    )
                    selected = next((row for row in rows if row.id == output_id), None)
                    if selected is None:
                        raise AnalysisError("NOT_FOUND", "Result was not found.", 404)
                    family = selected.raster_metadata.get("bundle_id", selected.id)
                    if not isinstance(family, str) or not family:
                        raise AnalysisError(
                            "RESULT_INVALID_BUNDLE",
                            "Result bundle identity is invalid.",
                            409,
                        )
                    removed = [
                        row
                        for row in rows
                        if row.id == family
                        or row.raster_metadata.get("bundle_id") == family
                    ]
                    ids = [row.id for row in removed]
                    files = set().union(*(self._files(row) for row in removed))
                    other_files = set().union(
                        *(self._files(row) for row in rows if row.id not in ids)
                    )
                    if files & other_files:
                        raise AnalysisError(
                            "RESULT_SHARED_FILE",
                            "Result files are shared with another result.",
                            409,
                        )
                    paths = [
                        self._path(workspace_id, relative) for relative in sorted(files)
                    ]
                    affected_sessions = set(
                        tx.scalars(
                            select(MapLayerRecord.session_id).where(
                                MapLayerRecord.output_id.in_(ids)
                            )
                        )
                    )
                    for index, source in enumerate(paths):
                        destination = Path(temporary) / str(index)
                        os.replace(source, destination)
                        moved.append((source, destination))
                    tx.execute(
                        delete(MapLayerRecord).where(MapLayerRecord.output_id.in_(ids))
                    )
                    tx.execute(
                        delete(AnalysisOutputRecord).where(
                            AnalysisOutputRecord.id.in_(ids)
                        )
                    )
                    for session_id in affected_sessions:
                        normalize_positions(tx, session_id)
            except BaseException:
                for source, staged in reversed(moved):
                    os.replace(staged, source)
                raise
            # Only empty result directories are pruned; unregistered files stay intact.
            for source, _ in moved:
                parent = source.parent
                boundaries = {
                    self.root / workspace_id / "results",
                    self.root / workspace_id / ".cache" / "results",
                }
                while parent not in boundaries and parent != self.root / workspace_id:
                    try:
                        parent.rmdir()
                    except OSError as error:
                        if error.errno not in {errno.ENOTEMPTY, errno.ENOENT}:
                            logger.warning(
                                "Could not prune empty result directory %s: %s",
                                parent,
                                error,
                            )
                        break
                    parent = parent.parent
        logger.info(
            "Removed result family %s with %d products and %d files",
            family,
            len(ids),
            len(moved),
        )
        return {
            "removed_output_ids": ids,
            "affected_session_ids": sorted(affected_sessions),
        }

    @staticmethod
    def _files(row: AnalysisOutputRecord) -> set[str]:
        paths = {row.cog_file, row.preview_file}
        bundle = row.source_metadata.get("bundle_file")
        if isinstance(bundle, str):
            paths.add(bundle)
        return paths

    def _path(self, workspace_id: str, relative: str) -> Path:
        path = self.root / relative
        base = self.root / workspace_id
        permitted = (base / "results", base / ".cache" / "results")
        if not any(path.is_relative_to(directory) for directory in permitted):
            raise AnalysisError(
                "RESULT_INVALID_PATH",
                "Result file is outside its managed directory.",
                409,
            )
        if path.resolve() != path.absolute() or not path.is_file() or path.is_symlink():
            raise AnalysisError(
                "RESULT_INVALID_PATH",
                "Result file is missing or is not a regular managed file.",
                409,
            )
        return path
