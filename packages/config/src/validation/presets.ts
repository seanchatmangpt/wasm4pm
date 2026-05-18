/**
 * Configuration presets for common scenarios.
 * Provides minimal working configs and scenario-specific templates.
 */

import { SCHEMA_VERSION } from '../schema.js';
import type { BaseConfig } from '../types.js';

export type PresetScenario = 'quick-test' | 'production' | 'research';

/**
 * Get a complete preset config for a scenario.
 * Validates and can be used directly with resolveConfig().
 */
export function getPresetConfig(scenario: PresetScenario): BaseConfig {
  switch (scenario) {
    case 'quick-test':
      return {
        schemaVersion: SCHEMA_VERSION,
        version: '26.4.5',
        source: { kind: 'file' },
        sink: { kind: 'stdout' },
        algorithm: { name: 'dfg', parameters: {} },
        execution: {
          profile: 'fast',
          timeout: 60000,
          maxMemory: 536870912, // 512MB
        },
        observability: {
          logLevel: 'info',
          metricsEnabled: false,
        },
        watch: { enabled: false, poll_interval: 1000 },
        output: { format: 'human', destination: 'stdout', pretty: true, colorize: true },
        prediction: {
          enabled: false,
          activityKey: 'concept:name',
          ngramOrder: 2,
          driftWindowSize: 10,
          tasks: [],
          drift: { ewma_alpha: 0.2, threshold: 0.3 },
        },
      };

    case 'production':
      return {
        schemaVersion: SCHEMA_VERSION,
        version: '26.4.5',
        source: { kind: 'file' },
        sink: { kind: 'stdout' },
        algorithm: { name: 'heuristic_miner', parameters: {} },
        execution: {
          profile: 'balanced',
          timeout: 300000, // 5 min
          maxMemory: 1073741824, // 1GB
        },
        observability: {
          otel: {
            enabled: true,
            exporter: 'otlp',
            endpoint: 'http://localhost:4318',
            required: false,
          },
          logLevel: 'warn',
          metricsEnabled: true,
        },
        watch: { enabled: false, poll_interval: 1000 },
        output: { format: 'json', destination: 'stdout', pretty: false, colorize: false },
        prediction: {
          enabled: true,
          activityKey: 'concept:name',
          ngramOrder: 3,
          driftWindowSize: 20,
          tasks: ['next_activity', 'drift'],
          drift: { ewma_alpha: 0.15, threshold: 0.25 },
        },
        ml: {
          enabled: true,
          tasks: ['classify', 'anomaly'],
          classify: { model: 'decision_tree', targetKey: 'outcome', k: 5 },
          cluster: { method: 'kmeans', k: 5, eps: 1.0 },
          forecast: { method: 'linear', periods: 5, polynomialDegree: 2 },
          anomaly: { method: 'ema', alpha: 0.3, threshold: 2.5 },
          regress: { method: 'linear', targetKey: 'outcome', lambda: 0.0 },
          pca: { nComponents: 2 },
          targetKey: 'outcome',
          forecastPeriods: 5,
          nComponents: 2,
          eps: 1.0,
        },
      };

    case 'research':
      return {
        schemaVersion: SCHEMA_VERSION,
        version: '26.4.5',
        source: { kind: 'file' },
        sink: { kind: 'file', path: './wasm4pm-results.pnml' },
        algorithm: { name: 'ilp', parameters: {} },
        execution: {
          profile: 'quality',
          timeout: 1800000, // 30 min
          maxMemory: 2147483648, // 2GB
        },
        observability: {
          otel: {
            enabled: true,
            exporter: 'otlp',
            endpoint: 'http://localhost:4318',
            required: true,
          },
          logLevel: 'debug',
          metricsEnabled: true,
        },
        watch: { enabled: true, poll_interval: 500 },
        output: {
          format: 'json',
          destination: '/tmp/wasm4pm-results.json',
          pretty: true,
          colorize: false,
        },
        prediction: {
          enabled: true,
          activityKey: 'concept:name',
          ngramOrder: 4,
          driftWindowSize: 50,
          tasks: ['next_activity', 'remaining_time', 'outcome', 'drift', 'features', 'resource'],
          drift: { ewma_alpha: 0.1, threshold: 0.2 },
        },
        ml: {
          enabled: true,
          tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'],
          classify: { model: 'logistic_regression', targetKey: 'outcome', k: 10 },
          cluster: { method: 'hierarchical', k: 8, eps: 0.5 },
          forecast: { method: 'polynomial', periods: 12, polynomialDegree: 3 },
          anomaly: { method: 'isolation_forest', alpha: 0.2, threshold: 2.0 },
          regress: { method: 'ridge', targetKey: 'outcome', lambda: 0.5 },
          pca: { nComponents: 4 },
          targetKey: 'outcome',
          forecastPeriods: 12,
          nComponents: 4,
          eps: 0.5,
        },
        rl: {
          enabled: true,
          agents: ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA'],
          learning_rate: 0.05,
          discount_factor: 0.99,
          epsilon: 0.05,
          convergence: {
            min_cycles: 100,
            target_reward_improvement: 0.01,
            window_size: 20,
          },
          gpu_enabled: false,
          linucb_lambda: 1.0,
          ucb1_exploration: Math.SQRT2,
        },
      };
  }
}

