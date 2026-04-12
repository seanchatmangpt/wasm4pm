#!/usr/bin/env bash
# =============================================================================
# validate-production-readiness.sh — Master Production Readiness Validator
#
# Covers 50+ merge gate checklist items across 5 categories:
#   1. Kernel Correctness (10 items)     KC-1  through KC-10
#   2. GPU Integration (8 items)         GI-1  through GI-8
#   3. OTEL Observability (12 items)     OT-1  through OT-12
#   4. Test Coverage (10 items)          TC-1  through TC-10
#   5. Code Quality (10 items)           CQ-1  through CQ-10
#
# Exit code: 0 if all items PASS (WARN is non-blocking), 1 if any FAIL
#
# Output: JSON report saved to .pictl/benchmarks/production-readiness-<timestamp>.json
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
REPORT_DIR="$REPO_ROOT/.pictl/benchmarks"
REPORT_FILE="$REPORT_DIR/production-readiness-${TIMESTAMP}.json"
VALIDATORS_DIR="$REPO_ROOT/scripts/validators"
TMP_DIR=$(mktemp -d)

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

mkdir -p "$REPORT_DIR"
mkdir -p "$TMP_DIR"

log() { echo -e "$1"; }
log_section() { log "\n${BOLD}${BLUE}=== $1 ===${RESET}"; }
log_pass() { log "  ${GREEN}PASS${RESET} $1: $2"; }
log_fail() { log "  ${RED}FAIL${RESET} $1: $2"; }
log_warn() { log "  ${YELLOW}WARN${RESET} $1: $2"; }

# Make all validators executable
chmod +x "$VALIDATORS_DIR/"*.sh 2>/dev/null || true

log "${BOLD}pictl Production Readiness Validator${RESET}"
log "Timestamp: $TIMESTAMP"
log "Repository: $REPO_ROOT"
log "Report: $REPORT_FILE"
log ""
log "Checking 50 merge gate items across 5 categories..."

# ─────────────────────────────────────────────────────────────────────────────
# Run each validator module
# ─────────────────────────────────────────────────────────────────────────────

MODULES=(
  "kernel-correctness:Kernel Correctness (10 items)"
  "gpu-integration:GPU Integration (8 items)"
  "otel-observability:OTEL Observability (12 items)"
  "test-coverage:Test Coverage (10 items)"
  "code-quality:Code Quality (10 items)"
)

MODULE_RESULTS=()
for entry in "${MODULES[@]}"; do
  MODULE_NAME="${entry%%:*}"
  MODULE_LABEL="${entry##*:}"
  TMP_FILE="$TMP_DIR/$MODULE_NAME.json"

  log_section "$MODULE_LABEL"

  if bash "$VALIDATORS_DIR/$MODULE_NAME.sh" "$TMP_FILE" 2>/dev/null; then
    # Parse and display results
    if [ -f "$TMP_FILE" ]; then
      python3 -c "
import json, sys

data = json.load(open('$TMP_FILE'))
category_key = list(data.keys())[0]
items = data[category_key]

for item in items:
    status = item['status']
    id_ = item['id']
    detail = item['detail']
    if status == 'PASS':
        print(f'  PASS  {id_}: {detail}')
    elif status == 'FAIL':
        print(f'  FAIL  {id_}: {detail}', file=sys.stderr)
    else:
        print(f'  WARN  {id_}: {detail}')
" 2>&1 | while IFS= read -r line; do
        if [[ "$line" == *"  FAIL  "* ]]; then
          log "  ${RED}FAIL${RESET}  ${line#  FAIL  }"
        elif [[ "$line" == *"  WARN  "* ]]; then
          log "  ${YELLOW}WARN${RESET}  ${line#  WARN  }"
        else
          log "  ${GREEN}PASS${RESET}  ${line#  PASS  }"
        fi
      done
      MODULE_RESULTS+=("$TMP_FILE")
    fi
  else
    log "  ${RED}ERROR${RESET} Module $MODULE_NAME failed to run"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# Aggregate results into final JSON report
# ─────────────────────────────────────────────────────────────────────────────

python3 << PYEOF
import json
import os
import sys
from datetime import datetime, timezone

tmp_dir = "$TMP_DIR"
report_file = "$REPORT_FILE"
repo_root = "$REPO_ROOT"

# Load all module results
categories = {}
all_items = []

module_files = [
    ("kernel_correctness",  os.path.join(tmp_dir, "kernel-correctness.json")),
    ("gpu_integration",     os.path.join(tmp_dir, "gpu-integration.json")),
    ("otel_observability",  os.path.join(tmp_dir, "otel-observability.json")),
    ("test_coverage",       os.path.join(tmp_dir, "test-coverage.json")),
    ("code_quality",        os.path.join(tmp_dir, "code-quality.json")),
]

