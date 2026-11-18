"""Versioned service contracts, separate from generic execution and map UI."""

import json
import re
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.object_review import ObjectReviewProfile
from kunyu.domain.geospatial.raster import ClassifiedStyle, RasterPresentation

CATALOG = Path(__file__).with_name("services")
ReviewContract = tuple[ObjectReviewProfile, str, str | None, tuple[int, ...]]


def service_definition(name: str) -> dict:
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", name):
        raise AnalysisError("INVALID_SERVICE_NAME", "服务名称格式无效。", 422)
    path = CATALOG / f"{name}.json"
    if not path.is_file():
        raise AnalysisError("SERVICE_NOT_REGISTERED", "该服务尚未登记成果契约。", 404)
    data = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(data["parameters"])
    presentation = RasterPresentation.model_validate(data["presentation"])
    if "object_review" in data:
        _review_contract(data["object_review"], presentation)
    return data


def _review_contract(data: dict, presentation: RasterPresentation) -> ReviewContract:
    profile = ObjectReviewProfile.model_validate(data)
    view = next(
        (view for view in presentation.views if view.id == profile.class_view), None
    )
    if view is None or not isinstance(view.style, ClassifiedStyle):
        raise ValueError("Object review requires a declared classified view.")
    codes = tuple(category.value for category in view.style.classes)
    groups = (
        profile.candidate_values + profile.missing_values + profile.ambiguous_values
    )
    if not set(groups) <= set(codes):
        raise ValueError(
            "Object review class groups must use codes from the declared view."
        )
    evidence = profile.evidence.band if profile.evidence else None
    if evidence is not None and evidence not in {
        band.name for band in presentation.bands
    }:
        raise ValueError("Object review evidence requires a declared band.")
    return profile, presentation.bands[view.bands[0] - 1].name, evidence, codes


@lru_cache(maxsize=32)
def registered_object_review(name: str, version: str) -> ReviewContract | None:
    try:
        definition = service_definition(name)
    except AnalysisError as error:
        if error.code in {"SERVICE_NOT_REGISTERED", "INVALID_SERVICE_NAME"}:
            return None
        raise
    if definition["version"] != version or "object_review" not in definition:
        return None
    presentation = RasterPresentation.model_validate(definition["presentation"])
    return _review_contract(definition["object_review"], presentation)


def service_catalog() -> list[dict]:
    return [
        {key: definition[key] for key in ("name", "version", "title", "description")}
        for path in sorted(CATALOG.glob("*.json"))
        for definition in [service_definition(path.stem)]
    ]


def service_parameters(name: str, arguments: dict) -> tuple[dict, dict]:
    definition = service_definition(name)
    schema = definition["parameters"]
    parameters = {
        key: value["default"]
        for key, value in schema["properties"].items()
        if "default" in value
    } | arguments
    try:
        json.dumps(parameters, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise AnalysisError(
            "INVALID_SERVICE_PARAMETERS", "参数必须为有限JSON数值。", 422
        ) from error
    errors = list(Draft202012Validator(schema).iter_errors(parameters))
    if errors:
        raise AnalysisError("INVALID_SERVICE_PARAMETERS", errors[0].message, 422)
    return definition, parameters