/**
 * Get TOML example with detailed comments explaining each section.
 */
export function getExampleTomlWithComments(): string {
  return `# wasm4pm Configuration
# Schema: v${SCHEMA_VERSION}
# Documentation: https://github.com/seanchatmangpt/wasm4pm/wiki/Configuration
# Place this file at: ./wasm4pm.toml or ~/.wasm4pm/wasm4pm.toml

schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

# ==============================================================================
# SOURCE
# ==============================================================================
# Specifies where to read the event log.
# kind = "file" (default):   Read from a local XES/JSON file
# kind = "stream":           Read from stdin or a message queue
# kind = "http":             Fetch from a remote HTTP endpoint

[source]
kind = "file"
# path = "./events.xes"     # For kind="file"
# url = "http://localhost:8080/events"  # For kind="http"

# ==============================================================================
# SINK
# ==============================================================================
# Specifies where to write the discovered model or results.
# kind = "stdout" (default): Write to stdout (console)
# kind = "file":             Write to a file (PNML, PNG, etc.)
# kind = "http":             POST to a remote endpoint

[sink]
kind = "stdout"
# path = "./output.pnml"    # For kind="file"
# url = "http://localhost:9090/results"  # For kind="http"

# ==============================================================================
# ALGORITHM
# ==============================================================================
# Specifies the process discovery algorithm.
# See ALGORITHM_IDS in schema for full list.
# Common choices: dfg, heuristic_miner, inductive_miner, ilp, genetic_algorithm

[algorithm]
name = "dfg"
# parameters = { dependency_threshold = 0.2 }  # Algorithm-specific params

# ==============================================================================
# EXECUTION
# ==============================================================================
# Controls runtime behavior and resource allocation.

[execution]
# Profile controls algorithm selection and feature availability:
#   "fast"     (500 KB): Minimal algorithms, sub-second response, mobile-friendly
#   "balanced" (2.2 MB): Default, heuristic discovery + ML, production-ready
#   "quality"  (2.7 MB): All 41 algorithms, genetic/ILP, research-grade
#   "stream"   (2.5 MB): Streaming discovery, drift detection, real-time logs
profile = "balanced"

# Execution timeout (milliseconds). Set to 0 for unlimited (not recommended).
timeout = 300000       # 5 minutes

# Max memory allocation (bytes). Useful for containerized deployments.
# maxMemory = 1073741824  # 1 GB (default)

# ==============================================================================
# OBSERVABILITY
# ==============================================================================
# Controls logging, metrics, and distributed tracing.

[observability]
logLevel = "info"      # debug | info | warn | error
metricsEnabled = false # Compute performance metrics?

[observability.otel]
# Enable OpenTelemetry export (requires OTEL collector running).
enabled = false

# Exporter: where OTEL spans are sent.
#   "otlp":    OTEL Protocol HTTP exporter (standard)
#   "console": Print to stderr (development)
#   "none":    Disabled
exporter = "otlp"

# OTEL collector endpoint (only used if exporter = "otlp")
# endpoint = "http://localhost:4318"

# If required = true, a missing OTEL collector will fail the pipeline.
# If required = false, OTEL errors are silently logged.
required = false

# Optional: HTTP headers for OTEL authentication.
# headers = { Authorization = "Bearer my-token" }

# ==============================================================================
# WATCH
# ==============================================================================
# File system monitoring: re-run discovery when the config or input log changes.

[watch]
enabled = false
poll_interval = 1000   # How often to check for file changes (ms)
# checkpoint_dir = "./.wasm4pm/checkpoints"  # Where to store intermediate state

# ==============================================================================
# OUTPUT
# ==============================================================================
# Controls how results are formatted and where they're sent.

[output]
format = "human"       # human (colored, pretty) | json (machine-parseable)
destination = "stdout" # stdout | path/to/file
pretty = true          # Pretty-print JSON output?
colorize = true        # Colorize human output?

# ==============================================================================
# PREDICTION
# ==============================================================================
# Predictive process mining: anticipate next activities, remaining times, drift.

[prediction]
enabled = false

# Event log attribute key for activity names (XES standard).
activityKey = "concept:name"

# N-gram order for next-activity prediction (2–5).
# Higher = more context-aware but slower. Typical: 2–4.
ngramOrder = 2

# Sliding window size for drift detection (# of traces).
# Higher = more stable drift signal, but slower to detect abrupt drift.
# Typical: 10–50. Min: 5.
driftWindowSize = 10

# Which tasks to run: next_activity | remaining_time | outcome | drift | features | resource
# tasks = ["next_activity", "remaining_time", "drift", "outcome", "features", "resource"]
tasks = []

# Drift detection parameters (Exponentially-Weighted Moving Average).
[prediction.drift]
# EWMA smoothing factor α in (0, 1].
# Higher = more reactive to sudden changes. Typical: 0.1–0.3.
ewma_alpha = 0.2

# Drift score threshold in (0, 1].
# When EWMA deviates by this amount, a drift event is fired.
threshold = 0.3

# ==============================================================================
# ML (Machine Learning Analysis)
# ==============================================================================
# ML tasks: classify | cluster | forecast | anomaly | regress | pca

[ml]
enabled = false
tasks = ["classify", "cluster", "forecast"]

# --- Classification ---
[ml.classify]
model = "decision_tree"   # decision_tree | naive_bayes | logistic_regression | knn
targetKey = "outcome"     # Event attribute to predict
k = 5                     # Neighbors (only for knn)

# --- Clustering ---
[ml.cluster]
method = "kmeans"         # kmeans | dbscan | hierarchical
k = 5                     # Number of clusters (kmeans/hierarchical)
eps = 1.0                 # Neighborhood radius (dbscan only)

# --- Forecasting ---
[ml.forecast]
method = "linear"         # linear | exponential | polynomial
periods = 5               # How many steps to forecast ahead
polynomialDegree = 2      # Degree of polynomial (polynomial method only)

# --- Anomaly Detection ---
[ml.anomaly]
method = "ema"            # ema | isolation_forest | zscore
alpha = 0.3               # EMA smoothing (ema method only)
threshold = 2.5           # Score threshold above which a point is anomalous

# --- Regression ---
[ml.regress]
method = "linear"         # linear | polynomial | ridge
targetKey = "outcome"     # Event attribute to predict
lambda = 0.0              # L2 regularization strength (ridge only)

# --- PCA (Principal Component Analysis) ---
[ml.pca]
nComponents = 2           # Number of principal components to extract

# ==============================================================================
# RL (Reinforcement Learning Orchestration)
# ==============================================================================
# Autonomous agent selection and policy learning.
# Uses 5 agents (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE)
# with a LinUCB contextual bandit for algorithm selection.

[rl]
enabled = false

# Which agents to run in parallel (at least 1).
agents = ["QLearning", "SARSA", "DoubleQLearning"]

# Temporal-difference learning rate α in (0, 1].
# Higher = faster learning, less stable. Typical: 0.01–0.1.
learning_rate = 0.1

# Discount factor γ in [0, 1].
# How much future rewards matter (0 = myopic, 1 = foresighted).
# Typical: 0.9–0.99.
discount_factor = 0.99

# ε-greedy exploration rate in [0, 1].
# Probability of taking a random action (0 = exploit only, 1 = explore only).
# Typical: 0.05–0.2. Decaying epsilon is recommended for convergence.
epsilon = 0.1

# Convergence detection: when to stop the learning loop?
[rl.convergence]
# Minimum cycles before checking for convergence.
min_cycles = 50

# Smallest mean-reward delta (window-over-window) considered "still improving".
# If improvement < this, the policy is deemed converged.
target_reward_improvement = 0.05

# Size of trailing window for computing mean reward (# cycles).
window_size = 10

# LinUCB / GPU dispatch (advanced)
gpu_enabled = false       # Enable GPU dispatch? (requires wgpu feature)
linucb_lambda = 1.0       # LinUCB regularization coefficient
ucb1_exploration = 1.4142 # sqrt(2) (standard LinUCB recommendation)
`;
}

