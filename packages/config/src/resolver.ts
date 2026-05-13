import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as toml from 'toml';
import { validate, SCHEMA_VERSION } from './schema.js';
import { trackProvenance, mergeProvenance, type ProvenanceMap } from './provenance.js';
import { hashConfig } from './hash.js';
import {
  validateMlConfig,
  validateRlConfig,
  validatePredictionConfig,
  validateAlgorithmProfile,
} from './validation/detailed-errors.js';
import type { BaseConfig, Config, CliOverrides, LoadConfigOptions } from './types.js';

/**
 * Resolution order (highest to lowest priority):
 *  1. CLI arguments
 *  2. TOML config file (wasm4pm.toml)
 *  3. JSON config file (wasm4pm.json)
 *  4. Environment variables (WASM4PM_* prefix)
 *  5. Defaults
 */
export async function resolveConfig(options?: LoadConfigOptions): Promise<Config> {
  const cliOverrides = options?.cliOverrides ?? {};
  const env = options?.env ?? process.env;
  const searchPaths = options?.configSearchPaths ?? getDefaultSearchPaths();

  // Layer 5: Defaults
  const defaults = getDefaults();
  let provenance = trackProvenance(defaults as unknown as Record<string, unknown>, 'default');

  // Layer 4: Environment variables
  const envLayer = parseEnvConfig(env);
  const envProvenance = trackProvenance(envLayer as Record<string, unknown>, 'env');

  // Layer 3 & 2: File configs (JSON then TOML — TOML wins if both exist)
  let fileLayer: Record<string, unknown> = {};
  let fileProvenance: ProvenanceMap = {};
  let filePath: string | undefined;
  let fileSource: 'toml' | 'json' | undefined;

  for (const dir of searchPaths) {
    // Try TOML first (higher priority)
    const tomlPath = path.join(dir, 'wasm4pm.toml');
    if (existsSync(tomlPath)) {
      try {
        const content = await fs.readFile(tomlPath, 'utf-8');
        fileLayer = toml.parse(content);
        filePath = tomlPath;
        fileSource = 'toml';
        fileProvenance = trackProvenance(fileLayer, 'toml', tomlPath);
        break;
      } catch (error) {
        throw new Error(`Failed to parse TOML config at ${tomlPath}: ${error}`);
      }
    }

    // Fall back to JSON
    const jsonPath = path.join(dir, 'wasm4pm.json');
    if (existsSync(jsonPath)) {
      try {
        const content = await fs.readFile(jsonPath, 'utf-8');
        fileLayer = JSON.parse(content);
        filePath = jsonPath;
        fileSource = 'json';
        fileProvenance = trackProvenance(fileLayer, 'json', jsonPath);
        break;
      } catch (error) {
        throw new Error(`Failed to parse JSON config at ${jsonPath}: ${error}`);
      }
    }
  }

  // Layer 1: CLI overrides
  const cliLayer = parseCliOverrides(cliOverrides);
  const cliProvenance = trackProvenance(cliLayer as Record<string, unknown>, 'cli');

  // Merge layers: defaults ← env ← file ← cli
  const merged = deepMerge(
    defaults as Record<string, unknown>,
    envLayer as Record<string, unknown>,
    fileLayer,
    cliLayer as Record<string, unknown>
  );

  // Merge provenance in same order (later wins)
  const mergedProvenance = mergeProvenance(
    provenance,
    envProvenance,
    fileProvenance,
    cliProvenance
  );

  // Validate the merged config
  const validated = validate(merged) as BaseConfig;

  // Compute hash
  const hash = hashConfig(validated);

  return {
    ...validated,
    metadata: {
      loadTime: Date.now(),
      hash,
      provenance: mergedProvenance,
    },
  };
}

// --- Helpers ---

function getDefaultSearchPaths(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return [process.cwd(), path.join(home, '.wasm4pm')].filter(Boolean);
}

