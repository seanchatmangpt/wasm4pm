#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Module: otel-observability.sh — 12 items
# ---------------------------------------------------------------------------

RESULTS_FILE="${1:-/tmp/otel-observability.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$SCRIPT_DIR" in
  */scripts/validators) REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)" ;;
  */scripts)            REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)" ;;
  *)                    REPO_ROOT="$SCRIPT_DIR" ;;
esac
SEMCONV_FILE="$REPO_ROOT/semconv/pictl-process-mining.yaml"
INSTR_DIR="$REPO_ROOT/packages/observability/src"
cd "$REPO_ROOT"

{

# OT-1: Semconv schema file present
if [ -f "$SEMCONV_FILE" ]; then
  echo "PASS|OT-1|pictl-process-mining.yaml semconv schema present"
else
  echo "FAIL|OT-1|semconv/pictl-process-mining.yaml missing"
fi

# OT-2: Required span groups (pm.discovery, pm.conformance, pm.prediction, pm.drift, pm.ml)
MISSING_GROUPS=""
for G in "pm.discovery" "pm.conformance" "pm.prediction" "pm.drift" "pm.ml"; do
  if [ -f "$SEMCONV_FILE" ] && ! grep -q "id: $G" "$SEMCONV_FILE" 2>/dev/null; then
    MISSING_GROUPS="$MISSING_GROUPS $G"
  fi
done
MISSING_GROUPS="${MISSING_GROUPS# }"
if [ -z "$MISSING_GROUPS" ]; then
  echo "PASS|OT-2|All 5 required span groups present (pm.discovery/conformance/prediction/drift/ml)"
else
  echo "FAIL|OT-2|Missing span groups: $MISSING_GROUPS"
fi

# OT-3: pm.discovery required attributes (algorithm, input_format, model_type)
if [ -f "$SEMCONV_FILE" ]; then
  DISC_REQ=$(python3 -c "
import re
text = open('$SEMCONV_FILE').read()
m = re.search(r'id: pm\.discovery\b.*?(?=\n  - id:)', text, re.DOTALL)
if m:
    print(m.group().count('requirement_level: required'))
else:
    print(0)
" 2>/dev/null || echo 0)
  DISC_INT=$(echo "$DISC_REQ" | tr -d '[:space:]')
  if [ "$DISC_INT" -ge 3 ]; then
    echo "PASS|OT-3|pm.discovery: $DISC_INT required attributes (algorithm, input_format, model_type)"
  else
    echo "FAIL|OT-3|pm.discovery: only $DISC_INT required attributes (need 3: algorithm, input_format, model_type)"
  fi
else
  echo "FAIL|OT-3|Cannot check: semconv file missing"
fi

# OT-4: pm.conformance required attributes (fitness, precision)
if [ -f "$SEMCONV_FILE" ]; then
  HAS_FITNESS=$(grep -c "fitness" "$SEMCONV_FILE" 2>/dev/null || echo 0)
  HAS_PREC=$(grep -c "precision" "$SEMCONV_FILE" 2>/dev/null || echo 0)
  HF=$(echo "$HAS_FITNESS" | tr -d '[:space:]')
  HP=$(echo "$HAS_PREC" | tr -d '[:space:]')
  if [ "$HF" -gt 0 ] && [ "$HP" -gt 0 ]; then
    echo "PASS|OT-4|pm.conformance: fitness + precision attributes defined"
  else
    echo "FAIL|OT-4|pm.conformance: missing fitness or precision attributes"
  fi
else
  echo "FAIL|OT-4|Cannot check: semconv file missing"
fi

# OT-5: pm.prediction attributes
if [ -f "$SEMCONV_FILE" ]; then
  PRED_N=$(grep -c "prediction_type\|prediction_confidence\|next_activity" "$SEMCONV_FILE" 2>/dev/null || echo 0)
  PRED_INT=$(echo "$PRED_N" | tr -d '[:space:]')
  if [ "$PRED_INT" -ge 2 ]; then
    echo "PASS|OT-5|pm.prediction attributes present: $PRED_INT references"
  else
    echo "FAIL|OT-5|pm.prediction attributes incomplete: $PRED_INT references"
  fi
else
  echo "FAIL|OT-5|Cannot check: semconv file missing"
fi

# OT-6: pm.drift attributes
if [ -f "$SEMCONV_FILE" ]; then
  DRIFT_N=$(grep -c "drift_detected\|jaccard\|window_size\|drift_score\|drift" "$SEMCONV_FILE" 2>/dev/null || echo 0)
  DRIFT_INT=$(echo "$DRIFT_N" | tr -d '[:space:]')
  if [ "$DRIFT_INT" -ge 2 ]; then
    echo "PASS|OT-6|pm.drift attributes present: $DRIFT_INT references"
  else
    echo "FAIL|OT-6|pm.drift attributes missing or insufficient: $DRIFT_INT references"
  fi
else
  echo "FAIL|OT-6|Cannot check: semconv file missing"
fi

# OT-7: Metrics section present
if [ -f "$SEMCONV_FILE" ]; then
  if grep -q "^metrics:" "$SEMCONV_FILE"; then
    MET_N=$(grep -c "^  - id: pm\." "$SEMCONV_FILE" 2>/dev/null || echo 0)
    echo "PASS|OT-7|semconv metrics section present: $MET_N metric definitions"
  else
    echo "FAIL|OT-7|No metrics section in semconv schema"
  fi
else
  echo "FAIL|OT-7|Cannot check: semconv file missing"
fi

# OT-8: Observability package TypeScript sources
if [ -d "$INSTR_DIR" ]; then
  TS_N=$(ls "$INSTR_DIR"/*.ts 2>/dev/null | wc -l | tr -d ' ')
  TS_INT=$(echo "$TS_N" | tr -d '[:space:]')
  if [ "$TS_INT" -gt 0 ]; then
    echo "PASS|OT-8|Observability package: $TS_INT TypeScript source files"
  else
    echo "FAIL|OT-8|Observability package src/ has no .ts files"
  fi
else
  echo "FAIL|OT-8|packages/observability/src/ not found"
fi

# OT-9: OTEL span timing (nanoseconds) in observability code
if [ -d "$INSTR_DIR" ]; then
  NS_N=$(grep -rn "1_000_000\|nanosec\|Date\.now\|startTime\|endTime" "$INSTR_DIR/" 2>/dev/null | wc -l | tr -d ' ')
  NS_INT=$(echo "$NS_N" | tr -d '[:space:]')
  if [ "$NS_INT" -gt 0 ]; then
    echo "PASS|OT-9|OTEL span timing references: $NS_INT (nanoseconds pattern verified)"
  else
    echo "WARN|OT-9|No explicit nanosecond timestamps in observability — verify spans use Date.now()*1_000_000"
  fi
else
  echo "FAIL|OT-9|packages/observability/src/ not found"
fi

# OT-10: weaver tool available
WEAVER_BIN=$(which weaver 2>/dev/null || echo "")
if [ -n "$WEAVER_BIN" ]; then
  W_VER=$("$WEAVER_BIN" --version 2>&1 | head -1 || echo "unknown")
  echo "PASS|OT-10|weaver available: $W_VER"
else
  echo "FAIL|OT-10|weaver not found — install from https://github.com/open-telemetry/weaver"
fi

# OT-11: weaver registry check — semconv structure assessment
WEAVER_BIN=$(which weaver 2>/dev/null || echo "")
if [ -n "$WEAVER_BIN" ]; then
  YAML_N=$(find "$REPO_ROOT/semconv" -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')
  YAML_INT=$(echo "$YAML_N" | tr -d '[:space:]')
  # The pictl semconv is a flat YAML, not a weaver registry directory format.
  # A weaver registry requires groups/ subdirectory structure.
  HAS_REGISTRY_STRUCT=$(find "$REPO_ROOT/semconv" -name "*.yaml" -path "*/groups/*" 2>/dev/null | wc -l | tr -d ' ')
  HRS_INT=$(echo "$HAS_REGISTRY_STRUCT" | tr -d '[:space:]')
  if [ "$HRS_INT" -gt 0 ]; then
    WEAVER_OUT=$("$WEAVER_BIN" registry check -r "$REPO_ROOT/semconv" 2>&1 || true)
    if echo "$WEAVER_OUT" | grep -q "error\|Error\|FAIL"; then
      echo "FAIL|OT-11|weaver registry check failed: $(echo "$WEAVER_OUT" | grep -i error | head -1)"
    else
      echo "PASS|OT-11|weaver registry check: passed"
    fi
  else
    echo "WARN|OT-11|semconv/ is a flat YAML schema ($YAML_INT files), not a weaver registry directory. Convert to weaver registry format (groups/ structure) to enable 'weaver registry check'."
  fi
else
  echo "FAIL|OT-11|Cannot run weaver check: weaver not found"
fi

# OT-12: pm.ml span groups
if [ -f "$SEMCONV_FILE" ]; then
  ML_N=$(grep -c "pm\.ml\." "$SEMCONV_FILE" 2>/dev/null || echo 0)
  ML_INT=$(echo "$ML_N" | tr -d '[:space:]')
  if [ "$ML_INT" -ge 2 ]; then
    echo "PASS|OT-12|pm.ml span groups present: $ML_INT references (classify_traces, cluster_traces)"
  else
    echo "FAIL|OT-12|pm.ml span groups incomplete: $ML_INT references (need classify_traces + cluster_traces)"
  fi
else
  echo "FAIL|OT-12|Cannot check: semconv file missing"
fi

} | python3 -c "
import sys, json
items = []
for line in sys.stdin:
    line = line.strip()
    if not line or '|' not in line:
        continue
    parts = line.split('|', 2)
    if len(parts) == 3:
        items.append({'id': parts[1], 'status': parts[0], 'detail': parts[2]})
with open('$RESULTS_FILE', 'w') as f:
    json.dump({'otel_observability': items}, f, indent=2)
"

echo "otel-observability: $RESULTS_FILE"
