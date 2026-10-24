"""Read persisted numeric results without assigning business meaning to their values."""

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.geospatial.raster_inspection import (
    region_statistics,
    sample_raster,
)


class ResultService:
    def __init__(self, analysis: AnalysisService) -> None:
        self.analysis = analysis

    def info(self, workspace_id: str, file_path: str) -> dict:
        for output in self.analysis.repository.workspace_outputs(workspace_id):
            if file_path == output.file_path:
                parameters = output.source_metadata.get("parameters", {})
                return {
                    **output.model_dump(mode="json", exclude={"source_metadata"}),
                    "source_metadata": {
                        "origin": output.source_metadata.get("origin"),
                        "parameters": {
                            key: parameters[key]
                            for key in (
                                "script",
                                "crs",
                                "scale",
                                "service_name",
                                "service_version",
                                "arguments",
                                "limitations",
                            )
                            if key in parameters
                        },
                    },
                }
        raise AnalysisError("NOT_FOUND", "该路径未登记为当前工作区的成果。", 404)

    def sample(
        self, workspace_id: str, output_id: str, longitude: float, latitude: float
    ) -> dict:
        output = self.analysis.repository.workspace_output(workspace_id, output_id)
        path, _ = self.analysis.repository.files(workspace_id, output_id)
        result = sample_raster(self.analysis.raster.path(path), longitude, latitude)
        return {
            **result,
            "categories": output.metadata.get("categories"),
            "output_id": output_id,
        }

    def statistics(
        self,
        workspace_id: str,
        output_id: str,
        geometry: dict,
        values: list[float] | None = None,
    ) -> dict:
        output = self.analysis.repository.workspace_output(workspace_id, output_id)
        path, _ = self.analysis.repository.files(workspace_id, output_id)
        return region_statistics(
            self.analysis.raster.path(path), geometry, output.metadata, values
        )
