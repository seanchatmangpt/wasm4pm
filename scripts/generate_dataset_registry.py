#!/usr/bin/env python3
"""
generate_dataset_registry.py

Scans Rust test and bench files for data fixture references,
hashes found files, and emits a dataset registry JSON.

Usage:
    python3 scripts/generate_dataset_registry.py \
        --src-dir wasm4pm/src --tests-dir wasm4pm/tests \
        --output wasm4pm/target/wasm4pm-v26.5.15/real-data-dataset-registry.json \
        --version 26.5.15
"""

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Domain heuristics (filename keywords → domain label)
# ---------------------------------------------------------------------------
DOMAIN_KEYWORDS = {
    "hospital":     "healthcare",
    "sepsis":       "healthcare",
    "bpi":          "process_mining",
    "bpic":         "process_mining",
    "bpi201":       "process_mining",
    "bpi_201":      "process_mining",
    "traffic":      "transportation",
    "road":         "transportation",
    "ocel":         "object_centric",
    "running":      "synthetic_reference",
    "example":      "synthetic_reference",
    "domestic":     "process_mining",
    "international": "process_mining",
    "permit":       "process_mining",
    "travel":       "process_mining",
    "incident":     "process_mining",
    "challenge":    "process_mining",
    "building":     "process_mining",
    "declaration":  "process_mining",
}

