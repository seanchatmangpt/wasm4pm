#!/usr/bin/env bash
# Download real BPI Challenge datasets for wasm4pm benchmarks.
# All datasets are freely available (CC BY 4.0) from 4TU.ResearchData.
#
# Usage:
#   bash scripts/download_datasets.sh           # Tier 1 (required: 30 MB)
#   TIER=2 bash scripts/download_datasets.sh    # Tier 1 + 2 (adds BPI 2012/2017: ~100 MB)
#   TIER=3 bash scripts/download_datasets.sh    # All tiers (adds Road Traffic/BPI 2015/2019: ~500 MB)
#
# Dataset integrity (post-incident D1–D3, see docs/benchmarks/RESULTS-2026-10-10.md §5):
# every download is validated BEFORE it is moved into place:
#   1. HTTP success (curl -f / wget exit status) — an error body is never saved.
#   2. Minimum expected size (per dataset).
#   3. Content sniff: XES must start with `<log` or `<?xml`; OCEL must parse as JSON.
#   4. sha256 verify hook: set SHA256_EXPECTED_<NAME> to enable checksum pinning.
# If any check fails the script aborts and the candidate file is kept as
# `*.part.rejected` for inspection — it is NEVER moved into place.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST="${REPO_ROOT}/bench_data"
FIXTURES="${REPO_ROOT}/wasm4pm/tests/fixtures"
TIER="${TIER:-1}"

mkdir -p "${DEST}"

log()  { echo "[download_datasets] $*"; }
skip() { log "Already cached: $1"; }

# ── Validation helpers ───────────────────────────────────────────────────────

# Reject a candidate: keep it for inspection, abort loudly.
reject() {
    local tmpfile="$1" outfile="$2" reason="$3"
    local rejected="${outfile}.part.rejected"
    mv "${tmpfile}" "${rejected}"
    echo "ERROR: ${reason}" >&2
    echo "ERROR: candidate kept for inspection at ${rejected}" >&2
    echo "ERROR: ${outfile} was NOT updated." >&2
    exit 1
}

# Content sniff by kind: "xes" must look like XML event log, "ocel" like JSON.
sniff_content() {
    local kind="$1" tmpfile="$2"
    local head_bytes
    head_bytes="$(head -c 256 "${tmpfile}" | tr -d '[:space:]\0')"
    # Strip an optional leading XML declaration so "<?xml ... ?><log" normalizes to "<log...".
    if [[ "${head_bytes}" == "<?xml"* ]]; then
        head_bytes="${head_bytes#*?>}"
    fi
    case "${kind}" in
        xes)
            # Valid XES is XML: starts with <log ...> (optionally after an XML declaration).
            case "${head_bytes}" in
                "<log"*) return 0 ;;
                *) return 1 ;;
            esac
            ;;
        ocel)
            # OCEL (.jsonocel) is JSON — require it to parse and be an object.
            python3 - "$tmpfile" <<'PY' 2>/dev/null
import json, sys
with open(sys.argv[1]) as f:
    obj = json.load(f)
sys.exit(0 if isinstance(obj, dict) else 1)
PY
            ;;
        *)
            echo "ERROR: unknown content kind '${kind}'" >&2
            exit 1
            ;;
    esac
}

