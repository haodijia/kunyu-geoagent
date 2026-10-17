"""Persist the global OGE account with the rest of the business database."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import ValidationError

from kunyu.domain.geospatial.oge import OgeAccount, OgeError
from kunyu.persistence.records.oge import OgeAccountRecord

if TYPE_CHECKING:
    from kunyu.persistence.database import Database

logger = logging.getLogger(__name__)


class OgeAccountStore:
    def __init__(self, database: Database) -> None:
        self._database = database

    def read(self) -> OgeAccount | None:
        with self._database.sessions() as tx:
            row = tx.get(OgeAccountRecord, 1)
            if row is None:
                return None
            try:
                return OgeAccount.model_validate(row.value)
            except ValidationError:
                logger.error("The saved OGE account has an invalid format.")
                raise OgeError(
                    "OGE_STORAGE_FAILED", "The saved OGE account is invalid.", 503
                ) from None

    def save(self, account: OgeAccount) -> None:
        value = account.model_dump(mode="json", exclude={"tokens"})
        value["tokens"] = {
            "token": account.tokens.token.get_secret_value(),
            "refreshToken": account.tokens.refreshToken.get_secret_value(),
            "tokenHead": account.tokens.tokenHead,
            "exp": account.tokens.exp,
            "refreshExp": account.tokens.refreshExp,
        }
        with self._database.sessions.begin() as tx:
            tx.merge(OgeAccountRecord(id=1, value=value))

    def clear(self) -> None:
        with self._database.sessions.begin() as tx:
            row = tx.get(OgeAccountRecord, 1)
            if row is not None:
                tx.delete(row)
