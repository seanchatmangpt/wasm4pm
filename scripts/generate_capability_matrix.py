#!/usr/bin/env python3
"""
generate_capability_matrix.py — generates capability-matrix.json for wasm4pm v26.5.19

Usage:
  python3 scripts/generate_capability_matrix.py \
    --src-dir wasm4pm/src \
    --tests-dir wasm4pm/tests \
    --cargo-toml wasm4pm/Cargo.toml \
    --output target/wasm4pm-v26.5.19/capability-matrix.json \
    --version 26.5.19

Run from the repo root.
"""

import argparse
import json
import os
import re
from pathlib import Path


MCPP_CRITICAL_FUNCTIONS = {
    "discover_dfg_from_log",
    "discover_heuristic_miner_from_log",
    "discover_inductive_miner_from_log",
    "discover_ilp_petri_net_from_log",
    "token_replay_pure",
    "compute_precision",
    "compute_simplicity",
    "compute_generalization",
    "load_xes",
    "load_ocel2_from_json",
    "filter_variants",
    "filter_start_activities",
    "filter_end_activities",
    "filter_directly_follows_relation",
    "filter_timeframe",
    "discover_alpha_ppp",
    "discover_powl",
    "ocel_flatten",
}

WASM_BOUNDARY_FUNCTIONS = {
    "streaming_dfg_begin", "streaming_dfg_add_event", "streaming_dfg_add_batch",
    "streaming_dfg_close_trace", "streaming_dfg_flush_open", "streaming_dfg_snapshot",
    "streaming_dfg_finalize", "streaming_dfg_stats", "streaming_skeleton_begin",
    "streaming_skeleton_add_event", "streaming_skeleton_close_trace",
    "streaming_skeleton_snapshot", "streaming_skeleton_finalize",
    "streaming_heuristic_begin", "streaming_heuristic_add_event",
    "streaming_heuristic_close_trace", "streaming_heuristic_snapshot",
    "streaming_heuristic_finalize", "detect_bottlenecks", "analyze_infrequent_paths",
    "discover_causal_alpha", "discover_causal_heuristic",
    "ensemble_discover", "dfg_threshold_sweep",
}

def parse_args():
    p = argparse.ArgumentParser(description="Generate wasm4pm capability matrix")
    p.add_argument("--src-dir", default="wasm4pm/src")
    p.add_argument("--tests-dir", default="wasm4pm/tests")
    p.add_argument("--cargo-toml", default="wasm4pm/Cargo.toml")
    p.add_argument("--output", default="target/wasm4pm-v26.5.19/capability-matrix.json")
    p.add_argument("--version", default="26.5.19")
    return p.parse_args()


def extract_wasm_functions(src_dir):
    """Extract all #[wasm_bindgen] pub fn names with their source module."""
    results = []
    src_path = Path(src_dir)

    for rs_file in sorted(src_path.rglob("*.rs")):
        content = rs_file.read_text(errors="replace")
        # Find #[wasm_bindgen] followed (within 3 lines) by pub fn
        pattern = re.compile(
            r'#\[wasm_bindgen\][^\n]*\n(?:[^\n]*\n){0,2}pub fn (\w+)\s*\(',
            re.MULTILINE
        )
        for m in pattern.finditer(content):
            fn_name = m.group(1)
            module = str(rs_file.relative_to(src_path)).replace("/", "::").removesuffix(".rs")
            results.append((fn_name, module, str(rs_file)))

    return results


def extract_feature_gates(src_dir, _cargo_toml_path):
    """Build {module_path: feature_gate} map from lib.rs cfg gates."""
    gates = {}
    lib_rs = Path(src_dir) / "lib.rs"
    if not lib_rs.exists():
        return gates

    content = lib_rs.read_text(errors="replace")
    # Match #[cfg(feature = "X")] pub mod Y;
    pattern = re.compile(r'#\[cfg\(feature\s*=\s*"([^"]+)"\)\]\s*pub mod (\w+)\s*;')
    for m in pattern.finditer(content):
        feature, mod_name = m.group(1), m.group(2)
        gates[mod_name] = feature

    return gates


