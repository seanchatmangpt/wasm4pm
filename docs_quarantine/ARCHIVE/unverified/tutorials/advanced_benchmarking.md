<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/unverified/tutorials/advanced_benchmarking.md; source-sha256: 0d227a01eb287f2ae8ea40bdb097b450be06d36a2fd5a8c3a5470d59ed01419b; reason: tooling or agent control surface -->

# Tutorial: Advanced Benchmarking

## Learning Objectives
In this tutorial, you will:
1. Run a combinatorial benchmark across multiple algorithms.
2. Compare edge vs. browser profiles.
3. Analyze memory and SIMD vectorization metrics.

## Step 1: Defining the Suite
Create a `bench_suite.toml` specifying the algorithms (e.g., `dfg`, `heuristic_miner`, `ilp`) and profiles.

## Step 2: Execution
Run the benchmark suite:
```bash
wpm compare suite --config bench_suite.toml -i sample.xes
```

## Step 3: Visualization
Export the results to an HTML report to view latency distributions and memory ceilings.
```bash
wpm compare export --format html
```
