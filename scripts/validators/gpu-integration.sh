#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Module: gpu-integration.sh — 8 items
# ---------------------------------------------------------------------------

RESULTS_FILE="${1:-/tmp/gpu-integration.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$SCRIPT_DIR" in
  */scripts/validators) REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)" ;;
  */scripts)            REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)" ;;
  *)                    REPO_ROOT="$SCRIPT_DIR" ;;
esac
WASM_DIR="$REPO_ROOT/wasm4pm"
cd "$REPO_ROOT"

{

# GI-1: GPU conformance spec present
if [ -f "$REPO_ROOT/GPU_KERNEL_CONFORMANCE_SPEC.yaml" ]; then
  SECTIONS=$(grep -c "^# SECTION\|^##" "$REPO_ROOT/GPU_KERNEL_CONFORMANCE_SPEC.yaml" 2>/dev/null || echo 0)
  echo "PASS|GI-1|GPU_KERNEL_CONFORMANCE_SPEC.yaml present ($SECTIONS section headers)"
else
  echo "FAIL|GI-1|GPU_KERNEL_CONFORMANCE_SPEC.yaml missing"
fi

# GI-2: GPU integration guide present
if [ -f "$REPO_ROOT/GPU_KERNEL_INTEGRATION_GUIDE.md" ]; then
  echo "PASS|GI-2|GPU_KERNEL_INTEGRATION_GUIDE.md present"
else
  echo "FAIL|GI-2|GPU_KERNEL_INTEGRATION_GUIDE.md missing"
fi

# GI-3: GPU kernel source (CUDA .cu / WGSL .wgsl)
CUDA_N=$(find "$WASM_DIR" -name "*.cu" 2>/dev/null | wc -l | tr -d ' ')
WGSL_N=$(find "$WASM_DIR" -name "*.wgsl" 2>/dev/null | wc -l | tr -d ' ')
CUDA_INT=$(echo "$CUDA_N" | tr -d '[:space:]')
WGSL_INT=$(echo "$WGSL_N" | tr -d '[:space:]')
if [ "$CUDA_INT" -gt 0 ] || [ "$WGSL_INT" -gt 0 ]; then
  echo "PASS|GI-3|GPU shader source: $CUDA_INT .cu + $WGSL_INT .wgsl"
else
  echo "FAIL|GI-3|GPU kernel not found: 0 .cu, 0 .wgsl. Expected wasm4pm/src/gpu/linucb_kernel.cu per merge gate checklist."
fi

# GI-4: 2048-state batch constant
BATCH_N=$(grep -rn "2048" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
BATCH_INT=$(echo "$BATCH_N" | tr -d '[:space:]')
if [ "$BATCH_INT" -gt 0 ]; then
  echo "PASS|GI-4|Batch size 2048 referenced: $BATCH_INT location(s) in src/"
else
  echo "FAIL|GI-4|No 2048-state batch constant in src/ — kernel memory layout not implemented"
fi

# GI-5: Workgroup/thread configuration (256 or workgroup keyword)
THREAD_N=$(grep -rn "256\|workgroup\|thread_block\|block_size" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
THREAD_INT=$(echo "$THREAD_N" | tr -d '[:space:]')
if [ "$THREAD_INT" -gt 0 ]; then
  echo "PASS|GI-5|Thread/workgroup config referenced: $THREAD_INT occurrences"
else
  echo "FAIL|GI-5|No workgroup/thread configuration in src/ — GPU kernel dispatch not implemented"
fi

# GI-6: CPU fallback path
FALLBACK_N=$(grep -rn "fallback\|cpu_fallback\|GpuError\|gpu_enabled\|gpu_available" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
FALLBACK_INT=$(echo "$FALLBACK_N" | tr -d '[:space:]')
if [ "$FALLBACK_INT" -gt 0 ]; then
  echo "PASS|GI-6|CPU fallback references: $FALLBACK_INT occurrence(s) in src/"
else
  echo "FAIL|GI-6|No CPU fallback path in src/ — required by merge gate (systems without GPU must fall back)"
fi

# GI-7: RL execution profile in config
RL_CONFIG=0
for f in $(find "$REPO_ROOT/packages/config" -name "*.ts" 2>/dev/null); do
  C=$(grep -c "\"rl\"\|'rl'\|linucb\|LinUCB\|ucb1\|UCB1" "$f" 2>/dev/null || echo 0)
  C_INT=$(echo "$C" | tr -d '[:space:]')
  RL_CONFIG=$((RL_CONFIG + C_INT))
done
RUST_RL=$(grep -rn "linucb_lambda\|ucb1_exploration\|gpu_enabled\|rl_profile\|ExecutionProfile.*Rl" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
RUST_INT=$(echo "$RUST_RL" | tr -d '[:space:]')
RL_TOTAL=$((RL_CONFIG + RUST_INT))
if [ "$RL_TOTAL" -gt 0 ]; then
  echo "PASS|GI-7|RL execution profile: $RL_TOTAL reference(s) in config/src"
else
  echo "FAIL|GI-7|No RL execution profile found — pictl.toml needs linucb_lambda, ucb1_exploration, gpu_enabled"
fi

# GI-8: GPU conformance test vectors (25 required per checklist)
GPU_TV=$(grep -rn "test_input_admissible\|test_output_argmax\|test_output_deterministic\|test_output_matches_cpu\|test_empty_admissible\|test_all_actions_admissible\|test_linucb_fresh\|test_linucb_established\|gpu_kernel_conformance" "$WASM_DIR/tests/" 2>/dev/null | wc -l | tr -d ' ')
GPU_INT=$(echo "$GPU_TV" | tr -d '[:space:]')
if [ "$GPU_INT" -ge 25 ]; then
  echo "PASS|GI-8|GPU conformance test vectors: $GPU_INT (>= 25 required)"
elif [ "$GPU_INT" -gt 0 ]; then
  echo "FAIL|GI-8|GPU conformance tests partial: $GPU_INT found, 25 required per merge gate checklist"
else
  echo "FAIL|GI-8|GPU conformance tests missing: 0 of 25 required test vectors implemented"
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
    json.dump({'gpu_integration': items}, f, indent=2)
"

echo "gpu-integration: $RESULTS_FILE"
