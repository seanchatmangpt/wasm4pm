import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as toml from 'toml';
import { validate, SCHEMA_VERSION } from './schema.js';
import { trackProvenance, mergeProvenance } from './provenance.js';
import { hashConfig } from './hash.js';
/**
 * Resolution order (highest to lowest priority):
 *  1. CLI arguments
 *  2. TOML config file (pictl.toml)
 *  3. JSON config file (wasm4pm.json)
 *  4. Environment variables (WASM4PM_* prefix)
 *  5. Defaults
 */
export async function resolveConfig(options) {
    const cliOverrides = options?.cliOverrides ?? {};
    const env = options?.env ?? process.env;
    const searchPaths = options?.configSearchPaths ?? getDefaultSearchPaths();
    // Layer 5: Defaults
    const defaults = getDefaults();
    let provenance = trackProvenance(defaults, 'default');
    // Layer 4: Environment variables
    const envLayer = parseEnvConfig(env);
    const envProvenance = trackProvenance(envLayer, 'env');
    // Layer 3 & 2: File configs (JSON then TOML — TOML wins if both exist)
    let fileLayer = {};
    let fileProvenance = {};
    let filePath;
    let fileSource;
    for (const dir of searchPaths) {
        // Try TOML first (higher priority)
        const tomlPath = path.join(dir, 'pictl.toml');
        if (existsSync(tomlPath)) {
            try {
                const content = await fs.readFile(tomlPath, 'utf-8');
                fileLayer = toml.parse(content);
                filePath = tomlPath;
                fileSource = 'toml';
                fileProvenance = trackProvenance(fileLayer, 'toml', tomlPath);
                break;
            }
            catch (error) {
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
            }
            catch (error) {
                throw new Error(`Failed to parse JSON config at ${jsonPath}: ${error}`);
            }
        }
    }
    // Layer 1: CLI overrides
    const cliLayer = parseCliOverrides(cliOverrides);
    const cliProvenance = trackProvenance(cliLayer, 'cli');
    // Merge layers: defaults ← env ← file ← cli
    const merged = deepMerge(defaults, envLayer, fileLayer, cliLayer);
    // Merge provenance in same order (later wins)
    const mergedProvenance = mergeProvenance(provenance, envProvenance, fileProvenance, cliProvenance);
    // Validate the merged config
    const validated = validate(merged);
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
function getDefaultSearchPaths() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return [process.cwd(), path.join(home, '.wasm4pm')].filter(Boolean);
}
function getDefaults() {
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
function parseEnvConfig(env) {
    const config = {};
    if (env.WASM4PM_PROFILE) {
        config.execution = { profile: env.WASM4PM_PROFILE };
    }
    if (env.WASM4PM_LOG_LEVEL) {
        config.observability = { ...config.observability, logLevel: env.WASM4PM_LOG_LEVEL };
    }
    if (env.WASM4PM_WATCH) {
        config.watch = { enabled: env.WASM4PM_WATCH === 'true' || env.WASM4PM_WATCH === '1' };
    }
    if (env.WASM4PM_OUTPUT_FORMAT) {
        config.output = { ...config.output, format: env.WASM4PM_OUTPUT_FORMAT };
    }
    if (env.WASM4PM_OUTPUT_DESTINATION) {
        config.output = { ...config.output, destination: env.WASM4PM_OUTPUT_DESTINATION };
    }
    if (env.WASM4PM_ALGORITHM) {
        config.algorithm = { ...config.algorithm, name: env.WASM4PM_ALGORITHM };
    }
    if (env.WASM4PM_SINK_KIND) {
        config.sink = { ...config.sink, kind: env.WASM4PM_SINK_KIND };
    }
    if (env.WASM4PM_SOURCE_KIND) {
        config.source = { ...config.source, kind: env.WASM4PM_SOURCE_KIND };
    }
    if (env.WASM4PM_OTEL_ENABLED) {
        const otel = { enabled: env.WASM4PM_OTEL_ENABLED === 'true' || env.WASM4PM_OTEL_ENABLED === '1' };
        config.observability = { ...config.observability, otel };
    }
    if (env.WASM4PM_OTEL_ENDPOINT) {
        const existingOtel = config.observability?.otel ?? {};
        config.observability = {
            ...config.observability,
            otel: { ...existingOtel, endpoint: env.WASM4PM_OTEL_ENDPOINT },
        };
    }
    if (env.WASM4PM_PREDICTION_ENABLED) {
        config.prediction = {
            ...config.prediction,
            enabled: env.WASM4PM_PREDICTION_ENABLED === 'true' || env.WASM4PM_PREDICTION_ENABLED === '1',
        };
    }
    if (env.WASM4PM_PREDICTION_TASKS) {
        config.prediction = {
            ...config.prediction,
            tasks: env.WASM4PM_PREDICTION_TASKS.split(',').map(t => t.trim()).filter(Boolean),
        };
    }
    if (env.WASM4PM_PREDICTION_ACTIVITY_KEY) {
        config.prediction = {
            ...config.prediction,
            activityKey: env.WASM4PM_PREDICTION_ACTIVITY_KEY,
        };
    }
    if (env.WASM4PM_PREDICTION_NGRAM_ORDER) {
        const n = parseInt(env.WASM4PM_PREDICTION_NGRAM_ORDER, 10);
        // CRITICAL: Only accept valid integers, reject NaN silently
        if (Number.isNaN(n)) {
            throw new Error(`Invalid WASM4PM_PREDICTION_NGRAM_ORDER: "${env.WASM4PM_PREDICTION_NGRAM_ORDER}" is not a valid integer`);
        }
        // Validate range: ngramOrder must be 2-5
        if (n < 2 || n > 5) {
            throw new Error(`Invalid WASM4PM_PREDICTION_NGRAM_ORDER: ${n} is out of range [2, 5]`);
        }
        config.prediction = { ...config.prediction, ngramOrder: n };
    }
    if (env.WASM4PM_PREDICTION_DRIFT_WINDOW) {
        const w = parseInt(env.WASM4PM_PREDICTION_DRIFT_WINDOW, 10);
        // CRITICAL: Only accept valid integers, reject NaN
        if (Number.isNaN(w)) {
            throw new Error(`Invalid WASM4PM_PREDICTION_DRIFT_WINDOW: "${env.WASM4PM_PREDICTION_DRIFT_WINDOW}" is not a valid integer`);
        }
        // Validate range: driftWindowSize must be > 0
        if (w <= 0) {
            throw new Error(`Invalid WASM4PM_PREDICTION_DRIFT_WINDOW: ${w} must be greater than 0`);
        }
        config.prediction = { ...config.prediction, driftWindowSize: w };
    }
    return config;
}
function parseCliOverrides(cli) {
    const config = {};
    if (cli.profile) {
        config.execution = { profile: cli.profile };
    }
    if (cli.outputFormat || cli.outputDestination) {
        const output = {};
        if (cli.outputFormat)
            output.format = cli.outputFormat;
        if (cli.outputDestination)
            output.destination = cli.outputDestination;
        config.output = output;
    }
    if (cli.watchEnabled !== undefined) {
        config.watch = { enabled: cli.watchEnabled };
    }
    if (cli.algorithm) {
        config.algorithm = { name: cli.algorithm, parameters: cli.algorithmParams ?? {} };
    }
    if (cli.sinkKind || cli.sinkPath || cli.sinkUrl) {
        const sink = {};
        if (cli.sinkKind)
            sink.kind = cli.sinkKind;
        if (cli.sinkPath)
            sink.path = cli.sinkPath;
        if (cli.sinkUrl)
            sink.url = cli.sinkUrl;
        config.sink = sink;
    }
    if (cli.predictionEnabled !== undefined ||
        cli.predictionTasks ||
        cli.predictionActivityKey ||
        cli.predictionNgramOrder !== undefined ||
        cli.predictionDriftWindow !== undefined) {
        const prediction = {};
        if (cli.predictionEnabled !== undefined)
            prediction.enabled = cli.predictionEnabled;
        if (cli.predictionTasks)
            prediction.tasks = cli.predictionTasks;
        if (cli.predictionActivityKey)
            prediction.activityKey = cli.predictionActivityKey;
        if (cli.predictionNgramOrder !== undefined)
            prediction.ngramOrder = cli.predictionNgramOrder;
        if (cli.predictionDriftWindow !== undefined)
            prediction.driftWindowSize = cli.predictionDriftWindow;
        config.prediction = prediction;
    }
    return config;
}
/**
 * Deep-merge multiple objects. Later values override earlier ones.
 * Only plain objects are recursed into; arrays and primitives are replaced.
 */
function deepMerge(...objects) {
    const result = {};
    for (const obj of objects) {
        if (!obj)
            continue;
        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined || value === null)
                continue;
            if (isPlainObject(value) && isPlainObject(result[key])) {
                result[key] = deepMerge(result[key], value);
            }
            else {
                result[key] = value;
            }
        }
    }
    return result;
}
function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/**
 * Get example TOML configuration string.
 */
export function getExampleTomlConfig() {
    return `# wasm4pm Configuration
# Place at: ./pictl.toml or ~/.wasm4pm/pictl.toml

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
`;
}
/**
 * Get example JSON configuration string.
 */
export function getExampleJsonConfig() {
    return JSON.stringify({
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
    }, null, 2);
}
//# sourceMappingURL=resolver.js.map