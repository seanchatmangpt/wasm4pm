#!/usr/bin/env python3
"""Generate Rust dispatch table for wasm4pm Python bindings from wasm4pm.d.ts + Rust sources."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DTS = ROOT / "wasm4pm" / "pkg" / "wasm4pm.d.ts"
SRC = ROOT / "wasm4pm" / "src"
OUT = ROOT / "crates" / "wasm4pm-bindings-py" / "src" / "dispatch_generated.rs"

SKIP_FUNCTIONS = {"main"}
SKIP_TYPE_MARKERS = ("RlState", "Float32Array", "Uint8Array")
SKIP_PATH_MARKERS = ("wasm_bindings", "wasm_testing_utils")

# Prefer crate-root or utility modules over struct impl duplicates.
PREFERRED_FILES = (
    "lib.rs",
    "utilities.rs",
    "state.rs",
    "io.rs",
    "prediction.rs",
    "prediction_remaining_time.rs",
    "prediction_outcome.rs",
    "prediction_drift.rs",
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
    "build_ngram_predictor": "wasm4pm::prediction::build_ngram_predictor",
    "build_remaining_time_model": "wasm4pm::prediction_remaining_time::build_remaining_time_model",
}

_PATH_CACHE: dict[str, tuple[str, Path] | None] = {}


def is_inside_impl(text: str, pos: int) -> bool:
    """Return True when `pos` sits inside an `impl ... { ... }` block."""
    before = text[:pos]
    impl_starts = [m.start() for m in re.finditer(r"\bimpl\b", before)]
    if not impl_starts:
        return False
    # Walk backward through impl blocks; if we're inside one whose brace depth > 0, skip.
    depth = 0
    for i in range(len(before) - 1, -1, -1):
        ch = before[i]
        if ch == "}":
            depth += 1
        elif ch == "{":
            if depth == 0:
                # Found a block start — check if it's an impl.
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
        if not part or part.startswith("//"):
            continue
        if ":" not in part:
            continue
        name, typ = part.rsplit(":", 1)
        name = name.strip().strip("_")
        typ = normalize_type(typ)
        args.append((name, typ))
    return args, ret


def rust_arg_extract(name: str, typ: str, idx: int) -> str:
    if "bool" in typ:
        return f"let {name} = arg_bool(&args, {idx})?;"
    if typ == "u8":
        return f"let {name} = arg_u8(&args, {idx})?;"
    if typ in {"usize", "u32", "u64", "u16"} or "usize" in typ:
        return f"let {name} = arg_usize(&args, {idx})?;"
    if typ == "i64":
        return f"let {name} = arg_i64(&args, {idx})?;"
    if "f64" in typ or "f32" in typ:
        return f"let {name} = arg_f64(&args, {idx})?;"
    if "&str" in typ or "String" in typ:
        return f"let {name} = arg_string(&args, {idx})?;"
    if "&JsValue" in typ:
        return f"let {name} = arg_js_value(&args, {idx})?;"
    if "&mut " in typ:
        return f"let {name} = arg_string(&args, {idx})?;"
    return f"let {name} = arg_string(&args, {idx})?;"


def format_call_arg(name: str, typ: str) -> str:
    if "&str" in typ:
        return f"&{name}"
    if "&JsValue" in typ:
        return f"&{name}"
    if typ == "f32":
        return f"{name} as f32"
    if typ == "u32":
        return f"{name} as u32"
    if typ == "u64":
        return f"{name} as u64"
    if typ == "i64":
        return name
    if typ == "u8":
        return name
    if "&mut " in typ:
        return f"&mut {name}"
    return name


def format_call(args: list[tuple[str, str]]) -> str:
    return ", ".join(format_call_arg(n, t) for n, t in args)


def generate_body(rust_path: str, args: list[tuple[str, str]], ret: str) -> str:
    call = format_call(args)
    call_expr = f"{rust_path}({call})" if call else f"{rust_path}()"

    if ret == "()":
        return f"wrap_void(|| {{ {call_expr}; }})"
    if ret == "String":
        return f"Ok(InvokeResult::String({call_expr}))"
    if ret == "bool":
        return f"Ok(InvokeResult::Bool({call_expr}))"
    if ret in {"f64", "f32"}:
        return f"Ok(InvokeResult::Number({call_expr} as f64))"
    if ret in {"usize", "u32", "u64", "u16", "u8", "i64"}:
        return f"Ok(InvokeResult::Number({call_expr} as f64))"
    if ret == "JsValue":
        return f"wrap_js_value(|| {call_expr})"

    if ret == "Result<String, JsValue>":
        return f"wrap_string_result(|| {call_expr})"
    if ret == "Result<JsValue, JsValue>":
        return f"wrap_js_result(|| {call_expr})"
    if ret == "Result<usize, JsValue>":
        return f"wrap_usize_result(|| {call_expr})"
    if ret == "Result<u8, JsValue>":
        return f"wrap_u8_result(|| {call_expr})"
    if ret == "Result<u32, JsValue>":
        return f"wrap_u32_result(|| {call_expr})"
    if ret == "Result<bool, JsValue>":
        return f"wrap_bool_result(|| {call_expr})"
    if ret == "Result<(), JsValue>":
        return f"wrap_void_result(|| {call_expr})"
    if ret == "Result<f64, JsValue>":
        return f"wrap_f64_result(|| {call_expr})"

    # Tuple / custom Result types — serialize through JsValue path when possible.
    if ret.startswith("Result<") and ret.endswith(", JsValue>"):
        return f"wrap_js_result(|| {call_expr}.map(|v| wasm_bindgen::JsValue::from_str(&serde_json::to_string(&v).map_err(|e| wasm4pm::error::js_val(&e.to_string()))?)))"
    if ret.startswith("Result<") and ", String>" in ret:
        inner = ret[len("Result<") : ret.rfind(", String>")]
        if inner in {"usize", "u32"}:
            return f"wrap_string_result(|| {call_expr}.map(|v| v.to_string()))"

    return f"wrap_js_result(|| {call_expr})"


def generate() -> None:
    if not DTS.exists():
        print(f"error: {DTS} not found — run wasm-pack build first", file=sys.stderr)
        sys.exit(1)

    text = DTS.read_text(encoding="utf-8")
    funcs = re.findall(r"export function (\w+)\(([^)]*)\):\s*([^;]+);", text)

    arms: list[str] = []
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
        extracts = [rust_arg_extract(n, t, i) for i, (n, t) in enumerate(args)]
        body = generate_body(rust_path, args, rust_ret)
        block = "\n            ".join(extracts)
        arms.append(f'        "{fn_name}" => {{\n            {block}\n            {body}\n        }}')

    header = """// AUTO-GENERATED by scripts/generate_python_dispatch.py — do not edit.

use crate::invoke::{
    arg_bool, arg_f64, arg_i64, arg_js_value, arg_string, arg_u8, arg_usize, wrap_bool_result,
    wrap_f64_result, wrap_js_result, wrap_js_value, wrap_string_result, wrap_u32_result,
    wrap_u8_result, wrap_usize_result, wrap_void, wrap_void_result, InvokeResult,
};

pub fn dispatch_export(name: &str, args: &[serde_json::Value]) -> Result<InvokeResult, String> {
    match name {
"""

    list_lines = "\n".join(f'        "{n}",' for n in listed)
    footer = f"""
        other => Err(format!("unknown export: {{other}}")),
    }}
}}

pub fn list_export_names() -> &'static [&'static str] {{
    &[
{list_lines}
    ]
}}
"""

    OUT.write_text(header + "\n".join(arms) + footer, encoding="utf-8")
    print(f"generated {OUT} with {len(arms)} exports, skipped {len(skipped)}")
    if skipped:
        print("skipped:", ", ".join(skipped[:20]), ("..." if len(skipped) > 20 else ""))


if __name__ == "__main__":
    generate()
