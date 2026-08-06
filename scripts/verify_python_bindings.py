#!/usr/bin/env python3
"""Verify the generated Python binding surface is closed over the WASM API.

This is a structural admission gate. Behavioral correctness remains covered by
maturin + pytest, but generation drift must fail before a wheel is published.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DTS = ROOT / "wasm4pm/pkg/wasm4pm.d.ts"
GENERATED = ROOT / "crates/wasm4pm-bindings-py/src/exports_generated.rs"
PY_INIT = ROOT / "crates/wasm4pm-bindings-py/python/wasm4pm/__init__.py"

SKIP = {"main"}
SKIP_MARKERS = ("RlState", "Float32Array", "Uint8Array")


def fail(message: str) -> None:
    print(f"PY_BINDINGS_REFUSED: {message}", file=sys.stderr)
    raise SystemExit(1)


def wasm_exports(text: str) -> set[str]:
    exports: set[str] = set()
    for name, args, ret in re.findall(
        r"export function (\w+)\(([^)]*)\):\s*([^;]+);", text
    ):
        if name in SKIP or any(marker in args or marker in ret for marker in SKIP_MARKERS):
            continue
        exports.add(name)
    return exports


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
            return set(value)
    fail("python package does not define __all__")
    return set()


def main() -> None:
    for path in (DTS, GENERATED, PY_INIT):
        if not path.is_file():
            fail(f"missing required projection: {path.relative_to(ROOT)}")

    expected = wasm_exports(DTS.read_text(encoding="utf-8"))
    registered = generated_exports(GENERATED.read_text(encoding="utf-8"))
    public = python_exports(PY_INIT.read_text(encoding="utf-8"))

    if registered != public:
        fail(
            "native registrations and Python __all__ differ; "
            f"native_only={sorted(registered-public)[:20]} "
            f"python_only={sorted(public-registered)[:20]}"
        )

    missing = expected - registered
    unexpected = registered - expected
    if missing or unexpected:
        fail(
            "generated surface does not match supported WASM exports; "
            f"missing={sorted(missing)[:20]} unexpected={sorted(unexpected)[:20]}"
        )

    duplicate_functions = [
        name for name in registered
        if len(re.findall(rf"\bfn\s+{re.escape(name)}\s*\(", GENERATED.read_text(encoding="utf-8"))) != 1
    ]
    if duplicate_functions:
        fail(f"exports must be defined exactly once: {sorted(duplicate_functions)[:20]}")

    print(f"PY_BINDINGS_ALIVE exports={len(expected)}")


if __name__ == "__main__":
    main()
