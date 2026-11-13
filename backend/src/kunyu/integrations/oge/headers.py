"""Uniform credentials for authenticated OGE requests."""
import os
from pydantic import SecretStr
from kunyu.domain.geospatial.oge import OgeError

def oge_headers(token: SecretStr) -> dict[str, str]:
    app_key = os.environ.get("OGE_APP_KEY", "")
    if not app_key:
        raise OgeError("OGE_APP_KEY_REQUIRED", "Configure OGE_APP_KEY on the server.", 503)
    return {"Authorization": "Bearer " + token.get_secret_value(), "appKey": app_key}