// Public preset names (ticket API)
export type PublicPreset = 'fast' | 'balanced' | 'quality';

const PRESET_ALIAS: Record<PublicPreset, PresetScenario> = {
  fast: 'quick-test',
  balanced: 'production',
  quality: 'research',
};

export function getPublicPresetConfig(preset: PublicPreset): BaseConfig {
  return getPresetConfig(PRESET_ALIAS[preset]);
}

export function describePublicPreset(preset: PublicPreset): string {
  return describePreset(PRESET_ALIAS[preset]);
}

export interface PresetConstraints {
  maxMemoryMb?: number;
  maxLatencyMs?: number;
  requiredAlgorithms?: string[];
  requiredFeatures?: string[];
}

const QUALITY_ALGORITHMS = new Set([
  'genetic_algorithm',
  'ilp',
  'a_star',
  'aco',
  'pso',
  'simulated_annealing',
]);

/**
 * Algorithms that indicate a streaming workload.
 * When any of these appear in `requiredAlgorithms`, `generateOptimalConfig`
 * will set `source.kind = 'stream'` so the pipeline opens a continuous ingest
 * channel rather than reading a static file.
 */
const STREAMING_ALGORITHMS = new Set(['simd_streaming_dfg', 'streaming_log']);

export function suggestPreset(constraints: PresetConstraints): PublicPreset {
  const { maxMemoryMb, maxLatencyMs, requiredAlgorithms = [] } = constraints;

  if (requiredAlgorithms.some((a) => QUALITY_ALGORITHMS.has(a))) return 'quality';
  if (maxMemoryMb !== undefined && maxMemoryMb < 1000) return 'fast';
  if (maxLatencyMs !== undefined && maxLatencyMs < 200) return 'fast';

  return 'balanced';
}

