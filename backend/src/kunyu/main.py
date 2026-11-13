"""Single-process web application entry point."""

import logging
import os

import uvicorn

from kunyu.server import create_app


class WebServer(uvicorn.Server):
    def handle_exit(self, sig: int, frame) -> None:
        scheduler = getattr(self.config.app.state, "run_scheduler", None)
        if scheduler is not None:
            scheduler.begin_shutdown()
        super().handle_exit(sig, frame)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    WebServer(
        uvicorn.Config(
            create_app(),
            host="0.0.0.0",
            port=int(os.environ.get("PORT", "80")),
            proxy_headers=False,
            access_log=False,
            timeout_graceful_shutdown=20,
        )
    ).run()


if __name__ == "__main__":
    main()
