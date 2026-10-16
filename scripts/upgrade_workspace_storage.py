"""Explicit, offline schema-4 export into a separate schema-5 business directory."""

import argparse
import filecmp
import json
import shutil
import sqlite3
from pathlib import Path

from kunyu.domain.oge import OgeAccount
from kunyu.domain.analysis import EXECUTING_STATES
from kunyu.domain.runs import NONTERMINAL_RUN_STATE_VALUES
from kunyu.persistence.database import create_database_engine
from kunyu.persistence.schema import SCHEMA_PATH, _statements, initialize_database


def copy_verified(source: Path, target: Path) -> None:
    if source.is_symlink():
        raise RuntimeError(f"Symbolic links cannot be migrated: {source}")
    if source.is_dir():
        target.mkdir(mode=0o700, parents=True, exist_ok=True)
        for child in source.iterdir():
            copy_verified(child, target / child.name)
    elif source.is_file():
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if target.exists():
            raise RuntimeError(f"Migration would overwrite a file: {target}")
        shutil.copyfile(source, target)
        target.chmod(0o600 | (source.stat().st_mode & 0o100))
        if not filecmp.cmp(source, target, shallow=False):
            raise RuntimeError(f"Copied file differs: {target}")
    else:
        raise RuntimeError(f"Unsupported file: {source}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--switch-desktop", action="store_true", help="Write business-data.json in the source Electron profile after validation.")
    args = parser.parse_args()
    source, target = args.source.resolve(), args.target.resolve()
    if source == target or source in target.parents or target in source.parents:
        raise RuntimeError("Source and target must be separate directories.")
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(target.iterdir()):
        raise RuntimeError("The target must be empty.")
    original = source / "kunyu.db"
    with sqlite3.connect(original.as_uri() + "?mode=ro", uri=True) as old:
        if old.execute("PRAGMA user_version").fetchone()[0] != 4:
            raise RuntimeError("This explicit development upgrade requires schema 4.")
        run_marks = ",".join("?" for _ in NONTERMINAL_RUN_STATE_VALUES)
        job_marks = ",".join("?" for _ in EXECUTING_STATES)
        if old.execute(f"SELECT 1 FROM runs WHERE state IN ({run_marks}) LIMIT 1", NONTERMINAL_RUN_STATE_VALUES).fetchone() or old.execute(f"SELECT 1 FROM analysis_jobs WHERE state IN ({job_marks}) LIMIT 1", EXECUTING_STATES).fetchone():
            raise RuntimeError("Close the application and settle active runs first.")
        outputs = old.execute("SELECT o.id, j.workspace_id, o.cog_file, o.preview_file FROM analysis_outputs o JOIN analysis_jobs j ON j.id=o.job_id JOIN sessions s ON s.id=o.session_id").fetchall()
        attachments = old.execute("SELECT a.id,s.workspace_id FROM session_attachments a JOIN sessions s ON s.id=a.session_id").fetchall()
        destination = target / "kunyu.db"
        destination.touch(mode=0o600, exist_ok=False)
        with sqlite3.connect(destination) as upgraded:
            old.backup(upgraded)
            upgraded.execute("PRAGMA foreign_keys=OFF")
            upgraded.execute("BEGIN IMMEDIATE")
            statements = tuple(_statements(SCHEMA_PATH.read_text(encoding="utf-8")))
            create = next(s for s in statements if "CREATE TABLE analysis_outputs (" in s)
            upgraded.execute(create.replace("CREATE TABLE analysis_outputs (", "CREATE TABLE analysis_outputs_new (", 1))
            columns = [row[1] for row in upgraded.execute("PRAGMA table_info(analysis_outputs_new)")]
            fields = ",".join(f'"{name}"' for name in columns)
            values = ",".join("j.workspace_id" if name == "workspace_id" else "s.title" if name == "source_session_title" else f'o."{name}"' for name in columns)
            upgraded.execute(f"INSERT INTO analysis_outputs_new ({fields}) SELECT {values} FROM analysis_outputs o JOIN analysis_jobs j ON j.id=o.job_id JOIN sessions s ON s.id=o.session_id")
            upgraded.execute("DROP TABLE analysis_outputs")
            upgraded.execute("ALTER TABLE analysis_outputs_new RENAME TO analysis_outputs")
            for statement in statements:
                if "CREATE INDEX ix_analysis_outputs_workspace_created" in statement or "CREATE TABLE oge_account" in statement:
                    upgraded.execute(statement)
            for output_id, workspace_id, cog, preview in outputs:
                for relative in (cog, preview):
                    name = Path(relative).name
                    copy_verified(source / "analysis-results" / relative, target / "workspaces" / workspace_id / "results" / output_id / name)
                upgraded.execute("UPDATE analysis_outputs SET cog_file=?,preview_file=? WHERE id=?", (f"{workspace_id}/results/{output_id}/result.tif", f"{workspace_id}/results/{output_id}/preview.png", output_id))
                metadata, session_id, job_id, run_id, tool_call_id = upgraded.execute(
                    "SELECT o.source_metadata,o.session_id,o.job_id,j.run_id,j.tool_call_id "
                    "FROM analysis_outputs o JOIN analysis_jobs j ON j.id=o.job_id WHERE o.id=?",
                    (output_id,),
                ).fetchone()
                provenance = json.loads(metadata)
                provenance["origin"] = {
                    "session_id": session_id,
                    "job_id": job_id,
                    "run_id": run_id,
                    "tool_call_id": tool_call_id,
                }
                upgraded.execute(
                    "UPDATE analysis_outputs SET source_metadata=? WHERE id=?",
                    (json.dumps(provenance, ensure_ascii=False), output_id),
                )
            for identity, workspace_id in attachments:
                copy_verified(source / "attachments" / identity, target / "workspaces" / workspace_id / "attachments" / identity)
            account_path = source / "oge" / "account.json"
            if account_path.is_file():
                raw = account_path.read_text(encoding="utf-8")
                OgeAccount.model_validate_json(raw)
                upgraded.execute("INSERT INTO oge_account (id,value) VALUES (1,?)", (raw,))
            upgraded.execute("PRAGMA user_version=5")
            if upgraded.execute("PRAGMA foreign_key_check").fetchall() or upgraded.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise RuntimeError("Migrated database failed integrity validation.")
            upgraded.commit()
    for entry in ("workspaces", "skills"):
        if (source / entry).is_dir():
            copy_verified(source / entry, target / entry)
    engine = create_database_engine(destination)
    try:
        initialize_database(engine)
    finally:
        engine.dispose()
    if args.switch_desktop:
        config = source / "business-data.json"
        if config.exists():
            raise RuntimeError("Desktop storage configuration already exists; it was not overwritten.")
        temporary = source / "business-data.json.tmp"
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump({"dataDirectory": str(target)}, stream, ensure_ascii=False, indent=2)
        temporary.chmod(0o600)
        temporary.replace(config)
    print(f"Migrated {len(outputs)} results and {len(attachments)} attachments to {target}. Original data retained at {source}.")
    print("Unregistered old outputs and developer recordings remain in the original directory.")


if __name__ == "__main__":
    main()
