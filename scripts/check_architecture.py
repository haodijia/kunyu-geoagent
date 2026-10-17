"""Check module ownership and dependency direction without importing application code."""

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend/src"
FRONTEND = ROOT / "frontend/src"

LAYER_ROOT_FILES = {
    "api": {"__init__.py", "dependencies.py", "errors.py", "router.py"},
    "application": {"__init__.py"},
    "domain": {"__init__.py", "mcp.py"},
    "persistence": {"__init__.py", "database.py", "schema.py", "time.py"},
}
FORBIDDEN_DEPENDENCIES = {
    "application": ("kunyu.api",),
    "domain": (
        "kunyu.api",
        "kunyu.application",
        "kunyu.persistence",
        "kunyu.integrations",
        "fastapi",
        "sqlalchemy",
    ),
    "persistence": ("kunyu.api", "kunyu.application"),
    "integrations": ("kunyu.api", "kunyu.application"),
    "agent": ("kunyu.api",),
}
RUNTIME_FORBIDDEN = (
    "kunyu.api",
    "kunyu.application",
    "kunyu.persistence",
    "kunyu.integrations",
    "fastapi",
    "sqlalchemy",
)
PURE_FRONTEND = (
    "features/events/stream/",
    "features/events/projection/",
    "features/events/trajectory/records/",
    "features/messages/model/",
)
IMPORT = re.compile(
    r"\bfrom\s*[\"']([^\"']+)[\"']"
    r"|\bimport\s*\(\s*[\"']([^\"']+)[\"']\s*\)"
    r"|\bimport\s*[\"']([^\"']+)[\"']"
)


def matches(module: str, prefix: str) -> bool:
    return module == prefix or module.startswith(prefix + ".")


def module_path(module: str) -> Path | None:
    path = BACKEND / module.replace(".", "/")
    if path.with_suffix(".py").is_file():
        return path.with_suffix(".py")
    if (path / "__init__.py").is_file():
        return path / "__init__.py"
    if module == "kunyu":
        return path
    return None


def check_backend(errors: list[str]) -> int:
    paths = sorted((BACKEND / "kunyu").rglob("*.py"))
    graph: dict[str, set[str]] = {}
    for path in paths:
        relative = path.relative_to(BACKEND)
        parts = relative.parts
        layer = parts[1] if len(parts) > 2 else ""
        location = str(path.relative_to(ROOT))
        if len(parts) == 3 and layer in LAYER_ROOT_FILES:
            if path.name not in LAYER_ROOT_FILES[layer]:
                errors.append(
                    f"{location}: place business modules in their feature package"
                )
        forbidden = FORBIDDEN_DEPENDENCIES.get(layer, ())
        if parts[:3] == ("kunyu", "agent", "runtime"):
            forbidden = (*forbidden, *RUNTIME_FORBIDDEN)
        module = ".".join(relative.with_suffix("").parts).removesuffix(".__init__")
        graph[module] = set()
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ImportFrom):
                if node.level:
                    errors.append(
                        f"{location}:{node.lineno}: use explicit kunyu imports"
                    )
                    continue
                imports = [node.module] if node.module else []
            elif isinstance(node, ast.Import):
                imports = [alias.name for alias in node.names]
            else:
                continue
            for imported in imports:
                if any(matches(imported, prefix) for prefix in forbidden):
                    errors.append(
                        f"{location}:{node.lineno}: forbidden dependency {imported}"
                    )
                if matches(imported, "kunyu"):
                    if module_path(imported) is None:
                        errors.append(
                            f"{location}:{node.lineno}: missing module {imported}"
                        )
                    graph[module].add(imported)
    # These deterministic protocol/projection packages must remain acyclic.
    visited: set[str] = set()
    active: list[str] = []

    def visit(module: str) -> None:
        if module in active:
            errors.append(
                "Cyclic event/projection dependency: " + " -> ".join([*active, module])
            )
            return
        if module in visited:
            return
        visited.add(module)
        active.append(module)
        for dependency in sorted(graph.get(module, ())):
            if dependency.startswith(
                ("kunyu.agent.runtime.events.", "kunyu.agent.runtime.projection.run.")
            ):
                visit(dependency)
        active.pop()

    for module in sorted(graph):
        if module.startswith(
            ("kunyu.agent.runtime.events.", "kunyu.agent.runtime.projection.run.")
        ):
            visit(module)
    return len(paths)


def frontend_target(path: Path, imported: str) -> Path | None:
    imported = imported.partition("?")[0]
    stem = (
        FRONTEND / imported[2:] if imported.startswith("@/") else path.parent / imported
    )
    for candidate in (
        stem,
        Path(str(stem) + ".ts"),
        Path(str(stem) + ".tsx"),
        Path(str(stem) + ".d.ts"),
        stem / "index.ts",
        stem / "index.tsx",
    ):
        if candidate.is_file():
            return candidate
    return None


def check_frontend(errors: list[str]) -> int:
    paths = sorted(
        path for path in FRONTEND.rglob("*") if path.suffix in {".ts", ".tsx"}
    )
    for path in paths:
        relative = path.relative_to(FRONTEND).as_posix()
        pure = relative.startswith(PURE_FRONTEND)
        for match in IMPORT.finditer(path.read_text(encoding="utf-8")):
            imported = next(value for value in match.groups() if value is not None)
            if pure and imported == "react":
                errors.append(
                    f"{relative}: data transformations must not depend on React"
                )
            if not imported.startswith(("@/", ".")):
                continue
            target = frontend_target(path, imported)
            if target is None:
                errors.append(f"{relative}: missing import {imported}")
            elif pure and target.suffix == ".tsx":
                errors.append(
                    f"{relative}: data transformations must not depend on UI {imported}"
                )
    return len(paths)


def main() -> int:
    errors: list[str] = []
    backend_count = check_backend(errors)
    frontend_count = check_frontend(errors)
    for error in errors:
        print(error)
    if errors:
        return 1
    print(
        f"Architecture checks passed: {backend_count} Python modules, {frontend_count} frontend modules."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
