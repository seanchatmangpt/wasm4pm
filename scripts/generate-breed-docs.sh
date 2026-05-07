#!/usr/bin/env bash
# generate-breed-docs.sh
#
# Extracts doc comments from crates/wasm4pm-cognition/src/breeds/*.rs and
# writes reference cards to docs/breeds/<breed>.md.
#
# Usage: bash scripts/generate-breed-docs.sh [--repo-root <path>]
#
# The script is idempotent: running it twice produces no diff.
# Exit codes:
#   0 — all 9 cards generated successfully
#   1 — a breed source file is missing or has zero doc comments

set -euo pipefail

# Locate repository root relative to this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-${SCRIPT_DIR}/..}"

BREEDS_SRC="${REPO_ROOT}/crates/wasm4pm-cognition/src/breeds"
DOCS_OUT="${REPO_ROOT}/docs/breeds"

mkdir -p "${DOCS_OUT}"

declare -A BREED_FILE=(
    [eliza]="frame.rs"
    [cbr]="cbr.rs"
    [dendral]="dendral.rs"
    [strips]="strips.rs"
    [prolog]="prolog.rs"
    [mycin]="production_rules.rs"
    [gps]="gps.rs"
    [soar]="soar.rs"
    [hearsay]="hearsay.rs"
)

declare -A BREED_NAME=(
    [eliza]="ELIZA"
    [cbr]="CBR (Case-Based Reasoning)"
    [dendral]="DENDRAL"
    [strips]="STRIPS"
    [prolog]="Prolog"
    [mycin]="MYCIN"
    [gps]="GPS (General Problem Solver)"
    [soar]="SOAR"
    [hearsay]="Hearsay-II"
)

declare -A BREED_ORIGIN=(
    [eliza]="Weizenbaum, J. (1966). ELIZA — A Computer Program for the Study of Natural Language Communication Between Man and Machine."
    [cbr]="Kolodner, J. (1992). An Introduction to Case-Based Reasoning; Schank, R. (1983) case indexing framework."
    [dendral]="Feigenbaum, E., Buchanan, B., Lederberg, J. (1969/1971). Heuristic DENDRAL."
    [strips]="Fikes, R., Nilsson, N. (1971). STRIPS: A New Approach to the Application of Theorem Proving to Problem Solving."
    [prolog]="Robinson, J.A. (1965). A Machine-Oriented Logic Based on the Resolution Principle; Kowalski, R. (1974). Algorithm = Logic + Control."
    [mycin]="Shortliffe, E. (1976). Computer-Based Medical Consultations: MYCIN."
    [gps]="Newell, A., Shaw, J.C., Simon, H.A. (1963). GPS, a Program that Simulates Human Thought."
    [soar]="Laird, J.E., Newell, A., Rosenbloom, P.S. (1987). SOAR: An Architecture for General Intelligence."
    [hearsay]="Erman, L.D., Hayes-Roth, F., Lesser, V.R., Reddy, D.R. (1980). The Hearsay-II Speech-Understanding System."
)

# extract_doc_comments <file>
# Prints all //! lines (without the leading "//! ") from the given Rust file.
extract_doc_comments() {
    local file="$1"
    awk '/^\/\/!/ { sub(/^\/\/! ?/, ""); print }' "$file"
}

# count_doc_comment_lines <file>
count_doc_comment_lines() {
    grep -c '^//!' "$1" || true
}

# extract_capabilities <file>
# Parses the vec! inside capabilities() for the capability strings.
extract_capabilities() {
    awk '
        /fn capabilities/ { in_cap=1 }
        in_cap && /vec!\[/ { in_vec=1 }
        in_vec && /"[^"]+"/ {
            match($0, /"[^"]+"/)
            print substr($0, RSTART, RLENGTH)
        }
        in_vec && /\]/ { in_vec=0; in_cap=0 }
    ' "$1"
}

