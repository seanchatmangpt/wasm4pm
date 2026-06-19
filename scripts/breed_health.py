#!/usr/bin/env python3
"""
breed_health.py — Western Electric SPC rules applied to breed fitness time-series.

Reads ocel/reports/*.json (current snapshots) and ocel/reports/history/*.json
(historical snapshots, if any) to build per-breed fitness time-series, then runs
all 7 Western Electric rules to detect drift before a breed fails admission.

Usage:
    python3 scripts/breed_health.py [--json] [--fail-on-violation]

Exit codes:
    0 — no WE violations
    1 — one or more WE violations detected
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Western Electric SPC rules
# Each rule takes (series: list[float], mean: float, sigma: float) and returns
# a list of (rule_number, description, offending_indices) tuples.
# ---------------------------------------------------------------------------

def we_rule1(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 1: Any single point beyond 3σ from the mean."""
    violations = []
    for i, v in enumerate(series):
        if abs(v - mean) > 3 * sigma:
            side = "above" if v > mean else "below"
            violations.append((1, f"point[{i}]={v:.4f} is {side} 3σ limit ({mean:.4f}±{3*sigma:.4f})", [i]))
    return violations


def we_rule2(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 2: 9 (or more) consecutive points on the same side of the mean."""
    del sigma  # uniform signature; this rule uses only mean
    violations = []
    n = len(series)
    run = 1
    for i in range(1, n):
        same_side = (series[i] > mean) == (series[i - 1] > mean)
        if same_side and series[i] != mean and series[i - 1] != mean:
            run += 1
            if run >= 9:
                indices = list(range(i - run + 1, i + 1))
                violations.append((2, f"9+ consecutive points on same side of mean starting at index {indices[0]}", indices))
        else:
            run = 1
    return violations


def we_rule3(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 3: 6 (or more) consecutive points trending steadily up or down."""
    del mean, sigma  # uniform signature; this rule uses only series values
    violations = []
    n = len(series)
    if n < 6:
        return violations
    run_up = 1
    run_down = 1
    for i in range(1, n):
        if series[i] > series[i - 1]:
            run_up += 1
            run_down = 1
        elif series[i] < series[i - 1]:
            run_down += 1
            run_up = 1
        else:
            run_up = 1
            run_down = 1
        if run_up >= 6:
            indices = list(range(i - run_up + 1, i + 1))
            violations.append((3, f"6+ points trending UP starting at index {indices[0]}", indices))
        elif run_down >= 6:
            indices = list(range(i - run_down + 1, i + 1))
            violations.append((3, f"6+ points trending DOWN starting at index {indices[0]}", indices))
    return violations


def we_rule4(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 4: 14 (or more) consecutive points alternating up and down."""
    del mean, sigma  # uniform signature; this rule uses only series values
    violations = []
    n = len(series)
    if n < 14:
        return violations
    run = 1
    for i in range(1, n - 1):
        alternating = ((series[i] > series[i - 1]) != (series[i + 1] > series[i]))
        if alternating:
            run += 1
            if run >= 14:
                start = i - run + 1
                indices = list(range(start, i + 2))
                violations.append((4, f"14+ alternating points starting at index {start}", indices))
        else:
            run = 1
    return violations


def we_rule5(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 5: 2 of any 3 consecutive points beyond 2σ on the same side."""
    violations = []
    n = len(series)
    for i in range(n - 2):
        window = series[i:i + 3]
        above2 = [j for j, v in enumerate(window) if v > mean + 2 * sigma]
        below2 = [j for j, v in enumerate(window) if v < mean - 2 * sigma]
        if len(above2) >= 2:
            indices = [i + j for j in above2]
            violations.append((5, f"2-of-3 beyond +2σ in window [{i}:{i+3}]", indices))
        elif len(below2) >= 2:
            indices = [i + j for j in below2]
            violations.append((5, f"2-of-3 beyond -2σ in window [{i}:{i+3}]", indices))
    return violations


def we_rule6(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 6: 4 of any 5 consecutive points beyond 1σ on the same side."""
    violations = []
    n = len(series)
    for i in range(n - 4):
        window = series[i:i + 5]
        above1 = [j for j, v in enumerate(window) if v > mean + sigma]
        below1 = [j for j, v in enumerate(window) if v < mean - sigma]
        if len(above1) >= 4:
            indices = [i + j for j in above1]
            violations.append((6, f"4-of-5 beyond +1σ in window [{i}:{i+5}]", indices))
        elif len(below1) >= 4:
            indices = [i + j for j in below1]
            violations.append((6, f"4-of-5 beyond -1σ in window [{i}:{i+5}]", indices))
    return violations


def we_rule7(series: list[float], mean: float, sigma: float) -> list[tuple]:
    """Rule 7: 15 (or more) consecutive points within 1σ of the mean (stratification)."""
    violations = []
    n = len(series)
    if n < 15:
        return violations
    run = 0
    start = 0
    for i, v in enumerate(series):
        if abs(v - mean) < sigma:
            if run == 0:
                start = i
            run += 1
            if run >= 15:
                indices = list(range(start, i + 1))
                violations.append((7, f"15+ points within 1σ of mean (stratification) starting at {start}", indices))
        else:
            run = 0
    return violations


ALL_WE_RULES = [we_rule1, we_rule2, we_rule3, we_rule4, we_rule5, we_rule6, we_rule7]


# ---------------------------------------------------------------------------
# Fitness series builder
# ---------------------------------------------------------------------------

@dataclass
class BreedSnapshot:
    breed_id: str
    fitness: float
    report_date: str
    source_file: str
    admitted: bool


def load_snapshots(reports_dir: Path) -> dict[str, list[BreedSnapshot]]:
    """Load all JSON snapshots from reports_dir (and history/ subdir) per breed."""
    series: dict[str, list[BreedSnapshot]] = {}

    # Load historical snapshots first (sorted by date embedded in path)
    history_dir = reports_dir / "history"
    history_files = sorted(glob.glob(str(history_dir / "**" / "*.json"), recursive=True)) if history_dir.exists() else []

    # Current snapshots
    current_files = sorted(glob.glob(str(reports_dir / "*.json")))

    all_files = history_files + current_files

    for path in all_files:
        try:
            with open(path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        breed_id = data.get("breed_id") or data.get("model_id")
        fitness = data.get("fitness")
        if breed_id is None or fitness is None:
            continue

        snap = BreedSnapshot(
            breed_id=breed_id,
            fitness=float(fitness),
            report_date=data.get("report_date") or data.get("measured_on") or "",
            source_file=path,
            admitted=bool(data.get("admitted", False)),
        )
        series.setdefault(breed_id, []).append(snap)

    return series


# ---------------------------------------------------------------------------
# SPC analysis
# ---------------------------------------------------------------------------

# Domain constants: fitness lives in [0, 1]; target is 1.0 (perfect conformance).
# For single-point series we use these domain-calibrated parameters so Rule 1
# can still fire when fitness < 0.85 (i.e., more than 3σ below target).
DOMAIN_TARGET = 1.0
DOMAIN_SIGMA = 0.05   # 3σ = 0.15 → flag anything below 0.85


@dataclass
class BreedHealthReport:
    breed_id: str
    n_points: int
    current_fitness: float
    mean: float
    sigma: float
    violations: list[tuple] = field(default_factory=list)
    trend: str = "flat"   # "up" | "down" | "flat" | "insufficient_data"

    @property
    def has_violations(self) -> bool:
        return len(self.violations) > 0


def compute_trend(series: list[float]) -> str:
    if len(series) < 2:
        return "insufficient_data"
    delta = series[-1] - series[0]
    if abs(delta) < 1e-9:
        return "flat"
    return "up" if delta > 0 else "down"


def analyze_breed(breed_id: str, snapshots: list[BreedSnapshot]) -> BreedHealthReport:
    # Sort by date string (lexicographic; ISO dates sort correctly)
    snapshots = sorted(snapshots, key=lambda s: (s.report_date, s.source_file))
    series = [s.fitness for s in snapshots]

    n = len(series)
    current = series[-1]

    if n == 1:
        # Single point: use domain constants; only Rule 1 can fire
        mean = DOMAIN_TARGET
        sigma = DOMAIN_SIGMA
    else:
        mean = sum(series) / n
        variance = sum((v - mean) ** 2 for v in series) / n
        sigma = math.sqrt(variance) if variance > 0 else DOMAIN_SIGMA

    violations = []
    for rule_fn in ALL_WE_RULES:
        violations.extend(rule_fn(series, mean, sigma))

    # Deduplicate by (rule_number, description) to avoid window-overlap spam
    seen = set()
    deduped = []
    for v in violations:
        key = (v[0], v[1])
        if key not in seen:
            seen.add(key)
            deduped.append(v)

    return BreedHealthReport(
        breed_id=breed_id,
        n_points=n,
        current_fitness=current,
        mean=mean,
        sigma=sigma,
        violations=deduped,
        trend=compute_trend(series),
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

RULE_NAMES = {
    1: "Single point >3σ",
    2: "9-in-a-row same side",
    3: "6-point trend",
    4: "14-point alternating",
    5: "2-of-3 beyond 2σ",
    6: "4-of-5 beyond 1σ",
    7: "15-in-a-row <1σ (stratification)",
}

TREND_ARROW = {"up": "↑", "down": "↓", "flat": "─", "insufficient_data": "?"}


def print_table(reports: list[BreedHealthReport]) -> None:
    violations_breeds = [r for r in reports if r.has_violations]
    clean_breeds = [r for r in reports if not r.has_violations]

    print()
    print("=" * 72)
    print("  BREED HEALTH — Western Electric SPC Rules")
    print("=" * 72)
    print(f"  Breeds analyzed : {len(reports)}")
    print(f"  WE violations   : {len(violations_breeds)}")
    print(f"  Clean           : {len(clean_breeds)}")
    print(f"  Domain baseline : target={DOMAIN_TARGET}, σ={DOMAIN_SIGMA} (single-point)")
    print("=" * 72)

    if violations_breeds:
        print("\n  [!] VIOLATIONS DETECTED\n")
        for r in sorted(violations_breeds, key=lambda x: x.breed_id):
            trend = TREND_ARROW.get(r.trend, "?")
            print(f"  {r.breed_id:<35} fitness={r.current_fitness:.4f}  n={r.n_points}  trend={trend}")
            for rule_num, desc, _ in r.violations:
                print(f"      WE-Rule {rule_num} ({RULE_NAMES.get(rule_num, '?')}): {desc}")
        print()

    print(f"\n  [OK] Clean breeds ({len(clean_breeds)}):")
    for r in sorted(clean_breeds, key=lambda x: x.breed_id):
        trend = TREND_ARROW.get(r.trend, "?")
        print(f"    {r.breed_id:<35} fitness={r.current_fitness:.4f}  n={r.n_points}  trend={trend}")

    print()
    if violations_breeds:
        print("  STATUS: DRIFT DETECTED — investigate listed breeds before next release.")
    else:
        print("  STATUS: ALL BREEDS WITHIN CONTROL LIMITS.")
    print()


def print_json_output(reports: list[BreedHealthReport]) -> None:
    out = []
    for r in reports:
        out.append({
            "breed_id": r.breed_id,
            "n_points": r.n_points,
            "current_fitness": r.current_fitness,
            "mean": r.mean,
            "sigma": r.sigma,
            "trend": r.trend,
            "violations": [
                {"rule": rule_num, "rule_name": RULE_NAMES.get(rule_num), "description": desc}
                for rule_num, desc, _ in r.violations
            ],
            "has_violations": r.has_violations,
        })
    print(json.dumps(out, indent=2))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Breed health via Western Electric SPC rules")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of table")
    parser.add_argument("--fail-on-violation", action="store_true", default=True,
                        help="Exit 1 if any WE violation found (default: True)")
    parser.add_argument("--no-fail", dest="fail_on_violation", action="store_false",
                        help="Always exit 0")
    parser.add_argument("--reports-dir", default=None,
                        help="Path to ocel/reports directory (default: auto-detect)")
    args = parser.parse_args()

    # Locate reports directory relative to this script or CWD
    if args.reports_dir:
        reports_dir = Path(args.reports_dir)
    else:
        script_dir = Path(__file__).parent
        candidates = [
            script_dir.parent / "ocel" / "reports",
            Path.cwd() / "ocel" / "reports",
        ]
        reports_dir = next((p for p in candidates if p.exists()), candidates[0])

    if not reports_dir.exists():
        print(f"ERROR: reports directory not found: {reports_dir}", file=sys.stderr)
        return 1

    series = load_snapshots(reports_dir)
    if not series:
        print("No breed fitness reports found.", file=sys.stderr)
        return 1

    reports = [analyze_breed(breed_id, snaps) for breed_id, snaps in sorted(series.items())]

    if args.json:
        print_json_output(reports)
    else:
        print_table(reports)

    has_violations = any(r.has_violations for r in reports)
    if has_violations and args.fail_on_violation:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
