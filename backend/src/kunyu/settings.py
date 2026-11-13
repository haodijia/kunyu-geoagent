"""Application configuration."""
import os
from pathlib import Path

API_VERSION = "1"
APP_DATA_DIRECTORY_ENV = "KUNYU_APP_DATA_DIR"

def get_app_data_directory() -> Path:
    value = os.environ.get(APP_DATA_DIRECTORY_ENV)
    if not value:
        raise ValueError(f"{APP_DATA_DIRECTORY_ENV} must name the server data directory.")
    return Path(value).expanduser().resolve()

def get_geocoding_url() -> str:
    return os.environ.get("KUNYU_GEOCODING_URL", "https://nominatim.openstreetmap.org/reverse")