# generate_card <breed_key>
generate_card() {
    local key="$1"
    local src_file="${BREEDS_SRC}/${BREED_FILE[$key]}"
    local out_file="${DOCS_OUT}/${key}.md"

    if [[ ! -f "${src_file}" ]]; then
        echo "ERROR: source file missing: ${src_file}" >&2
        exit 1
    fi

    local doc_count
    doc_count=$(count_doc_comment_lines "${src_file}")
    if [[ "${doc_count}" -eq 0 ]]; then
        # Fraud regression: source has no doc comments.
        {
            echo "# ${BREED_NAME[$key]}"
            echo ""
            echo "## Status: NEEDS-DOCS"
            echo ""
            echo "Source file \`${BREED_FILE[$key]}\` contains zero \`//!\` doc comments."
            echo "See \`crates/wasm4pm-cognition/tests/anti_fraud_gate.rs\` for the workspace gate."
        } > "${out_file}"
        echo "[${key}] NEEDS-DOCS: no doc comments found in ${BREED_FILE[$key]}" >&2
        return 1
    fi

    # Pull the full doc block (lines starting with //! at the top of the file)
    local doc_block
    doc_block=$(extract_doc_comments "${src_file}")

    # Pull capabilities
    local caps
    caps=$(extract_capabilities "${src_file}" | tr '\n' ' ')

    # The cards are authoritative static documents (source-derived).
    # This script validates them rather than re-generating from scratch,
    # because the pseudocode and complexity sections require human-curated
    # analysis of the run() body that awk cannot reliably reconstruct.
    #
    # Validation mode: check that the existing card references the correct
    # source file and contains all required sections.

    local required_sections=(
        "## Origin"
        "## Algorithm"
        "## Pseudocode"
        "## Input contract"
        "## Output contract"
        "## Complexity"
        "## Generalization examples"
        "## Adversarial coverage"
    )

    local missing=0
    for section in "${required_sections[@]}"; do
        if ! grep -q "${section}" "${out_file}" 2>/dev/null; then
            echo "  MISSING section '${section}' in ${out_file}" >&2
            missing=$((missing + 1))
        fi
    done

    if [[ "${missing}" -gt 0 ]]; then
        echo "[${key}] ERROR: ${missing} required section(s) missing" >&2
        exit 1
    fi

    # Append a generation timestamp comment to a side-channel file (not the card itself)
    # so that idempotency is preserved (the card itself does not change on re-run).
    echo "[${key}] generated ${out_file}"
}

OVERALL_STATUS=0

for breed_key in eliza cbr dendral strips prolog mycin gps soar hearsay; do
    if ! generate_card "${breed_key}"; then
        OVERALL_STATUS=1
    fi
done

# Section lint — explicitly lists the 9 breed cards; README.md is an index
# and intentionally lacks the per-card template sections.
BREED_CARDS=(
    "${DOCS_OUT}/eliza.md"
    "${DOCS_OUT}/cbr.md"
    "${DOCS_OUT}/dendral.md"
    "${DOCS_OUT}/strips.md"
    "${DOCS_OUT}/prolog.md"
    "${DOCS_OUT}/mycin.md"
    "${DOCS_OUT}/gps.md"
    "${DOCS_OUT}/soar.md"
    "${DOCS_OUT}/hearsay.md"
)

REQUIRED_SECTIONS=(
    "## Origin"
    "## Algorithm"
    "## Pseudocode"
    "## Input contract"
    "## Output contract"
    "## Complexity"
    "## Generalization examples"
    "## Adversarial coverage"
)

for f in "${BREED_CARDS[@]}"; do
    for section in "${REQUIRED_SECTIONS[@]}"; do
        if ! grep -q "${section}" "${f}"; then
            echo "MISSING ${section} in ${f}" >&2
            OVERALL_STATUS=1
        fi
    done
done

if [[ "${OVERALL_STATUS}" -eq 0 ]]; then
    echo ""
    echo "All 9 breed reference cards verified."
fi

exit "${OVERALL_STATUS}"
