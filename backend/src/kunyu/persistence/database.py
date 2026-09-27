from dataclasses import dataclass
from pathlib import Path
from sqlite3 import Connection as SQLiteConnection

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

from kunyu.persistence.models import Base
from kunyu.settings import get_app_data_directory

DATABASE_FILE_NAME = "kunyu.db"
APP_DATA_SUBDIRECTORIES = ("artifacts", "results", "exports", "logs")


@dataclass(frozen=True, slots=True)
class Database:
    path: Path
    engine: Engine
    sessions: sessionmaker[Session]

    @classmethod
    def open(cls) -> "Database":
        data_directory = get_app_data_directory()
        data_directory.mkdir(parents=True, exist_ok=True)
        for directory_name in APP_DATA_SUBDIRECTORIES:
            (data_directory / directory_name).mkdir(exist_ok=True)

        database_path = data_directory / DATABASE_FILE_NAME
        engine = create_engine(database_url(database_path))
        configure_sqlite(engine)
        try:
            Base.metadata.create_all(engine)
        except Exception:
            engine.dispose()
            raise
        return cls(
            path=database_path,
            engine=engine,
            sessions=sessionmaker(bind=engine, expire_on_commit=False),
        )

    def close(self) -> None:
        self.engine.dispose()


def database_url(database_path: Path) -> URL:
    return URL.create("sqlite+pysqlite", database=str(database_path))


def configure_sqlite(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(
        dbapi_connection: SQLiteConnection, _: object
    ) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
        finally:
            cursor.close()