for key, path in module_files:
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
        cat_key = list(data.keys())[0]
        items = data[cat_key]
        categories[key] = {
            item["id"]: {
                "status": item["status"],
                "detail": item["detail"]
            }
            for item in items
        }
        all_items.extend(items)
    else:
        categories[key] = {"ERROR": {"status": "FAIL", "detail": f"Module {key} did not produce results"}}
        all_items.append({"id": f"{key.upper()}-ERROR", "status": "FAIL", "detail": "Module failed to run"})

# Tally
pass_count  = sum(1 for i in all_items if i["status"] == "PASS")
fail_count  = sum(1 for i in all_items if i["status"] == "FAIL")
warn_count  = sum(1 for i in all_items if i["status"] == "WARN")
total_count = len(all_items)

# Remediation list (FAIL items only)
remediations = [
    {
        "id": i["id"],
        "action": i["detail"]
    }
    for i in all_items if i["status"] == "FAIL"
]

# Category summaries
category_summaries = {}
for cat_key, items_dict in categories.items():
    cat_pass  = sum(1 for v in items_dict.values() if v["status"] == "PASS")
    cat_fail  = sum(1 for v in items_dict.values() if v["status"] == "FAIL")
    cat_warn  = sum(1 for v in items_dict.values() if v["status"] == "WARN")
    cat_total = len(items_dict)
    category_summaries[cat_key] = {
        "pass": cat_pass,
        "fail": cat_fail,
        "warn": cat_warn,
        "total": cat_total,
        "status": "PASS" if cat_fail == 0 else "FAIL"
    }

overall_status = "PASS" if fail_count == 0 else "FAIL"

report = {
    "schema": "production-readiness-v1",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "repository": repo_root,
    "validator_version": "1.0.0",
    "summary": {
        "total_items": total_count,
        "pass":  pass_count,
        "fail":  fail_count,
        "warn":  warn_count,
        "overall_status": overall_status,
        "merge_approved": overall_status == "PASS",
        "note": "WARN items are non-blocking. FAIL items block merge."
    },
    "category_summaries": category_summaries,
    "categories": categories,
    "remediation_required": remediations,
    "merge_gate_conditions": {
        "all_items_pass_or_warn": fail_count == 0,
        "kernel_correctness_clean": category_summaries.get("kernel_correctness", {}).get("fail", 1) == 0,
        "gpu_kernel_implemented": categories.get("gpu_integration", {}).get("GI-3", {}).get("status") == "PASS",
        "conformance_tests_complete": categories.get("test_coverage", {}).get("TC-8", {}).get("status") == "PASS",
        "otel_schema_valid": category_summaries.get("otel_observability", {}).get("fail", 1) == 0,
    }
}

with open(report_file, "w") as f:
    json.dump(report, f, indent=2)

print(json.dumps({
    "total": total_count,
    "pass": pass_count,
    "fail": fail_count,
    "warn": warn_count,
    "status": overall_status,
    "remediations": len(remediations)
}))
PYEOF

# ─────────────────────────────────────────────────────────────────────────────
# Print summary
# ─────────────────────────────────────────────────────────────────────────────

SUMMARY=$(python3 -c "
import json
with open('$REPORT_FILE') as f:
    r = json.load(f)
s = r['summary']
print(f\"{s['pass']}/{s['total_items']} PASS  {s['fail']} FAIL  {s['warn']} WARN  — {s['overall_status']}\")
")

FAIL_COUNT=$(python3 -c "import json; r=json.load(open('$REPORT_FILE')); print(r['summary']['fail'])")

log ""
log "${BOLD}═══════════════════════════════════════════════════${RESET}"
log "${BOLD}  Production Readiness Summary${RESET}"
log "${BOLD}═══════════════════════════════════════════════════${RESET}"
log "  $SUMMARY"
log ""

# Print remediation list
python3 -c "
import json
r = json.load(open('$REPORT_FILE'))
items = r.get('remediation_required', [])
if items:
    print('  Remediation required:')
    for item in items:
        print(f\"    [{item['id']}] {item['action']}\")
else:
    print('  No remediation required — all items pass or warn only.')
"

log ""
log "  Full report: $REPORT_FILE"
log "${BOLD}═══════════════════════════════════════════════════${RESET}"

# Clean up temp dir
rm -rf "$TMP_DIR"

# Exit with 1 if any FAIL
if [ "$FAIL_COUNT" -gt 0 ]; then
  log ""
  log "${RED}Validation FAILED: $FAIL_COUNT item(s) require remediation before merge.${RESET}"
  exit 1
else
  log ""
  log "${GREEN}Validation PASSED: all items pass (WARN items are non-blocking).${RESET}"
  exit 0
fi
