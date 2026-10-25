"""Read persisted numeric results without assigning business meaning to their values."""

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.raster import raster_view
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

    def selection(
        self,
        workspace_id: str,
        output_id: str,
        view_id: str | None,
        bands: list[int] | None,
    ):
        output = self.analysis.repository.workspace_output(workspace_id, output_id)
        view = raster_view(output.metadata, view_id)
        selected = list(dict.fromkeys(view["bands"])) if bands is None else bands
        if (
            not selected
            or len(set(selected)) != len(selected)
            or any(i < 1 or i > output.metadata["band_count"] for i in selected)
        ):
            raise AnalysisError("INVALID_BANDS", "波段索引必须存在且不能重复。", 422)
        path, _ = self.analysis.repository.files(workspace_id, output_id)
        return output, view, selected, self.analysis.raster.path(path)

    def sample(
        self,
        workspace_id: str,
        output_id: str,
        longitude: float,
        latitude: float,
        view_id: str | None = None,
        bands: list[int] | None = None,
    ) -> dict:
        output, view, selected, path = self.selection(
            workspace_id, output_id, view_id, bands
        )
        result = sample_raster(path, longitude, latitude, selected)
        return {
            **result,
            "output_id": output_id,
            "view_id": view["id"],
            "band_indices": selected,
            "bands": [output.metadata["bands"][i - 1]["title"] for i in selected],
            "units": [output.metadata["bands"][i - 1]["unit"] for i in selected],
            "categories": view["style"]["classes"]
            if view["style"]["type"] == "classified" and selected == view["bands"]
            else None,
        }

    def statistics(
        self,
        workspace_id: str,
        output_id: str,
        geometry: dict,
        values: list[float] | None = None,
        view_id: str | None = None,
        bands: list[int] | None = None,
    ) -> dict:
        output, view, selected, path = self.selection(
            workspace_id, output_id, view_id, bands
        )
        measurements = []
        for band in selected:
            categories = (
                view["style"]["classes"]
                if view["style"]["type"] == "classified" and view["bands"] == [band]
                else None
            )
            statistics = region_statistics(path, geometry, band, categories, values)
            measurements.append(
                {
                    "band": band,
                    "title": output.metadata["bands"][band - 1]["title"],
                    "unit": output.metadata["bands"][band - 1]["unit"],
                    **statistics,
                }
            )
        return {"output_id": output_id, "view_id": view["id"], "bands": measurements}
