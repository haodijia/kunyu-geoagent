"""Build locally derived evidence packages from four persisted OGE raster outputs."""

import hashlib
import logging
from datetime import UTC, datetime
from threading import Event

from sqlalchemy import text

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.assessment import (
    Assessment,
    AssessmentArtifact,
    AssessmentRequest,
    StudyArea,
    StudyAreaWrite,
)
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.workspaces import validate_filename
from kunyu.integrations.geospatial.assessment_raster import build_change
from kunyu.integrations.geospatial.assessment_report import write_report
from kunyu.integrations.geospatial.raster_inspection import (
    region_statistics,
    sample_raster,
)
from kunyu.integrations.geospatial.study_area import area_m2, validated_geometry
from kunyu.persistence.geospatial.assessments import AssessmentRepository

logger = logging.getLogger(__name__)

ARTIFACTS = [
    AssessmentArtifact(
        filename="result.tif", media_type="image/tiff", label="变化分类 GeoTIFF"
    ),
    AssessmentArtifact(
        filename="added-water.geojson",
        media_type="application/geo+json",
        label="新增候选图斑 GeoJSON",
    ),
    AssessmentArtifact(filename="metrics.csv", media_type="text/csv", label="指标 CSV"),
    AssessmentArtifact(
        filename="metrics.json",
        media_type="application/json",
        label="指标及统计口径 JSON",
    ),
    AssessmentArtifact(
        filename="assessment.json",
        media_type="application/json",
        label="完整证据与参数快照",
    ),
    AssessmentArtifact(
        filename="brief.md", media_type="text/markdown", label="研判简报 Markdown"
    ),
    AssessmentArtifact(
        filename="brief.pdf", media_type="application/pdf", label="研判简报 PDF"
    ),
]


