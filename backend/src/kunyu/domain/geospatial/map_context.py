"""Explicit map selections travel with a question; camera state stays in the UI."""

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator


class MapSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    geometry: dict[str, JsonValue]
    layer_id: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("geometry")
    @classmethod
    def valid_geometry(cls, value):
        if set(value) != {"type", "coordinates"}:
            raise ValueError("Selection requires only geometry type and coordinates.")
        kind = value["type"]
        if kind not in ("Point", "Polygon", "MultiPolygon"):
            raise ValueError("Selection must be a point or polygon.")
        count = 0

        def position(point):
            nonlocal count
            count += 1
            if (
                count > 10000
                or not isinstance(point, list)
                or len(point) != 2
                or any(type(item) not in (int, float) for item in point)
                or not -180 <= point[0] <= 180
                or not -90 <= point[1] <= 90
            ):
                raise ValueError("Invalid WGS84 selection coordinates.")

        coordinates = value["coordinates"]
        if kind == "Point":
            position(coordinates)
            return value
        polygons = [coordinates] if kind == "Polygon" else coordinates
        if not isinstance(polygons, list) or not polygons:
            raise ValueError("Selection must contain a polygon.")
        for polygon in polygons:
            if not isinstance(polygon, list) or not polygon:
                raise ValueError("Polygon must contain rings.")
            for ring in polygon:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError("Polygon rings must be closed and have four positions.")
                for point in ring:
                    position(point)
        return value


class TurnMapContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str = Field(min_length=1, max_length=64)
    selection: MapSelection | None = None