def find_real_data_tests(tests_dir, fn_name):
    """Check if fn_name is tested in a real-data test file."""
    real_data_files = [
        "real_data_algo_validation.rs",
        "pm4py_cross_validation.rs",
        "filter_real_data_tests.rs",
        "powl_and_prediction_real_data_tests.rs",
        "ml_real_data_tests.rs",
        "analytics_real_data_tests.rs",
        "ocel_real_data_tests.rs",
        "conformance_real_data_tests.rs",
        "remaining_capabilities_real_data_tests.rs",
        "coverage_gap_real_data_tests.rs",
    ]

    datasets = []
    tested = False
    tests_path = Path(tests_dir)

    for fname in real_data_files:
        fpath = tests_path / fname
        if not fpath.exists():
            continue
        content = fpath.read_text(errors="replace")
        if fn_name in content and "#[test]" in content:
            tested = True
            # Detect which datasets are referenced
            for ds in ["running-example", "roadtraffic", "bpi2020", "ocel20", "bpi2017", "receipt"]:
                if ds in content and fn_name in content:
                    if ds not in datasets:
                        datasets.append(ds)

    return tested, datasets


def get_production_status(fn_name, _module, _src_file_content, tested):
    """Heuristic production status."""
    if fn_name in WASM_BOUNDARY_FUNCTIONS:
        return "wasm_boundary"
    if not tested:
        return "experimental"
    return "stable"


def main():
    args = parse_args()

    # Change to repo root
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    os.chdir(repo_root)

    wasm_functions = extract_wasm_functions(args.src_dir)
    feature_gates = extract_feature_gates(args.src_dir, args.cargo_toml)

    capabilities = []
    seen = set()

    for fn_name, module, src_file in wasm_functions:
        if fn_name in seen:
            continue
        seen.add(fn_name)

        # Module-level feature gate
        top_level_module = module.split("::")[0]
        feature_gate = feature_gates.get(top_level_module)

        # Real-data test coverage
        tested, datasets = find_real_data_tests(args.tests_dir, fn_name)

        # Production status
        try:
            src_content = Path(src_file).read_text(errors="replace")
        except OSError:
            src_content = ""
        status = get_production_status(fn_name, module, src_content, tested)

        # Known gaps
        known_gaps = []
        if fn_name in WASM_BOUNDARY_FUNCTIONS:
            known_gaps.append("WASM boundary: JsValue return not inspectable in native tests")
        if not tested:
            known_gaps.append("No real-data test coverage")

        capabilities.append({
            "capability": fn_name,
            "module": module,
            "real_data_tested": tested,
            "datasets": datasets,
            "feature_gate": feature_gate,
            "production_status": status,
            "mcpp_critical": fn_name in MCPP_CRITICAL_FUNCTIONS,
            "known_gaps": known_gaps,
        })

    # Sort by module then name for stable output
    capabilities.sort(key=lambda x: (x["module"], x["capability"]))

    matrix = {
        "version": args.version,
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_capabilities": len(capabilities),
        "capabilities": capabilities,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(matrix, indent=2) + "\n")

    stable = sum(1 for c in capabilities if c["production_status"] == "stable")
    wasm_boundary = sum(1 for c in capabilities if c["production_status"] == "wasm_boundary")
    experimental = sum(1 for c in capabilities if c["production_status"] == "experimental")
    with_gaps = sum(1 for c in capabilities if c["known_gaps"])
    no_real_data = sum(1 for c in capabilities if not c["real_data_tested"])
    print(f"capability-matrix: {len(capabilities)} capabilities")
    print(f"  stable={stable}, wasm_boundary={wasm_boundary}, experimental={experimental}")
    print(f"  capabilities_with_gaps={with_gaps}, no_real_data_coverage={no_real_data}")
    if no_real_data > 0:
        print(
            f"  Next step: add real-data tests for {no_real_data} experimental capability(ies).\n"
            "  See wasm4pm/tests/real_data_algo_validation.rs for the test harness pattern."
        )
    print(f"  output: {args.output}")


if __name__ == "__main__":
    main()
