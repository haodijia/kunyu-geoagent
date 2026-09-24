import os
from pathlib import Path

from platformdirs import user_data_path

API_VERSION = "1"
APP_DATA_DIRECTORY_ENV = "KUNYU_APP_DATA_DIR"
DESKTOP_HOST = "127.0.0.1"
DESKTOP_PORT = 8000
DESKTOP_RENDERER_ORIGINS = ("http://127.0.0.1:5173", "null")
SESSION_HEADER = "X-Kunyu-Session"
SESSION_TOKEN_ENV = "KUNYU_SESSION_TOKEN"


def get_app_data_directory() -> Path:
    configured_directory = os.environ.get(APP_DATA_DIRECTORY_ENV)
    if configured_directory:
        return Path(configured_directory).expanduser().resolve()

    return user_data_path("Kunyu", appauthor=False, ensure_exists=False)