# Download + validate + decompress + verify. Never moves an invalid file into place.
#   $1 url          — direct download URL (MUST serve the raw dataset, not a landing page)
#   $2 outfile      — final destination path
#   $3 kind         — "xes" or "ocel"
#   $4 min_bytes    — minimum acceptable decompressed size
#   $5 compressed   — "true" if source is .gz (optional, default false)
download_if_missing() {
    local url="$1"
    local outfile="$2"
    local kind="$3"
    local min_bytes="$4"
    local compressed="${5:-false}"

    if [[ -f "${outfile}" ]]; then
        skip "$(basename "${outfile}")"
        return 0
    fi

    if [[ "${url}" == TODO_URL* ]]; then
        echo "ERROR: no verified download URL for $(basename "${outfile}")." >&2
        echo "       Fetch it manually from the dataset landing page (see bench_data/MISSING-DATASETS.md)" >&2
        echo "       or set the correct direct URL in scripts/download_datasets.sh." >&2
        return 1
    fi

    log "Downloading $(basename "${outfile}")..."
    local tmpfile="${outfile}.part"
    rm -f "${tmpfile}"

    # 1. HTTP success: -f makes curl fail on HTTP >= 400; wget -q errors non-zero too.
    if command -v curl &>/dev/null; then
        if ! curl -fL --progress-bar --retry 3 -o "${tmpfile}" "${url}"; then
            rm -f "${tmpfile}"
            echo "ERROR: HTTP download failed for $(basename "${outfile}") (${url})." >&2
            exit 1
        fi
    elif command -v wget &>/dev/null; then
        if ! wget -q --show-progress -O "${tmpfile}" "${url}"; then
            rm -f "${tmpfile}"
            echo "ERROR: HTTP download failed for $(basename "${outfile}") (${url})." >&2
            exit 1
        fi
    else
        echo "ERROR: curl or wget required for dataset download." >&2
        exit 1
    fi

    # 2. Minimum size.
    local size
    size="$(stat -f%z "${tmpfile}" 2>/dev/null || stat -c%s "${tmpfile}")"
    if (( size < min_bytes )); then
        reject "${tmpfile}" "${outfile}" \
            "$(basename "${outfile}"): ${size} bytes is below minimum ${min_bytes} — likely an error page."
    fi

    # 3. Content sniff.
    if ! sniff_content "${kind}" "${tmpfile}"; then
        reject "${tmpfile}" "${outfile}" \
            "$(basename "${outfile}"): content is not a valid ${kind^^} file — refusing to install."
    fi

    # 4. sha256 hook: SHA256_EXPECTED_<name> (uppercased basename, non-alnum → _).
    local name_key
    name_key="SHA256_EXPECTED_$(basename "${outfile}" | tr 'a-zA-Z0-9.' 'A-ZA-Z0-9_')"
    local expected="${!name_key:-}"
    if [[ -n "${expected}" ]]; then
        local actual
        actual="$(shasum -a 256 "${tmpfile}" | awk '{print $1}')"
        if [[ "${actual}" != "${expected}" ]]; then
            reject "${tmpfile}" "${outfile}" \
                "$(basename "${outfile}"): sha256 ${actual} != expected ${expected}."
        fi
        log "sha256 verified: ${actual}"
    fi

    if [[ "${compressed}" == "true" ]]; then
        log "Decompressing $(basename "${outfile}")..."
        gunzip -c "${tmpfile}" > "${outfile}"
        rm -f "${tmpfile}"
    else
        mv "${tmpfile}" "${outfile}"
    fi

    log "Saved: ${outfile} ($(( size / 1024 / 1024 )) MB)"
}

# ── Tier 1: Essential datasets (~30 MB total) ────────────────────────────────
log "=== Tier 1: Essential Datasets ==="

# BPI 2020 Domestic Declarations (already in fixtures — just copy it).
# NOTE: this is the BPI 2020 *Domestic Declarations* log, NOT Travel Permits.
# The fixture BPI_2020_Travel_Permits_Actual.xes was previously mislabeled; the
# file historically shipped as bench_data/bpi2020_travel.xes was byte-identical
# to tests/fixtures/BPI_2020_DomesticDeclarations.xes (md5 e107a70b623704a8c1e...).
BPI2020_SRC="${FIXTURES}/BPI_2020_DomesticDeclarations.xes"
BPI2020_DST="${DEST}/bpi2020_domestic_declarations.xes"
if [[ -f "${BPI2020_SRC}" ]] && [[ ! -f "${BPI2020_DST}" ]]; then
    log "Copying BPI 2020 Domestic Declarations from fixtures..."
    cp "${BPI2020_SRC}" "${BPI2020_DST}"
elif [[ -f "${BPI2020_DST}" ]]; then
    skip "bpi2020_domestic_declarations.xes"
else
    # KNOWN-BAD: the old data.4tu.nl/file/<uuid>/... direct links return 503
    # ("Not allowed") and previously saved raw HTTP error bodies into bench_data
    # (finding D1/D3). Direct-download URL TBD — fetch manually from the DOI
    # landing page: https://doi.org/10.4121/uuid:52fb97d4-4588-43c9-9d04-3604d4613b51
    download_if_missing \
        "TODO_URL_BPI2020_DOMESTIC" \
        "${DEST}/bpi2020_domestic_declarations.xes" \
        "xes" \
        10000000 \
        "true"
fi

