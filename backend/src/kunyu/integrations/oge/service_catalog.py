"""Versioned service contracts, separate from generic execution and map UI."""

import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.products import RasterProduct

CATALOG = Path(__file__).with_name("services")


def service_definition(name: str) -> dict:
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", name):
        raise AnalysisError("INVALID_SERVICE_NAME", "服务名称格式无效。", 422)
    path = CATALOG / f"{name}.json"
    if not path.is_file():
        raise AnalysisError("SERVICE_NOT_REGISTERED", "该服务尚未登记成果契约。", 404)
    data = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(data["parameters"])
    names = [product["name"] for product in data["products"]]
    if not names or len(set(names)) != len(names):
        raise AnalysisError("INVALID_SERVICE_CONTRACT", "服务成果名称必须非空且唯一。")
    for product in data["products"]:
        RasterProduct.model_validate(product)
    return data


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
