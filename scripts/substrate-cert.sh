#!/usr/bin/env bash
# substrate-cert.sh — generate substrate-certificate.json from audit inputs
# Reads: REAL_DATA_REPORT, FAKE_AUDIT
# Writes: OUTPUT_FILE
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

REAL_DATA_REPORT="${REAL_DATA_REPORT:-wasm4pm/target/wasm4pm-v26.5.28/real-data-report.json}"
FAKE_AUDIT="${FAKE_AUDIT:-wasm4pm/target/wasm4pm-v26.5.28/fake-stub-audit.json}"
OUTPUT_FILE="${OUTPUT_FILE:-wasm4pm/target/wasm4pm-v26.5.28/substrate-certificate.json}"
RELEASE="${RELEASE:-26.5.28}"

python3 - <<PYEOF
import json, sys, os
from datetime import datetime, timezone

# ── Read inputs ──────────────────────────────────────────────────────────────
try:
    with open("$REAL_DATA_REPORT") as f:
        report = json.load(f)
except FileNotFoundError:
    print(f"ERROR: {repr('$REAL_DATA_REPORT')} not found. Run 'make real-data' first.", file=sys.stderr)
    sys.exit(1)

try:
    with open("$FAKE_AUDIT") as f:
        audit = json.load(f)
except FileNotFoundError:
    print(f"ERROR: {repr('$FAKE_AUDIT')} not found. Run 'make fake-audit' first.", file=sys.stderr)
    sys.exit(1)

# ── Compute metrics ──────────────────────────────────────────────────────────
files = report.get("files", [])
total_passed = sum(f.get("passed", 0) for f in files)
total_failed = sum(f.get("failed", 0) for f in files)

s1_fake = sum(1 for f in audit if f.get("classification") == "s1_fake")
s2_placeholder = sum(1 for f in audit if f.get("classification") == "s2_placeholder")
production_blockers = sum(1 for f in audit if not f.get("production_allowed", True))

# ── Certificate value ─────────────────────────────────────────────────────────
if s1_fake > 0:
    cert_value = "RefusedUntilBlockersResolved"
elif s2_placeholder > 0:
    cert_value = "AcceptedWithExperimentalExclusions"
else:
    cert_value = "Accepted"

# ── mcpp-critical paths ───────────────────────────────────────────────────────
mcpp_critical_paths = {
    "dfg_discovery":           "real_data_algo_validation",
    "pm4py_cross_validation":  "pm4py_cross_validation",
    "event_log_filtering":     "filter_real_data_tests",
    "powl_and_prediction":     "powl_and_prediction_real_data_tests",
    "ml_classification":       "ml_real_data_tests",
    "analytics_prediction":    "analytics_real_data_tests",
    "ocel_process_mining":     "ocel_real_data_tests",
    "conformance_checking":    "conformance_real_data_tests",
    "streaming_conformance":   "remaining_capabilities_real_data_tests",
    "coverage_gap_algorithms": "coverage_gap_real_data_tests",
}

# ── Emit certificate ──────────────────────────────────────────────────────────
cert = {
    "release": "$RELEASE",
    "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "real_data_tests": {
        "passed": total_passed,
        "failed": total_failed,
        "files": len(files),
    },
    "fake_stub_audit": {
        "s1_fake": s1_fake,
        "s2_placeholder": s2_placeholder,
        "production_blockers": production_blockers,
    },
    "mcpp_critical_paths": mcpp_critical_paths,
    "certificate_value": cert_value,
}

os.makedirs(os.path.dirname("$OUTPUT_FILE") or ".", exist_ok=True)
with open("$OUTPUT_FILE", "w") as f:
    json.dump(cert, f, indent=2)
    f.write("\n")

print(f"substrate-cert: certificate_value={cert_value}")
print(f"  real_data_tests: {total_passed} passed / {total_failed} failed across {len(files)} files")
print(f"  fake_stub_audit: {s1_fake} s1_fake, {s2_placeholder} s2_placeholder, {production_blockers} blockers")
print(f"  output: $OUTPUT_FILE")
PYEOF
