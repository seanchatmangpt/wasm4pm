<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: bench_data/README.md; source-sha256: a312ce7b6b51ee07f4bca3fd6a43bcead34cf5ee0828961fbff3afd96f51f2ff; reason: path-local authority or entrypoint -->

# Benchmark Datasets

Truth-in-labeling inventory of `bench_data/` (post-incident D1–D3 — see
`MISSING-DATASETS.md` and `docs/benchmarks/RESULTS-2026-10-10.md` §5).
Every file below is described as what it actually is, with on-disk md5.

## Currently on disk

| File | What it actually is | Bytes | md5 |
|------|--------------------|-------|-----|
| `sepsis.xes` | **Sepsis Cases — Event Log** (real log; 1,050 cases / 15,214 events). Sourced from `data/Sepsis Cases - Event Log.xes`; md5 verified. Fetched via DOI 10.4121/uuid:915d2bfb-7e84-49ad-a286-dc35f063a460. | 5,441,435 | `90a79e233310a78bff17d9ff718da748` |
| `bpi2020_domestic_declarations.xes` | **BPI 2020 Domestic Declarations** (real log). Previously mislabeled `bpi2020_travel.xes`; byte-identical to `wasm4pm/tests/fixtures/BPI_2020_DomesticDeclarations.xes`. | 20,497,405 | `e107a70b623704a8c1efa7177102bbf7` |
| `sepsis_stub_5traces.xes` | **Handcrafted stub** — 5 traces / 37 events. NOT the real Sepsis Cases log (1,050 cases / 15,214 events). Kept only as a smoke-test fixture. | 6,252 | `c3089ced047e5cdd72d8bf305c0f4e6e` |
| `roadtraffic100traces.xes` | Road Traffic Fine Management, 100-trace sample. | 218,471 | `32b5497568eb60a0320dfea4a369c190` |
| `ocel20_example.jsonocel` | OCEL 2.0 example log (small, from the OCEL 2.0 specification examples). | 10,508 | `fb2070dcc3d40dbc73933c36bd397b47` |

`wasm4pm/bench_data/` (crate-local): `receipt.xes` (synthetic receipt-process log,
4,285,624 bytes, md5 `b76718fb2a1392412558459af6eba97f`) and
`ocel20_example.jsonocel` (same bytes as above). The former `bpi2017.jsonocel`
was a saved 404 HTML page and has been deleted.

## Absent (must be fetched — see MISSING-DATASETS.md)

`bpi2013_incidents.xes`, `bpi2012_loans.xes`,
`bpi2017_loans.xes`, `road_traffic_fines.xes`, `bpi2015_building_permits_1.xes`,
`bpi2019_p2p.xes`. Benches/tests referencing these skip or fail loudly until they
are present. `scripts/download_datasets.sh` currently refuses to download until
verified direct URLs replace its `TODO_URL_*` placeholders (the old
`data.4tu.nl/file/...` links return 503 and were the source of saved error bodies).

## Citation

All BPI Challenge and 4TU datasets are CC BY 4.0. When citing benchmark results
produced with real datasets, cite the relevant BPI Challenge paper:

> van der Aalst, W.M.P. et al. (2011–2020). BPI Challenge [year].
> 4TU.ResearchData. https://doi.org/[dataset DOI]
