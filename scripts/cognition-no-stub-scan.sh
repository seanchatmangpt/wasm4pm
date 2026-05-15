#!/usr/bin/env bash
# cognition-no-stub-scan.sh
# Layer 1 (lexicon) + Layer 2 (structural) scan for the cognition no-stub gate.
#
# Exit 0  — clean, no violations found
# Exit 1  — one or more violations found; details printed to stderr
#
# EXCLUDED from scan:
#   - __tests__/ and tests/ directories (test code may legitimately reference
#     mocking frameworks, vi.mock(), etc.)
#   - *.md files (documentation mentions forbidden words for educational purposes)
#   - node_modules/, target/, pkg/, dist/ build artifacts
#   - This script itself and docs/cognition-no-stub-law.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Target directories ────────────────────────────────────────────────────────
# Only scan cognition-related source paths. Excluded: implementation agents' own
# source is still scanned — the gate does NOT carve out exemptions for any team.
SCAN_DIRS=(
  "crates/wasm4pm-cognition/src"
  "apps/wasm4pm/src/commands/cognition"
  "packages/cognition/src"
)

# ── Build the list of actually-present directories ───────────────────────────
EXISTING_DIRS=()
for d in "${SCAN_DIRS[@]}"; do
  if [[ -d "${REPO_ROOT}/${d}" ]]; then
    EXISTING_DIRS+=("${REPO_ROOT}/${d}")
  fi
done

