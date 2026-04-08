# Apple M3 Max Hardware Considerations

How the hardware we benchmark on affects our results, and what to expect when running pictl on different machines.

---

## Reference Hardware

All benchmark numbers published in the pictl documentation were measured on:

| Component           | Specification                      |
| ------------------- | ---------------------------------- |
| Chip                | Apple M3 Max                       |
| Performance cores   | 16 (P-cores)                       |
| Efficiency cores    | 4 (E-cores)                        |
| Total cores         | 20                                 |
| Unified memory      | 36GB                               |
| Memory bandwidth    | 400 GB/s                           |
| Neural Engine       | 18-core                            |
| Media Engine        | Hardware-accelerated encode/decode |
| GPU                 | 40-core                            |
| L1 cache (per core) | 192KB instruction + 128KB data     |
| L2 cache (per core) | 48MB shared cluster cache          |
| Fabrication         | 3nm (second-gen)                   |
| OS                  | macOS Sonoma 14.x                  |
| Node.js             | 20 LTS                             |
| Rust toolchain      | 1.77 stable via rustup             |
| wasm-pack           | 0.12.1                             |

This is a high-end laptop/workstation chip. Your results will differ on different hardware, but the relative performance ratios between algorithms should remain consistent.

---

## Why Hardware Matters for Process Mining Benchmarks

Process mining algorithms are **CPU-bound**, not I/O-bound or GPU-bound. The bottleneck is the computation itself: building dependency matrices, searching solution spaces, evaluating fitness functions. The hardware factors that matter most are:

### Single-Thread Performance

Most of our WASM algorithms run on a single thread. WASM's threading model requires SharedArrayBuffer and Atomics, which have limited browser support and add complexity. For benchmarking purposes, single-thread performance is the relevant metric.

The M3 Max's single-thread performance is excellent: ~3.0ms for DFG on BPI 2020. A lower-end chip (M1, or an Intel i5) might see 5-10ms for the same algorithm. The ratio between algorithms (DFG vs Heuristic Miner vs Hill Climbing) should remain similar.

### Memory Bandwidth

Process mining algorithms access memory in patterns that vary by algorithm type:

- **DFG**: Sequential scan of events, random access to edge matrix. Memory access pattern is mixed but mostly sequential.
- **Inductive Miner**: Recursive tree traversal with frequent allocations. Memory access pattern is random.
- **ILP**: Matrix operations on large constraint matrices. Memory access pattern is structured but bandwidth-intensive.

The M3 Max's 400 GB/s memory bandwidth is generous. Algorithms that are memory-bandwidth-bound on slower systems will perform relatively better on the M3 Max. This is one reason why our absolute numbers may not transfer directly to systems with lower memory bandwidth.

### Cache Size

The M3 Max's 48MB shared L2 cache is large enough to hold the entire DFG edge matrix for BPI 2020 (~1,225 edges \* 16 bytes = ~20KB) with room to spare. This means DFG computation stays in L2 cache for the entire benchmark run, avoiding main memory access entirely.

Larger datasets (100K+ traces) may exceed L2 cache for matrix-based algorithms, causing cache misses and slower performance. This is a scaling concern that our BPI 2020 benchmarks do not capture.

---

## WASM Single-Thread Limitation

WebAssembly in its current standard form (WASM 1.0 and most of WASM 2.0) is primarily a single-threaded execution environment. Even on a 20-core M3 Max, our WASM algorithms use only one core.

### What This Means for Benchmarks

Our benchmark numbers represent single-core performance. The 16 other cores on the M3 Max are idle during benchmark execution. If we could parallelize our algorithms across all 20 cores, theoretical speedups would range from:

- **Embarrassingly parallel** (DFG per-trace analysis): up to 16x (limited by P-core count)
- **Partially parallel** (Hill Climbing with parallel fitness evaluation): 2-8x depending on synchronization overhead
- **Difficult to parallelize** (ILP, A\* search): 1-2x due to sequential dependencies

