"""Desktop backend command-line entry point."""

import argparse

from kunyu.desktop import DesktopConfigurationError, run_desktop
from kunyu.server import create_app


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Kunyu backend.")
    parser.add_argument(
        "--desktop",
        action="store_true",
        help="Run as a desktop sidecar on the loopback interface.",
    )
    args = parser.parse_args()

    if not args.desktop:
        parser.error("the --desktop option is required")

    try:
        run_desktop(create_app)
    except DesktopConfigurationError as error:
        parser.error(str(error))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
