# Tier 1 Discovery Algorithm Benchmarks

**Date:** 2026-04-10
**Commit:** refactor/performance-optimizations branch
**Hardware:** macOS (Darwin 25.2.0)
**Compiler:** Rust 1.84 with `opt-level=3` for benchmarks

## Summary

Tier 1 discovery algorithms are the foundational process discovery methods in pictl. These benchmarks measure throughput (events/second) and latency (milliseconds/operation) across 4 dataset sizes: 100, 1,000, 10,000, and 50,000 cases.

### Key Findings

| Algorithm | 100 cases | 1,000 cases | 10,000 cases | 50,000 cases | Throughput (50k) |
|-----------|-----------|-------------|--------------|--------------|------------------|
| **DFG** | 21.7 µs | 157.5 µs | 1.25 ms | 6.84 ms | **142.7 Melem/s** |
| **Heuristic Miner** | 22.9 µs | 206.6 µs | 1.54 ms | 11.49 ms | **84.9 Melem/s** |
| **Alpha++** | 65.3 µs | 1.03 ms | 11.84 ms | 83.10 ms | **11.7 Melem/s** |
| **Process Skeleton** | 69.2 µs | 926.7 µs | 10.95 ms | 73.02 ms | **13.4 Melem/s** |
| **Inductive Miner** | 98.0 µs | 1.16 ms | 16.32 ms | 136.56 ms | **7.1 Melem/s** |

**Throughput Ranking (fastest to slowest at 50k events):**
1. DFG: 142.7 Melem/s (baseline)
2. Heuristic Miner: 84.9 Melem/s (60% of DFG)
3. Process Skeleton: 13.4 Melem/s (9% of DFG)
4. Alpha++: 11.7 Melem/s (8% of DFG)
5. Inductive Miner: 7.1 Melem/s (5% of DFG)

---

## Detailed Results

### 1. DFG (Directly-Follows Graph)

The foundational O(n) single-pass algorithm. Fastest discovery method.

| Cases | Avg Time | Min Time | Max Time | Throughput |
|-------|----------|----------|----------|------------|
| 100 | 21.69 µs | 19.999 µs | 23.373 µs | 42.1 Melem/s |
| 1,000 | 157.53 µs | 152.40 µs | 164.93 µs | 91.9 Melem/s |
| 10,000 | 1.25 ms | 1.222 ms | 1.285 ms | 115.6 Melem/s |
| 50,000 | 6.84 ms | 6.80 ms | 6.88 ms | **142.7 Melem/s** |

**Scaling:** Near-linear O(n) with excellent cache locality from columnar layout.

---

### 2. Heuristic Miner

Threshold-based dependency discovery. Adds dependency computation to DFG.

| Cases | Avg Time | Min Time | Max Time | Throughput |
|-------|----------|----------|----------|------------|
| 100 | 22.87 µs | 19.36 µs | 27.42 µs | 40.0 Melem/s |
| 1,000 | 206.59 µs | 183.45 µs | 240.30 µs | 70.1 Melem/s |
| 10,000 | 1.54 ms | 1.49 ms | 1.61 ms | 94.1 Melem/s |
| 50,000 | 11.49 ms | 10.18 ms | 13.00 ms | **84.9 Melem/s** |

**Scaling:** O(n) with additional dependency computation overhead.

---

### 3. Alpha++ Algorithm

Basic Petri net discovery using causal relationships.

| Cases | Avg Time | Min Time | Max Time | Throughput |
|-------|----------|----------|----------|------------|
| 100 | 65.29 µs | 63.85 µs | 67.51 µs | 14.0 Melem/s |
| 1,000 | 1.03 ms | 945.53 µs | 1.13 ms | 14.1 Melem/s |
| 10,000 | 11.84 ms | 11.05 ms | 12.73 ms | 12.2 Melem/s |
| 50,000 | 83.10 ms | 75.64 ms | 92.27 ms | **11.7 Melem/s** |

**Scaling:** O(n²) due to causal graph computation and Petri net construction.

---

### 4. Process Skeleton

