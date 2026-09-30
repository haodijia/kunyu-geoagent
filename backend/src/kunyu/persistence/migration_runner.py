"""Apply the single development database baseline."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine


def upgrade_database(engine: Engine) -> None:
    config = _alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option(
        "script_location",
        str(Path(__file__).with_name("migrations")),
    )
    return config
