"""Enter an inherited directory descriptor before exec, without parent preexec hooks."""

import os
import sys


def main() -> None:
    try:
        descriptor = int(sys.argv[1])
        os.fchdir(descriptor)
        os.close(descriptor)
        os.execv(sys.argv[2], sys.argv[2:])
    except (OSError, ValueError) as error:
        print(f"Foreground process could not start: {error}", file=sys.stderr)
        raise SystemExit(125) from error


if __name__ == "__main__":
    main()
