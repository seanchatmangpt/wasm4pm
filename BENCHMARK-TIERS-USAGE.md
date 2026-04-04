# Benchmark Tiers: Real Data Only

**Important:** All benchmarks use REAL BPI datasets. No synthetic data.

## Quick Start

### Tier 1: Essential (Credible, Fast)
```bash
cargo test --release -- bench_tier_1_essential --nocapture --ignored
```
- **Datasets:** BPI 2020 Travel Permits (7,065 cases, 86,581 events)
- **Time:** ~30-35 seconds
- **Best for:** ChatmanGPT investor pitch, academic publications
- **Use when:** You need credible benchmarks vs. Celonis

### Tier 2: Comprehensive (Scalability)
```bash
cargo test --release -- bench_tier_2_comprehensive --nocapture --ignored
```
- **Datasets:** BPI 2019 Invoice (200K events), BPI 2015 Permits (150K cases)
- **Time:** ~5-10 minutes
- **Best for:** Proving scalability, algorithm comparison
- **Use when:** You need to show handling large logs

### Tier 3: Stress Test (Ultimate)
```bash
cargo test --release -- bench_tier_3_stress --nocapture --ignored
```
- **Datasets:** Road Traffic Fines (150K cases, 561K events)
- **Time:** ~10-20 minutes
- **Best for:** Memory profiling, extreme-scale validation
- **Use when:** You need to prove wasm4pm handles massive volumes

## How to Use Real Datasets

### Step 1: Download datasets

```bash
# Visit 4TU.ResearchData
# https://data.4tu.nl/collections/BPI_Challenge_2020/5065541

# Download the files you need for your tier:
# Tier 1: BPI_2020_Travel_Permits_Actual.xes
# Tier 2: BPI_2019_Invoice_Purchase_to_Pay.xes + BPI_2015_Building_Permits.xes
# Tier 3: Road_Traffic_Fine_Management.xes
```

### Step 2: Place in fixtures directory

```bash
# For Tier 1
cp ~/Downloads/BPI_2020_Travel_Permits_Actual.xes wasm4pm/tests/fixtures/

# For Tier 2
cp ~/Downloads/BPI_2019_Invoice_Purchase_to_Pay.xes wasm4pm/tests/fixtures/
cp ~/Downloads/BPI_2015_Building_Permits.xes wasm4pm/tests/fixtures/

# For Tier 3
cp ~/Downloads/Road_Traffic_Fine_Management.xes wasm4pm/tests/fixtures/
```

### Step 3: Run benchmarks

```bash
cd wasm4pm
cargo test --release -- bench_tier_1_essential --nocapture --ignored
```

## Expected Output

```
======================================================================
TIER 1: ESSENTIAL (Quick Validation) BENCHMARKS
Datasets: BPI 2020 Travel (7K cases)
Data Source: Real BPI 2020 (7,065 cases)
License: CC BY 4.0
======================================================================

DFG Discovery
Cases      Events     Median ms 
------------------------------------
7065       141300     XXX.XX

Heuristic Miner (θ=0.5)
Cases      Events     Median ms 
------------------------------------
7065       141300     YYY.YY

... [all 35 benchmarks run on REAL data]

======================================================================
✅ Tier 1 benchmarking complete
📊 Data Source: Real BPI 2020 (7,065 cases)
======================================================================
```

## If Real Data Not Found

If benchmark files aren't in `tests/fixtures/`, benchmarks will **fail** (no synthetic fallback).

**Solution:** Download datasets from 4TU.ResearchData and place in `wasm4pm/tests/fixtures/`

## For ChatmanGPT Competitive Story

**Recommended sequence:**
1. **Generate Tier 1 results** (BPI 2020) for investor pitch
2. **Compare vs. Celonis** (€50K annual cost, cloud-only)
3. **Show ChatmanGPT advantage** (free wasm4pm + AI premium, on-premise)

**Example:**
- Celonis: "BPI 2020 analysis requires enterprise license, 6-month implementation"
- ChatmanGPT: "BPI 2020 analysis completes in 30 seconds, free & open-source"

---

**All datasets:** CC BY 4.0 (free to use, attribution required)  
**Source:** 4TU.ResearchData (https://data.4tu.nl/)  
**License:** Real data only, no synthetic fallback