// ============================================================================
// Benchmark-driven AutoML preset selection
// ============================================================================

export interface AlgorithmMeasurement {
  median_ms_per_100_events: number | null;
  speed_score: number;
  quality_score: number;
  profile: string[];
}

export interface BenchmarkData {
  schema_version: string;
  algorithms: Record<string, AlgorithmMeasurement>;
}

/**
 * Select the best PublicPreset by scoring algorithms against actual benchmark
 * latency measurements.
 *
 * Steps:
 *  1. Filter by deployment profile (default: 'browser')
 *  2. Filter by latency: keep algos where
 *     `median_ms_per_100_events * (logSizeHint / 100) <= maxLatencyMs`
 *  3. If requiredAlgorithms is set, at least one must survive filtering
 *  4. Score remaining: `quality_score * qualityWeight + (100 - speed_score) * speedWeight`
 *     where qualityWeight = 0.6 and speedWeight = 0.4 (balanced default)
 *  5. Map winner's speed_score to preset: <=30 -> fast, <=55 -> balanced, else -> quality
 *  6. Fall back to suggestPreset() if no algorithms pass all filters
 */
export function suggestPresetFromBenchmarks(
  benchmarks: BenchmarkData,
  constraints: PresetConstraints & { deploymentProfile?: string; logSizeHint?: number }
): PublicPreset {
  const {
    maxLatencyMs,
    requiredAlgorithms = [],
    deploymentProfile = 'browser',
    logSizeHint = 100,
  } = constraints;

  const entries = Object.entries(benchmarks.algorithms);
  if (entries.length === 0) {
    return suggestPreset(constraints);
  }

  // 1. Filter by deployment profile
  let candidates = entries.filter(([, m]) => m.profile.includes(deploymentProfile));

  // 2. Filter by latency constraint
  if (maxLatencyMs !== undefined && maxLatencyMs > 0) {
    candidates = candidates.filter(([, m]) => {
      if (m.median_ms_per_100_events === null) return false;
      const estimatedMs = m.median_ms_per_100_events * (logSizeHint / 100);
      return estimatedMs <= maxLatencyMs;
    });
  }

  // 3. If requiredAlgorithms specified, at least one must survive
  if (requiredAlgorithms.length > 0) {
    const passingNames = new Set(candidates.map(([name]) => name));
    const hasRequired = requiredAlgorithms.some((a) => passingNames.has(a));
    if (!hasRequired) {
      return suggestPreset(constraints);
    }
    // Prefer required algorithms when scoring
    const requiredCandidates = candidates.filter(([name]) => requiredAlgorithms.includes(name));
    if (requiredCandidates.length > 0) {
      candidates = requiredCandidates;
    }
  }

  if (candidates.length === 0) {
    return suggestPreset(constraints);
  }

  // 4. Score: quality is primary concern (0.6), speed is secondary (0.4)
  const qualityWeight = 0.6;
  const speedWeight = 0.4;

  const scored = candidates.map(([name, m]) => ({
    name,
    measurement: m,
    score: m.quality_score * qualityWeight + (100 - m.speed_score) * speedWeight,
  }));

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0].measurement;

  // 5. Map speed_score to preset
  if (winner.speed_score <= 30) return 'fast';
  if (winner.speed_score <= 55) return 'balanced';
  return 'quality';
}