In practice, multi-threaded WASM support is limited. SharedArrayBuffer requires specific HTTP headers (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy) and is not available in all environments. We chose single-threaded WASM for maximum portability.

### SIMD Helps

While multi-threading is limited, WASM does support SIMD (128-bit vector instructions). The M3 Max supports SIMD natively through its ARM NEON instruction set. V8's WASM engine compiles WASM SIMD instructions to NEON intrinsics, providing a speedup for data-parallel operations (matrix arithmetic, frequency counting).

Our Rust code uses portable SIMD through the `std::simd` API where beneficial. The actual SIMD speedup varies by algorithm: DFG frequency counting sees a 1.5-2x speedup from SIMD, while control-flow-heavy algorithms (Inductive Miner recursion) see minimal benefit.

---

## Rust Native vs WASM Performance Gap

We compile our algorithms from Rust to WASM via wasm-pack. This compilation introduces a performance gap compared to running the same Rust code natively.

### Typical Gap: 1.2x-2x Slower

WASM execution in V8 is fast but not as fast as native ARM64 code. The gap comes from:

1. **WASM bytecode overhead**: WASM instructions are more verbose than native machine code. V8 must decode and JIT-compile them.
2. **No auto-vectorization**: V8's JIT compiler does not auto-vectorize loops the way LLVM does for native Rust. Manual SIMD (via WASM SIMD) is needed.
3. **Memory model**: WASM linear memory has different performance characteristics than native memory. Bounds checking adds overhead (though V8 optimizes this away in many cases).
4. **No link-time optimization**: wasm-pack does not perform LTO across the WASM/JS boundary. Cross-language calls (JS calling into WASM) have overhead.

### When the Gap Matters

For ultra-fast algorithms (DFG at 3.0ms), the gap is noticeable: native Rust might achieve 1.5-2.0ms. But for medium-speed algorithms (Hill Climbing at 135ms), the gap is a smaller fraction of total time and less noticeable.

The gap is most relevant for latency-sensitive applications (real-time streaming) where every millisecond counts. For batch processing and CLI use, the WASM overhead is acceptable in exchange for portability (runs in any JavaScript environment: Node.js, Deno, Bun, browsers).

---

## Thermal Throttling: The Hidden Variable

Apple Silicon chips are designed for power efficiency. Under sustained load, they manage thermals by reducing clock speed. This affects benchmark reproducibility.

### What Happens During a Benchmark Run

The M3 Max starts at its base clock frequency (~2.5 GHz for P-cores). When a compute-intensive workload starts, the chip boosts to its turbo frequency (~4.0 GHz) for a short period. As the chip heats up, it gradually reduces clock speed to stay within thermal limits.

For ultra-fast algorithms (DFG at 3.0ms), the entire benchmark completes within the turbo boost window. The chip never has time to heat up, and every run gets turbo performance.

For medium-speed algorithms (Hill Climbing at 135ms), a single run may stay within turbo boost. But after 7 runs (135ms \* 7 = ~1 second of compute), the chip may begin to throttle. Later runs in the sequence may be slightly slower than earlier runs.

### Why Median of 7 Runs Accounts for This

The median of 7 runs naturally accounts for thermal variation. If the first 3 runs are fast (turbo boost) and the last 4 are slightly slower (thermal throttle), the median (4th run) reflects the throttled performance. This is conservative and realistic: it represents the speed you can expect from sustained use, not peak burst speed.

### Mitigation Strategies

For more reproducible results:

1. **Cool down between benchmarks**: Wait 30 seconds between algorithm benchmarks to let the chip return to base temperature.
2. **Disable turbo boost**: On macOS, there is no official way to disable turbo boost. Third-party tools (like `powermetrics`) can monitor clock frequency.
3. **Run more iterations**: 7 runs provides a reasonable median. 15-20 runs would better characterize the thermal throttling behavior.
4. **Monitor with powermetrics**: `sudo powermetrics --samplers cpu_power -i 1000` shows real-time clock frequency and power draw.

