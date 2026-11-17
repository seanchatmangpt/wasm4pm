<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: bench_data/MISSING-DATASETS.md; source-sha256: 571a60f1dd4dd1009b8ab72eb673414184db32b373d7c6c264cbdfefb7dd8a0c; reason: path-local documentation retained pending domain-specific supersession -->

# Missing Datasets — Status and Fetch Instructions

<!-- wasm4pm-doc-status: active; created: 2026-10-10; context: findings D1–D3 in docs/benchmarks/RESULTS-2026-10-10.md §5 -->

Update 2026-10-10: `sepsis.xes` is now present (md5 `90a79e233310a78bff17d9ff718da748`,
1,050 cases / 15,214 events) and no longer on the absent list.

This directory previously shipped files cited as real BPI/Sepsis datasets that were
not what they claimed (stubs, mislabeled copies, saved HTTP error bodies). The
poisoned artifacts have been removed or renamed; this file records what is absent
and how to fetch the real data.

## Absent files

| File | Expected dataset | Expected size | Sources |
|------|------------------|---------------|---------|
| `bpi2013_incidents.xes` | BPI 2013 Incidents (7,554 / 65,533) | ~10 MB | DOI [10.4121/12693914](https://doi.org/10.4121/12693914) |
| `bpi2012_loans.xes` | BPI 2012 Loan Applications (13,087 / 262,200) | ~50 MB | DOI [10.4121/12689204](https://doi.org/10.4121/12689204) |
| `bpi2017_loans.xes` | BPI 2017 Loan Applications (31,509 / 1,202,267) | ~100 MB | DOI [10.4121/uuid:5f3067df-f10b-45da-b98b-86ae4c7a310b](https://doi.org/10.4121/uuid:5f3067df-f10b-45da-b98b-86ae4c7a310b) |
| `road_traffic_fines.xes` | Road Traffic Fine Management (150,370 / 561,470) | ~50 MB | DOI [10.4121/uuid:270fd440-1057-4fb9-89a9-b699b47990f5](https://doi.org/10.4121/uuid:270fd440-1057-4fb9-89a9-b699b47990f5) |
| `bpi2015_building_permits_1.xes` | BPI 2015 Building Permits, municipality 1 | ~50 MB | DOI [10.4121/uuid:31a308ef-c844-48da-948c-305d167a25ee](https://doi.org/10.4121/uuid:31a308ef-c844-48da-948c-305d167a25ee) |
| `bpi2019_p2p.xes` | BPI 2019 Invoice/Purchase-to-Pay | ~100 MB | DOI [10.4121/uuid:3926db30-f712-4394-aebc-75976070e91f](https://doi.org/10.4121/uuid:3926db30-f712-4394-aebc-75976070e91f) |
| `wasm4pm/bench_data/bpi2017.jsonocel` | BPI 2017 as OCEL (`.jsonocel`) | TBD | No verified source — the previous file was a saved 404 HTML page (D3). Needs a real OCEL export or removal of consumers. |

## What happened (D1–D3)

- **D1** — `sepsis.xes` was a handcrafted 5-trace/37-event stub cited as the real
  Sepsis log by ~25 benches/tests. It is preserved as `sepsis_stub_5traces.xes`.
- **D2** — `bpi2020_travel.xes` was byte-identical to BPI 2020 **Domestic
  Declarations** (md5 `e107a70b623704a8c1efa7177102bbf7`), not Travel Permits.
  Renamed to `bpi2020_domestic_declarations.xes`.
- **D3** — `wasm4pm/bench_data/bpi2017.jsonocel` was a saved 404 HTML page;
  `scripts/download_datasets.sh` saved HTTP error bodies verbatim. The file is
  deleted and the script now validates HTTP status, minimum size, content
  sniff, and optional sha256 before installing anything.

## Why the old download URLs are disabled

The former `https://data.4tu.nl/file/<uuid>/<name>.xes.gz` direct links are
dead (HTTP 503, body `{"message": "Not allowed."}` — the exact bytes found in
`sepsis.xes.part`). Until verified direct URLs are supplied,
`scripts/download_datasets.sh` refuses to run with `TODO_URL_*` placeholders
instead of silently writing error bodies.

## How to fetch

1. Visit the DOI landing page for each dataset above.
2. Download the `.xes.gz` via the landing page's file listing.
3. Place the decompressed `.xes` in `bench_data/` with the filename from the
   table (or run `bash scripts/download_datasets.sh` after updating the
   `TODO_URL_*` entries with verified direct links).
4. Optional checksum pinning: export `SHA256_EXPECTED_<FILENAME_UPPERCASE>`
   (e.g. `SHA256_EXPECTED_SEPSIS_XES=<hex>`) before running the script.

Until a dataset is fetched, benches and tests that require it skip or fail
loudly by design — none will silently consume the stub.
