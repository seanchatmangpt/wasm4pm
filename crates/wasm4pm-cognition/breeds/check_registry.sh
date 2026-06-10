#!/usr/bin/env bash
# check_registry.sh — Validate that every breed name referenced in the thesis
# chapters appears in crates/wasm4pm-cognition/breeds/registry.json.
#
# Run from repo root:
#   bash crates/wasm4pm-cognition/breeds/check_registry.sh
#
# Exit codes:
#   0 — all thesis breed names found in registry
#   1 — one or more thesis breed names missing from registry

set -euo pipefail

REGISTRY="crates/wasm4pm-cognition/breeds/registry.json"
THESIS_DIR="docs/thesis/periodic-table-of-reason/chapters"

# ── Prereq checks ────────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$REGISTRY" ]]; then
  echo "ERROR: registry not found at $REGISTRY" >&2
  exit 1
fi

if [[ ! -d "$THESIS_DIR" ]]; then
  echo "ERROR: thesis chapters directory not found at $THESIS_DIR" >&2
  exit 1
fi

# ── Load registry breed names ─────────────────────────────────────────────────
# Support both:
#   [ { "breed_name": "..." }, ... ]          (array of objects)
#   { "breeds": [ { "breed_name": "..." } ] } (wrapped object)
mapfile -t REGISTRY_BREEDS < <(
  jq -r '
    if type == "array" then
      .[].breed_name
    elif .breeds then
      .breeds[].breed_name
    else
      to_entries[].value |
        if type == "object" then .breed_name // empty
        else empty
        end
    end
  ' "$REGISTRY" | sort -u
)

REGISTRY_COUNT="${#REGISTRY_BREEDS[@]}"
echo "Registry contains ${REGISTRY_COUNT} breeds"

# ── Candidate breed names to check in thesis ─────────────────────────────────
# Combine: names from registry + well-known historical breeds that may appear
# in the manuscript under a canonical short name.
HISTORICAL_BREEDS=(
  MYCIN STRIPS SOAR "HEARSAY-II" Prolog CBR GPS DENDRAL ELIZA
  PROSPECTOR ACE Internist XCON R1 CYC
  "rule-based" "case-based" "model-based" "constraint-based"
  "forward-chaining" "backward-chaining"
)

# Build a deduplicated list of all candidates (registry + historical)
declare -A ALL_BREEDS
for b in "${REGISTRY_BREEDS[@]}"; do
  ALL_BREEDS["$b"]=1
done
for b in "${HISTORICAL_BREEDS[@]}"; do
  ALL_BREEDS["$b"]=1
done

# ── Scan thesis for breed name occurrences ───────────────────────────────────
THESIS_FILES=("$THESIS_DIR"/*.tex)
if [[ ${#THESIS_FILES[@]} -eq 0 ]]; then
  echo "ERROR: no .tex files found in $THESIS_DIR" >&2
  exit 1
fi

declare -A THESIS_FOUND   # breed_name → 1 if found in thesis
for breed in "${!ALL_BREEDS[@]}"; do
  # Case-sensitive grep across all chapter files
  if grep -qF -- "$breed" "${THESIS_FILES[@]}" 2>/dev/null; then
    THESIS_FOUND["$breed"]=1
  fi
done

THESIS_COUNT="${#THESIS_FOUND[@]}"
echo "Thesis references ${THESIS_COUNT} breed names"

# ── Cross-check: every thesis-found name must be in registry ─────────────────
MISSING=()
for breed in "${!THESIS_FOUND[@]}"; do
  if [[ -z "${REGISTRY_BREEDS[*]+x}" ]]; then
    MISSING+=("$breed")
    continue
  fi
  found=0
  for rb in "${REGISTRY_BREEDS[@]}"; do
    if [[ "$rb" == "$breed" ]]; then
      found=1
      break
    fi
  done
  if [[ $found -eq 0 ]]; then
    MISSING+=("$breed")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  for m in "${MISSING[@]}"; do
    echo "ERROR: breed \"$m\" found in thesis but NOT in registry.json"
  done
  exit 1
fi

echo "All thesis breed names found in registry."
exit 0
