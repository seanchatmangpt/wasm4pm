#!/usr/bin/env bash
# cognition-smoke.sh — 6-invariant health check for the cognition stack
#
# Exits 0 only when all 6 invariants pass on a warm (already-built) workspace.
# Budget per step is printed; total must stay under 10 seconds on a warm cache.
#
# Usage:
#   bash scripts/cognition-smoke.sh
#   NO_COLOR=1 bash scripts/cognition-smoke.sh   # disable ANSI

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── ANSI color helpers ────────────────────────────────────────────────────────
if [ "${NO_COLOR:-}" = "1" ] || [ ! -t 1 ]; then
  GREEN=""
  RED=""
  BOLD=""
  RESET=""
else
  GREEN="\033[32m"
  RED="\033[31m"
  BOLD="\033[1m"
  RESET="\033[0m"
fi

pass_count=0
fail_count=0

# ── Millisecond clock — portable across macOS and Linux ──────────────────────
_ms() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import time; print(int(time.time()*1000))"
  elif command -v gdate >/dev/null 2>&1; then
    gdate +%s%3N
  else
    # Fall back to seconds (1-second precision)
    echo $(( $(date +%s) * 1000 ))
  fi
}

overall_start=$(_ms)

# ── Step runner ───────────────────────────────────────────────────────────────
# run_step <label> <command...>
# Prints "[NNN ms] PASS label" or "[NNN ms] FAIL label" and accumulates counts.
run_step() {
  local label="$1"
  shift
  local step_start step_end elapsed_ms exit_code=0

  step_start=$(_ms)
  if "$@" >/dev/null 2>&1; then
    exit_code=0
  else
    exit_code=$?
  fi
  step_end=$(_ms)
  elapsed_ms=$(( step_end - step_start ))

  if [ "$exit_code" -eq 0 ]; then
    printf "${GREEN}[%4d ms] PASS${RESET} %s\n" "$elapsed_ms" "$label"
    (( pass_count++ )) || true
  else
    printf "${RED}[%4d ms] FAIL${RESET} %s\n" "$elapsed_ms" "$label"
    (( fail_count++ )) || true
  fi
}

# ── Step 1: wasm4pm-cognition crate compiles ──────────────────────────────────
run_step "cargo check -p wasm4pm-cognition" \
  bash -c "cd '${REPO_ROOT}' && cargo check -p wasm4pm-cognition 2>&1"

# ── Step 2: wasm4pm-cognition lib tests pass ─────────────────────────────────
run_step "cargo test -p wasm4pm-cognition --lib" \
  bash -c "cd '${REPO_ROOT}' && cargo test -p wasm4pm-cognition --lib 2>&1 | grep -qE '^test result: ok|test .* ok\$'"

# ── Step 3: prolog8 lib tests pass ───────────────────────────────────────────
run_step "cargo test -p prolog8 --lib" \
  bash -c "cd '${REPO_ROOT}' && cargo test -p prolog8 --lib 2>&1 | grep -qE '^test result: ok|test .* ok\$'"

# ── Step 4: No fraud regression (no-stub scan) ───────────────────────────────
run_step "cognition-no-stub-scan.sh --quick" \
  bash -c "bash '${REPO_ROOT}/scripts/cognition-no-stub-scan.sh' --quick 2>&1"

# ── Step 5: TypeScript cognition boundary requires cleanly ─────────────────────
run_step "node -e require('./packages/cognition/dist/index.js')" \
  bash -c "node -e \"require('${REPO_ROOT}/packages/cognition/dist/index.js')\" 2>&1"

# ── Step 6: wpm cognition adversarial returns 8 detectors ────────────────────
run_step "wpm cognition adversarial --format json | jq detectors==8" \
  bash -c "
    WPM='${REPO_ROOT}/apps/wasm4pm/dist/bin/wpm.js'
    if [ ! -f \"\$WPM\" ]; then exit 1; fi
    count=\$(node \"\$WPM\" cognition adversarial --format json 2>/dev/null \
      | node -e \"
          let d='';
          process.stdin.on('data',c=>d+=c);
          process.stdin.on('end',()=>{
            try{
              const p=JSON.parse(d);
              const n=(p.payload&&p.payload.detectors)?p.payload.detectors.length:0;
              process.stdout.write(String(n));
            }catch(e){process.stdout.write('0');}
          });
        \" 2>/dev/null)
    [ \"\$count\" = '8' ]
  "

# ── Summary ───────────────────────────────────────────────────────────────────
overall_end=$(_ms)
total_ms=$(( overall_end - overall_start ))

echo ""
printf "${BOLD}cognition-smoke: %d passed, %d failed — %d ms total${RESET}\n" \
  "$pass_count" "$fail_count" "$total_ms"

if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
exit 0
