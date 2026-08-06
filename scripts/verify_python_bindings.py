#!/usr/bin/env python3
"""Verify closure of the committed generated Python binding projections.

The authoritative parity check is deterministic regeneration followed by a
zero-diff assertion in CI. This verifier checks the committed Rust registration
surface, Python public surface, and duplicate-definition invariants.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "crates/wasm4pm-bindings-py/src/exports_generated.rs"
PY_INIT = ROOT / "crates/wasm4pm-bindings-py/python/wasm4pm/__init__.py"


def fail(message: str) -> None:
    print(f"PY_BINDINGS_REFUSED: {message}", file=sys.stderr)
    raise SystemExit(1)


def generated_exports(text: str) -> set[str]:
    return set(re.findall(r"wrap_pyfunction!\((\w+),\s*m\)", text))


def python_exports(text: str) -> set[str]:
    tree = ast.parse(text)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "__all__" for target in node.targets
        ):
            value = ast.literal_eval(node.value)
            if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
                fail("__all__ must be a literal list[str]")
            if len(value) != len(set(value)):
                fail("__all__ contains duplicate exports")
            return set(value)
    fail("python package does not define __all__")
    return set()


def main() -> None:
    for path in (GENERATED, PY_INIT):
        if not path.is_file():
            fail(f"missing required projection: {path.relative_to(ROOT)}")

    generated_text = GENERATED.read_text(encoding="utf-8")
    registered = generated_exports(generated_text)
    public = python_exports(PY_INIT.read_text(encoding="utf-8"))

    if not registered:
        fail("generated Rust registration surface is empty")

    if registered != public:
        fail(
            "native registrations and Python __all__ differ; "
            f"native_only={sorted(registered-public)[:20]} "
            f"python_only={sorted(public-registered)[:20]}"
        )

    duplicate_functions = [
        name
        for name in registered
        if len(re.findall(rf"\bfn\s+{re.escape(name)}\s*\(", generated_text)) != 1
    ]
    if duplicate_functions:
        fail(f"exports must be defined exactly once: {sorted(duplicate_functions)[:20]}")

    print(f"PY_BINDINGS_ALIVE exports={len(registered)}")


if __name__ == "__main__":
    main()
