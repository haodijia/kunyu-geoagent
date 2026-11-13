"""Single-process web application entry point."""
import logging
import os
import uvicorn
from kunyu.server import create_app

def main() -> None:
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "80")), proxy_headers=False, access_log=False)

if __name__ == "__main__":
    main()
