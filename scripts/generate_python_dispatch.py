#!/usr/bin/env python3
"""Generate typed PyO3 exports mirroring wasm4pm Rust/WASM function signatures."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DTS = ROOT / "wasm4pm" / "pkg" / "wasm4pm.d.ts"
SRC = ROOT / "wasm4pm" / "src"
OUT_RS = ROOT / "crates" / "wasm4pm-bindings-py" / "src" / "exports_generated.rs"
OUT_PY = ROOT / "crates" / "wasm4pm-bindings-py" / "python" / "wasm4pm" / "__init__.py"

SKIP_FUNCTIONS = {"main"}
SKIP_TYPE_MARKERS = ("RlState", "Float32Array", "Uint8Array")
SKIP_PATH_MARKERS = ("wasm_bindings", "wasm_testing_utils")

PREFERRED_FILES = (
    "lib.rs",
    "utilities.rs",
    "state.rs",
    "io.rs",
    "prediction.rs",
    "prediction_remaining_time.rs",
    "prediction_outcome.rs",
    "prediction_drift.rs",
    "ocel_v2.rs",
    "powl_api.rs",
)

MANUAL_PATH_OVERRIDES: dict[str, str] = {
    "object_count": "wasm4pm::state::object_count",
    "clear_all_objects": "wasm4pm::state::clear_all_objects",
    "delete_object": "wasm4pm::state::delete_object",
    "get_activities": "wasm4pm::utilities::get_activities",
    "get_traces": "wasm4pm::utilities::get_traces",
    "get_activity_frequencies": "wasm4pm::utilities::get_activity_frequencies",
    "get_trace_count": "wasm4pm::utilities::get_trace_count",
    "get_event_count": "wasm4pm::utilities::get_event_count",
    "wf_net_to_powl": "wasm4pm::wf_to_powl::wf_net_to_powl",
    "read_bpmn": "wasm4pm::bpmn_import::read_bpmn",
    "check_wf_net_soundness": "wasm4pm::soundness::check_wf_net_soundness",
    "load_ocel_v2": "wasm4pm::ocel_v2::load_ocel_v2",
    "flatten_ocel_v2": "wasm4pm::ocel_v2::flatten_ocel_v2",
    "validate_ocel_v2": "wasm4pm::ocel_v2::validate_ocel_v2",
    "discover_powl_from_log": "wasm4pm::powl_api::discover_powl_from_log",
    "discover_powl_from_log_config": "wasm4pm::powl_api::discover_powl_from_log_config",
    "parse_powl": "wasm4pm::powl_api::parse_powl",
    "validate_partial_orders": "wasm4pm::powl_api::validate_partial_orders",
    "powl_execute": "wasm4pm::powl_execution::powl_execute",
}

# Python default arguments mirroring common Rust/WASM optional parameters.
PY_SIGNATURE_DEFAULTS: dict[str, dict[str, str]] = {
    "validate_ocel_v2": {"cardinality_json": '""'},
    "powl_execute": {"config_json": '""'},
    "discover_powl_from_log": {"variant": '"decision_graph_cyclic"'},
}

_PATH_CACHE: dict[str, tuple[str, Path] | None] = {}


def is_inside_impl(text: str, pos: int) -> bool:
    before = text[:pos]
    depth = 0
    for i in range(len(before) - 1, -1, -1):
        ch = before[i]
        if ch == "}":
            depth += 1
        elif ch == "{":
            if depth == 0:
                prefix = before[: i + 1]
                if re.search(r"\bimpl\b[^{]*\{", prefix[-200:]):
                    return True
                return False
            depth -= 1
    return False


def file_rank(path: Path) -> tuple[int, str]:
    name = path.name
    if name in PREFERRED_FILES:
        return (PREFERRED_FILES.index(name), str(path))
    if name == "models.rs":
        return (100, str(path))
    if name == "types.rs":
        return (90, str(path))
    return (50, str(path))


def find_rust_location(fn_name: str) -> tuple[str, Path] | None:
    if fn_name in MANUAL_PATH_OVERRIDES:
        rust_path = MANUAL_PATH_OVERRIDES[fn_name]
        module = rust_path.rsplit("::", 1)[0].replace("wasm4pm::", "")
        rel = Path(*module.split("::")) if module else Path("lib")
        return rust_path, SRC / f"{rel}.rs"

    if fn_name in _PATH_CACHE:
        return _PATH_CACHE[fn_name]

    pattern = re.compile(rf"pub fn {re.escape(fn_name)}\b")
    candidates: list[tuple[str, Path]] = []

    for path in sorted(SRC.rglob("*.rs")):
        if any(marker in str(path) for marker in SKIP_PATH_MARKERS):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for m in pattern.finditer(text):
            if is_inside_impl(text, m.start()):
                continue
            prefix = text[max(0, m.start() - 500) : m.start()]
            if "#[wasm_bindgen]" not in prefix and "#[wasm_bindgen(" not in prefix:
                continue
            rel = path.relative_to(SRC).with_suffix("")
            parts = list(rel.parts)
            if parts == ["lib"]:
                rust_path = f"wasm4pm::{fn_name}"
            else:
                if parts[-1] == "mod":
                    parts = parts[:-1]
                rust_path = f"wasm4pm::{ '::'.join(parts) }::{fn_name}"
            candidates.append((rust_path, path))

    if not candidates:
        _PATH_CACHE[fn_name] = None
        return None

    candidates.sort(key=lambda c: file_rank(c[1]))
    result = candidates[0]
    _PATH_CACHE[fn_name] = result
    return result


def normalize_type(typ: str) -> str:
    return re.sub(r"\s+", " ", typ.strip())


def parse_rust_signature(fn_name: str, path: Path) -> tuple[list[tuple[str, str]], str] | None:
    text = path.read_text(encoding="utf-8", errors="ignore")
    pattern = re.compile(
        rf"pub fn {re.escape(fn_name)}\s*\((.*?)\)\s*(?:->\s*([^\n{{;]+))?",
        re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        return None
    raw_args = re.sub(r"//[^\n]*", "", m.group(1))
    ret = normalize_type(m.group(2) or "()")
    args: list[tuple[str, str]] = []
    for part in raw_args.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        name, typ = part.rsplit(":", 1)
        name = name.strip().strip("_")
        typ = normalize_type(typ)
        args.append((name, typ))
    return args, ret


def py_param_type(typ: str) -> str:
    if typ == "bool":
        return "bool"
    if typ == "u8":
        return "u8"
    if typ in {"usize", "u32", "u64", "u16"}:
        return "usize"
    if typ == "i64":
        return "i64"
    if "f64" in typ or "f32" in typ:
        return "f64"
    if "&JsValue" in typ:
        return "&str"
    return "&str"


def format_call_arg(name: str, typ: str) -> str:
    if "&JsValue" in typ:
        return f"&wasm_bindgen::JsValue::from_str(&{name})"
    if "&str" in typ:
        return f"&{name}"
    if typ == "f32":
        return f"{name} as f32"
    if typ == "u32":
        return f"{name} as u32"
    if typ == "u64":
        return f"{name} as u64"
    if typ == "u8":
        return name
    return name


def format_call(args: list[tuple[str, str]]) -> str:
    return ", ".join(format_call_arg(n, t) for n, t in args)


def py_signature(fn_name: str, args: list[tuple[str, str]]) -> str | None:
    defaults = PY_SIGNATURE_DEFAULTS.get(fn_name)
    if not defaults:
        return None
    parts = []
    for name, _typ in args:
        if name in defaults:
            parts.append(f"{name}={defaults[name]}")
        else:
            parts.append(name)
    return f"#[pyfunction(signature = ({', '.join(parts)}))]"


def generate_body(rust_path: str, args: list[tuple[str, str]], ret: str) -> tuple[str, str, bool]:
    """Return (body, return_type, needs_py)."""
    call = format_call(args)
    call_expr = f"{rust_path}({call})" if call else f"{rust_path}()"

    if ret == "()":
        return (
            f"    prepare_call();\n    {call_expr};\n    Ok(())",
            "()",
            False,
        )
    if ret == "String":
        return (f"    Ok({call_expr})", "String", False)
    if ret == "bool":
        return (f"    Ok({call_expr})", "bool", False)
    if ret in {"f64", "f32"}:
        return (f"    Ok({call_expr})", "f64", False)
    if ret in {"usize", "u32", "u64", "u16", "u8", "i64"}:
        return (f"    Ok({call_expr} as f64)", "f64", False)

    if ret == "Result<String, JsValue>":
        return (
            f"    prepare_call();\n    {call_expr}.map_err(js_error).map_err(py_err)",
            "String",
            False,
        )
    if ret == "Result<usize, JsValue>":
        return (
            f"    prepare_call();\n    Ok({call_expr}.map_err(js_error).map_err(py_err)? as f64)",
            "f64",
            False,
        )
    if ret == "Result<u8, JsValue>":
        return (
            f"    prepare_call();\n    Ok({call_expr}.map_err(js_error).map_err(py_err)? as f64)",
            "f64",
            False,
        )
    if ret == "Result<u32, JsValue>":
        return (
            f"    prepare_call();\n    Ok({call_expr}.map_err(js_error).map_err(py_err)? as f64)",
            "f64",
            False,
        )
    if ret == "Result<bool, JsValue>":
        return (
            f"    prepare_call();\n    {call_expr}.map_err(js_error).map_err(py_err)",
            "bool",
            False,
        )
    if ret == "Result<(), JsValue>":
        return (
            f"    prepare_call();\n    {call_expr}.map_err(js_error).map_err(py_err)?;\n    Ok(())",
            "()",
            False,
        )
    if ret == "Result<f64, JsValue>":
        return (
            f"    prepare_call();\n    {call_expr}.map_err(js_error).map_err(py_err)",
            "f64",
            False,
        )
    if ret == "JsValue":
        return (
            f"    prepare_call();\n    let _ = {call_expr};\n    json_result_to_py(py)",
            "PyObject",
            True,
        )

    return (
        f"    prepare_call();\n    {call_expr}.map_err(js_error).map_err(py_err)?;\n    json_result_to_py(py)",
        "PyObject",
        True,
    )


def generate_pyfunction(fn_name: str, rust_path: str, args: list[tuple[str, str]], ret: str) -> str:
    py_params = ", ".join(f"{name}: {py_param_type(typ)}" for name, typ in args)
    sig_attr = py_signature(fn_name, args)
    sig_line = f"{sig_attr}\n" if sig_attr else "#[pyfunction]\n"
    if sig_attr:
        sig_line = f"{sig_attr}\n"
    else:
        sig_line = "#[pyfunction]\n"
    body, return_type, needs_py = generate_body(rust_path, args, ret)

    if needs_py:
        params = f"py: Python<'_>, {py_params}" if py_params else "py: Python<'_>"
    else:
        params = py_params

    if return_type == "PyObject":
        ret_clause = "PyResult<PyObject>"
    elif return_type == "()":
        ret_clause = "PyResult<()>"
    else:
        ret_clause = f"PyResult<{return_type}>"

    if sig_attr:
        return f"""{sig_line}fn {fn_name}({params}) -> {ret_clause} {{
{body}
}}
"""
    return f"""#[pyfunction]