---

## Turbo Boost and First-Run Effects

The first time you run a benchmark after opening a terminal, the result may be faster than subsequent runs. This is not just JIT warmup (which we handle with 3 warmup runs). It is also turbo boost: the chip has been idle and is cool, so it boosts to maximum frequency.

After several benchmark runs, the chip is warmer and runs at a lower sustained frequency. This is why we report medians across 7 runs: the median represents steady-state performance, not cold-start performance.

### Practical Implication

If you run `pictl run log.xes --algorithm dfg` once, you might see 2.5ms (turbo boost + JIT). If you run it 10 times in a row, the median will be closer to 3.0ms (sustained frequency). Our published numbers reflect the sustained case.

---

## Comparison Expectations Across Hardware

Different hardware will produce different absolute times but similar relative ratios. Here is what to expect:

### Faster Hardware (M4 Max, M3 Ultra)

Absolute times will be lower. DFG might run in 2.0ms instead of 3.0ms. The ratios between algorithms should remain similar because all algorithms benefit proportionally from faster CPU and memory.

### Slower Hardware (M1, Intel i5, ARM Cortex)

Absolute times will be higher. DFG might run in 8-15ms instead of 3.0ms. The ratios between algorithms may shift slightly:

- Cache-sensitive algorithms (DFG, Heuristic Miner) will degrade more on chips with smaller caches.
- Memory-bandwidth-sensitive algorithms (ILP) will degrade more on chips with lower bandwidth.
- Compute-intensive algorithms (Hill Climbing, Genetic Algorithm) scale roughly linearly with single-thread CPU performance.

### Mobile Devices (iPhone 15 Pro, iPad Pro M2)

WASM runs in Safari on iOS, but with different performance characteristics:

- Lower clock speeds: 2-3x slower than M3 Max for CPU-bound workloads.
- Smaller caches: More cache misses for matrix-based algorithms.
- Thermal limits: Aggressive throttling under sustained load.
- Battery optimization: Background throttling may reduce performance further.

Our benchmarks are not designed for mobile devices. The algorithms will work, but expect 3-10x slower absolute times.

---

## Tips for Reproducible Results

If you want to reproduce our benchmark numbers as closely as possible:

### Environment

1. **Close other applications**: Every background process competes for CPU time and memory bandwidth. Close browsers, IDEs, and other development tools before benchmarking.
2. **Consistent power settings**: On macOS, ensure the laptop is plugged in (not on battery). Battery mode may limit CPU frequency.
3. **Cool environment**: Run benchmarks in a cool room or after the laptop has been idle for 10+ minutes. Warm ambient temperatures cause earlier thermal throttling.
4. **Same Node.js version**: Use Node.js 20 LTS to match our reference environment. Different V8 versions may have different JIT optimization behavior.

### Methodology

5. **Use our benchmark script**: `node scripts/benchmark.mjs --dataset bpi2020 --runs 7 --warmup 3` applies the same methodology we use.
6. **Run multiple times**: Run the full benchmark suite 3 times and compare medians. If results are consistent within 5%, your environment is reproducible.
7. **Check for thermal throttling**: Run `sudo powermetrics --samplers cpu_power -i 1000` in a separate terminal during benchmarks to verify the chip is not throttling severely.
8. **Verify WASM build**: Run `cd wasm4pm && npm run build` to rebuild WASM with the same compiler flags we use. Different optimization levels (-O0 vs -O2 vs -O3) produce different WASM bytecode.

### Interpretation

9. **Focus on ratios, not absolutes**: Your DFG time might be 5ms instead of 3ms. But if your Heuristic Miner is 23ms (4.6x slower), the ratio matches ours (14ms / 3ms = 4.7x). The ratios are hardware-independent.
10. **Report your hardware**: If you publish benchmark comparisons, include your chip, memory, OS, and Node.js version. This lets others interpret your results in context.
