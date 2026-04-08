# Benchmark Hardware Specification

## Primary Benchmark Platform

| Component            | Specification                     |
| -------------------- | --------------------------------- |
| **Device**           | Apple MacBook Pro (16-inch, 2024) |
| **SoC**              | Apple M3 Max                      |
| **P-Cores**          | 16 Performance cores              |
| **E-Cores**          | 4 Efficiency cores                |
| **Total Cores**      | 20 (16P + 4E)                     |
| **Unified Memory**   | 36 GB                             |
| **Memory Bandwidth** | 400 GB/s                          |
| **OS**               | macOS (Darwin 25.x)               |
| **Architecture**     | ARM64 (Apple Silicon)             |

## Software Stack

| Component       | Version / Command                     |
| --------------- | ------------------------------------- |
| **Rust**        | stable toolchain (`rustc --version`)  |
| **wasm-pack**   | latest (`wasm-pack --version`)        |
| **Node.js**     | >= 18 (`node --version`)              |
| **pnpm**        | workspace package manager             |
| **WASM Target** | `wasm32-unknown-unknown` (bundler)    |
| **WASM Target** | `wasm32-unknown-emscripten` (browser) |

## Build Configuration

| Setting                | Value                                  |
| ---------------------- | -------------------------------------- |
| **Rust build command** | `cargo build --release`                |
| **Optimization level** | Release profile (LTO, codegen-units=1) |
| **WASM build command** | `wasm-pack build --target bundler`     |
| **WASM build command** | `wasm-pack build --target nodejs`      |
| **WASM build command** | `wasm-pack build --target web`         |
| **WASM features**      | Default (no special feature flags)     |

## Benchmark Runner Configuration

| Parameter          | Default Value     | CI Value | Description                      |
| ------------------ | ----------------- | -------- | -------------------------------- |
| **Iterations**     | 7                 | 3        | Number of runs (median reported) |
| **Warmup**         | 1                 | 1        | Discarded warmup runs            |
| **Dataset sizes**  | 100, 1K, 10K, 50K | 1K, 10K  | Cases per synthetic event log    |
| **Worker threads** | 4                 | 2        | Parallel benchmark workers       |
| **Timeout**        | 30s per algorithm | 60s      | Per-algorithm timeout            |

## Platform Notes

### Apple Silicon Considerations

- **Unified memory** means CPU and GPU share the same 36 GB pool. WASM runs on CPU cores only.
- **P-cores** run at higher frequency (~4 GHz) and handle single-threaded workloads. All benchmarks are single-threaded.
- **E-cores** are idle during benchmarks. They are not used by the benchmark runner.
- **Memory bandwidth** (400 GB/s) is significantly higher than x86 platforms. Memory-bound algorithms may appear faster relative to x86.

### Reproducibility on Other Platforms

| Platform Factor        | Impact on Benchmarks                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **x86_64 (AMD/Intel)** | Expect 1.5-3x slower for compute-bound algorithms. Memory-bound algorithms may be 2-4x slower due to lower bandwidth. |
| **ARM64 (non-Apple)**  | Varies by implementation. Ampere/Graviton may be comparable for memory-bound workloads.                               |
| **Windows (WSL2)**     | Near-native Linux performance. WASM in Node.js may have slightly higher overhead.                                     |
| **Browser**            | WASM in browser is sandboxed. Expect 1.1-1.5x overhead vs Node.js due to security restrictions.                       |

### Known Variability Sources

| Source                   | Magnitude             | Mitigation                                                  |
| ------------------------ | --------------------- | ----------------------------------------------------------- |
| **Thermal throttling**   | +/- 5-10%             | Run benchmarks within 5 min of idle. Do not run on battery. |
| **Background processes** | +/- 2-5%              | Close IDEs, browsers, other dev tools.                      |
| **macOS scheduler**      | +/- 1-3%              | P-core affinity is managed by macOS. No pinning needed.     |
| **Node.js JIT warmup**   | First run ~20% slower | Warmup iteration discarded. Median of N runs reported.      |
| **Garbage collection**   | Occasional spikes     | Median (not mean) eliminates outlier impact.                |

## Environment Verification

```bash
# Verify hardware
sysctl -n machdep.cpu.brand_string
sysctl -n hw.memsize
sysctl -n hw.ncpu

# Verify software
rustc --version
wasm-pack --version
node --version
```