fn {fn_name}({params}) -> {ret_clause} {{
{body}
}}
"""


def generate() -> None:
    if not DTS.exists():
        print(f"error: {DTS} not found — run wasm-pack build first", file=sys.stderr)
        sys.exit(1)

    text = DTS.read_text(encoding="utf-8")
    funcs = re.findall(r"export function (\w+)\(([^)]*)\):\s*([^;]+);", text)

    pyfunctions: list[str] = []
    registrations: list[str] = []
    listed: list[str] = []
    skipped: list[str] = []

    for fn_name, _arg_str, _ret in funcs:
        if fn_name in SKIP_FUNCTIONS:
            skipped.append(fn_name)
            continue
        if any(marker in _arg_str or marker in _ret for marker in SKIP_TYPE_MARKERS):
            skipped.append(fn_name)
            continue

        loc = find_rust_location(fn_name)
        if loc is None:
            skipped.append(fn_name)
            continue
        rust_path, path = loc
        sig = parse_rust_signature(fn_name, path)
        if sig is None:
            skipped.append(fn_name)
            continue
        args, rust_ret = sig

        listed.append(fn_name)
        pyfunctions.append(generate_pyfunction(fn_name, rust_path, args, rust_ret))
        registrations.append(f"    m.add_function(wrap_pyfunction!({fn_name}, m)?)?;")

    rs_header = """// AUTO-GENERATED by scripts/generate_python_dispatch.py — do not edit.