class AssessmentService:
    def __init__(self, analysis: AnalysisService) -> None:
        self.analysis = analysis
        self.repository = AssessmentRepository(analysis.repository.database)

    def save_area(self, workspace_id: str, request: StudyAreaWrite) -> StudyArea:
        if not request.name.strip():
            raise AnalysisError("INVALID_AOI_NAME", "研究区名称不能为空。", 422)
        geometry = validated_geometry(request.geometry)
        measured = area_m2(geometry)
        if measured <= 0 or measured > 10_000_000_000:
            raise AnalysisError(
                "AOI_AREA_LIMIT", "研究区面积须大于零且不超过一万平方千米。", 422
            )
        value = StudyArea(
            workspace_id=workspace_id,
            name=request.name.strip(),
            geometry=geometry,
            revision=request.expected_revision + 1,
            area_m2=measured,
            updated_at=datetime.now(UTC),
        )
        return self.repository.save_area(value, request.expected_revision)

    def build(
        self,
        workspace_id: str,
        session_id: str | None,
        request: AssessmentRequest,
        cancelled: Event,
    ) -> Assessment:
        identity = "assessment_" + request.operation_id.hex
        existing = next(
            (v for v in self.repository.list(workspace_id) if v.id == identity), None
        )
        if existing is not None:
            if existing.request != request:
                raise AnalysisError(
                    "ASSESSMENT_CONFLICT", "请求身份已绑定其他参数。", 409
                )
            return existing
        area = self.repository.area(workspace_id)
        if area is None or area.revision != request.area_revision:
            raise AnalysisError("AOI_CONFLICT", "请保存研究区并使用其当前版本。", 409)
        sources = [
            self.analysis.repository.workspace_output(workspace_id, identity)
            for identity in (
                request.before_output_id,
                request.after_output_id,
                request.before_scl_output_id,
                request.after_scl_output_id,
            )
        ]
        paths = [
            self.analysis.raster.path(
                self.analysis.repository.files(workspace_id, source.id)[0]
            )
            for source in sources
        ]
        integrity = []
        for path in paths:
            check_cancelled(cancelled, "freeze assessment input")
            with path.open("rb") as stream:
                integrity.append(
                    {
                        "size_bytes": path.stat().st_size,
                        "sha256": hashlib.file_digest(stream, "sha256").hexdigest(),
                    }
                )
        snapshots = []
        for source, receipt in zip(sources, integrity, strict=True):
            computation = (
                None
                if source.job_id is None
                else self.analysis.repository.job(source.session_id, source.job_id)
            )
            snapshots.append(
                {
                    **source.model_dump(mode="json"),
                    "file_integrity": receipt,
                    "computation": None
                    if computation is None
                    else computation.model_dump(mode="json"),
                }
            )
        name = self.analysis.raster.reserve(workspace_id, request.title)
        value = Assessment(
            id=identity,
            workspace_id=workspace_id,
            session_id=session_id,
            status="building",
            request=request,
            area=area,
            sources=snapshots,
            result_directory=name,
            created_at=datetime.now(UTC),
        )
        value, created = self.repository.create(value)
        if not created:
            return value
        directory = self.analysis.raster.directory(workspace_id, name)
        try:
            metrics = build_change(value, paths, directory, cancelled)
            for path, receipt in zip(paths, integrity, strict=True):
                with path.open("rb") as stream:
                    if (
                        hashlib.file_digest(stream, "sha256").hexdigest()
                        != receipt["sha256"]
                    ):
                        raise AnalysisError(
                            "ASSESSMENT_SOURCE_CHANGED",
                            "输入文件在计算期间变化，请核查来源后重新生成。",
                            409,
                        )
            metadata = self.analysis.raster.prepare(workspace_id, name, cancelled)
            output_id = "out_" + request.operation_id.hex
            value = value.model_copy(
                update={
                    "status": "succeeded",
                    "metrics": metrics,
                    "artifacts": ARTIFACTS,
                    "output_id": output_id,
                }
            )
            check_cancelled(cancelled, "generate assessment report")
            write_report(
                value, directory, self.analysis.raster.preview_path(workspace_id, name)
            )
            check_cancelled(cancelled, "publish assessment")
            with self.repository.database.sessions.begin() as transaction:
                transaction.execute(text("BEGIN IMMEDIATE"))
                self.analysis.repository.publish_derived_output(
                    workspace_id,
                    session_id,
                    output_id,
                    request.title,
                    metadata,
                    {
                        "assessment_id": identity,
                        "method": "MNDWI water change",
                        "area_revision": area.revision,
                    },
                    name,
                    transaction=transaction,
                )
                return self.repository.settle(value, transaction=transaction)
        except Exception as error:
            logger.exception("Building assessment %s failed", identity)
            self.repository.settle(
                value.model_copy(update={"status": "failed", "error": str(error)})
            )
            if isinstance(error, AnalysisError):
                raise
            raise AnalysisError(
                "ASSESSMENT_FAILED", f"研判生成失败：{error}", 422
            ) from error

    def artifact(self, workspace_id: str, identity: str, filename: str):
        value = self.repository.get(workspace_id, identity)
        artifact = next(
            (item for item in value.artifacts if item.filename == filename), None
        )
        if value.status != "succeeded" or artifact is None:
            raise AnalysisError("NOT_FOUND", "成果文件未发布。", 404)
        validate_filename(filename)
        relative = f"{workspace_id}/results/{value.result_directory}/{filename}"
        return self.analysis.raster.path(relative), artifact

    def sample(
        self, workspace_id: str, output_id: str, longitude: float, latitude: float
    ) -> dict:
        output = self.analysis.repository.workspace_output(workspace_id, output_id)
        path, _ = self.analysis.repository.files(workspace_id, output_id)
        result = sample_raster(self.analysis.raster.path(path), longitude, latitude)
        categories = output.metadata.get("categories")
        result["categories"] = categories
        result["output_id"] = output_id
        return result

    def statistics(self, workspace_id: str, output_id: str, geometry: dict) -> dict:
        output = self.analysis.repository.workspace_output(workspace_id, output_id)
        path, _ = self.analysis.repository.files(workspace_id, output_id)
        return region_statistics(
            self.analysis.raster.path(path), geometry, output.metadata
        )
