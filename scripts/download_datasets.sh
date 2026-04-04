#!/usr/bin/env bash
# Download real BPI Challenge datasets for wasm4pm benchmarks.
# All datasets are freely available (CC BY 4.0) from 4TU.ResearchData.
#
# Usage:
#   bash scripts/download_datasets.sh           # Tier 1 (required)
#   TIER=2 bash scripts/download_datasets.sh    # Tier 1 + 2
#   TIER=3 bash scripts/download_datasets.sh    # All tiers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST="${REPO_ROOT}/bench_data"
FIXTURES="${REPO_ROOT}/wasm4pm/tests/fixtures"
TIER="${TIER:-1}"

mkdir -p "${DEST}"

log()  { echo "[download_datasets] $*"; }
skip() { log "Already cached: $1"; }

# ── Helper: download + decompress + verify ───────────────────────────────────
download_if_missing() {
    local url="$1"
    local outfile="$2"
    local compressed="${3:-false}"   # "true" if .xes.gz

    if [[ -f "${outfile}" ]]; then
        skip "$(basename "${outfile}")"
        return 0
    fi

    log "Downloading $(basename "${outfile}")..."
    local tmpfile="${outfile}.part"

    if command -v curl &>/dev/null; then
        curl -L --progress-bar --retry 3 -o "${tmpfile}" "${url}"
    elif command -v wget &>/dev/null; then
        wget -q --show-progress -O "${tmpfile}" "${url}"
    else
        echo "ERROR: curl or wget required for dataset download." >&2
        exit 1
    fi

    if [[ "${compressed}" == "true" ]]; then
        log "Decompressing $(basename "${outfile}")..."
        gunzip -c "${tmpfile}" > "${outfile}"
        rm -f "${tmpfile}"
    else
        mv "${tmpfile}" "${outfile}"
    fi

    log "Saved: ${outfile}"
}

# ── Tier 1: Essential datasets (~30 MB total) ────────────────────────────────
log "=== Tier 1: Essential Datasets ==="

# BPI 2020 Travel Permits (already in fixtures — just copy it)
BPI2020_SRC="${FIXTURES}/BPI_2020_Travel_Permits_Actual.xes"
BPI2020_DST="${DEST}/bpi2020_travel.xes"
if [[ -f "${BPI2020_SRC}" ]] && [[ ! -f "${BPI2020_DST}" ]]; then
    log "Copying BPI 2020 from fixtures..."
    cp "${BPI2020_SRC}" "${BPI2020_DST}"
elif [[ -f "${BPI2020_DST}" ]]; then
    skip "bpi2020_travel.xes"
else
    # Fall back to download
    download_if_missing \
        "https://data.4tu.nl/file/52fb97d4-4588-43c9-9d04-3604d4613b51/bpi2020_travel_permits.xes.gz" \
        "${DEST}/bpi2020_travel.xes" \
        "true"
fi

# Sepsis Cases — 1,050 cases, 15,214 events (DOI: 10.4121/uuid:915d2bfb)
download_if_missing \
    "https://data.4tu.nl/file/915d2bfb-7e84-49ad-a286-dc35f063a460/Sepsis_Cases_Event_Log.xes.gz" \
    "${DEST}/sepsis.xes" \
    "true"

# BPI 2013 Incidents — 7,554 cases, 65,533 events (DOI: 10.4121/12693914)
download_if_missing \
    "https://data.4tu.nl/file/500573e6-accc-4b0c-9576-aa5468b10cec/BPI_Challenge_2013_incidents.xes.gz" \
    "${DEST}/bpi2013_incidents.xes" \
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
    "https://data.4tu.nl/file/533f66a4-8911-4ac7-8612-1235d65d1f37/BPI_Challenge_2012.xes.gz" \
    "${DEST}/bpi2012_loans.xes" \
    "true"

if [[ "${TIER}" -lt 3 ]]; then
    log "Tier 2 complete. Set TIER=3 to download Road Traffic Fine (561K events)."
    ls -lh "${DEST}/"
    exit 0
fi

# ── Tier 3: Stress datasets (~300 MB additional) ─────────────────────────────
log "=== Tier 3: Stress Datasets ==="

# Road Traffic Fine Management — 150,370 cases, 561,470 events
# (DOI: 10.4121/uuid:270fd440-1057-4fb9-89a9-b699b47990f5)
download_if_missing \
    "https://data.4tu.nl/file/270fd440-1057-4fb9-89a9-b699b47990f5/Road_Traffic_Fine_Management_Process.xes.gz" \
    "${DEST}/road_traffic_fines.xes" \
    "true"

log "=== All datasets downloaded ==="
ls -lh "${DEST}/"
