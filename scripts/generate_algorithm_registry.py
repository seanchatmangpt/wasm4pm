#!/usr/bin/env python3
"""
generate_algorithm_registry.py — generates algorithm-registry.json for wasm4pm v26.5.21

Usage:
  python3 scripts/generate_algorithm_registry.py \
    --src-dir wasm4pm/src \
    --tests-dir wasm4pm/tests \
    --criterion-dir target/criterion \
    --output target/wasm4pm-v26.5.21/algorithm-registry.json \
    --version 26.5.21

Run from the repo root.
"""

import argparse
import datetime
import json
import os
import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Constants (reused from generate_capability_matrix.py)
# ---------------------------------------------------------------------------

MCPP_CRITICAL_FUNCTIONS = {
    # DFG discovery family
    "discover_dfg",
    "discover_dfg_simd",
    "discover_optimized_dfg",
    # Miner variants
    "discover_heuristic_miner",
    "discover_inductive_miner",
    "discover_ilp_petri_net",
    # Conformance
    "token_replay_pure",
    "token_replay_fitness",
    "wasm_compute_precision",
    "wasm_compute_simplicity",
    "generalization",
    # Loaders
    "load_eventlog_from_xes",
    "load_ocel2_from_json",
    # Filters
    "filter_by_variants_top_k",
    "filter_by_variant_coverage",
    "filter_by_start_activity",
    "filter_by_end_activity",
    "filter_by_directly_follows",
    "filter_by_time_range",
    # POWL
    "discover_alpha_plus_plus",
    "discover_powl_from_log",
    # OCEL
    "flatten_ocel_to_eventlog",
    "discover_ocel_dfg_pure",
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

FAMILY_MAP = {
    # --- Discovery ---
    "discovery": "discovery",
    "algorithms": "discovery",
    "advanced_algorithms": "discovery",
    "fast_discovery": "discovery",
    "more_discovery": "discovery",
    "genetic_discovery": "discovery",
    "ilp_discovery": "discovery",
    "ilp": "discovery",
    "hierarchical": "discovery",
    "parallel_executor": "discovery",
    "performance_dfg": "discovery",
    "branchless": "discovery",
    "ablation": "discovery",
    "binary_format": "discovery",
    "hot_kernels": "discovery",
    # --- Streaming ---
    "streaming": "streaming",
    "streaming_wasm": "streaming",
    "streaming_pipeline": "streaming",
    "incremental_dfg": "streaming",
    "simd_streaming_dfg": "streaming",
    "simd_inner_loops": "streaming",
    # --- Conformance ---
    "conformance": "conformance",
    "conformance_cache": "conformance",
    "align_etconformance": "conformance",
    "alignment_fitness": "conformance",
    "alignments": "conformance",
    "declare_conformance": "conformance",
    "etconformance_precision": "conformance",
    "generalization": "conformance",
    "temporal_profile": "conformance",
    "streaming_conformance": "conformance",
    "actor_envelope": "conformance",
    "route_envelope": "conformance",
    "simd_token_replay": "conformance",
    # --- POWL ---
    "powl": "powl",
    "powl_api": "powl",
    "powl_arena": "powl",
    "powl_event_log": "powl",
    "powl_models": "powl",
    "powl_parser": "powl",
    "powl_petri_net": "powl",
    "powl_process_tree": "powl",
    "powl_to_process_tree": "powl",
    # --- OCEL ---
    "ocel": "ocel",
    "ocel_flatten": "ocel",
    "ocel_io": "ocel",
    "ocel_tests": "ocel",
    "oc_conformance": "ocel",
    "oc_orchestrator": "ocel",
    "oc_performance": "ocel",
    "oc_petri_net": "ocel",
    # --- ML / Prediction ---
    "ml": "ml",
    "ml_algorithms": "ml",
    "anomaly": "ml",
    "prediction": "ml",
    "prediction_additions": "ml",
    "prediction_drift": "ml",
    "prediction_features": "ml",
    "prediction_next_activity": "ml",
    "prediction_outcome": "ml",
    "prediction_remaining_time": "ml",
    "prediction_resource": "ml",
    "prediction_rf": "ml",
    "feature_extraction": "ml",
    "feature_importance": "ml",
    "trace_embeddings": "ml",
    "montecarlo": "ml",
    "simulation": "ml",
    "validation": "ml",
    # --- Analytics ---
    "analytics": "analytics",
    "causal": "analytics",
    "causal_graph": "analytics",
    "correlation_miner": "analytics",
    "ensemble": "analytics",
    "pattern_analysis": "analytics",
    "pattern_dispatch": "analytics",
    "final_analytics": "analytics",
    "statistical_analysis": "analytics",
    "spc": "analytics",
    "spc_history": "analytics",
    "social_network": "analytics",
    "resource_analysis": "analytics",
    "analysis": "analytics",
    "data_quality": "analytics",
    "batches": "analytics",
    "complexity_metrics": "analytics",
    "hand_stats": "analytics",
    "performance_spectrum": "analytics",
    # --- Petri Net ---
    "petri": "petri",
    "petri_net_playout": "petri",
    "petri_net_reduction": "petri",
    "pnml_io": "petri",
    "playout": "petri",
    "process_tree": "petri",
    "log_to_trie": "petri",
    "transition_system": "petri",
    # --- RL ---
    "reinforcement": "rl",
    "rl_orchestrator": "rl",
    "rl_state_serialization": "rl",
    # --- I/O / Filters ---
    "xes_format": "io",
    "io": "io",
    "filters": "filter",
    "text_encoding": "io",
    "yawl_export": "io",
    # --- Advanced (subdirectory) ---
    "advanced": "discovery",
    # --- ML extras ---
    "automembrane": "ml",
    "automl_envelope": "ml",
    "time_envelope": "ml",
    "probabilistic": "ml",
    # --- Analytics extras ---
    "recommendations": "analytics",
    "smart_engine": "analytics",
    # --- System/utility (kept as other intentionally) ---
    # "lib", "state", "utilities", "benchmark_runner", "capability_registry", "cell8"
}

EVIDENCE_CLASS_OVERRIDES = {
    # POWL native Criterion path panics — adversary evidence only
    "discover_powl": "adversary_measured",
    "discover_powl_from_ocel": "adversary_measured",
    # RL dispatch requires cloud feature
    "dispatch_action": "source_inspected",
    "compute_reward": "source_inspected",
    # WASM boundary functions
    "streaming_dfg_begin": "wasm_boundary_documented",
    "streaming_dfg_add_event": "wasm_boundary_documented",
    "streaming_dfg_finalize": "wasm_boundary_documented",
    "streaming_skeleton_begin": "wasm_boundary_documented",
    "streaming_heuristic_begin": "wasm_boundary_documented",
    "detect_bottlenecks": "wasm_boundary_documented",
    "analyze_infrequent_paths": "wasm_boundary_documented",
    "discover_causal_alpha": "wasm_boundary_documented",
    "discover_causal_heuristic": "wasm_boundary_documented",
    "dfg_threshold_sweep": "wasm_boundary_documented",
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Generate wasm4pm algorithm registry")
    p.add_argument("--src-dir", default="wasm4pm/src")
    p.add_argument("--tests-dir", default="wasm4pm/tests")
    p.add_argument("--criterion-dir", default="target/criterion")
    p.add_argument("--output", default="target/wasm4pm-v26.5.21/algorithm-registry.json")
    p.add_argument("--version", default="26.5.21")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Source extraction (reused pattern from generate_capability_matrix.py)
# ---------------------------------------------------------------------------

def extract_wasm_functions(src_dir):
    """Extract all #[wasm_bindgen] pub fn names with their source module and file path."""
    results = []
    src_path = Path(src_dir)

    for rs_file in sorted(src_path.rglob("*.rs")):
        content = rs_file.read_text(errors="replace")
        pattern = re.compile(
            r'#\[wasm_bindgen\][^\n]*\n(?:[^\n]*\n){0,2}pub fn (\w+)\s*\(',
            re.MULTILINE
        )
        for m in pattern.finditer(content):
            fn_name = m.group(1)
            module = str(rs_file.relative_to(src_path)).replace("/", "::").removesuffix(".rs")
            results.append((fn_name, module, str(rs_file)))

    return results


def extract_feature_gates(src_dir):
    """Build {module_path: feature_gate} map from lib.rs cfg gates."""
    gates = {}
    lib_rs = Path(src_dir) / "lib.rs"
    if not lib_rs.exists():
        return gates

    content = lib_rs.read_text(errors="replace")
    pattern = re.compile(r'#\[cfg\(feature\s*=\s*"([^"]+)"\)\]\s*pub mod (\w+)\s*;')
    for m in pattern.finditer(content):
        feature, mod_name = m.group(1), m.group(2)
        gates[mod_name] = feature

    return gates


# ---------------------------------------------------------------------------
# Real-data test coverage (reused from generate_capability_matrix.py)
# ---------------------------------------------------------------------------

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
            for ds in ["running-example", "roadtraffic", "bpi2020", "ocel20", "bpi2017", "receipt"]:
                if ds in content and fn_name in content:
                    if ds not in datasets:
                        datasets.append(ds)

    return tested, datasets


# ---------------------------------------------------------------------------
# Verb-stripping helpers (Criterion drops common verb prefixes from group names)
# ---------------------------------------------------------------------------

_VERB_PREFIXES = (
    "discover_", "analyze_", "load_", "compute_", "detect_",
    "build_", "check_", "filter_", "streaming_", "parse_",
)


def fn_name_variants(fn_name: str) -> list[str]:
    """Return fn_name plus all verb-stripped variants, longest first."""
    result = [fn_name]
    for prefix in _VERB_PREFIXES:
        if fn_name.startswith(prefix):
            result.append(fn_name[len(prefix):])
    return result


# ---------------------------------------------------------------------------
# Criterion data
# ---------------------------------------------------------------------------

def build_criterion_group_set(criterion_dir):
    """
    Walk criterion_dir and collect all group names that have estimates.json.
    Returns a set of group directory names (top-level dirs under criterion_dir).
    """
    crit_path = Path(criterion_dir)
    if not crit_path.exists():
        return set()

    groups_with_data = set()
    for estimates_file in crit_path.rglob("estimates.json"):
        # Only count "new" runs, not "base"
        if estimates_file.parent.name != "new":
            continue
        # The group is the first directory level under criterion_dir
        try:
            rel = estimates_file.relative_to(crit_path)
            group_name = rel.parts[0]
            groups_with_data.add(group_name)
        except ValueError:
            continue

    return groups_with_data


def get_criterion_stats(criterion_dir, fn_name):
    """
    Look for Criterion measurements for this function.
    Returns (criterion_measured, latest_median, latest_throughput).
    Searches for any group directory whose name contains fn_name.
    """
    crit_path = Path(criterion_dir)
    if not crit_path.exists():
        return False, None, None

    variants = fn_name_variants(fn_name)
    matches = []
    for group_dir in sorted(crit_path.iterdir()):
        if not group_dir.is_dir():
            continue
        if not any(v in group_dir.name for v in variants):
            continue
        # Walk for new/estimates.json
        for estimates_file in sorted(group_dir.rglob("estimates.json")):
            if estimates_file.parent.name != "new":
                continue
            try:
                data = json.loads(estimates_file.read_text())
                median = None
                if "median" in data and data["median"]:
                    median = data["median"].get("point_estimate")
                throughput = None
                # Check sibling benchmark.json for throughput
                bench_file = estimates_file.parent / "benchmark.json"
                if bench_file.exists():
                    bench_data = json.loads(bench_file.read_text())
                    tp = bench_data.get("throughput")
                    if isinstance(tp, dict):
                        throughput = tp.get("elements") or tp.get("bytes")
                    elif isinstance(tp, (int, float)):
                        throughput = tp
                matches.append((median, throughput))
            except (json.JSONDecodeError, OSError):
                continue

    if not matches:
        return False, None, None

    # Use the last (most recent alphabetically) match
    latest_median, latest_throughput = matches[-1]
    return True, latest_median, latest_throughput


# ---------------------------------------------------------------------------
# Family and algorithm_id derivation
# ---------------------------------------------------------------------------

def get_family(module_path):
    """Derive family from the first path component of the module."""
    first = module_path.split("::")[0]
    return FAMILY_MAP.get(first, "other")


def make_algorithm_id(fn_name, family):
    """Construct a namespaced algorithm_id."""
    return f"{family}.{fn_name}"


def make_display_name(fn_name):
    """Convert snake_case fn_name to Title Case display name."""
    return fn_name.replace("_", " ").title()


# ---------------------------------------------------------------------------
# Evidence class and production status
# ---------------------------------------------------------------------------

def get_evidence_class(fn_name, criterion_measured, adversary_measured_set):
    """
    Determine evidence class for a function.
    Priority: hard-coded override > criterion > adversary > source.
    """
    if fn_name in EVIDENCE_CLASS_OVERRIDES:
        return EVIDENCE_CLASS_OVERRIDES[fn_name]
    if criterion_measured:
        return "criterion_measured"
    if fn_name in adversary_measured_set:
        return "adversary_measured"
    return "source_inspected"


def get_production_status(_fn_name, evidence_class, real_data_tested, feature_gate):
    if evidence_class in ("blocked_fake", "blocked_placeholder"):
        return "blocked"
    if evidence_class == "removed":
        return "removed"
    if evidence_class == "experimental":
        return "experimental"
    if real_data_tested:
        return "ready"
    if feature_gate and feature_gate not in (
        "discovery_advanced", "conformance_full", "ml",
        "streaming_full", "ocel", "powl"
    ):
        return "ready_feature_gated"
    return "experimental"


# ---------------------------------------------------------------------------
# Integration test detection
# ---------------------------------------------------------------------------

def has_integration_test(tests_dir, fn_name):
    """Check if fn_name appears in any integration test file."""
    tests_path = Path(tests_dir)
    if not tests_path.exists():
        return False
    for rs_file in tests_path.rglob("*.rs"):
        try:
            content = rs_file.read_text(errors="replace")
            if fn_name in content and "#[test]" in content:
                return True
        except OSError:
            continue
    return False


# ---------------------------------------------------------------------------
# Known gap generation
# ---------------------------------------------------------------------------

def compute_known_gaps(fn_name, evidence_class, real_data_tested, criterion_measured):
    gaps = []
    if fn_name in WASM_BOUNDARY_FUNCTIONS:
        gaps.append("WASM boundary: JsValue return not inspectable in native tests")
    if not real_data_tested:
        gaps.append("No real-data test coverage")
    if not criterion_measured and evidence_class not in (
        "adversary_measured", "wasm_boundary_documented", "source_inspected"
    ):
        gaps.append("No Criterion benchmark measurement")
    return gaps


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    # Change to repo root (same pattern as generate_capability_matrix.py)
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    os.chdir(repo_root)

    wasm_functions = extract_wasm_functions(args.src_dir)
    feature_gates = extract_feature_gates(args.src_dir)
    criterion_groups = build_criterion_group_set(args.criterion_dir)

    # Build set of functions that appear in adversary/chaos test files
    adversary_measured_set = set()
    tests_path = Path(args.tests_dir)
    adversary_files = list(tests_path.glob("*adversar*.rs")) + list(tests_path.glob("*chaos*.rs")) \
        if tests_path.exists() else []
    for af in adversary_files:
        try:
            content = af.read_text(errors="replace")
            for fn_name, _, _ in wasm_functions:
                if fn_name in content:
                    adversary_measured_set.add(fn_name)
        except OSError:
            continue

    algorithms = []
    seen = set()

    for fn_name, module, src_file in wasm_functions:
        if fn_name in seen:
            continue
        seen.add(fn_name)

        top_level_module = module.split("::")[0]
        feature_gate = feature_gates.get(top_level_module)
        family = get_family(module)
        algorithm_id = make_algorithm_id(fn_name, family)
        display_name = make_display_name(fn_name)

        # Determine module_path relative to src_dir
        try:
            module_path = str(Path(src_file).relative_to(Path(args.src_dir).resolve()))
        except ValueError:
            module_path = src_file

        # Real-data coverage
        real_data_tested, real_datasets = find_real_data_tests(args.tests_dir, fn_name)

        # Criterion data
        criterion_measured, latest_median, latest_throughput = get_criterion_stats(
            args.criterion_dir, fn_name
        )

        # Also check group name membership via the group set (using verb-stripped variants)
        if not criterion_measured:
            variants = fn_name_variants(fn_name)
            for group in criterion_groups:
                if any(v in group for v in variants):
                    criterion_measured = True
                    break

        # Integration test
        integration_measured = has_integration_test(args.tests_dir, fn_name)

        # Adversary measured
        adversary_measured = fn_name in adversary_measured_set

        # Evidence class
        evidence_class = get_evidence_class(fn_name, criterion_measured, adversary_measured_set)

        # Production status
        production_status = get_production_status(fn_name, evidence_class, real_data_tested, feature_gate)

        # MCPP criticality
        mcpp_criticality = "critical" if fn_name in MCPP_CRITICAL_FUNCTIONS else None

        # Known gaps
        known_gaps = compute_known_gaps(fn_name, evidence_class, real_data_tested, criterion_measured)

        # WASM export / public API
        wasm_export = True  # All extracted functions have #[wasm_bindgen]
        public_api = True

        algorithms.append({
            "algorithm_id": algorithm_id,
            "display_name": display_name,
            "family": family,
            "module_path": module_path,
            "feature_gate": feature_gate,
            "public_api": public_api,
            "wasm_export": wasm_export,
            "evidence_class": evidence_class,
            "production_status": production_status,
            "real_data_coverage": real_data_tested,
            "real_datasets": real_datasets,
            "benchmark_targets": [],
            "criterion_measured": criterion_measured,
            "integration_measured": integration_measured,
            "adversary_measured": adversary_measured,
            "latest_median": latest_median,
            "latest_throughput": latest_throughput,
            "known_gaps": known_gaps,
            "mcpp_criticality": mcpp_criticality,
        })

    # Sort by family then algorithm_id for stable output
    algorithms.sort(key=lambda x: (x["family"], x["algorithm_id"]))

    generated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    registry = {
        "version": args.version,
        "generated_at": generated_at,
        "total_algorithms": len(algorithms),
        "algorithms": algorithms,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(registry, indent=2) + "\n")

    ready = sum(1 for a in algorithms if a["production_status"] == "ready")
    experimental = sum(1 for a in algorithms if a["production_status"] == "experimental")
    criterion_count = sum(1 for a in algorithms if a["criterion_measured"])

    print(f"algorithm-registry: {len(algorithms)} algorithms written to {args.output}")
    print(f"  ready={ready}, experimental={experimental}, criterion_measured={criterion_count}")
    print(f"  output: {args.output}")


if __name__ == "__main__":
    main()