/**
 * Generate an optimal BaseConfig by combining preset selection with specific
 * algorithm selection from benchmark data.
 *
 * Returns a BaseConfig with additional metadata fields:
 *  - `_selectedAlgorithm`: the specific algorithm chosen
 *  - `_selectionReason`: human-readable explanation of the selection
 *  - `_warning` (optional): a human-readable warning when constraints could not
 *    be fully satisfied (unknown required algorithm, memory cascade, profile /
 *    algorithm mismatch).
 *
 * Instinct behaviours:
 *
 * 1. Streaming source kind - if any algorithm in `requiredAlgorithms` is a
 *    known streaming algorithm (`simd_streaming_dfg`, `streaming_log`), the
 *    returned config has `source.kind = 'stream'`.
 *
 * 2. Unknown algorithm warning - if `requiredAlgorithms` contains a name
 *    that does not appear in the benchmark catalogue (when benchmarks are
 *    provided), `_warning` is set describing the unknown name(s).
 *
 * 3. Memory cascade fallback message - when `maxMemoryMb` forces the
 *    preset down to `'fast'` through the hardcoded `suggestPreset` path,
 *    `_selectionReason` explains the cascade explicitly.
 *
 * 4. Profile / algorithm mismatch - when a required algorithm is absent
 *    from the requested deployment profile, `_warning` identifies the mismatch
 *    and the system gracefully falls back to `suggestPreset`.
 */
