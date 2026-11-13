"""Deployment settings shared by routing, cookies and OAuth."""

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class WebConfig:
    public_url: str
    root_path: str
    frontend: Path
    password: str

    @classmethod
    def read(cls) -> "WebConfig":
        public_url = os.environ.get("KUNYU_PUBLIC_URL", "").rstrip("/") + "/"
        parsed = urlsplit(public_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or ".." in parsed.path.split("/")
        ):
            raise ValueError("KUNYU_PUBLIC_URL must be the public application URL.")
        password = os.environ.get("KUNYU_ACCESS_PASSWORD", "")
        if len(password) < 12:
            raise ValueError(
                "KUNYU_ACCESS_PASSWORD must contain at least 12 characters."
            )
        frontend = Path(os.environ["KUNYU_FRONTEND_DIST"]).resolve()
        if not (frontend / "index.html").is_file():
            raise ValueError("KUNYU_FRONTEND_DIST must contain the built frontend.")
        return cls(public_url, parsed.path.rstrip("/"), frontend, password)

    @property
    def cookie_path(self) -> str:
        return self.root_path + "/"

    @property
    def origin(self) -> str:
        parsed = urlsplit(self.public_url)
        return f"{parsed.scheme}://{parsed.netloc}"
