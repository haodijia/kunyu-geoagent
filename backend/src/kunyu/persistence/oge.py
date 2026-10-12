"""Atomically store the backend-owned OGE session in a private account file."""

import json
import logging
import os
import tempfile
from pathlib import Path

from pydantic import ValidationError

from kunyu.domain.oge import OgeAccount, OgeError

logger = logging.getLogger(__name__)


class OgeAccountStore:
    def __init__(self, data_directory: Path) -> None:
        self._path = data_directory / "oge" / "account.json"

    def read(self) -> OgeAccount | None:
        try:
            data = self._path.read_bytes()
        except FileNotFoundError:
            return None
        except OSError:
            logger.error("Could not read the OGE account store.")
            raise OgeError(
                "OGE_STORAGE_FAILED", "Could not read the saved OGE account.", 503
            ) from None
        try:
            return OgeAccount.model_validate_json(data)
        except ValidationError:
            logger.error("The OGE account store has an invalid format.")
            raise OgeError(
                "OGE_STORAGE_FAILED", "The saved OGE account is invalid.", 503
            ) from None

    def save(self, account: OgeAccount) -> None:
        temporary: Path | None = None
        try:
            self._path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            self._path.parent.chmod(0o700)
            value = account.model_dump(mode="json", exclude={"tokens"})
            value["tokens"] = {
                "token": account.tokens.token.get_secret_value(),
                "refreshToken": account.tokens.refreshToken.get_secret_value(),
                "tokenHead": account.tokens.tokenHead,
                "exp": account.tokens.exp,
                "refreshExp": account.tokens.refreshExp,
            }
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self._path.parent,
                prefix="account-",
                suffix=".tmp",
                delete=False,
            ) as stream:
                temporary = Path(stream.name)
                os.fchmod(stream.fileno(), 0o600)
                json.dump(value, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self._path)
        except OSError:
            logger.error("Could not save the OGE account store.")
            raise OgeError(
                "OGE_STORAGE_FAILED", "Could not save the OGE account.", 503
            ) from None
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    logger.error("Could not remove an unpublished OGE account file.")

    def clear(self) -> None:
        try:
            self._path.unlink(missing_ok=True)
        except OSError:
            logger.error("Could not clear the OGE account store.")
            raise OgeError(
                "OGE_STORAGE_FAILED", "Could not clear the OGE account.", 503
            ) from None