FORMAT_MAP = {
    ".xes":      "xes",
    ".json":     "ocel_json",
    ".jsonocel": "ocel_json",
    ".csv":      "csv",
    ".ocel":     "ocel",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def infer_format(path: str) -> str:
    p = Path(path)
    # Handle compound extensions like .jsonocel
    suffix = p.suffix.lower()
    name_lower = p.name.lower()
    if name_lower.endswith(".jsonocel"):
        return "ocel_json"
    return FORMAT_MAP.get(suffix, "unknown")


def infer_domain(path: str) -> str:
    name_lower = Path(path).stem.lower()
    for keyword, domain in DOMAIN_KEYWORDS.items():
        if keyword in name_lower:
            return domain
    return "unknown"


def make_dataset_id(path: str) -> str:
    """Derive a short stable ID from the filename without extension."""
    stem = Path(path).stem
    # strip compound extension like .jsonocel
    if stem.endswith(".json"):
        stem = stem[:-5]
    return stem.replace(" ", "_").replace("-", "-")


def sha256_file(file_path: Path) -> str | None:
    if not file_path.exists():
        return None
    h = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def count_xes_traces(file_path: Path) -> int | None:
    """Count <trace> elements in an XES file using streaming parse."""
    if not file_path.exists():
        return None
    try:
        count = 0
        for _, elem in ET.iterparse(str(file_path), events=("start",)):
            if elem.tag in ("trace", "{http://www.xes-standard.org/}trace"):
                count += 1
        return count
    except Exception:
        return None


def count_xes_events(file_path: Path) -> int | None:
    """Count <event> elements in an XES file."""
    if not file_path.exists():
        return None
    try:
        count = 0
        for _, elem in ET.iterparse(str(file_path), events=("start",)):
            if elem.tag in ("event", "{http://www.xes-standard.org/}event"):
                count += 1
        return count
    except Exception:
        return None


def count_ocel_events(file_path: Path) -> int | None:
    """Count ocel:events entries in OCEL JSON."""
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
        events = data.get("ocel:events", data.get("events", None))
        if isinstance(events, dict):
            return len(events)
        if isinstance(events, list):
            return len(events)
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# File scanning
# ---------------------------------------------------------------------------

# Patterns that indicate data file references in Rust source
DATA_FILE_RE = re.compile(
    r'"([^"]*(?:bench_data|real_data|tests/bench_data|tests/fixtures|wasm4pm/tests)[^"]*'
    r'\.(?:xes|json|jsonocel|ocel|csv))"'
    r'|include_str!\("([^"]*\.(?:xes|json|jsonocel|ocel|csv))"\)'
    r'|Path::new\("([^"]*\.(?:xes|json|jsonocel|ocel|csv))"\)',
    re.IGNORECASE,
)


def extract_data_paths_from_file(rs_path: Path) -> list[str]:
    """Return all data file path strings found in a Rust source file."""
    try:
        text = rs_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    found = []
    for m in DATA_FILE_RE.finditer(text):
        raw = m.group(1) or m.group(2) or m.group(3)
        if not raw:
            continue
        # Skip absolute paths that are machine-local (~ or /Users/...)
        if raw.startswith("~") or raw.startswith("/"):
            continue
        # Skip source .json fixture outputs (pm4py_*_output.json etc.)
        if "/fixtures/pm4py_" in raw or raw.endswith("_output.json"):
            continue
        found.append(raw)
    return found


def scan_rs_files(dirs: list[Path]) -> dict[str, set[str]]:
    """
    Returns: {normalized_data_path: {test_file_stem, ...}}
    """
    path_to_tests: dict[str, set[str]] = {}
    for d in dirs:
        if not d.exists():
            continue
        for rs_file in sorted(d.rglob("*.rs")):
            paths = extract_data_paths_from_file(rs_file)
            for p in paths:
                path_to_tests.setdefault(p, set()).add(rs_file.stem)
    return path_to_tests


# ---------------------------------------------------------------------------
# Canonical path resolution
# ---------------------------------------------------------------------------

def resolve_canonical(raw_path: str, repo_root: Path) -> tuple[str, Path | None]:
    """
    Try to find the file on disk relative to repo_root.
    Returns (canonical_relative_path, absolute_path_or_None).
    """
    # Normalise separators
    norm = raw_path.replace("\\", "/")

    # Try the path as-is from repo root
    candidate = repo_root / norm
    if candidate.exists():
        return norm, candidate

    # Strip leading wasm4pm/ prefix and retry
    stripped = re.sub(r"^wasm4pm/", "", norm)
    candidate2 = repo_root / "wasm4pm" / stripped
    if candidate2.exists():
        return "wasm4pm/" + stripped, candidate2

    candidate3 = repo_root / stripped
    if candidate3.exists():
        return stripped, candidate3

    # Try bench_data at repo root
    if norm.startswith("bench_data/") or norm.startswith("../../bench_data/"):
        filename = Path(norm).name
        for probe in [
            repo_root / "bench_data" / filename,
            repo_root / "wasm4pm" / "bench_data" / filename,
        ]:
            if probe.exists():
                rel = probe.relative_to(repo_root)
                return str(rel), probe

    return norm, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_registry(
    tests_dirs: list[Path],
    repo_root: Path,
    version: str,
) -> dict:
    path_to_tests = scan_rs_files(tests_dirs)

    # De-duplicate by canonical path
    canonical_map: dict[str, dict] = {}  # canonical_path -> entry

    for raw_path, test_files in sorted(path_to_tests.items()):
        canonical_path, abs_path = resolve_canonical(raw_path, repo_root)

        if canonical_path in canonical_map:
            canonical_map[canonical_path]["used_by_tests"].extend(sorted(test_files))
            canonical_map[canonical_path]["used_by_tests"] = sorted(
                set(canonical_map[canonical_path]["used_by_tests"])
            )
            continue

        exists = abs_path is not None and abs_path.exists()
        fmt = infer_format(canonical_path)
        domain = infer_domain(canonical_path)
        dataset_id = make_dataset_id(canonical_path)
        file_hash = sha256_file(abs_path) if (exists and abs_path is not None) else None

        trace_count: int | None = None
        event_count: int | None = None
        if exists and abs_path is not None:
            if fmt == "xes":
                trace_count = count_xes_traces(abs_path)
                event_count = count_xes_events(abs_path)
            elif fmt in ("ocel_json", "ocel"):
                event_count = count_ocel_events(abs_path)

        canonical_map[canonical_path] = {
            "dataset_id":    dataset_id,
            "path":          canonical_path,
            "format":        fmt,
            "domain":        domain,
            "hash_algorithm": "sha256",
            "hash":          file_hash,
            "trace_count":   trace_count,
            "event_count":   event_count,
            "exists":        exists,
            "used_by_tests": sorted(test_files),
        }

    return {
        "version":      version,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "datasets":     list(canonical_map.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan Rust tests/benches for data file references and emit dataset registry."
    )
    parser.add_argument("--src-dir",    default="wasm4pm/src",   help="Source directory (unused, reserved)")
    parser.add_argument("--tests-dir",  default="wasm4pm/tests",  help="Tests directory to scan (also scans wasm4pm/benches)")
    parser.add_argument("--output",     required=True,            help="Output JSON path")
    parser.add_argument("--version",    default="26.5.15",        help="Version string")
    args = parser.parse_args()

    repo_root = Path.cwd()

    tests_dir = Path(args.tests_dir)
    benches_dir = tests_dir.parent / "benches"

    scan_dirs = [tests_dir, benches_dir]
    # Also scan the wasm4pm sub-workspace if present
    sub = repo_root / "wasm4pm"
    if sub.exists() and sub != repo_root:
        scan_dirs.extend([sub / "tests", sub / "benches"])

    registry = build_registry(scan_dirs, repo_root, args.version)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)
        f.write("\n")

    total = len(registry["datasets"])
    found = sum(1 for d in registry["datasets"] if d["exists"])
    print(f"Dataset registry written to {output_path}")
    print(f"  {total} unique datasets found, {found} exist on disk")
    for d in registry["datasets"]:
        mark = "OK" if d["exists"] else "MISSING"
        print(f"  [{mark}] {d['path']}")


if __name__ == "__main__":
    main()