# Sepsis Cases — real log: 1,050 cases, 15,214 events (DOI: 10.4121/uuid:915d2bfb).
# WARNING: bench_data/sepsis.xes is ABSENT. bench_data/sepsis_stub_5traces.xes is
# a 5-trace/37-event handcrafted stub (D1) and must never be cited as real data.
# See bench_data/MISSING-DATASETS.md.
download_if_missing \
    "TODO_URL_SEPSIS" \
    "${DEST}/sepsis.xes" \
    "xes" \
    1000000 \
    "true"

# BPI 2013 Incidents — 7,554 cases, 65,533 events (DOI: 10.4121/12693914)
download_if_missing \
    "TODO_URL_BPI2013" \
    "${DEST}/bpi2013_incidents.xes" \
    "xes" \
    5000000 \
    "true"

if [[ "${TIER}" -lt 2 ]]; then
    log "Tier 1 complete. Set TIER=2 to download BPI 2012 and Road Traffic Fine datasets."
    ls -lh "${DEST}/"
    exit 0
fi

# ── Tier 2: Comprehensive datasets (~120 MB additional) ──────────────────────
log "=== Tier 2: Comprehensive Datasets ==="

# BPI 2012 — 13,087 cases, 262,200 events (DOI: 10.4121/12689204)
download_if_missing \
    "TODO_URL_BPI2012" \
    "${DEST}/bpi2012_loans.xes" \
    "xes" \
    50000000 \
    "true"

# BPI 2017 — 31,509 cases, 1,202,267 events (DOI: 10.4121/uuid:5f3067df)
download_if_missing \
    "TODO_URL_BPI2017" \
    "${DEST}/bpi2017_loans.xes" \
    "xes" \
    100000000 \
    "true"

if [[ "${TIER}" -lt 3 ]]; then
    log "Tier 2 complete. Set TIER=3 to download Road Traffic Fine and BPI 2019/2015."
    ls -lh "${DEST}/"
    exit 0
fi

# ── Tier 3: Stress datasets (~300 MB additional) ─────────────────────────────
log "=== Tier 3: Stress Datasets ==="

# Road Traffic Fine Management — 150,370 cases, 561,470 events
# (DOI: 10.4121/uuid:270fd440-1057-4fb9-89a9-b699b47990f5)
download_if_missing \
    "TODO_URL_ROADTRAFFIC" \
    "${DEST}/road_traffic_fines.xes" \
    "xes" \
    50000000 \
    "true"

# BPI 2015 Building Permits — 28,657 cases, 376,467 events (DOI: 10.4121/uuid:31a308ef)
# Using municipality 1 as representative
download_if_missing \
    "TODO_URL_BPI2015" \
    "${DEST}/bpi2015_building_permits_1.xes" \
    "xes" \
    50000000 \
    "true"

# BPI 2019 Purchase-to-Pay — 251,734 cases, 1,595,923 events (DOI: 10.4121/uuid:3926db30)
download_if_missing \
    "TODO_URL_BPI2019" \
    "${DEST}/bpi2019_p2p.xes" \
    "xes" \
    100000000 \
    "true"

log "=== All datasets downloaded ==="
ls -lh "${DEST}/"

# ── Copy downloaded datasets to fixtures for use in tests ──────────────────────
log "=== Linking datasets to fixtures ==="
mkdir -p "${FIXTURES}"

link_to_fixtures() {
    local src="$1"
    local dst_name="$2"
    if [[ -f "${src}" ]]; then
        cp "${src}" "${FIXTURES}/${dst_name}"
        log "Linked: ${dst_name}"
    fi
}

link_to_fixtures "${DEST}/sepsis.xes" "Sepsis_Cases_Event_Log.xes"
link_to_fixtures "${DEST}/bpi2013_incidents.xes" "BPI_2013_Incidents.xes"
link_to_fixtures "${DEST}/bpi2012_loans.xes" "BPI_Challenge_2012.xes"
link_to_fixtures "${DEST}/bpi2017_loans.xes" "BPI_Challenge_2017.xes"
link_to_fixtures "${DEST}/road_traffic_fines.xes" "Road_Traffic_Fine_Management.xes"
link_to_fixtures "${DEST}/bpi2015_building_permits_1.xes" "BPI_2015_Building_Permits.xes"
link_to_fixtures "${DEST}/bpi2019_p2p.xes" "BPI_2019_Invoice_Purchase_to_Pay.xes"

log "=== Setup complete ==="
echo ""
echo "Fixtures ready in: ${FIXTURES}"
ls -lh "${FIXTURES}"/*.xes 2>/dev/null | tail -10 || echo "(XES files in fixtures)"
