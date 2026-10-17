"""Enter an inherited directory descriptor before exec, without parent preexec hooks."""

import os
import subprocess
import sys


def main() -> None:
    try:
        if os.name == "nt":
            # Do not spawn the command until the parent assigns us to its job.
            if sys.stdin.buffer.read(1) != b"\x01":
                raise SystemExit(125)
            raise SystemExit(subprocess.call(sys.argv[1:], stdin=subprocess.DEVNULL))
        descriptor = int(sys.argv[1])
        os.fchdir(descriptor)
        os.close(descriptor)
        os.execv(sys.argv[2], sys.argv[2:])
    except (OSError, ValueError) as error:
        print(f"Foreground process could not start: {error}", file=sys.stderr)
        raise SystemExit(125) from error


if __name__ == "__main__":
    main()