if [[ ${#EXISTING_DIRS[@]} -eq 0 ]]; then
  echo "[cognition-no-stub] No cognition source directories found — skipping scan (nothing to check)." >&2
  echo "[cognition-no-stub] PASS: gate would apply once source directories are created." >&2
  exit 0
fi

VIOLATIONS=0
VIOLATION_REPORT=()

# ── Helper: report a violation ───────────────────────────────────────────────
report() {
  local context="$1"
  local file="$2"
  local lineno="$3"
  local line="$4"
  VIOLATIONS=$((VIOLATIONS + 1))
  VIOLATION_REPORT+=("VIOLATION [${context}] ${file}:${lineno}: ${line}")
}

# ── Layer 1: Lexicon scan ─────────────────────────────────────────────────────
# Each pattern is checked with word-boundary awareness where applicable.
# Safe-context exclusions are applied per pattern (see inline comments).

echo "[cognition-no-stub] Layer 1: lexicon scan..."

scan_pattern() {
  local label="$1"
  local pattern="$2"
  # Optional third arg: grep pattern for SAFE lines to exclude
  local safe_pattern="${3:-}"

  while IFS= read -r -d '' filepath; do
    # Skip test directories
    if [[ "${filepath}" == */__tests__/* ]] || [[ "${filepath}" == */tests/* ]]; then
      continue
    fi
    # Skip doc files
    if [[ "${filepath}" == *.md ]]; then
      continue
    fi

    local lineno=0
    while IFS= read -r line; do
      lineno=$((lineno + 1))
      if echo "${line}" | grep -qiE "${pattern}"; then
        # Apply safe-context exclusion if provided
        if [[ -n "${safe_pattern}" ]]; then
          if echo "${line}" | grep -qE "${safe_pattern}"; then
            continue
          fi
        fi
        report "${label}" "${filepath}" "${lineno}" "${line}"
      fi
    done < "${filepath}"
  done < <(find "${EXISTING_DIRS[@]}" -type f \( -name "*.rs" -o -name "*.ts" -o -name "*.tsx" \) -print0 2>/dev/null)
}

# \bstub\b — reject any use of "stub" as a word
scan_pattern "lexicon:stub" '\bstub\b'

# \bplaceholder\b — reject literal placeholder identifiers/strings
# Safe: HTML attribute placeholder="..." and consola details strings are not production stubs
scan_pattern "lexicon:placeholder" '\bplaceholder\b' 'placeholder="|details:.*placeholder'

# \bmock\b — reject mock outside test files (test files already skipped above)
# Safe: vi.mock() and mockito imports inside __tests__/tests/ already excluded by dir filter
# Additional safe: import declarations for mock libraries themselves
scan_pattern "lexicon:mock" '\bmock\b' 'from.*mock|import.*mock|vi\.mock\('

# todo!() and unimplemented!() Rust macros
scan_pattern "lexicon:todo_macro" 'todo!\(\)'
scan_pattern "lexicon:unimplemented" 'unimplemented!'

# \bfake\b — reject fake implementations
# Safe: "fake-" in package.json dependency names
scan_pattern "lexicon:fake" '\bfake\b' '"fake-'

# \bcache\b — reserved; mutable access patterns leak across inference traces
# Safe: .cache/ path references in strings/comments, test names, cache.test.ts
scan_pattern "lexicon:cache" '\bcache\b' '\.cache/|cache\.test\.|"cache |# cache'

# \bheap\b — uncontrolled allocation signal in cognition breed bodies
scan_pattern "lexicon:heap" '\bheap\b'

# \bbuffer\b — except .as_bytes() context
scan_pattern "lexicon:buffer" '\bbuffer\b' '\.as_bytes\('

# \bbyte\b — except .as_bytes() context
scan_pattern "lexicon:byte" '\bbyte\b' '\.as_bytes\('

# \bstore\b — reserved for atomic ops; except .store( method calls
scan_pattern "lexicon:store" '\bstore\b' '\.store\('

# \bload\b — except .load( method calls
scan_pattern "lexicon:load" '\bload\b' '\.load\('

# ── Layer 2: Structural scan ──────────────────────────────────────────────────
echo "[cognition-no-stub] Layer 2: structural scan..."

while IFS= read -r -d '' filepath; do
  if [[ "${filepath}" == */__tests__/* ]] || [[ "${filepath}" == */tests/* ]]; then
    continue
  fi

  # 2a. `pub struct Stub` — outright reject
  if grep -qn 'pub struct Stub' "${filepath}"; then
    while IFS= read -r match; do
      local_lineno=$(echo "${match}" | cut -d: -f1)
      local_line=$(echo "${match}" | cut -d: -f2-)
      report "structural:pub_struct_Stub" "${filepath}" "${local_lineno}" "${local_line}"
    done < <(grep -n 'pub struct Stub' "${filepath}")
  fi

  # 2b. Functions whose body is only `Ok(input.clone())` — identity pass-through
  if grep -qn 'Ok(input\.clone())' "${filepath}"; then
    while IFS= read -r match; do
      local_lineno=$(echo "${match}" | cut -d: -f1)
      local_line=$(echo "${match}" | cut -d: -f2-)
      report "structural:identity_passthrough" "${filepath}" "${local_lineno}" "${local_line}"
    done < <(grep -n 'Ok(input\.clone())' "${filepath}")
  fi

  # 2c. console.log(.*stub) or console.log(.*placeholder) in TS cognition commands
  if [[ "${filepath}" == *.ts ]] || [[ "${filepath}" == *.tsx ]]; then
    if grep -qiEn 'console\.log\(.*stub|console\.log\(.*placeholder' "${filepath}"; then
      while IFS= read -r match; do
        local_lineno=$(echo "${match}" | cut -d: -f1)
        local_line=$(echo "${match}" | cut -d: -f2-)
        report "structural:console_log_stub" "${filepath}" "${local_lineno}" "${local_line}"
      done < <(grep -iEn 'console\.log\(.*stub|console\.log\(.*placeholder' "${filepath}")
    fi
  fi

  # 2d. Rust breed files in breeds/ whose run() has < 5 non-comment lines of body
  if [[ "${filepath}" == */breeds/*.rs ]]; then
    # Extract lines between first `fn run(` and its closing `}`, count non-comment, non-blank lines
    local_body_lines=$(awk '/fn run\(/{found=1; depth=0} found{for(i=1;i<=length($0);i++){c=substr($0,i,1); if(c=="{") depth++; if(c=="}") {depth--; if(depth==0){exit}}} if(found && depth>0 && $0 !~ /^[[:space:]]*(\/\/|$)/){count++}} END{print count+0}' "${filepath}")
    if [[ -n "${local_body_lines}" ]] && [[ "${local_body_lines}" -lt 5 ]] && [[ "${local_body_lines}" -gt 0 ]]; then
      report "structural:thin_breed_run" "${filepath}" "0" "run() body has only ${local_body_lines} non-comment lines (minimum 5 required)"
    fi
  fi

done < <(find "${EXISTING_DIRS[@]}" -type f \( -name "*.rs" -o -name "*.ts" -o -name "*.tsx" \) -print0 2>/dev/null)

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
if [[ ${VIOLATIONS} -gt 0 ]]; then
  echo "========================================" >&2
  echo "COGNITION NO-STUB GATE: FAILED (${VIOLATIONS} violation(s))" >&2
  echo "========================================" >&2
  for v in "${VIOLATION_REPORT[@]}"; do
    echo "  ${v}" >&2
  done
  echo "" >&2
  echo "To understand what each violation means, see:" >&2
  echo "  docs/cognition-no-stub-law.md" >&2
  echo "" >&2
  echo "To run locally: make cognition-no-stub-gate" >&2
  exit 1
else
  echo "[cognition-no-stub] PASS: 0 violations found across ${#EXISTING_DIRS[@]} directory/directories."
  exit 0
fi
