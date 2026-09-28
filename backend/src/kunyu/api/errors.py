from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from starlette.responses import JSONResponse


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any]


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = dict(details or {})
        super().__init__(message)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(HTTPException, _handle_http_error)


def _handle_api_error(_: Request, error: Exception) -> JSONResponse:
    api_error = _require_api_error(error)
    return _response(
        api_error.status_code,
        api_error.code,
        api_error.message,
        api_error.details,
    )


def _handle_validation_error(_: Request, error: Exception) -> JSONResponse:
    validation_error = _require_validation_error(error)
    issues = [
        {
            "field": ".".join(str(part) for part in item["loc"] if part != "body"),
            "type": item["type"],
        }
        for item in validation_error.errors()
    ]
    return _response(
        422,
        "INVALID_INPUT",
        "The request contains invalid input.",
        {"issues": issues},
    )


def _handle_http_error(_: Request, error: Exception) -> JSONResponse:
    http_error = _require_http_error(error)
    message = (
        http_error.detail
        if isinstance(http_error.detail, str)
        else "The request could not be completed."
    )
    return _response(
        http_error.status_code,
        _http_error_code(http_error.status_code),
        message,
        {},
        headers=http_error.headers,
    )


def _response(
    status_code: int,
    code: str,
    message: str,
    details: Mapping[str, Any],
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorDetail(code=code, message=message, details=dict(details))
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json"),
        headers=headers,
    )


def _http_error_code(status_code: int) -> str:
    if status_code == 401:
        return "UNAUTHORIZED"
    if status_code == 404:
        return "NOT_FOUND"
    if status_code == 409:
        return "CONFLICT"
    if status_code == 422:
        return "INVALID_INPUT"
    if status_code == 503:
        return "SERVICE_UNAVAILABLE"
    return "REQUEST_FAILED"


def _require_api_error(error: Exception) -> ApiError:
    if not isinstance(error, ApiError):
        raise TypeError("Expected ApiError.")
    return error


def _require_validation_error(error: Exception) -> RequestValidationError:
    if not isinstance(error, RequestValidationError):
        raise TypeError("Expected RequestValidationError.")
    return error


def _require_http_error(error: Exception) -> HTTPException:
    if not isinstance(error, HTTPException):
        raise TypeError("Expected HTTPException.")
    return error
