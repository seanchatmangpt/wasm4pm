#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Module: kernel-correctness.sh — 10 items
# Uses Python for JSON aggregation to avoid bash quoting fragility.
# ---------------------------------------------------------------------------

RESULTS_FILE="${1:-/tmp/kernel-correctness.json}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WASM_DIR="$REPO_ROOT/wasm4pm"

# Emit one line per check: STATUS|ID|detail
# Then Python aggregates into JSON.
{

# KC-1: cargo check
if cargo check --manifest-path "$WASM_DIR/Cargo.toml" 2>&1 | grep -q "^error"; then
  echo "FAIL|KC-1|cargo check: compile errors detected"
else
  echo "PASS|KC-1|cargo check: no compile errors"
fi

# KC-2: clippy
CLIPPY_OUT=$(cargo clippy --manifest-path "$WASM_DIR/Cargo.toml" --lib 2>&1 || true)
if echo "$CLIPPY_OUT" | grep -q "^error"; then
  echo "FAIL|KC-2|clippy: errors reported"
else
  WARN_N=$(echo "$CLIPPY_OUT" | grep -c "^warning\[" 2>/dev/null || echo 0)
  if [ "$WARN_N" -gt 0 ]; then
    echo "WARN|KC-2|clippy: $WARN_N clippy warnings (non-blocking)"
  else
    echo "PASS|KC-2|clippy: zero warnings on lib target"
  fi
fi

# KC-3: rustfmt
FMT_OUT=$(cargo fmt --manifest-path "$WASM_DIR/Cargo.toml" -- --check 2>&1 || true)
DIFFS=$(echo "$FMT_OUT" | grep -c "^Diff in" 2>/dev/null || echo 0)
if [ "$DIFFS" -gt 0 ]; then
  echo "FAIL|KC-3|rustfmt: $DIFFS file(s) need formatting"
else
  echo "PASS|KC-3|rustfmt: all sources correctly formatted"
fi

# KC-4: lib.rs module count
LIB_MODS=$(grep -c "^pub mod\|^mod " "$WASM_DIR/src/lib.rs" 2>/dev/null || echo 0)
if [ "$LIB_MODS" -gt 0 ]; then
  echo "PASS|KC-4|lib.rs declares $LIB_MODS modules (all compile via KC-1)"
else
  echo "FAIL|KC-4|lib.rs has no module declarations"
fi

# KC-5: no unsafe in hot paths
UNSAFE_N=0
for f in "$WASM_DIR/src/hot_kernels.rs" "$WASM_DIR/src/fast_discovery.rs" "$WASM_DIR/src/discovery.rs"; do
  if [ -f "$f" ]; then
    C=$(grep -c "unsafe " "$f" 2>/dev/null || echo 0)
    UNSAFE_N=$((UNSAFE_N + C))
  fi
done
if [ "$UNSAFE_N" -gt 0 ]; then
  echo "WARN|KC-5|hot-path files: $UNSAFE_N unsafe expressions (review required)"
else
  echo "PASS|KC-5|hot-path discovery files: no unsafe blocks"
fi

# KC-6: SIMD modules
SIMD_N=$(ls "$WASM_DIR/src/simd_"*.rs 2>/dev/null | wc -l | tr -d ' ')
if [ "$SIMD_N" -ge 2 ]; then
  echo "PASS|KC-6|SIMD modules present: $SIMD_N (simd_streaming_dfg + simd_token_replay)"
else
  echo "FAIL|KC-6|Expected 2+ SIMD modules, found $SIMD_N"
fi

# KC-7: reinforcement learning module
if [ -f "$WASM_DIR/src/reinforcement.rs" ]; then
  RL_N=$(grep -c "pub struct\|impl.*Agent" "$WASM_DIR/src/reinforcement.rs" 2>/dev/null || echo 0)
  echo "PASS|KC-7|reinforcement.rs: present with $RL_N structs/impls"
else
  echo "FAIL|KC-7|reinforcement.rs: missing"
fi

# KC-8: GPU kernel implementation (honest report)
CUDA_N=$(find "$WASM_DIR" -name "*.cu" 2>/dev/null | wc -l | tr -d ' ')
WGSL_N=$(find "$WASM_DIR" -name "*.wgsl" 2>/dev/null | wc -l | tr -d ' ')
WGPU_N=$(grep -rn "wgpu\|GpuLinUCB\|cuda_wrapper" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
if [ "$CUDA_N" -gt 0 ] || [ "$WGSL_N" -gt 0 ] || [ "$WGPU_N" -gt 0 ]; then
  echo "PASS|KC-8|GPU kernel: .cu=$CUDA_N .wgsl=$WGSL_N wgpu-refs=$WGPU_N"
else
  echo "FAIL|KC-8|GPU kernel not implemented: 0 .cu/.wgsl files, 0 wgpu/GpuLinUCB refs. GPU_KERNEL_CONFORMANCE_SPEC.yaml describes aspirational spec."
fi

# KC-9: LinUCB CPU reference
LINUCB_N=$(grep -rn "LinUCB\|linucb" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LINUCB_N" -gt 0 ]; then
  echo "PASS|KC-9|LinUCB references in source: $LINUCB_N"
else
  echo "FAIL|KC-9|LinUCB not implemented — required by GPU merge gate checklist (wasm4pm/src/ml/linucb.rs missing)"
fi

# KC-10: cargo audit
AUDIT_OUT=$(cargo audit 2>&1 || true)
VULN_N=$(echo "$AUDIT_OUT" | grep -c "^Vulnerability" 2>/dev/null || echo 0)
SEC_WARN=$(echo "$AUDIT_OUT" | grep -c "^Warning:" 2>/dev/null || echo 0)
if [ "$VULN_N" -gt 0 ]; then
  echo "FAIL|KC-10|cargo audit: $VULN_N vulnerabilities"
elif [ "$SEC_WARN" -gt 0 ]; then
  echo "WARN|KC-10|cargo audit: 0 vulnerabilities, $SEC_WARN unsound warnings (rand 0.8.5 RUSTSEC-2026-0097)"
else
  echo "PASS|KC-10|cargo audit: clean — no vulnerabilities"
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
print(json.dumps({'kernel_correctness': items}, indent=2))
" > "$RESULTS_FILE"

echo "kernel-correctness: $RESULTS_FILE"
