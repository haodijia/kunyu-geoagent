from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine

BACKEND_DIRECTORY = Path(__file__).resolve().parents[3]


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIRECTORY / "alembic.ini"))
    config.set_main_option(
        "script_location", str(BACKEND_DIRECTORY / "migrations")
    )
    return config


def upgrade_database(engine: Engine) -> None:
    config = alembic_config()
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
