#!/usr/bin/env python3
"""
generate_blue_ocean_summary.py

Generates an executive Blue Ocean summary Markdown from benchmark-report.json.

Usage:
    python3 scripts/generate_blue_ocean_summary.py \
        --report wasm4pm/target/wasm4pm-v26.5.28/benchmark-report.json \
        --output wasm4pm/target/wasm4pm-v26.5.28/executive-blue-ocean-summary.md
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


# PRD §9.2 verbatim doctrine block — must appear exactly as shown
DOCTRINE_BLOCK = """\
The benchmark story is not "fast Rust."
The benchmark story is that speed, real-data coverage, adversarial closure,
deterministic hashing, and reportable evidence converge into one process substrate."""

# SIMD highlight — required by PRD §5 regardless of top-5 position
SIMD_HIGHLIGHT = (
    "**Standout: SIMD Streaming DFG — 9.93 µs · 92.0M cases/sec · 24× scalar advantage**"
)

# Honesty label evidence classes that require explicit disclosure
HONESTY_LABEL_CLASSES = {
    "source_inspected",
    "adversary_measured",
    "feature_gated_not_run",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_report(path: Path) -> dict:
    if not path.exists():
        print(f"ERROR: Report file not found: {path}", file=sys.stderr)
        sys.exit(1)
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"ERROR: Failed to load report: {e}", file=sys.stderr)
        sys.exit(1)


def format_latency(median_us: float | None) -> str:
    if median_us is None:
        return "—"
    if median_us < 1.0:
        return f"{median_us * 1000:.1f} ns"
    if median_us < 1000.0:
        return f"{median_us:.2f} µs"
    return f"{median_us / 1000:.2f} ms"


def format_throughput(throughput_m: float | None) -> str:
    if throughput_m is None:
        return "—"
    if throughput_m >= 1.0:
        return f"{throughput_m:.1f}M cases/sec"
    return f"{throughput_m * 1000:.0f}K cases/sec"


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------

def section_header(version: str, generated_at: str) -> str:
    lines = [
        f"# wasm4pm v{version} — Real-Data Algorithm Benchmark Suite: Executive Blue Ocean Summary",
        "",
        f"**Generated:** {generated_at}",
        "",
    ]
    return "\n".join(lines)


def section_doctrine() -> str:
    return "\n".join([
        "---",
        "",
        DOCTRINE_BLOCK,
        "",
    ])


def section_top5(algorithms: list[dict]) -> str:
    # Top 5 by throughput_m (already sorted in report)
    top5 = [a for a in algorithms if a.get("throughput_m") is not None][:5]

    lines = [
        "## Top 5 Standout Metrics",
        "",
        "| Algorithm | Median Latency | Throughput | Evidence Class | Production Status |",
        "|---|---|---|---|---|",
    ]
    for a in top5:
        name     = a.get("display_name", a.get("algorithm_id", "?"))
        latency  = format_latency(a.get("median_us"))
        throughput = format_throughput(a.get("throughput_m"))
        evidence = a.get("evidence_class", "—")
        status   = a.get("production_status", "—")
        lines.append(f"| {name} | {latency} | {throughput} | {evidence} | {status} |")

    lines.append("")
    return "\n".join(lines)


def section_simd_highlight(algorithms: list[dict]) -> str:
    # PRD §5: always include SIMD block regardless of top-5 position
    # Check if SIMD is already in the data; if so add measured note
    simd_entry = None
    for a in algorithms:
        aid = a.get("algorithm_id", "")
        if "simd" in aid.lower() and "dfg" in aid.lower():
            simd_entry = a
            break

    lines = ["## SIMD Streaming DFG — Performance Highlight", ""]
    lines.append(SIMD_HIGHLIGHT)
    lines.append("")

    if simd_entry:
        latency   = format_latency(simd_entry.get("median_us"))
        tput      = format_throughput(simd_entry.get("throughput_m"))
        evidence  = simd_entry.get("evidence_class", "—")
        source    = simd_entry.get("perf_source", "—")
        lines.append(
            f"Latency: {latency} | Throughput: {tput} | "
            f"Evidence: {evidence} | Source: {source}"
        )
        lines.append("")

    lines.append(
        "The SIMD-accelerated streaming variant processes live process events 24 times "
        "faster than the standard scalar approach at 92 million cases per second, "
        "discovering process structure in real time from a live event stream. "
        "This is the first open-source WebAssembly process mining substrate to validate "
        "SIMD streaming discovery at these throughput levels."
    )
    lines.append("")
    return "\n".join(lines)


def section_evidence_class_distribution(evidence_summary: dict) -> str:
    lines = [
        "## Evidence Class Distribution",
        "",
        "| Evidence Class | Count | Meaning |",
        "|---|---|---|",
    ]
    descriptions = {
        "criterion_measured":       "Direct Criterion benchmark measurement",
        "integration_measured":     "Measured in integration test with real data",
        "adversary_measured":       "Measured under adversarial / stress conditions",
        "source_inspected":         "Code reviewed; not yet directly benchmarked",
        "wasm_boundary_documented": "WASM API boundary verified; performance estimated",
        "feature_gated_not_run":    "Behind feature gate; not run in standard benchmarks",
        "experimental":             "Experimental; evidence incomplete",
    }
    for ec, count in sorted(evidence_summary.items(), key=lambda x: -x[1]):
        desc = descriptions.get(ec, "—")
        lines.append(f"| `{ec}` | {count} | {desc} |")
    lines.append("")
    return "\n".join(lines)


def section_mcpp_critical_paths(algorithms: list[dict]) -> str:
    critical = [a for a in algorithms if a.get("mcpp_criticality")]
    if not critical:
        return ""

    lines = [
        "## mcpp Critical Paths",
        "",
        "These algorithms are on the critical path for multi-core process parallelism (mcpp). "
        "Their latency directly constrains system-level throughput.",
        "",
        "| Algorithm | Family | Median Latency | Throughput | Criticality | Status |",
        "|---|---|---|---|---|---|",
    ]
    for a in critical:
        name        = a.get("display_name", a.get("algorithm_id", "?"))
        family      = a.get("family", "—")
        latency     = format_latency(a.get("median_us"))
        tput        = format_throughput(a.get("throughput_m"))
        criticality = a.get("mcpp_criticality", "—")
        status      = a.get("production_status", "—")
        lines.append(f"| {name} | {family} | {latency} | {tput} | {criticality} | {status} |")
    lines.append("")
    return "\n".join(lines)


def section_honesty_labels(algorithms: list[dict]) -> str:
    labelled = [a for a in algorithms if a.get("evidence_class") in HONESTY_LABEL_CLASSES]
    if not labelled:
        return ""

    lines = [
        "## Honesty Labels",
        "",
        "> The following algorithms carry an honesty label indicating their performance "
        "figures are **not** direct Criterion benchmark measurements. They are included "
        "for completeness but should not be cited as head-to-head benchmark results.",
        "",
        "| Algorithm | Evidence Class | Note |",
        "|---|---|---|",
    ]
    notes = {
        "source_inspected":         "Code reviewed and implementation verified; not yet benchmarked",
        "adversary_measured":        "Measured under adversarial conditions, not standard benchmark harness",
        "feature_gated_not_run":     "Feature-gated; excluded from standard CI benchmark runs",
    }
    for a in labelled:
        name    = a.get("display_name", a.get("algorithm_id", "?"))
        ec      = a.get("evidence_class", "—")
        note    = notes.get(ec, "See evidence class description above")
        lines.append(f"| {name} | `{ec}` | {note} |")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def generate_summary(report: dict) -> str:
    version      = report.get("version", "unknown")
    generated_at = report.get("generated_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    algorithms   = report.get("algorithms", [])
    ec_summary   = report.get("evidence_class_summary", {})

    parts = [
        section_header(version, generated_at),
        section_doctrine(),
        section_top5(algorithms),
        section_simd_highlight(algorithms),
        section_evidence_class_distribution(ec_summary),
        section_mcpp_critical_paths(algorithms),
        section_honesty_labels(algorithms),
    ]

    # Filter empty sections
    return "\n".join(p for p in parts if p.strip())


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate executive Blue Ocean summary from benchmark-report.json."
    )
    parser.add_argument("--report", required=True, help="Path to benchmark-report.json")
    parser.add_argument("--output", required=True, help="Output Markdown path")
    args = parser.parse_args()

    report = load_report(Path(args.report))
    summary = generate_summary(report)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(summary)
        if not summary.endswith("\n"):
            f.write("\n")

    print(f"Blue Ocean summary written to {out_path} ({out_path.stat().st_size:,} bytes)")

    version    = report.get("version", "?")
    total      = report.get("total_algorithms", 0)
    top        = report.get("top_throughput", [])
    top_name   = top[0]["display_name"] if top else "—"
    top_tput   = top[0].get("throughput_m", "—") if top else "—"
    print(f"  v{version} | {total} algorithms | top: {top_name} @ {top_tput}M cases/sec")


if __name__ == "__main__":
    main()
