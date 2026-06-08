## 2026-06-05T08:07:01Z
You are a teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_m4/`.
Your task is to implement the Criterion benchmarks for the `pm4py-lsp` crate.

Specifically:
1. Modify `crates/pm4py-lsp/Cargo.toml` to:
   - Add `criterion = "0.5"` to `[dev-dependencies]`.
   - Register the following benchmark targets:
     ```toml
     [[bench]]
     name = "analysis_bench"
     harness = false

     [[bench]]
     name = "diagnostics_bench"
     harness = false

     [[bench]]
     name = "receipts_bench"
     harness = false

     [[bench]]
     name = "lsp_flow_bench"
     harness = false
     ```
2. Create the benchmarks directory `crates/pm4py-lsp/benches/`.
3. Implement the 4 benchmarks files using Criterion:
   - `analysis_bench.rs`: Benchmark static analysis throughput and snapshot hash latency (B1, B3).
   - `diagnostics_bench.rs`: Benchmark diagnostic generation latency (B2).
   - `receipts_bench.rs`: Benchmark fixture write latency, receipt verification latency, and conformance vector latency (B4, B5, B7).
   - `lsp_flow_bench.rs`: Benchmark codeAction latency and didOpen -> diagnostics latency (B6, B8).
4. Run the benchmarks using:
   `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo bench -p pm4py-lsp`
   (or you can run a dry-run using `--no-run` to verify compilation first if cargo bench takes too long, but you should run it and gather the actual performance numbers if possible).
5. Document your changes and the benchmark output/results in your handoff report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/boundary implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