function getDefaults(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    version: '26.4.5',
    source: { kind: 'file' },
    sink: { kind: 'stdout' },
    algorithm: { name: 'dfg', parameters: {} },
    execution: {
      profile: 'balanced',
      timeout: 300000,
      maxMemory: 1073741824,
    },
    observability: {
      logLevel: 'info',
      metricsEnabled: false,
    },
    watch: {
      enabled: false,
      poll_interval: 1000,
    },
    output: {
      format: 'human',
      destination: 'stdout',
      pretty: true,
      colorize: true,
    },
    prediction: {
      enabled: false,
      activityKey: 'concept:name',
      ngramOrder: 2,
      driftWindowSize: 10,
      tasks: [],
    },
  };
}

function parseEnvConfig(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  if (env.WASM4PM_PROFILE) {
    config.execution = { profile: env.WASM4PM_PROFILE };
  }
  if (env.WASM4PM_LOG_LEVEL) {
    config.observability = {
      ...(config.observability as Record<string, unknown>),
      logLevel: env.WASM4PM_LOG_LEVEL,
    };
  }
  if (env.WASM4PM_WATCH) {
    config.watch = { enabled: env.WASM4PM_WATCH === 'true' || env.WASM4PM_WATCH === '1' };
  }
  if (env.WASM4PM_OUTPUT_FORMAT) {
    config.output = {
      ...(config.output as Record<string, unknown>),
      format: env.WASM4PM_OUTPUT_FORMAT,
    };
  }
  if (env.WASM4PM_OUTPUT_DESTINATION) {
    config.output = {
      ...(config.output as Record<string, unknown>),
      destination: env.WASM4PM_OUTPUT_DESTINATION,
    };
  }
  if (env.WASM4PM_ALGORITHM) {
    config.algorithm = {
      ...(config.algorithm as Record<string, unknown>),
      name: env.WASM4PM_ALGORITHM,
    };
  }
  if (env.WASM4PM_SINK_KIND) {
    config.sink = { ...(config.sink as Record<string, unknown>), kind: env.WASM4PM_SINK_KIND };
  }
  if (env.WASM4PM_SOURCE_KIND) {
    config.source = {
      ...(config.source as Record<string, unknown>),
      kind: env.WASM4PM_SOURCE_KIND,
    };
  }
  if (env.WASM4PM_OTEL_ENABLED) {
    const otel = {
      enabled: env.WASM4PM_OTEL_ENABLED === 'true' || env.WASM4PM_OTEL_ENABLED === '1',
    };
    config.observability = { ...(config.observability as Record<string, unknown>), otel };
  }
  if (env.WASM4PM_OTEL_ENDPOINT) {
    const existingOtel = (config.observability as Record<string, unknown>)?.otel ?? {};
    config.observability = {
      ...(config.observability as Record<string, unknown>),
      otel: { ...(existingOtel as Record<string, unknown>), endpoint: env.WASM4PM_OTEL_ENDPOINT },
    };
  }
  if (env.WASM4PM_PREDICTION_ENABLED) {
    config.prediction = {
      ...(config.prediction as Record<string, unknown>),
      enabled: env.WASM4PM_PREDICTION_ENABLED === 'true' || env.WASM4PM_PREDICTION_ENABLED === '1',
    };
  }
  if (env.WASM4PM_PREDICTION_TASKS) {
    config.prediction = {
      ...(config.prediction as Record<string, unknown>),
      tasks: env.WASM4PM_PREDICTION_TASKS.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
  }
  if (env.WASM4PM_PREDICTION_ACTIVITY_KEY) {
    config.prediction = {
      ...(config.prediction as Record<string, unknown>),
      activityKey: env.WASM4PM_PREDICTION_ACTIVITY_KEY,
    };
  }
  if (env.WASM4PM_PREDICTION_NGRAM_ORDER) {
    const n = parseInt(env.WASM4PM_PREDICTION_NGRAM_ORDER, 10);
    // CRITICAL: Only accept valid integers, reject NaN silently
    if (Number.isNaN(n)) {
      throw new Error(
        `Invalid WASM4PM_PREDICTION_NGRAM_ORDER: "${env.WASM4PM_PREDICTION_NGRAM_ORDER}" is not a valid integer`
      );
    }
    // Validate range: ngramOrder must be 2-5
    if (n < 2 || n > 5) {
      throw new Error(`Invalid WASM4PM_PREDICTION_NGRAM_ORDER: ${n} is out of range [2, 5]`);
    }
    config.prediction = { ...(config.prediction as Record<string, unknown>), ngramOrder: n };
  }
  // --- ML environment variables ---
  if (env.WASM4PM_ML_ENABLED) {
    config.ml = {
      ...(config.ml as Record<string, unknown>),
      enabled: env.WASM4PM_ML_ENABLED === 'true' || env.WASM4PM_ML_ENABLED === '1',
    };
  }
  if (env.WASM4PM_ML_ALGORITHMS) {
    config.ml = {
      ...(config.ml as Record<string, unknown>),
      tasks: env.WASM4PM_ML_ALGORITHMS.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
  }

  // --- RL environment variables ---
  if (env.WASM4PM_RL_ENABLED) {
    config.rl = {
      ...(config.rl as Record<string, unknown>),
      enabled: env.WASM4PM_RL_ENABLED === 'true' || env.WASM4PM_RL_ENABLED === '1',
    };
  }
  if (env.WASM4PM_RL_AGENTS) {
    config.rl = {
      ...(config.rl as Record<string, unknown>),
      agents: env.WASM4PM_RL_AGENTS.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
  }
  if (env.WASM4PM_RL_LEARNING_RATE) {
    const v = parseFloat(env.WASM4PM_RL_LEARNING_RATE);
    if (Number.isNaN(v)) {
      throw new Error(
        `Invalid WASM4PM_RL_LEARNING_RATE: "${env.WASM4PM_RL_LEARNING_RATE}" is not a valid number`
      );
    }
    if (v <= 0 || v > 1) {
      throw new Error(`Invalid WASM4PM_RL_LEARNING_RATE: ${v} must be in (0, 1]`);
    }
    config.rl = { ...(config.rl as Record<string, unknown>), learning_rate: v };
  }
  if (env.WASM4PM_RL_DISCOUNT_FACTOR) {
    const v = parseFloat(env.WASM4PM_RL_DISCOUNT_FACTOR);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      throw new Error(
        `Invalid WASM4PM_RL_DISCOUNT_FACTOR: "${env.WASM4PM_RL_DISCOUNT_FACTOR}" must be a number in [0, 1]`
      );
    }
    config.rl = { ...(config.rl as Record<string, unknown>), discount_factor: v };
  }
  if (env.WASM4PM_RL_EPSILON) {
    const v = parseFloat(env.WASM4PM_RL_EPSILON);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      throw new Error(
        `Invalid WASM4PM_RL_EPSILON: "${env.WASM4PM_RL_EPSILON}" must be a number in [0, 1]`
      );
    }
    config.rl = { ...(config.rl as Record<string, unknown>), epsilon: v };
  }

  // --- Membrane environment variables ---
  if (env.WASM4PM_MEMBRANE_ENABLED) {
    config.membrane = { ...(config.membrane as Record<string, unknown> ?? {}), enabled: env.WASM4PM_MEMBRANE_ENABLED === 'true' || env.WASM4PM_MEMBRANE_ENABLED === '1' };
  }
  if (env.WASM4PM_MEMBRANE_CUSTODY_ACTIONS) {
    config.membrane = { ...(config.membrane as Record<string, unknown> ?? {}), custody_actions: env.WASM4PM_MEMBRANE_CUSTODY_ACTIONS.split(',').map((a: string) => a.trim()).filter(Boolean) };
  }
  if (env.WASM4PM_MEMBRANE_PERSIST) {
    const existing = (config.membrane as Record<string, unknown>) ?? {};
    const envelopes = (existing.envelopes as Record<string, unknown>) ?? {};
    config.membrane = { ...existing, envelopes: { ...envelopes, persist: env.WASM4PM_MEMBRANE_PERSIST === 'true' } };
  }
  if (env.WASM4PM_MEMBRANE_PATH) {
    const existing = (config.membrane as Record<string, unknown>) ?? {};
    const envelopes = (existing.envelopes as Record<string, unknown>) ?? {};
    config.membrane = { ...existing, envelopes: { ...envelopes, path: env.WASM4PM_MEMBRANE_PATH } };
  }
  if (env.WASM4PM_MEMBRANE_ACTOR_ESCALATE) {
    const v = parseFloat(env.WASM4PM_MEMBRANE_ACTOR_ESCALATE);
    if (Number.isNaN(v) || v < 0 || v > 1) throw new Error(`Invalid WASM4PM_MEMBRANE_ACTOR_ESCALATE: "${env.WASM4PM_MEMBRANE_ACTOR_ESCALATE}" must be a number in [0, 1]`);
    const existing = (config.membrane as Record<string, unknown>) ?? {};
    const thresholds = (existing.thresholds as Record<string, unknown>) ?? {};
    config.membrane = { ...existing, thresholds: { ...thresholds, actor_anomaly_escalate: v } };
  }
  if (env.WASM4PM_MEMBRANE_AUTOML_ESCALATE) {
    const v = parseFloat(env.WASM4PM_MEMBRANE_AUTOML_ESCALATE);
    if (Number.isNaN(v) || v < 0 || v > 1) throw new Error(`Invalid WASM4PM_MEMBRANE_AUTOML_ESCALATE: "${env.WASM4PM_MEMBRANE_AUTOML_ESCALATE}" must be a number in [0, 1]`);
    const existing = (config.membrane as Record<string, unknown>) ?? {};
    const thresholds = (existing.thresholds as Record<string, unknown>) ?? {};
    config.membrane = { ...existing, thresholds: { ...thresholds, automl_escalate: v } };
  }

  // --- Prediction drift environment variables ---
  if (env.WASM4PM_PREDICTION_DRIFT_THRESHOLD) {
    const v = parseFloat(env.WASM4PM_PREDICTION_DRIFT_THRESHOLD);
    if (Number.isNaN(v) || v <= 0 || v > 1) {
      throw new Error(
        `Invalid WASM4PM_PREDICTION_DRIFT_THRESHOLD: "${env.WASM4PM_PREDICTION_DRIFT_THRESHOLD}" must be a number in (0, 1]`
      );
    }
    const existing = (config.prediction as Record<string, unknown>) ?? {};
    const drift = (existing.drift as Record<string, unknown>) ?? {};
    config.prediction = { ...existing, drift: { ...drift, threshold: v } };
  }
  if (env.WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA) {
    const v = parseFloat(env.WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA);
    if (Number.isNaN(v) || v <= 0 || v > 1) {
      throw new Error(
        `Invalid WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: "${env.WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA}" must be a number in (0, 1]`
      );
    }
    const existing = (config.prediction as Record<string, unknown>) ?? {};
    const drift = (existing.drift as Record<string, unknown>) ?? {};
    config.prediction = { ...existing, drift: { ...drift, ewma_alpha: v } };
  }

  if (env.WASM4PM_PREDICTION_DRIFT_WINDOW) {
    const w = parseInt(env.WASM4PM_PREDICTION_DRIFT_WINDOW, 10);
    // CRITICAL: Only accept valid integers, reject NaN
    if (Number.isNaN(w)) {
      throw new Error(
        `Invalid WASM4PM_PREDICTION_DRIFT_WINDOW: "${env.WASM4PM_PREDICTION_DRIFT_WINDOW}" is not a valid integer`
      );
    }
    // Validate range: driftWindowSize must be > 0
    if (w <= 0) {
      throw new Error(`Invalid WASM4PM_PREDICTION_DRIFT_WINDOW: ${w} must be greater than 0`);
    }
    config.prediction = { ...(config.prediction as Record<string, unknown>), driftWindowSize: w };
  }

  return config;
}

function parseCliOverrides(cli: CliOverrides): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  if (cli.profile) {
    config.execution = { profile: cli.profile };
  }
  if (cli.outputFormat || cli.outputDestination) {
    const output: Record<string, unknown> = {};
    if (cli.outputFormat) output.format = cli.outputFormat;
    if (cli.outputDestination) output.destination = cli.outputDestination;
    config.output = output;
  }
  if (cli.watchEnabled !== undefined) {
    config.watch = { enabled: cli.watchEnabled };
  }
  if (cli.algorithm) {
    config.algorithm = { name: cli.algorithm, parameters: cli.algorithmParams ?? {} };
  }
  if (cli.sinkKind || cli.sinkPath || cli.sinkUrl) {
    const sink: Record<string, unknown> = {};
    if (cli.sinkKind) sink.kind = cli.sinkKind;
    if (cli.sinkPath) sink.path = cli.sinkPath;
    if (cli.sinkUrl) sink.url = cli.sinkUrl;
    config.sink = sink;
  }
  if (
    cli.predictionEnabled !== undefined ||
    cli.predictionTasks ||
    cli.predictionActivityKey ||
    cli.predictionNgramOrder !== undefined ||
    cli.predictionDriftWindow !== undefined
  ) {
    const prediction: Record<string, unknown> = {};
    if (cli.predictionEnabled !== undefined) prediction.enabled = cli.predictionEnabled;
    if (cli.predictionTasks) prediction.tasks = cli.predictionTasks;
    if (cli.predictionActivityKey) prediction.activityKey = cli.predictionActivityKey;
    if (cli.predictionNgramOrder !== undefined) prediction.ngramOrder = cli.predictionNgramOrder;
    if (cli.predictionDriftWindow !== undefined)
      prediction.driftWindowSize = cli.predictionDriftWindow;
    config.prediction = prediction;
  }
  if (cli.mlEnabled !== undefined || cli.mlTasks) {
    const ml: Record<string, unknown> = {};
    if (cli.mlEnabled !== undefined) ml.enabled = cli.mlEnabled;
    if (cli.mlTasks) ml.tasks = cli.mlTasks;
    config.ml = ml;
  }
  if (
    cli.rlEnabled !== undefined ||
    cli.rlAgents ||
    cli.rlLearningRate !== undefined ||
    cli.rlDiscountFactor !== undefined ||
    cli.rlEpsilon !== undefined
  ) {
    const rl: Record<string, unknown> = {};
    if (cli.rlEnabled !== undefined) rl.enabled = cli.rlEnabled;
    if (cli.rlAgents) rl.agents = cli.rlAgents;
    if (cli.rlLearningRate !== undefined) rl.learning_rate = cli.rlLearningRate;
    if (cli.rlDiscountFactor !== undefined) rl.discount_factor = cli.rlDiscountFactor;
    if (cli.rlEpsilon !== undefined) rl.epsilon = cli.rlEpsilon;
    config.rl = rl;
  }

  return config;
}

