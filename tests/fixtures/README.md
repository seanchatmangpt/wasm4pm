# Real Data Benchmarking Fixtures

## Setup

Place BPI 2020 Travel Permits dataset here:

```bash
# Download from 4TU.ResearchData
# https://data.4tu.nl/collections/BPI_Challenge_2020/5065541
# File: BPI_2020_Travel_Permits_Actual.xes

cd tests/fixtures/
# Place downloaded .xes file here
ls -lh *.xes
```

## BPI 2020 Variants Available

- **BPI_2020_Travel_Permits_Actual.xes** (7,065 cases, 86,581 events)
- **BPI_2020_Domestic_Declarations.xes** (10,500 cases, 56,437 events)
- **BPI_2020_International_Declarations.xes** (6,449 cases, 72,151 events)
- **BPI_2020_Prepaid_Travel_Cost.xes** (2,099 cases, 18,246 events)
- **BPI_2020_Requests_for_Payment.xes** (6,886 cases, 36,796 events)

## License

CC BY 4.0 (Free to use, attribution required)

## Alternative: Generate Test Data

If you don't have real data yet, the benchmarks can generate synthetic data:

```bash
cargo test --release -- benchmark
```

Then update THESIS.md with synthetic results.
