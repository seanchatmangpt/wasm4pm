# Benchmarks

Performance data, methodology, and reproducibility guides for the pictl WASM process mining engine (21 algorithms, compiled to WebAssembly). All results are from Apple M3 Max (16P/4E, 36GB unified memory), median of 7 runs.

---

## Directory Structure

```
benchmarks/
  README.md              <-- you are here
  tutorials/             -- guided walkthroughs
  how-to/                -- problem-solution guides
  explanation/           -- conceptual background
  reference/             -- lookup tables and specifications
```

---

## Quick Links

### Tutorials (learn by doing)

- [First Benchmark](./tutorials/first-benchmark.md) -- run your first benchmark end-to-end
- [Interpreting Results](./tutorials/interpreting-results.md) -- read and understand benchmark output
- [Custom Benchmark Suite](./tutorials/custom-benchmark-suite.md) -- create your own benchmark configurations

### How-To Guides (solve a specific problem)

- [Compare Algorithms](./how-to/compare-algorithms.md) -- side-by-side algorithm comparison with `pictl compare`
- [Profile a Slow Algorithm](./how-to/profile-slow-algorithm.md) -- diagnose performance bottlenecks
- [CI/CD Integration](./how-to/cicd-integration.md) -- add benchmarks to your pipeline
- [Browser Benchmarks](./how-to/browser-benchmarks.md) -- run benchmarks in Chrome via Playwright
- [Reproduce Paper Benchmarks](./how-to/reproduce-paper-benchmarks.md) -- validate against published numbers

### Explanation (understand the why)

- [Methodology](./explanation/methodology.md) -- how benchmarks are designed and run
- [Dataset Choice](./explanation/dataset-choice.md) -- why we use these datasets
- [Statistical Significance](./explanation/statistical-significance.md) -- median-of-N, confidence, variability
- [Streaming vs Batch](./explanation/streaming-vs-batch.md) -- tradeoffs between streaming and batch modes
- [Hardware Considerations](./explanation/hardware-considerations.md) -- Apple Silicon specifics and cross-platform notes

### Reference (lookup tables and specs)

- [Commands](./reference/commands.md) -- all benchmark-related CLI commands and flags
- [Hardware](./reference/hardware.md) -- full hardware specification sheet
- [Datasets](./reference/datasets.md) -- dataset catalog (BPI 2020, synthetic)
- [Results](./reference/results.md) -- complete benchmark result tables
- [Configuration](./reference/configuration.md) -- config files, ENV vars, profiles

---

## Related Resources

- [docs/BENCHMARKS.md](../BENCHMARKS.md) -- full benchmark result tables (all algorithms, all sizes)
- [ALGORITHMS.md](../ALGORITHMS.md) -- algorithm descriptions, parameters, and output types
- [benchmarks/README.md](../../benchmarks/README.md) -- how to run the benchmark suite