export function generateOptimalConfig(
  constraints: PresetConstraints & { deploymentProfile?: string; logSizeHint?: number },
  benchmarks?: BenchmarkData
): BaseConfig & { _selectedAlgorithm: string; _selectionReason: string; _warning?: string } {
  const {
    maxMemoryMb,
    requiredAlgorithms = [],
    deploymentProfile = 'browser',
    logSizeHint = 100,
    maxLatencyMs,
  } = constraints;

  // --- Instinct: detect unknown algorithms before any scoring ---
  let unknownWarning: string | undefined;
  if (benchmarks && requiredAlgorithms.length > 0) {
    const knownNames = new Set(Object.keys(benchmarks.algorithms));
    const unknowns = requiredAlgorithms.filter((a) => !knownNames.has(a));
    if (unknowns.length > 0) {
      unknownWarning = `Unknown required algorithm(s): [${unknowns.join(', ')}] not present in benchmark catalogue; falling back to preset default`;
    }
  }

  // --- Preset selection ---
  const preset = benchmarks
    ? suggestPresetFromBenchmarks(benchmarks, constraints)
    : suggestPreset(constraints);

  const base = getPublicPresetConfig(preset);

  let selectedAlgorithm = base.algorithm.name;
  let selectionReason = `Preset '${preset}' selected by hardcoded rules; default algorithm used`;
  let warning: string | undefined = unknownWarning;

  // --- Memory cascade explanation ---
  // When maxMemoryMb drives the preset to 'fast' via suggestPreset, make the
  // cascade visible in the selection reason so practitioners can diagnose it.
  if (
    maxMemoryMb !== undefined &&
    maxMemoryMb < 1000 &&
    preset === 'fast' &&
    // Only emit cascade message when memory was the deciding factor, not when
    // required quality algorithms overrode it (they take priority in suggestPreset).
    !requiredAlgorithms.some((a) => QUALITY_ALGORITHMS.has(a))
  ) {
    selectionReason = `Memory constraint (${maxMemoryMb} MB < 1000 MB) cascaded preset selection to 'fast'; default algorithm used`;
  }

  if (benchmarks && Object.keys(benchmarks.algorithms).length > 0) {
    const entries = Object.entries(benchmarks.algorithms);

    // Filter by profile
    let candidates = entries.filter(([, m]) => m.profile.includes(deploymentProfile));

    // --- Instinct: detect profile/algorithm mismatch ---
    if (requiredAlgorithms.length > 0) {
      const inProfile = new Set(candidates.map(([name]) => name));
      const missingFromProfile = requiredAlgorithms.filter(
        (a) =>
          !inProfile.has(a) && Object.prototype.hasOwnProperty.call(benchmarks.algorithms, a)
      );
      if (missingFromProfile.length > 0) {
        const mismatchMsg = `Required algorithm(s) [${missingFromProfile.join(', ')}] not available in deployment profile '${deploymentProfile}'; falling back to preset default`;
        warning = warning ? `${warning}; ${mismatchMsg}` : mismatchMsg;
      }
    }

    // Filter by latency
    if (maxLatencyMs !== undefined && maxLatencyMs > 0) {
      candidates = candidates.filter(([, m]) => {
        if (m.median_ms_per_100_events === null) return false;
        return m.median_ms_per_100_events * (logSizeHint / 100) <= maxLatencyMs;
      });
    }

    // Prefer required algorithms
    if (requiredAlgorithms.length > 0) {
      const passingNames = new Set(candidates.map(([name]) => name));
      const hasRequired = requiredAlgorithms.some((a) => passingNames.has(a));
      if (hasRequired) {
        const requiredCandidates = candidates.filter(([name]) =>
          requiredAlgorithms.includes(name)
        );
        if (requiredCandidates.length > 0) {
          candidates = requiredCandidates;
        }
      }
    }

    if (candidates.length > 0) {
      const qualityWeight = 0.6;
      const speedWeight = 0.4;

      const scored = candidates.map(([name, m]) => ({
        name,
        score: m.quality_score * qualityWeight + (100 - m.speed_score) * speedWeight,
        measurement: m,
      }));
      scored.sort((a, b) => b.score - a.score);

      const winner = scored[0];
      selectedAlgorithm = winner.name as BaseConfig['algorithm']['name'];
      selectionReason = `Algorithm '${winner.name}' selected from benchmarks (score=${winner.score.toFixed(1)}, quality=${winner.measurement.quality_score}, speed=${winner.measurement.speed_score}) for preset '${preset}'`;
    }
  }

  // --- Instinct: streaming source kind ---
  // If any required algorithm is a streaming algorithm, ensure source.kind = 'stream'
  // so the pipeline can consume events as a continuous flow rather than a static file.
  const needsStreamingSource = requiredAlgorithms.some((a) => STREAMING_ALGORITHMS.has(a));
  const effectiveSource = needsStreamingSource
    ? { ...base.source, kind: 'stream' as const }
    : base.source;

  const result: BaseConfig & {
    _selectedAlgorithm: string;
    _selectionReason: string;
    _warning?: string;
  } = {
    ...base,
    source: effectiveSource,
    algorithm: {
      ...base.algorithm,
      name: selectedAlgorithm as BaseConfig['algorithm']['name'],
    },
    _selectedAlgorithm: selectedAlgorithm,
    _selectionReason: selectionReason,
  };

  if (warning !== undefined) {
    result._warning = warning;
  }

  return result;
}

/**
 * Describe what each preset is best for.
 */
export function describePreset(scenario: PresetScenario): string {
  const descriptions: Record<PresetScenario, string> = {
    'quick-test': `
Quick Test Preset
-----------------
Use this for: rapid prototyping, CI/CD pipelines, learning wasm4pm
Profile: fast (minimal overhead, sub-100ms response)
Features: DFG discovery only, no ML/RL/prediction
Good for: smoke tests, getting started, tight latency budgets
Expect: 60s timeout, 512MB memory limit, colored human output
`,
    production: `
Production Preset
-----------------
Use this for: production process mining pipelines
Profile: balanced (proven, general-purpose)
Features: heuristic discovery + classification/anomaly ML + next-activity prediction
Telemetry: OTEL enabled, JSON output for machines
Config: 5min timeout, 1GB memory, drift detection active
Expect: 2-10s end-to-end, suitable for containerized deployments, SLA-ready
`,
    research: `
Research Preset
---------------
Use this for: academic research, complex analysis, high-accuracy models
Profile: quality (all algorithms available)
Features: ILP/genetic discovery + all ML tasks + all prediction tasks + RL orchestration
Telemetry: Full OTEL, debug logging, file output
Config: 30min timeout, 2GB memory, comprehensive analysis
Expect: 10-60s end-to-end, requires careful log preprocessing, publishes outputs
`,
  };

  return descriptions[scenario];
}
