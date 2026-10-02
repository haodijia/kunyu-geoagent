"""Apply the single development database baseline."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine


def upgrade_database(engine: Engine) -> None:
    config = _alembic_config()
    with engine.connect() as connection:
        # SQLite table rewrites must not cascade into dependent query projections.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
                violations = connection.exec_driver_sql(
                    "PRAGMA foreign_key_check"
                ).all()
                if violations:
                    raise RuntimeError(
                        f"Database migration broke foreign keys: {violations}"
                    )
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option(
        "script_location",
        str(Path(__file__).with_name("migrations")),
    )
    return config
