#!/usr/bin/env python3
"""bench_regress.py — Criterion regression gate for wasm4pm.

Runs a named set of FAST benches twice via Criterion's baseline machinery
(``--save-baseline`` then ``--baseline``), then compares the resulting
``new/estimates.json`` median against the saved baseline ``estimates.json``.
Exits 1 if any benchmark's median regresses beyond a threshold.

Criterion already persists everything under ``target/criterion/<bench>/`` so
this script only orchestrates the runs and parses the JSON — it never edits
the bench source.

Layout used by Criterion (per benchmark id):
    target/criterion/<group>/<id>/new/estimates.json        # most recent run
    target/criterion/<group>/<id>/<baseline-name>/estimates.json  # saved baseline

estimates.json schema (relevant slice):
    {"median": {"point_estimate": <ns>,
                "confidence_interval": {"lower_bound": .., "upper_bound": ..}}}

Usage:
    python3 scripts/bench_regress.py                 # run fast benches + gate
    python3 scripts/bench_regress.py --no-run        # parse existing dirs only
    python3 scripts/bench_regress.py --baseline main # compare vs an existing baseline
    BENCH_REGRESS_THRESHOLD=15 python3 scripts/bench_regress.py   # 15% threshold

Env:
    BENCH_REGRESS_THRESHOLD  percent allowed regression (default 10)
    BENCH_REGRESS_BENCHES    space-separated bench names (default: fast set)
    BENCH_REGRESS_FEATURES   cargo feature flag value (default: cloud)

Exit codes:
    0  no regression beyond threshold
    1  at least one benchmark regressed beyond threshold
    2  usage / environment error (no data to compare)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CRITERION_DIR = REPO_ROOT / "wasm4pm" / "target" / "criterion"

# Fast benches only — slow_algorithms / metaheuristic deliberately excluded.
DEFAULT_BENCHES = ["fast_algorithms", "analytics", "hot_kernels"]
DEFAULT_THRESHOLD = 10.0
DEFAULT_BASELINE = "regress-base"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def run_benches(benches: list[str], features: str, baseline: str, save: bool) -> None:
    flag = "--save-baseline" if save else "--baseline"
    pkg = REPO_ROOT / "wasm4pm"
    for b in benches:
        cmd = [
            "cargo", "bench", "--bench", b, "--features", features, "--",
            flag, baseline, "--warm-up-time", "1", "--measurement-time", "3",
        ]
        log(f"+ ({pkg}) {' '.join(cmd)}")
        subprocess.run(cmd, cwd=pkg, check=True)


def median_ns(estimates_path: Path) -> float | None:
    try:
        data = json.loads(estimates_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    median = data.get("median")
    if not isinstance(median, dict):
        return None
    pe = median.get("point_estimate")
    return float(pe) if isinstance(pe, (int, float)) else None


def find_pairs(baseline: str, criterion_dir: Path) -> list[tuple[str, Path, Path]]:
    """Yield (bench_id, baseline_estimates, new_estimates) for every benchmark
    that has both a saved baseline and a fresh ``new`` directory."""
    pairs: list[tuple[str, Path, Path]] = []
    if not criterion_dir.is_dir():
        return pairs
    for new_est in sorted(criterion_dir.rglob("new/estimates.json")):
        bench_dir = new_est.parent.parent
        base_est = bench_dir / baseline / "estimates.json"
        if base_est.is_file():
            bench_id = str(bench_dir.relative_to(criterion_dir))
            pairs.append((bench_id, base_est, new_est))
    return pairs


def main() -> int:
    ap = argparse.ArgumentParser(description="Criterion median regression gate")
    ap.add_argument("--baseline", default=os.environ.get("BENCH_REGRESS_BASELINE", DEFAULT_BASELINE))
    ap.add_argument("--no-run", action="store_true", help="skip cargo bench; parse existing dirs")
    ap.add_argument("--threshold", type=float,
                    default=float(os.environ.get("BENCH_REGRESS_THRESHOLD", DEFAULT_THRESHOLD)))
    ap.add_argument("--criterion-dir", type=Path, default=CRITERION_DIR,
                    help="override Criterion output dir (for testing fixtures)")
    args = ap.parse_args()

    benches = os.environ.get("BENCH_REGRESS_BENCHES", " ".join(DEFAULT_BENCHES)).split()
    features = os.environ.get("BENCH_REGRESS_FEATURES", "cloud")

    if not args.no_run:
        # First pass establishes/refreshes baseline; second pass writes `new/`.
        run_benches(benches, features, args.baseline, save=True)
        run_benches(benches, features, args.baseline, save=False)

    pairs = find_pairs(args.baseline, args.criterion_dir)
    if not pairs:
        log(f"ERROR: no benchmark dirs with both '{args.baseline}' and 'new' estimates "
            f"under {args.criterion_dir}")
        return 2

    threshold = args.threshold
    log(f"Regression gate: threshold={threshold:.1f}%  baseline='{args.baseline}'")
    regressions = []
    for bench_id, base_est, new_est in pairs:
        base = median_ns(base_est)
        new = median_ns(new_est)
        if base is None or new is None or base <= 0:
            log(f"  SKIP  {bench_id} (unparseable estimates)")
            continue
        delta = (new - base) / base * 100.0
        marker = "REGRESSED" if delta > threshold else "ok"
        log(f"  {marker:<10} {bench_id}: {base:.0f}ns -> {new:.0f}ns ({delta:+.2f}%)")
        if delta > threshold:
            regressions.append((bench_id, delta))

    if regressions:
        log("")
        log(f"FAIL: {len(regressions)} benchmark(s) regressed beyond {threshold:.1f}%:")
        for bench_id, delta in regressions:
            log(f"  - {bench_id}: {delta:+.2f}%")
        return 1

    log("PASS: no median regression beyond threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
