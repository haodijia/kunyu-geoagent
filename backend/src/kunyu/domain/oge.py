"""OGE account facts; secrets never appear in the settings projection."""

from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    SecretStr,
    TypeAdapter,
    field_validator,
    model_validator,
)

DEFAULT_OGE_BASE_URL = "http://openge.org.cn/api"


class OgeError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 502) -> None:
        self.code, self.status = code, status
        super().__init__(message)


class OgeLogin(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    base_url: str = Field(min_length=1, max_length=2048)
    username: str = Field(min_length=1, max_length=200)
    password: SecretStr = Field(min_length=1, max_length=1024)

    @field_validator("base_url")
    @classmethod
    def endpoint(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        url = urlsplit(value)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username is not None
            or url.password is not None
            or url.query
            or url.fragment
        ):
            raise ValueError(
                "Use an HTTP(S) API base URL without credentials, query or fragment."
            )
        _ = url.port
        return str(TypeAdapter(HttpUrl).validate_python(value)).rstrip("/")

    @field_validator("username")
    @classmethod
    def account_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Username must not be empty.")
        return value


class OgeTokens(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    token: SecretStr = Field(min_length=1)
    refreshToken: SecretStr = Field(min_length=1)
    tokenHead: Literal["Bearer "]
    exp: int = Field(strict=True, gt=0)
    refreshExp: int = Field(strict=True, gt=0)


class OgeAccount(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    base_url: str
    username: str
    tokens: OgeTokens
    updated_at: str


class OgeAccountStatus(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    state: Literal["signed_out", "signed_in", "expired"]
    base_url: str
    username: str | None
    expires_at: int | None
    updated_at: str | None


class OgeRegionNode(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    code: str
    name: str
    nameEn: str
    level: int = Field(ge=0, le=4)
    children: list["OgeRegionNode"]


class OgeImageRecord(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    imageId: int = Field(gt=0)
    productId: int = Field(gt=0)
    imageIdentification: str
    productName: str
    mission: str | None
    phenomenonTime: str
    coverCloud: float | None
    resolution: str | None
    crs: str | None
    upperLeftLong: float | None
    upperLeftLat: float | None
    upperRightLong: float | None
    upperRightLat: float | None
    lowerLeftLong: float | None
    lowerLeftLat: float | None
    lowerRightLong: float | None
    lowerRightLat: float | None


class OgeImagePage(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    pages: int = Field(ge=0)
    currentPage: int = Field(ge=1)
    total: int = Field(ge=0)
    pageSize: int = Field(ge=1)
    records: list[OgeImageRecord]

    @model_validator(mode="after")
    def page_shape(self) -> Self:
        if len(self.records) > self.pageSize or len(self.records) > self.total:
            raise ValueError("OGE pagination is inconsistent.")
        return self