/**
 * Deep-merge multiple objects. Later values override earlier ones.
 * Only plain objects are recursed into; arrays and primitives are replaced.
 */
function deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const obj of objects) {
    if (!obj) continue;
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Check a resolved config for warnings (not errors).
 * Returns an array of warnings that don't prevent execution but may indicate
 * suboptimal choices (e.g., aggressive k for clustering a small log).
 *
 * @param config The resolved configuration
 * @param logSize Optional: estimated event log size for better warnings
 * @returns Array of { field, warning } objects
 */
export function checkConfigWarnings(
  config: Partial<Config>,
  logSize?: number
): Array<{ field: string; warning: string }> {
  const warnings: Array<{ field: string; warning: string }> = [];

  // Algorithm profile compatibility
  if (config.algorithm?.name && config.execution?.profile) {
    const result = validateAlgorithmProfile(config.algorithm.name, config.execution.profile as any);
    if (!result.compatible && result.warning) {
      warnings.push({ field: 'algorithm.name', warning: result.warning });
    }
  }

  // ML configuration warnings
  warnings.push(...validateMlConfig(config, logSize));

  // RL configuration warnings
  warnings.push(...validateRlConfig(config));

  // Prediction configuration warnings
  warnings.push(...validatePredictionConfig(config));

  return warnings;
}

/**
 * Get example TOML configuration string.
 */
export function getExampleTomlConfig(): string {
  return `# wasm4pm Configuration
# Place at: ./wasm4pm.toml or ~/.wasm4pm/wasm4pm.toml

schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "file"
# path = "./events.xes"

[sink]
kind = "stdout"
# path = "./output.pnml"

[algorithm]
name = "dfg"

[algorithm.parameters]

[execution]
profile = "balanced"   # fast | balanced | quality | stream
timeout = 300000       # ms (5 min)
# maxMemory = 1073741824  # bytes (1 GB)

[observability]
logLevel = "info"      # debug | info | warn | error
metricsEnabled = false

[observability.otel]
enabled = false
exporter = "otlp"      # otlp | console | none
# endpoint = "http://localhost:4318"
required = false

[watch]
enabled = false
poll_interval = 1000   # ms
# checkpoint_dir = "./.wasm4pm/checkpoints"

[output]
format = "human"       # human | json
destination = "stdout"
pretty = true
colorize = true

[prediction]
enabled = false
activityKey = "concept:name"
ngramOrder = 2           # 2–5
driftWindowSize = 10
# tasks = ["next_activity", "remaining_time", "drift", "outcome", "features", "resource"]
tasks = []

[prediction.drift]
ewma_alpha = 0.2   # EWMA smoothing factor in (0, 1]
threshold  = 0.3   # drift threshold in (0, 1]

# ---------------------------------------------------------------------------
# ML analysis (classify / cluster / forecast / anomaly / regress / pca)
# ---------------------------------------------------------------------------
[ml]
enabled    = false
algorithms = ["classify", "cluster", "forecast"]   # alias of "tasks"

[ml.classify]
model     = "decision_tree"   # decision_tree | naive_bayes | logistic_regression | knn
targetKey = "outcome"
k         = 5                 # only used when model = "knn"

[ml.cluster]
method = "kmeans"             # kmeans | dbscan | hierarchical
k      = 5
eps    = 1.0                  # DBSCAN ε

[ml.forecast]
method            = "linear"  # linear | exponential | polynomial
periods           = 5
polynomialDegree  = 2

[ml.anomaly]
method    = "ema"             # ema | isolation_forest | zscore
alpha     = 0.3
threshold = 2.5

[ml.regress]
method    = "linear"          # linear | polynomial | ridge
targetKey = "outcome"
lambda    = 0.0               # L2 strength (ridge only)

[ml.pca]
nComponents = 2

# ---------------------------------------------------------------------------
# RL system (tabular TD agents + LinUCB algorithm-selector)
# ---------------------------------------------------------------------------
[rl]
enabled         = false
agents          = ["QLearning", "SARSA", "DoubleQLearning"]
learning_rate   = 0.1     # α in (0, 1]
discount_factor = 0.99    # γ in [0, 1]
epsilon         = 0.1     # ε-greedy exploration in [0, 1]

[rl.convergence]
min_cycles                = 50
target_reward_improvement = 0.05
window_size               = 10

# LinUCB / GPU dispatch (algorithm-selector)
gpu_enabled      = false
linucb_lambda    = 1.0
ucb1_exploration = 1.4142  # √2

# ---------------------------------------------------------------------------
# AutoMembrane — pre-execution 5-layer conformance membrane
# Layers: actor → object → route → automl → custody
# Set enabled = true to activate the membrane for all algorithm executions.
# ---------------------------------------------------------------------------
# [membrane]
# enabled = false
# custody_actions = ["approve", "release", "transfer"]   # "delete" is also valid
#
# [membrane.thresholds]
# actor_anomaly_escalate = 0.7   # score above which actor layer escalates
# actor_anomaly_warn     = 0.4   # score above which actor layer warns
# route_match_allow      = 0.5   # score below which route layer allows
# automl_escalate        = 0.9   # score above which automl layer escalates
# automl_warn            = 0.7   # score above which automl layer warns
#
# [membrane.drift]
# stable_threshold   = 0.10
# moderate_threshold = 0.25
# high_threshold     = 0.50
# severe_threshold   = 0.75
#
# [membrane.envelopes]
# persist = true
# path    = ".wasm4pm/envelopes"
`;
}

/**
 * Get example .env file string showing every supported WASM4PM_* variable.
 */
export function getExampleEnvFile(): string {
  return `# wasm4pm environment variables (.env)
# Place at: ./.env or ~/.wasm4pm/.env

# --- Core ---
WASM4PM_PROFILE=balanced              # fast | balanced | quality | stream
WASM4PM_ALGORITHM=dfg
WASM4PM_OUTPUT_FORMAT=human           # human | json
WASM4PM_OUTPUT_DESTINATION=stdout
WASM4PM_LOG_LEVEL=info
WASM4PM_WATCH=false
WASM4PM_SOURCE_KIND=file
WASM4PM_SINK_KIND=stdout

# --- OpenTelemetry ---
WASM4PM_OTEL_ENABLED=false
WASM4PM_OTEL_ENDPOINT=http://localhost:4318

# --- Prediction ---
WASM4PM_PREDICTION_ENABLED=false
WASM4PM_PREDICTION_TASKS=next_activity,remaining_time,drift
WASM4PM_PREDICTION_ACTIVITY_KEY=concept:name
WASM4PM_PREDICTION_NGRAM_ORDER=2      # integer in [2, 5]
WASM4PM_PREDICTION_DRIFT_WINDOW=10    # positive integer
WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA=0.2  # number in (0, 1]
WASM4PM_PREDICTION_DRIFT_THRESHOLD=0.3   # number in (0, 1]

# --- ML ---
WASM4PM_ML_ENABLED=false
WASM4PM_ML_ALGORITHMS=classify,cluster,forecast

# --- RL ---
WASM4PM_RL_ENABLED=false
WASM4PM_RL_AGENTS=QLearning,SARSA
WASM4PM_RL_LEARNING_RATE=0.1          # α in (0, 1]
WASM4PM_RL_DISCOUNT_FACTOR=0.99       # γ in [0, 1]
WASM4PM_RL_EPSILON=0.1                # ε in [0, 1]
`;
}

/**
 * Get a preset example config suitable for one of the standard execution profiles.
 *
 * Useful for `wpm init --preset fast|balanced|quality` and as documentation.
 */
export function getExamplePresetConfig(preset: 'fast' | 'balanced' | 'quality'): string {
  switch (preset) {
    case 'fast':
      return `# wasm4pm — "fast" preset (latency-optimised)
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "file"

[sink]
kind = "stdout"

[algorithm]
name = "dfg"

[execution]
profile = "fast"
timeout = 60000

[ml]
enabled = false

[rl]
enabled = false

[prediction]
enabled = false
`;
    case 'balanced':
      return `# wasm4pm — "balanced" preset
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "file"

[sink]
kind = "stdout"

[algorithm]
name = "heuristic_miner"

[execution]
profile = "balanced"

[ml]
enabled = true
tasks = ["classify", "anomaly"]

[ml.classify]
model = "decision_tree"

[ml.anomaly]
method = "ema"

[prediction]
enabled = true
tasks = ["next_activity", "drift"]

[prediction.drift]
ewma_alpha = 0.2
`;
    case 'quality':
      return `# wasm4pm — "quality" preset (accuracy-optimised, longer runtime)
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "file"

[sink]
kind = "stdout"

[algorithm]
name = "ilp"

[execution]
profile = "quality"
timeout = 1800000

[ml]
enabled = true
tasks = ["classify", "cluster", "forecast", "anomaly", "regress", "pca"]

[ml.classify]
model = "logistic_regression"

[ml.cluster]
method = "kmeans"
k = 8

[ml.forecast]
method = "polynomial"
polynomialDegree = 3
periods = 12

[ml.regress]
method = "ridge"
lambda = 0.5

[ml.pca]
nComponents = 4

[rl]
enabled = true
agents = ["QLearning", "SARSA", "DoubleQLearning", "ExpectedSARSA"]
learning_rate = 0.05
discount_factor = 0.99
epsilon = 0.05

[rl.convergence]
min_cycles = 100
target_reward_improvement = 0.01
window_size = 20

[prediction]
enabled = true
tasks = ["next_activity", "remaining_time", "outcome", "drift"]
ngramOrder = 4

[prediction.drift]
ewma_alpha = 0.1
threshold = 0.2
`;
  }
}

/**
 * Get example JSON configuration string.
 */
export function getExampleJsonConfig(): string {
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      version: '26.4.5',
      source: { kind: 'file' },
      sink: { kind: 'stdout' },
      algorithm: { name: 'dfg', parameters: {} },
      execution: { profile: 'balanced', timeout: 300000 },
      observability: {
        logLevel: 'info',
        metricsEnabled: false,
        otel: { enabled: true, exporter: 'otlp', required: false },
      },
      watch: { enabled: false, poll_interval: 1000 },
      output: { format: 'human', destination: 'stdout', pretty: true, colorize: true },
      prediction: {
        enabled: false,
        activityKey: 'concept:name',
        ngramOrder: 2,
        driftWindowSize: 10,
        tasks: [],
      },
    },
    null,
    2
  );
}
