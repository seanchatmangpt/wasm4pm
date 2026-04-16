/**
 * performance-runner.ts
 *
 * TypeScript performance benchmarking harness for the pictl kernel.
 *
 * Measures (all 21 algorithm targets via the WASM API):
 *   - Per-state latency distribution: mean, stddev, p99, p99.9 (nanoseconds)
 *   - Throughput: sustained states/second over a 10-second window
 *   - Memory bandwidth proxy: GB/sec based on bytes-per-event estimate
 *   - Peak heap usage: MB, validated against <512 MB target
 *   - Thermal profile: macOS `powermetrics` if available, else "N/A"
 *   - GPU utilization: not measurable from Node.js userspace on Apple Silicon;
 *     reported as 0 with note — no fabricated data.
 *
 * Targets (from CLAUDE.md / pictl specification):
 *   ≤120 ns per state, ≥250K states/sec, <512 MB peak heap, <80°C sustained
 *
 * Usage (standalone):
 *   node dist/bench/performance-runner.js [options]
 *
 * Options:
 *   --samples <N>        Number of timing samples per algorithm (default: 1000)
 *   --warmup <N>         Warmup iterations before timing (default: 50)
 *   --cases <N>          Log size in cases for latency bench (default: 1000)
 *   --out <path>         Override output file path
 *   --format human|json  Output format (default: human)
 *   --no-save            Skip writing JSON report to .pictl/benchmarks/
 *   --algorithms <ids>   Comma-separated algorithm IDs to benchmark (default: all)
 */
export interface LatencyStats {
    mean_ns: number;
    stddev_ns: number;
    p50_ns: number;
    p99_ns: number;
    p999_ns: number;
    min_ns: number;
    max_ns: number;
    samples: number;
}
export interface ThroughputPoint {
    /** elapsed seconds from benchmark start */
    elapsed_s: number;
    /** cumulative states processed */
    cumulative_states: number;
    /** instantaneous states/sec over this interval */
    states_per_sec: number;
}
export interface AlgorithmBenchResult {
    algorithm: string;
    log_cases: number;
    total_events: number;
    latency: LatencyStats;
    per_state_mean_ns: number;
    throughput_states_per_sec: number;
    throughput_curve: ThroughputPoint[];
    memory_bandwidth_gbps: number;
    peak_heap_mb: number;
    meets_latency_target: boolean;
    meets_throughput_target: boolean;
    meets_memory_target: boolean;
    margin_latency_pct: number;
    margin_throughput_pct: number;
}
export interface ThermalProfile {
    source: 'powermetrics' | 'unavailable';
    cpu_temp_c: number | null;
    gpu_temp_c: number | null;
    note: string;
}
export interface GpuUtilization {
    source: 'unavailable';
    gpu_util_pct: number;
    note: string;
}
export interface PerformanceReport {
    version: 1;
    generated_at: string;
    platform: string;
    node_version: string;
    targets: {
        max_per_state_ns: number;
        min_throughput_states_per_sec: number;
        max_peak_heap_mb: number;
        max_sustained_temp_c: number;
    };
    thermal: ThermalProfile;
    gpu: GpuUtilization;
    algorithms: AlgorithmBenchResult[];
    summary: {
        all_latency_targets_met: boolean;
        all_throughput_targets_met: boolean;
        all_memory_targets_met: boolean;
        fastest_algorithm: string;
        slowest_algorithm: string;
        best_throughput_algorithm: string;
        worst_throughput_algorithm: string;
    };
}
export interface RunBenchmarkOptions {
    samples?: number;
    warmup?: number;
    numCases?: number;
    outputPath?: string;
    format?: 'human' | 'json';
    save?: boolean;
    /** Restrict to specific algorithm IDs; empty = all 21 */
    algorithms?: string[];
}
/**
 * Run the full performance benchmark suite and return the report.
 * Writes JSON to .pictl/benchmarks/ unless save=false.
 */
export declare function runBenchmark(options?: RunBenchmarkOptions): Promise<PerformanceReport>;
//# sourceMappingURL=performance-runner.d.ts.map