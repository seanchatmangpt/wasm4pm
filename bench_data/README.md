# Benchmark Datasets

Real-world process mining datasets for pictl benchmarks.
All datasets are freely available under CC BY 4.0 from [4TU.ResearchData](https://data.4tu.nl).

Run `make bench-data` (or `bash scripts/download_datasets.sh`) to download them.

## Tier 1 — Essential (~30 MB, always run)

| File | Dataset | Cases | Events | DOI |
|------|---------|-------|--------|-----|
| `bpi2020_travel.xes` | BPI 2020 Travel Permits | 7,065 | 86,581 | [10.4121/...52fb97d4](https://doi.org/10.4121/uuid:52fb97d4-4588-43c9-9d04-3604d4613b51) |
| `sepsis.xes` | Sepsis Cases | 1,050 | 15,214 | [10.4121/...915d2bfb](https://doi.org/10.4121/uuid:915d2bfb-7e84-49ad-a286-dc35f063a460) |
| `bpi2013_incidents.xes` | BPI 2013 Incidents (Volvo IT) | 7,554 | 65,533 | [10.4121/12693914](https://doi.org/10.4121/12693914) |

## Tier 2 — Comprehensive (set `TIER=2`, ~150 MB)

| File | Dataset | Cases | Events | DOI |
|------|---------|-------|--------|-----|
| `bpi2012_loans.xes` | BPI 2012 Loan Applications | 13,087 | 262,200 | [10.4121/12689204](https://doi.org/10.4121/12689204) |

## Tier 3 — Stress (set `TIER=3`, ~450 MB)

| File | Dataset | Cases | Events | DOI |
|------|---------|-------|--------|-----|
| `road_traffic_fines.xes` | Road Traffic Fine Management | 150,370 | 561,470 | [10.4121/...270fd440](https://doi.org/10.4121/uuid:270fd440-1057-4fb9-89a9-b699b47990f5) |

## Fallback Behavior

If datasets are not present, benchmarks fall back to synthetic event logs of equivalent
size with realistic process variance. Synthetic results are clearly labeled in reports.

## Citation

When citing benchmark results produced with real datasets, please cite both
the pictl paper and the relevant BPI Challenge paper:

> van der Aalst, W.M.P. et al. (2011–2020). BPI Challenge [year].
> 4TU.ResearchData. https://doi.org/[dataset DOI]
