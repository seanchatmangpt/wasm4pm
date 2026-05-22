#!/usr/bin/env python3
"""
parse_criterion_output.py — parses Criterion benchmark output for wasm4pm v26.5.21

Walks target/criterion/ and produces criterion-results.json with all measurements.

Usage:
  python3 scripts/parse_criterion_output.py \
    --criterion-dir target/criterion \
    --output target/wasm4pm-v26.5.21/criterion-results.json

Run from the repo root.
"""

import argparse
import datetime
import json
import os
from pathlib import Path


# ---------------------------------------------------------------------------
# Known top-level prefixes used to split dir name into group/bench_id
# ---------------------------------------------------------------------------

KNOWN_PREFIXES = [
    "discovery",
    "streaming",
    "analytics",
    "conformance",
    "powl",
    "ml",
    "ocel",
    "petri",
    "rl",
    "analysis",
    "extended",
    "loader",
]


def parse_args():
    p = argparse.ArgumentParser(description="Parse Criterion benchmark output")
    p.add_argument("--criterion-dir", default="target/criterion")
    p.add_argument("--output", default="target/wasm4pm-v26.5.21/criterion-results.json")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Group name normalization
# ---------------------------------------------------------------------------

def normalize_group_name(dir_name):
    """
    Convert a Criterion directory name to slash form.

    Criterion uses the full benchmark title as the directory name, replacing
    slashes with underscores. We reverse the first underscore-after-prefix
    substitution to recover the canonical group/function form.

    Examples:
      analytics_detect_rework  -> analytics/detect_rework
      discovery_alpha_plus_plus -> discovery/alpha_plus_plus
      streaming_dfg_scalar     -> streaming/dfg_scalar
      loader_xes               -> loader/xes
      manhattan2               -> manhattan2  (no known prefix)
    """
    for prefix in KNOWN_PREFIXES:
        if dir_name.startswith(prefix + "_"):
            rest = dir_name[len(prefix) + 1:]
            return f"{prefix}/{rest}"
    return dir_name


# ---------------------------------------------------------------------------
# Throughput extraction from benchmark.json
# ---------------------------------------------------------------------------

def extract_throughput(bench_file):
    """
    Read a benchmark.json sibling and return throughput_elements_per_sec if present.
    """
    if not bench_file.exists():
        return None
    try:
        data = json.loads(bench_file.read_text())
        tp = data.get("throughput")
        if tp is None:
            return None
        if isinstance(tp, dict):
            # Criterion throughput field can be {"elements": N} or {"bytes": N}
            return tp.get("elements") or tp.get("bytes")
        if isinstance(tp, (int, float)):
            return float(tp)
    except (json.JSONDecodeError, OSError):
        pass
    return None


# ---------------------------------------------------------------------------
# Sample size extraction from sample.json
# ---------------------------------------------------------------------------

def extract_sample_size(new_dir):
    """
    Try to read sample.json (if present) for the sample size.
    Criterion stores the sample values in sample.json as a flat array.
    """
    sample_file = new_dir / "sample.json"
    if not sample_file.exists():
        return None
    try:
        data = json.loads(sample_file.read_text())
        # sample.json is {"iters": [...], "times": [...]}
        if isinstance(data, dict):
            iters = data.get("iters") or data.get("times")
            if isinstance(iters, list):
                return len(iters)
        if isinstance(data, list):
            return len(data)
    except (json.JSONDecodeError, OSError):
        pass
    return None


# ---------------------------------------------------------------------------
# Walk and collect measurements
# ---------------------------------------------------------------------------

def collect_measurements(criterion_dir):
    """
    Walk criterion_dir recursively, find all new/estimates.json files,
    and return a list of measurement records.
    """
    crit_path = Path(criterion_dir)
    if not crit_path.exists():
        print(
            f"WARNING: Criterion directory not found: {crit_path}\n"
            "  Next step: run benchmarks first with:\n"
            "    cd wasm4pm && cargo bench\n"
            "  This produces target/criterion/<bench_name>/new/estimates.json files.\n"
            "  Without these, generate_benchmark_report.py will fall back to hardcoded baseline anchors.",
            file=__import__("sys").stderr,
        )
        return []

    measurements = []

    # All estimates.json under "new" subdirectories
    for estimates_file in sorted(crit_path.rglob("estimates.json")):
        # Only process "new" runs (skip "base" — those are comparison baselines)
        if estimates_file.parent.name != "new":
            continue

        new_dir = estimates_file.parent
        try:
            data = json.loads(estimates_file.read_text())
        except (json.JSONDecodeError, OSError):
            continue

        # Extract stats
        median_ns = None
        mean_ns = None
        std_dev_ns = None

        if "median" in data and data["median"]:
            median_ns = data["median"].get("point_estimate")
        if "mean" in data and data["mean"]:
            mean_ns = data["mean"].get("point_estimate")
        if "std_dev" in data and data["std_dev"]:
            std_dev_ns = data["std_dev"].get("point_estimate")
        # Fallback: slope is sometimes a better estimate than median for linear benchmarks
        if median_ns is None and "slope" in data and data["slope"]:
            median_ns = data["slope"].get("point_estimate")

        # Throughput from sibling benchmark.json
        bench_file = new_dir / "benchmark.json"
        throughput = extract_throughput(bench_file)

        # Sample size from sibling sample.json
        sample_size = extract_sample_size(new_dir)

        # Reconstruct group / bench_id from the path
        # Path layout: criterion_dir/<group>[/<sub-params>...]/<bench_id>/new/estimates.json
        # OR:          criterion_dir/<flat_group>/new/estimates.json  (no bench_id)
        try:
            rel = estimates_file.relative_to(crit_path)
        except ValueError:
            continue

        parts = rel.parts  # e.g. ("analytics_detect_rework", "cases", "100", "new", "estimates.json")
        #                      or  ("manhattan2", "new", "estimates.json")

        # parts[-1] == "estimates.json", parts[-2] == "new"
        path_parts = parts[:-2]  # strip "new/estimates.json"

        if len(path_parts) == 1:
            # Flat layout: group = normalized dir_name, bench_id = ""
            raw_group = path_parts[0]
            bench_id = ""
        else:
            # Nested layout: first part is group dir, remaining are bench_id components
            raw_group = path_parts[0]
            bench_id = "/".join(path_parts[1:])

        group = normalize_group_name(raw_group)

        measurements.append({
            "group": group,
            "bench_id": bench_id,
            "median_ns": median_ns,
            "mean_ns": mean_ns,
            "std_dev_ns": std_dev_ns,
            "throughput_elements_per_sec": throughput,
            "sample_size": sample_size,
            "criterion_dir": str(new_dir),
        })

    return measurements


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    # Change to repo root
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    os.chdir(repo_root)

    measurements = collect_measurements(args.criterion_dir)

    generated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    output = {
        "generated_at": generated_at,
        "criterion_dir": args.criterion_dir,
        "total_measurements": len(measurements),
        "measurements": measurements,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2) + "\n")

    groups_found = len({m["group"] for m in measurements})
    print(f"criterion-results: {len(measurements)} measurements across {groups_found} groups written to {args.output}")
    print(f"  output: {args.output}")


if __name__ == "__main__":
    main()
