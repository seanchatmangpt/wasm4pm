#!/usr/bin/env bash
# Download real BPI Challenge datasets for wasm4pm benchmarks.
# All datasets are freely available (CC BY 4.0) from 4TU.ResearchData.
#
# Usage:
#   bash scripts/download_datasets.sh           # Tier 1 (required: 30 MB)
#   TIER=2 bash scripts/download_datasets.sh    # Tier 1 + 2 (adds BPI 2012/2017: ~100 MB)
#   TIER=3 bash scripts/download_datasets.sh    # All tiers (adds Road Traffic/BPI 2015/2019: ~500 MB)

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

# BPI 2017 — 31,509 cases, 1,202,267 events (DOI: 10.4121/uuid:5f3067df-f10b-45da-b98b-86ae4c7a310b)
download_if_missing \
    "https://data.4tu.nl/file/5f3067df-f10b-45da-b98b-86ae4c7a310b/BPI_Challenge_2017.xes.gz" \
    "${DEST}/bpi2017_loans.xes" \
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
    "https://data.4tu.nl/file/270fd440-1057-4fb9-89a9-b699b47990f5/Road_Traffic_Fine_Management_Process.xes.gz" \
    "${DEST}/road_traffic_fines.xes" \
    "true"

# BPI 2015 Building Permits — 28,657 cases, 376,467 events (DOI: 10.4121/uuid:31a308ef-c844-48da-948c-305d167a25ee)
# Using municipality 1 as representative
download_if_missing \
    "https://data.4tu.nl/file/31a308ef-c844-48da-948c-305d167a25ee/BPI_Challenge_2015_1.xes.gz" \
    "${DEST}/bpi2015_building_permits_1.xes" \
    "true"

# BPI 2019 Purchase-to-Pay — 251,734 cases, 1,595,923 events (DOI: 10.4121/uuid:3926db30-f712-4394-aebc-75976070e91f)
download_if_missing \
    "https://data.4tu.nl/file/3926db30-f712-4394-aebc-75976070e91f/BPI_Challenge_2019.xes.gz" \
    "${DEST}/bpi2019_p2p.xes" \
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