use pyo3::prelude::*;
use wasm_bindgen::JsValue;
use crate::bridge::{js_error, json_result_to_py, prepare_call, py_err};

"""

    rs_footer = f"""
pub fn register_exports(m: &Bound<'_, PyModule>) -> PyResult<()> {{
{chr(10).join(registrations)}
    Ok(())
}}
"""

    OUT_RS.write_text(rs_header + "\n".join(pyfunctions) + rs_footer, encoding="utf-8")

    py_names = ",\n    ".join(listed)
    py_init = f'''"""Python bindings for wasm4pm — mirrors the Rust/WASM export surface."""

from wasm4pm._native import (
    {py_names},
)

__all__ = [
    {", ".join(f'"{n}"' for n in listed)}
]

def parse_wasm_result(value):
    """Parse JSON string results the same way TypeScript callers do."""
    import json

    if isinstance(value, str):
        return json.loads(value)
    return value


__version__ = get_version()
'''

    OUT_PY.write_text(py_init, encoding="utf-8")
    print(f"generated {OUT_RS} with {len(listed)} exports, skipped {len(skipped)}")
    print(f"generated {OUT_PY}")
    if skipped:
        print("skipped:", ", ".join(skipped[:20]), ("..." if len(skipped) > 20 else ""))


if __name__ == "__main__":
    generate()
