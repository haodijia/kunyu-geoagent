from logging.config import fileConfig

from alembic import context

from kunyu.persistence.database import (
    DATABASE_FILE_NAME,
    create_database_engine,
    database_url,
)
from kunyu.persistence.models import Base
from kunyu.settings import get_app_data_directory

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = database_url(
        get_app_data_directory() / DATABASE_FILE_NAME
    ).render_as_string(
        hide_password=False
    )
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        transactional_ddl=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    supplied_connection = config.attributes.get("connection")
    if supplied_connection is not None:
        context.configure(
            connection=supplied_connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            transactional_ddl=True,
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    connectable = create_database_engine(
        get_app_data_directory() / DATABASE_FILE_NAME
    )
    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                transactional_ddl=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
