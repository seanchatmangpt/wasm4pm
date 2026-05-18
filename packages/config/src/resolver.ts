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

  for (const dir of searchPaths) {
    // Try TOML first (higher priority)
    const tomlPath = path.join(dir, 'wasm4pm.toml');
    if (existsSync(tomlPath)) {
      try {
        const content = await fs.readFile(tomlPath, 'utf-8');
        fileLayer = toml.parse(content);
        filePath = tomlPath;
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

  // Validate the merged config — augment Zod errors with the config file path so
  // the user knows which file to fix rather than seeing an anonymous field path.
  let validated: BaseConfig;
  try {
    validated = validate(merged) as BaseConfig;
  } catch (validationError) {
    if (validationError instanceof Error && filePath) {
      throw new Error(
        `${validationError.message}\n\n` +
        `  Config file: ${filePath}\n` +
        `  Run "wpm init --force" to reset to a valid default configuration.`
      );
    }
    throw validationError;
  }

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

/**
 * Validate an environment variable value before processing.
 * Rejects:
 * - Values containing null bytes (\x00)
 * - Values exceeding 1KB (prevents buffer exhaustion)
 * - Values with suspicious control characters
 *
 * @param varName - The environment variable name (for error reporting)
 * @param value - The value to validate
 * @throws Error if validation fails
 */
function validateEnvValue(varName: string, value: string): void {
  // Reject null bytes (string terminator injection)
  if (value.includes('\x00')) {
    throw new Error(
      `Invalid environment variable ${varName}: contains null byte (potential injection).`
    );
  }

  // Reject excessively long values (DOS prevention)
  if (value.length > 1024) {
    throw new Error(
      `Invalid environment variable ${varName}: exceeds 1KB limit (${value.length} bytes). ` +
        `Possible buffer exhaustion attack.`
    );
  }

  // Reject suspicious control characters (aside from whitespace)
  const suspiciousChars = /[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/;
  if (suspiciousChars.test(value)) {
    throw new Error(
      `Invalid environment variable ${varName}: contains unexpected control characters. ` +
        `Possible injection attempt.`
    );
  }
}

function parseEnvConfig(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // Pre-validate all WASM4PM_* variables
  const wasm4pmVars = Object.entries(env).filter(([k]) => k.startsWith('WASM4PM_'));
  for (const [varName, value] of wasm4pmVars) {
    if (value !== undefined) {
      validateEnvValue(varName, value);
    }
  }

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
    const result = validateAlgorithmProfile(config.algorithm.name, config.execution.profile);
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
kind = "file"          # file | stream | http
# path = "./events.xes"

[sink]
kind = "stdout"        # stdout | file | http
# path = "./output.pnml"

[algorithm]
name = "dfg"           # dfg | heuristic | inductive | alpha | ilp | genetic | pso | astar | hill-climbing | simulated-annealing | ant-colony | declare | skeleton | simd-dfg | hierarchical-dfg | smart-engine

[algorithm.parameters]

[execution]
profile = "balanced"   # fast | balanced | quality | stream
timeout = 300000       # ms (5 min)
# maxMemory = 1073741824  # bytes (1 GB)

[observability]
logLevel = "info"      # debug | info | warn | error
metricsEnabled = false # true | false

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
destination = "stdout" # stdout | stderr | <file path>
pretty = true          # true | false
colorize = true        # true | false (disable for CI/pipes)

[prediction]
enabled = false
activityKey = "concept:name"  # XES attribute name used to identify activities
ngramOrder = 2           # 2–5 (n-gram order for next-activity prediction)
driftWindowSize = 10     # positive integer (sliding window size for drift detection)
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
# Copy this file to .env and adjust values as needed.
# Place at: ./.env or ~/.wasm4pm/.env
#
# Precedence: CLI args > wasm4pm.toml > wasm4pm.json > ENV vars > defaults

# ==============================================================================
# CORE
# ==============================================================================
WASM4PM_PROFILE=balanced              # fast | balanced | quality | stream
WASM4PM_ALGORITHM=dfg                 # dfg | heuristic_miner | inductive_miner | ilp | genetic_algorithm | ...
WASM4PM_OUTPUT_FORMAT=human           # human | json
WASM4PM_OUTPUT_DESTINATION=stdout     # stdout | stderr | /path/to/file
WASM4PM_LOG_LEVEL=info                # debug | info | warn | error
WASM4PM_WATCH=false                   # true | false
WASM4PM_SOURCE_KIND=file              # file | stream | http
WASM4PM_SINK_KIND=stdout              # stdout | file | http

# ==============================================================================
# OPENTELEMETRY
# ==============================================================================
WASM4PM_OTEL_ENABLED=false
WASM4PM_OTEL_ENDPOINT=http://localhost:4318   # OTLP HTTP collector URL

# ==============================================================================
# PREDICTION (predictive process monitoring)
# Six perspectives: next_activity | remaining_time | outcome | drift | features | resource
# ==============================================================================
WASM4PM_PREDICTION_ENABLED=false
WASM4PM_PREDICTION_TASKS=next_activity,remaining_time,drift
WASM4PM_PREDICTION_ACTIVITY_KEY=concept:name  # XES standard attribute for activity names
WASM4PM_PREDICTION_NGRAM_ORDER=2              # integer in [2, 5]; higher = more context
WASM4PM_PREDICTION_DRIFT_WINDOW=10            # positive integer; sliding window size for drift
WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA=0.2       # number in (0, 1]; higher = more reactive
WASM4PM_PREDICTION_DRIFT_THRESHOLD=0.3        # number in (0, 1]; drift score alert threshold

# ==============================================================================
# ML (machine learning analysis)
# Tasks: classify | cluster | forecast | anomaly | regress | pca
# ==============================================================================
WASM4PM_ML_ENABLED=false
WASM4PM_ML_ALGORITHMS=classify,cluster,forecast

# ==============================================================================
# RL (reinforcement learning orchestration)
# Agents: QLearning | SARSA | DoubleQLearning | ExpectedSARSA | REINFORCE
# ==============================================================================
WASM4PM_RL_ENABLED=false
WASM4PM_RL_AGENTS=QLearning,SARSA
WASM4PM_RL_LEARNING_RATE=0.1          # α in (0, 1]; higher = faster but less stable
WASM4PM_RL_DISCOUNT_FACTOR=0.99       # γ in [0, 1]; higher = more foresighted
WASM4PM_RL_EPSILON=0.1                # ε-greedy exploration in [0, 1]

# ==============================================================================
# MEMBRANE (pre-execution conformance membrane — 5 layers)
# Layers: actor → object → route → automl → custody
# ==============================================================================
WASM4PM_MEMBRANE_ENABLED=false
# WASM4PM_MEMBRANE_CUSTODY_ACTIONS=approve,release,transfer
# WASM4PM_MEMBRANE_PERSIST=false
# WASM4PM_MEMBRANE_PATH=.wasm4pm/envelopes
# WASM4PM_MEMBRANE_ACTOR_ESCALATE=0.7   # anomaly score above which actor layer escalates
# WASM4PM_MEMBRANE_AUTOML_ESCALATE=0.9  # score above which automl layer escalates
`;
}

/**
 * Get a preset example config suitable for one of the standard execution profiles.
 *
 * Presets:
 *   fast        — DFG discovery, minimal overhead, sub-second, no ML/prediction
 *   balanced    — Heuristic miner, ML classify+anomaly, next-activity prediction
 *   quality     — ILP/genetic, full ML suite, all prediction tasks, RL orchestration
 *   conformance — Alignments-based fitness check against a normative model
 *   streaming   — SIMD streaming DFG, drift detection, real-time log analysis
 *
 * Useful for `wpm init --preset <preset>` and as documentation.
 */
export function getExamplePresetConfig(preset: 'fast' | 'balanced' | 'quality' | 'conformance' | 'streaming'): string {
  switch (preset) {
    case 'fast':
      return `# wasm4pm — "fast" preset (latency-optimised)
# Purpose: sub-second process discovery on any log size. No ML, no prediction.
# Van der Aalst quality trade-offs: high fitness, low precision, low generalization.
# Best for: first look at a new log; real-time dashboards; logs with 1M+ events.
# Next step: run  wpm explain dfg  to understand the trade-offs before committing.
#
# Generated by: wpm init --preset fast
# Docs: https://github.com/seanchatmangpt/wasm4pm/tree/main/docs/reference/config-schema.md
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

# ---------------------------------------------------------------------------
# SOURCE — where to read the event log
# ---------------------------------------------------------------------------
[source]
kind = "file"          # file | stream | http
# path = "./events.xes"   # required when kind = "file"; omit for wpm run <log.xes>

# ---------------------------------------------------------------------------
# SINK — where to write results
# ---------------------------------------------------------------------------
[sink]
kind = "stdout"        # stdout | file | http
# path = "./output.json"  # required when kind = "file"

# ---------------------------------------------------------------------------
# ALGORITHM — discovery algorithm
# For "fast" preset, DFG is the only sensible choice:
#   speed score 5/100 (fastest), quality score 30/100, output: DFG
#   Alternative: process_skeleton (even smaller output, speed score 3)
# ---------------------------------------------------------------------------
[algorithm]
name = "dfg"           # dfg | process_skeleton | simd_streaming_dfg

[algorithm.parameters]
# activity_key = "concept:name"   # XES standard attribute for activity names

# ---------------------------------------------------------------------------
# EXECUTION — runtime profile controls which WASM feature set is loaded
# fast profile: loads only basic discovery + conformance (~1 MB subset)
# ---------------------------------------------------------------------------
[execution]
profile = "fast"       # fast | balanced | quality | stream
timeout = 60000        # ms — 60 s is ample for DFG on any reasonable log

# ---------------------------------------------------------------------------
# OBSERVABILITY — logging and OpenTelemetry
# ---------------------------------------------------------------------------
[observability]
logLevel = "warn"      # debug | info | warn | error — "warn" reduces noise
metricsEnabled = false

[observability.otel]
enabled = false        # set true + endpoint to send spans to Jaeger/Tempo
exporter = "otlp"
required = false

# ---------------------------------------------------------------------------
# OUTPUT — result format
# ---------------------------------------------------------------------------
[output]
format = "human"       # human (coloured) | json (machine-readable)
destination = "stdout"
pretty = true
colorize = true        # set false for CI / pipes

# ---------------------------------------------------------------------------
# ML / RL / PREDICTION — all disabled in "fast" preset for minimum overhead
# ---------------------------------------------------------------------------
[ml]
enabled = false

[rl]
enabled = false

[prediction]
enabled = false
tasks = []
`;
    case 'balanced':
      return `# wasm4pm — "balanced" preset
# Purpose: good-quality process discovery + ML classification + next-activity prediction.
# Van der Aalst quality trade-offs:
#   heuristic_miner — medium fitness (filters noise), medium precision, high generalization.
# Best for: operational process analysis; noisy real-world logs; daily monitoring.
# Next step: run  wpm explain heuristic  for detailed algorithm information.
#
# Generated by: wpm init --preset balanced
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

# ---------------------------------------------------------------------------
# SOURCE / SINK
# ---------------------------------------------------------------------------
[source]
kind = "file"          # file | stream | http
# path = "./events.xes"

[sink]
kind = "stdout"        # stdout | file | http

# ---------------------------------------------------------------------------
# ALGORITHM
# heuristic_miner: speed 25/100, quality 50/100, output: DFG
# dependency_threshold: 0.2–0.4 for real logs (0.8 filters almost everything)
# ---------------------------------------------------------------------------
[algorithm]
name = "heuristic_miner"   # heuristic_miner | inductive_miner | alpha_plus_plus

[algorithm.parameters]
# activity_key = "concept:name"
# dependency_threshold = 0.3   # lower = more edges shown; higher = sparser model

# ---------------------------------------------------------------------------
# EXECUTION
# balanced profile: heuristic + ML algorithms available; SIMD streaming enabled
# ---------------------------------------------------------------------------
[execution]
profile = "balanced"   # fast | balanced | quality | stream
timeout = 300000       # ms — 5 min

# ---------------------------------------------------------------------------
# OBSERVABILITY
# ---------------------------------------------------------------------------
[observability]
logLevel = "info"      # debug | info | warn | error
metricsEnabled = false

[observability.otel]
enabled = false
exporter = "otlp"
# endpoint = "http://localhost:4318"   # OTLP HTTP collector
required = false

# ---------------------------------------------------------------------------
# OUTPUT
# ---------------------------------------------------------------------------
[output]
format = "human"       # human | json
destination = "stdout"
pretty = true
colorize = true

# ---------------------------------------------------------------------------
# ML — machine learning analysis
# classify: label traces as conforming/deviating or by outcome attribute
# anomaly: flag statistically unusual traces for investigation
# ---------------------------------------------------------------------------
[ml]
enabled = true
tasks = ["classify", "anomaly"]

[ml.classify]
model = "decision_tree"  # decision_tree | naive_bayes | logistic_regression | knn
targetKey = "outcome"    # event/trace attribute to predict
k = 5                    # only used when model = "knn"

[ml.anomaly]
method = "ema"           # ema | isolation_forest | zscore
alpha = 0.3              # EMA smoothing factor — higher = more reactive
threshold = 2.5          # anomaly score threshold (z-score or EMA deviation)

# ---------------------------------------------------------------------------
# PREDICTION — predictive process monitoring (van der Aalst 6 perspectives)
# next_activity: predict the next event in a running case (n-gram model)
# drift:         detect concept drift via EWMA on activity distribution
# ---------------------------------------------------------------------------
[prediction]
enabled = true
activityKey = "concept:name"   # XES standard attribute for activity names
ngramOrder = 2                 # 2–5; higher = more context, needs more data
driftWindowSize = 10           # traces per sliding window for drift detection
tasks = ["next_activity", "drift"]

[prediction.drift]
ewma_alpha = 0.2    # EWMA smoothing — 0.1 (stable) to 0.5 (reactive)
threshold  = 0.3    # Jaccard distance threshold for drift alert in (0, 1]

# ---------------------------------------------------------------------------
# RL / MEMBRANE — disabled in balanced preset
# ---------------------------------------------------------------------------
[rl]
enabled = false

[watch]
enabled = false
poll_interval = 1000   # ms
`;
    case 'quality':
      return `# wasm4pm — "quality" preset (accuracy-optimised, longer runtime)
# Purpose: highest-quality process model + full ML suite + RL orchestration.
# Van der Aalst quality trade-offs:
#   ilp — high fitness (optimal), high precision (ILP penalises spurious transitions),
#          medium generalization (can overfit small logs), low simplicity (larger Petri nets).
# Best for: compliance audits; regulatory reporting; research; benchmarking.
# Trade-off: runtime can be 10–30 min on large logs — use "balanced" for daily use.
# Next step: run  wpm explain ilp  for detailed algorithm information.
#
# Generated by: wpm init --preset quality
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "file"          # file | stream | http
# path = "./events.xes"

[sink]
kind = "stdout"

[algorithm]
name = "ilp"           # ilp | genetic_algorithm | a_star | aco | pso

[algorithm.parameters]
# activity_key = "concept:name"

[execution]
profile = "quality"    # quality profile unlocks all 38 kernel-registered algorithms
timeout = 1800000      # ms — 30 min; ILP/genetic can be slow on large logs

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
    case 'conformance':
      return `# wasm4pm — "conformance" preset
# Purpose: measure how well a real event log conforms to a normative process model.
# Uses token-based replay for fitness and ET-conformance for precision.
# Run: wpm conformance -i event_log.xes -m normative_model.pnml
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "file"
# path = "./event_log.xes"

[sink]
kind = "stdout"

# Conformance checking uses ETConformance + alignments for exact fitness/precision.
# For large logs, start with etconformance_precision (fast).
# For gold-standard results, use alignments (more expensive).
# Typical healthy range: fitness > 0.85, precision > 0.70.
[algorithm]
name = "etconformance_precision"  # etconformance_precision | alignments | heuristic_miner

[execution]
profile = "quality"    # quality profile makes all conformance algorithms available
timeout = 600000       # 10 minutes — alignments can be expensive for large logs

[observability]
logLevel = "info"
metricsEnabled = true  # Emit fitness/precision metrics

[observability.otel]
enabled = false
exporter = "otlp"
required = false

[watch]
enabled = false
poll_interval = 1000

[output]
format = "human"
destination = "stdout"
pretty = true
colorize = true

[prediction]
enabled = false
tasks = []

[ml]
enabled = false

[rl]
enabled = false
`;
    case 'streaming':
      return `# wasm4pm — "streaming" preset
# Purpose: real-time process monitoring on high-volume event streams.
# Uses SIMD-accelerated streaming DFG + EWMA drift detection.
# Run: wpm run --config wasm4pm.toml --watch
schema_version = ${SCHEMA_VERSION}
version = "26.4.5"

[source]
kind = "stream"   # stream = read from stdin or a message queue

[sink]
kind = "stdout"

# simd_streaming_dfg is the fastest discovery algorithm (speed score: 2).
# For slightly higher quality at acceptable latency: heuristic_miner (speed: 25).
[algorithm]
name = "simd_streaming_dfg"   # simd_streaming_dfg | dfg | heuristic_miner

[execution]
profile = "stream"    # enables streaming-full feature set + SIMD acceleration
timeout = 0           # 0 = unlimited (streaming never stops voluntarily)

[observability]
logLevel = "warn"     # reduce log noise in high-throughput scenarios
metricsEnabled = true # emit throughput metrics

[observability.otel]
enabled = false
exporter = "otlp"
required = false

[watch]
enabled = true         # re-run model update when config changes
poll_interval = 500    # poll every 500ms (aggressive for streaming scenarios)
# checkpoint_dir = "./.wasm4pm/checkpoints"

[output]
format = "json"        # machine-parseable — useful for downstream consumers
destination = "stdout"
pretty = false
colorize = false

# Drift detection: EWMA on the activity distribution of sliding trace windows.
# Fire a drift event when the Jaccard distance exceeds the threshold.
[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 2
driftWindowSize = 20   # traces per window — larger = more stable, slower response
tasks = ["drift", "next_activity"]

[prediction.drift]
ewma_alpha = 0.3       # more reactive (higher α) for streaming use cases
threshold = 0.25

[ml]
enabled = false        # ML is disabled in stream profile for latency reasons

[rl]
enabled = false
`;
  }
}

/**
 * Serialize a resolved Config object to TOML format.
 * Emits actual resolved values — not a placeholder template.
 */
export function configToToml(config: Config): string {
  const lines: string[] = ['# wasm4pm resolved configuration'];
  lines.push('# Generated by: wpm config export --format toml');
  lines.push('');

  // [source]
  lines.push('[source]');
  lines.push(`kind = "${config.source.kind}"`);
  if (config.source.path) lines.push(`path = "${config.source.path}"`);
  if (config.source.url) lines.push(`url = "${config.source.url}"`);
  lines.push('');

  // [sink]
  lines.push('[sink]');
  lines.push(`kind = "${config.sink.kind}"`);
  if (config.sink.path) lines.push(`path = "${config.sink.path}"`);
  if (config.sink.url) lines.push(`url = "${config.sink.url}"`);
  lines.push('');

  // [algorithm]
  lines.push('[algorithm]');
  lines.push(`name = "${config.algorithm.name}"`);
  const params = config.algorithm.parameters ?? {};
  if (Object.keys(params).length > 0) {
    lines.push('');
    lines.push('[algorithm.parameters]');
    for (const [k, v] of Object.entries(params)) {
      lines.push(`${k} = ${JSON.stringify(v)}`);
    }
  }
  lines.push('');

  // [execution]
  lines.push('[execution]');
  lines.push(`profile = "${config.execution.profile}"`);
  if (config.execution.timeout !== undefined) lines.push(`timeout = ${config.execution.timeout}`);
  if (config.execution.maxMemory !== undefined) lines.push(`maxMemory = ${config.execution.maxMemory}`);
  lines.push('');

  // [output]
  lines.push('[output]');
  lines.push(`format = "${config.output.format}"`);
  lines.push(`destination = "${config.output.destination}"`);
  lines.push(`pretty = ${config.output.pretty}`);
  lines.push(`colorize = ${config.output.colorize}`);
  lines.push('');

  // [observability]
  lines.push('[observability]');
  lines.push(`logLevel = "${config.observability.logLevel}"`);
  if (config.observability.metricsEnabled !== undefined) {
    lines.push(`metricsEnabled = ${config.observability.metricsEnabled}`);
  }
  if (config.observability.otel) {
    lines.push('');
    lines.push('[observability.otel]');
    lines.push(`enabled = ${config.observability.otel.enabled}`);
    if (config.observability.otel.exporter) {
      lines.push(`exporter = "${config.observability.otel.exporter}"`);
    }
    if (config.observability.otel.endpoint) {
      lines.push(`endpoint = "${config.observability.otel.endpoint}"`);
    }
    if (config.observability.otel.required !== undefined) {
      lines.push(`required = ${config.observability.otel.required}`);
    }
  }
  lines.push('');

  // [watch]
  if (config.watch) {
    lines.push('[watch]');
    lines.push(`enabled = ${config.watch.enabled}`);
    if (config.watch.poll_interval !== undefined) {
      lines.push(`poll_interval = ${config.watch.poll_interval}`);
    }
    if (config.watch.checkpoint_dir) {
      lines.push(`checkpoint_dir = "${config.watch.checkpoint_dir}"`);
    }
    lines.push('');
  }

  // [prediction]
  if (config.prediction) {
    lines.push('[prediction]');
    lines.push(`enabled = ${config.prediction.enabled}`);
    lines.push(`activityKey = "${config.prediction.activityKey}"`);
    lines.push(`ngramOrder = ${config.prediction.ngramOrder}`);
    lines.push(`driftWindowSize = ${config.prediction.driftWindowSize}`);
    const tasks = config.prediction.tasks ?? [];
    lines.push(`tasks = [${tasks.map(t => `"${t}"`).join(', ')}]`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

/**
 * Serialize a resolved Config object to .env format.
 * Emits actual resolved values — not a placeholder template.
 */
export function configToEnv(config: Config): string {
  const lines: string[] = ['# wasm4pm resolved ENV vars'];
  lines.push('# Generated by: wpm config export --format env');
  lines.push('');
  lines.push(`WASM4PM_ALGORITHM="${config.algorithm.name}"`);
  lines.push(`WASM4PM_PROFILE="${config.execution.profile}"`);
  lines.push(`WASM4PM_OUTPUT_FORMAT="${config.output.format}"`);
  lines.push(`WASM4PM_OUTPUT_DESTINATION="${config.output.destination}"`);
  lines.push(`WASM4PM_LOG_LEVEL="${config.observability.logLevel}"`);
  lines.push(`WASM4PM_WATCH="${config.watch?.enabled ?? false}"`);
  lines.push(`WASM4PM_SOURCE_KIND="${config.source.kind}"`);
  lines.push(`WASM4PM_SINK_KIND="${config.sink.kind}"`);
  if (config.observability.otel) {
    lines.push(`WASM4PM_OTEL_ENABLED="${config.observability.otel.enabled}"`);
    if (config.observability.otel.endpoint) {
      lines.push(`WASM4PM_OTEL_ENDPOINT="${config.observability.otel.endpoint}"`);
    }
  }
  if (config.prediction) {
    lines.push(`WASM4PM_PREDICTION_ENABLED="${config.prediction.enabled}"`);
    const tasks = config.prediction.tasks ?? [];
    if (tasks.length > 0) {
      lines.push(`WASM4PM_PREDICTION_TASKS="${tasks.join(',')}"`);
    }
    lines.push(`WASM4PM_PREDICTION_ACTIVITY_KEY="${config.prediction.activityKey}"`);
    lines.push(`WASM4PM_PREDICTION_NGRAM_ORDER="${config.prediction.ngramOrder}"`);
    lines.push(`WASM4PM_PREDICTION_DRIFT_WINDOW="${config.prediction.driftWindowSize}"`);
  }
  return lines.join('\n') + '\n';
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