Filtered DFG with minimum frequency threshold.

| Cases | Avg Time | Min Time | Max Time | Throughput |
|-------|----------|----------|----------|------------|
| 100 | 69.23 µs | 68.79 µs | 69.92 µs | 13.2 Melem/s |
| 1,000 | 926.68 µs | 923.48 µs | 930.34 µs | 15.6 Melem/s |
| 10,000 | 10.95 ms | 10.37 ms | 11.63 ms | 13.2 Melem/s |
| 50,000 | 73.02 ms | 71.99 ms | 74.28 ms | **13.4 Melem/s** |

**Scaling:** O(n) with additional filtering pass.

---

### 5. Inductive Miner

Recursive structure discovery. Slowest Tier 1 algorithm due to recursion overhead.

| Cases | Avg Time | Min Time | Max Time | Throughput |
|-------|----------|----------|----------|------------|
| 100 | 97.99 µs | 90.25 µs | 108.21 µs | 9.3 Melem/s |
| 1,000 | 1.16 ms | 1.12 ms | 1.20 ms | 12.5 Melem/s |
| 10,000 | 16.32 ms | 15.14 ms | 17.89 ms | 8.9 Melem/s |
| 50,000 | 136.56 ms | 121.36 ms | 153.74 ms | **7.1 Melem/s** |

**Scaling:** O(n log n) due to recursive divide-and-conquer on traces.

---

## Performance Analysis

### Throughput vs Dataset Size

```
Throughput (Million events/second)
180 |                    ┌─────────────┐
    |              ┌────┘             │
160 |           ┌──┘                 │
    |        ┌──┘                    │
140 |     ┌──┘        DFG            │
    |  ┌──┘                          │
120 |──┘                              │
    |                        ┌────────┤ Heuristic
100 |                        │        │
    |                        │        │
 80 |                        └────────┤
    |                                  └───┐
 60 |                                      │
    |                                      │ Alpha++, Skeleton
 40 |                                      │
    |                                      │
 20 |                                      │
    |                    ┌─────────────────┤ Inductive
  0 |____________________└________________-└─────────>
      100    1,000    10,000    50,000    Cases (log scale)
```

### Latency vs Dataset Size

```
Latency (ms, log scale)
1000 |                                                          ┌──── Inductive
     |                                                     ┌───┘
 500 |                                                ┌───┘
     |                                           ┌───┘
 250 |                                      ┌───┘
     |                                 ┌───┘
 125 |                            ┌───┤ Alpha++
     |                       ┌───┘  │
  60 |                  ┌───┤       └── Skeleton
     |             ┌───┤  │
  30 |        ┌───┤  └──┤ Heuristic
     |   ┌───┤  │     │
  15 ├──┤  │  │  ┌──┤ DFG
     │  │  └──┤  │
  10 │  │     │  │
     │  └─────┘  └───────────────────────────────────────────>
   5 │
     └──────────────────────────────────────────────────────>
     100     1,000     10,000     50,000      Cases (log scale)
```

---

## Recommendations

1. **For real-time discovery (<1ms):** Use DFG for datasets up to 10,000 cases
2. **For noisy data:** Heuristic Miner provides 60% of DFG throughput with noise tolerance
3. **For Petri net models:** Alpha++ is suitable for small-to-medium datasets (<10k cases)
4. **For structured models:** Inductive Mine is best for smaller datasets where structure matters more than speed

---

## Benchmark Configuration

- **Warm-up time:** 1-2 seconds per benchmark
- **Measurement time:** 5-8 seconds per benchmark
- **Sample size:** 30-50 iterations
- **Hardware:** macOS (Darwin 25.2.0), x86_64
- **Compiler:** rustc 1.84 with `opt-level=3`
- **Features:** `--all-features` (full cloud profile)

---

## Appendix: Raw Criterion Output

Full benchmark output saved to: `/tmp/bench_tier1.txt`

To regenerate:
```bash
cd /Users/sac/chatmangpt/pictl/wasm4pm
cargo bench --bench tier1_discovery --all-features
```
