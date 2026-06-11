/**
 * mcpp-bridge — maps wasm4pm ResolvedConfig to McpplusRequest fields.
 *
 * The mcpp `extensions` field (BTreeMap<String, Value>) is the forward-
 * compatible slot for wasm4pm config overrides. This module provides three
 * functions:
 *
 *   configToMcppExtensions        — wasm4pm fields → extensions keys
 *   configToConformanceThresholds — execution profile → required_conformance
 *   buildMcppRequest              — full McpplusRequest builder
 *
 * Key namespace convention for extensions:
 *   "wasm4pm.<section>.<field>" — all keys are prefixed to avoid collisions
 *   with other V2 extension producers.
 */

import { z } from 'zod';
import type { Config } from './types.js';

// ---------------------------------------------------------------------------
// Mirror types for the Rust McpplusRequest structures (JSON-serialised form).
// These are TypeScript representations of the Rust structs in
// mcpp-core/src/protocol/request.rs — kept in sync by convention.
// ---------------------------------------------------------------------------

export const objectRefSchema = z.object({
  id: z.string(),
  type: z.string(),
  /** "blake3:<64 hex>" */
  hash: z.string(),
});
export type ObjectRef = z.infer<typeof objectRefSchema>;

/**
 * Five conformance dimensions understood by the mcpp admission gate.
 * All values are thresholds in [0, 1]; absent means "not required".
 */
export const conformanceThresholdsSchema = z.object({
  fitness: z.number().min(0).max(1).optional(),
  precision: z.number().min(0).max(1).optional(),
  lifecycle: z.number().min(0).max(1).optional(),
  cardinality: z.number().min(0).max(1).optional(),
  receipt: z.number().min(0).max(1).optional(),
});
export type ConformanceThresholds = z.infer<typeof conformanceThresholdsSchema>;

export type PolicyOnNonconformance = 'refuse';

export const policySchema = z.object({
  on_nonconformance: z.literal('refuse').optional(),
  proof_pack_required: z.boolean().optional(),
  receipt_required: z.boolean().optional(),
});
export type Policy = z.infer<typeof policySchema>;

export const mcpplusRequestSchema = z.object({
  mcpp_version: z.string(),
  part_id: z.string(),
  route_class: z.string().optional(),
  input_objects: z.array(objectRefSchema),
  required_conformance: conformanceThresholdsSchema.optional(),
  policy: policySchema.optional(),
  trace_parent: z.string().optional(),
  /** Forward-compatible extension slot (V2). Keys: "wasm4pm.<section>.<field>". */
  extensions: z.record(z.string(), z.unknown()).optional(),
});
export type McpplusRequest = z.infer<typeof mcpplusRequestSchema>;

// ---------------------------------------------------------------------------
// MCPP_VERSION constant — must match the Rust constant in protocol/mod.rs
// ---------------------------------------------------------------------------
export const MCPP_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// configToMcppExtensions
// ---------------------------------------------------------------------------

/**
 * Maps a resolved wasm4pm config into a flat `Record<string, unknown>` that
 * can be serialised directly into `McpplusRequest.extensions`.
 *
 * Mapping strategy:
 *   - All keys use the "wasm4pm.<section>.<field>" namespace.
 *   - Optional config sections (ml, rl, prediction, membrane, swarm) are only
 *     included when present and enabled to keep extensions lean.
 *   - The config hash and schema version are always emitted so the receiving
 *     server can fingerprint the exact config that produced the request.
 *
 * @example
 * ```ts
 * const ext = configToMcppExtensions(config);
 * // ext["wasm4pm.algorithm.name"]         === "dfg"
 * // ext["wasm4pm.execution.profile"]      === "balanced"
 * // ext["wasm4pm.config.hash"]            === "<blake3 hex>"
 * ```
 */
export function configToMcppExtensions(config: Config): Record<string, unknown> {
  const ext: Record<string, unknown> = {};

  // --- Core identity ---
  ext['wasm4pm.config.hash'] = config.metadata.hash;
  ext['wasm4pm.config.schema_version'] = config.schemaVersion;
  ext['wasm4pm.config.version'] = config.version;

  // --- Algorithm ---
  ext['wasm4pm.algorithm.name'] = config.algorithm.name;
  if (Object.keys(config.algorithm.parameters).length > 0) {
    ext['wasm4pm.algorithm.parameters'] = config.algorithm.parameters;
  }

  // --- Execution ---
  ext['wasm4pm.execution.profile'] = config.execution.profile;
  if (config.execution.timeout !== undefined) {
    ext['wasm4pm.execution.timeout_ms'] = config.execution.timeout;
  }
  if (config.execution.maxMemory !== undefined) {
    ext['wasm4pm.execution.max_memory_bytes'] = config.execution.maxMemory;
  }

  // --- Source / Sink ---
  ext['wasm4pm.source.kind'] = config.source.kind;
  if (config.source.path !== undefined) ext['wasm4pm.source.path'] = config.source.path;
  if (config.source.url !== undefined) ext['wasm4pm.source.url'] = config.source.url;

  ext['wasm4pm.sink.kind'] = config.sink.kind;
  if (config.sink.path !== undefined) ext['wasm4pm.sink.path'] = config.sink.path;
  if (config.sink.url !== undefined) ext['wasm4pm.sink.url'] = config.sink.url;

  // --- Observability ---
  ext['wasm4pm.observability.log_level'] = config.observability.logLevel;
  ext['wasm4pm.observability.metrics_enabled'] = config.observability.metricsEnabled;
  if (config.observability.otel) {
    ext['wasm4pm.observability.otel.enabled'] = config.observability.otel.enabled;
    ext['wasm4pm.observability.otel.exporter'] = config.observability.otel.exporter;
    if (config.observability.otel.endpoint !== undefined) {
      ext['wasm4pm.observability.otel.endpoint'] = config.observability.otel.endpoint;
    }
  }

  // --- Prediction (only when enabled) ---
  if (config.prediction?.enabled) {
    ext['wasm4pm.prediction.enabled'] = true;
    ext['wasm4pm.prediction.activity_key'] = config.prediction.activityKey;
    ext['wasm4pm.prediction.ngram_order'] = config.prediction.ngramOrder;
    ext['wasm4pm.prediction.drift_window_size'] = config.prediction.driftWindowSize;
    if (config.prediction.tasks.length > 0) {
      ext['wasm4pm.prediction.tasks'] = config.prediction.tasks;
    }
    ext['wasm4pm.prediction.drift.ewma_alpha'] = config.prediction.drift.ewma_alpha;
    ext['wasm4pm.prediction.drift.threshold'] = config.prediction.drift.threshold;
  }

  // --- ML (only when enabled) ---
  if (config.ml?.enabled) {
    ext['wasm4pm.ml.enabled'] = true;
    if (config.ml.tasks.length > 0) {
      ext['wasm4pm.ml.tasks'] = config.ml.tasks;
    }
    // Emit active sub-configs for tasks that are declared
    if (config.ml.tasks.includes('classify')) {
      ext['wasm4pm.ml.classify.model'] = config.ml.classify.model;
      ext['wasm4pm.ml.classify.target_key'] = config.ml.classify.targetKey;
      ext['wasm4pm.ml.classify.k'] = config.ml.classify.k;
    }
    if (config.ml.tasks.includes('cluster')) {
      ext['wasm4pm.ml.cluster.method'] = config.ml.cluster.method;
      ext['wasm4pm.ml.cluster.k'] = config.ml.cluster.k;
      ext['wasm4pm.ml.cluster.eps'] = config.ml.cluster.eps;
    }
    if (config.ml.tasks.includes('forecast')) {
      ext['wasm4pm.ml.forecast.method'] = config.ml.forecast.method;
      ext['wasm4pm.ml.forecast.periods'] = config.ml.forecast.periods;
      ext['wasm4pm.ml.forecast.polynomial_degree'] = config.ml.forecast.polynomialDegree;
    }
    if (config.ml.tasks.includes('anomaly')) {
      ext['wasm4pm.ml.anomaly.method'] = config.ml.anomaly.method;
      ext['wasm4pm.ml.anomaly.alpha'] = config.ml.anomaly.alpha;
      ext['wasm4pm.ml.anomaly.threshold'] = config.ml.anomaly.threshold;
    }
    if (config.ml.tasks.includes('regress')) {
      ext['wasm4pm.ml.regress.method'] = config.ml.regress.method;
      ext['wasm4pm.ml.regress.target_key'] = config.ml.regress.targetKey;
      ext['wasm4pm.ml.regress.lambda'] = config.ml.regress.lambda;
    }
    if (config.ml.tasks.includes('pca')) {
      ext['wasm4pm.ml.pca.n_components'] = config.ml.pca.nComponents;
    }
  }

  // --- RL (only when enabled) ---
  if (config.rl?.enabled) {
    ext['wasm4pm.rl.enabled'] = true;
    ext['wasm4pm.rl.agents'] = config.rl.agents;
    ext['wasm4pm.rl.learning_rate'] = config.rl.learning_rate;
    ext['wasm4pm.rl.discount_factor'] = config.rl.discount_factor;
    ext['wasm4pm.rl.epsilon'] = config.rl.epsilon;
    ext['wasm4pm.rl.convergence.min_cycles'] = config.rl.convergence.min_cycles;
    ext['wasm4pm.rl.convergence.target_reward_improvement'] =
      config.rl.convergence.target_reward_improvement;
    ext['wasm4pm.rl.convergence.window_size'] = config.rl.convergence.window_size;
    ext['wasm4pm.rl.gpu_enabled'] = config.rl.gpu_enabled;
    ext['wasm4pm.rl.linucb_lambda'] = config.rl.linucb_lambda;
    ext['wasm4pm.rl.ucb1_exploration'] = config.rl.ucb1_exploration;
  }

  // --- Membrane (only when enabled) ---
  if (config.membrane?.enabled) {
    ext['wasm4pm.membrane.enabled'] = true;
    ext['wasm4pm.membrane.custody_actions'] = config.membrane.custody_actions;
    ext['wasm4pm.membrane.thresholds.actor_anomaly_escalate'] =
      config.membrane.thresholds.actor_anomaly_escalate;
    ext['wasm4pm.membrane.thresholds.actor_anomaly_warn'] =
      config.membrane.thresholds.actor_anomaly_warn;
    ext['wasm4pm.membrane.thresholds.route_match_allow'] =
      config.membrane.thresholds.route_match_allow;
    ext['wasm4pm.membrane.thresholds.automl_escalate'] =
      config.membrane.thresholds.automl_escalate;
    ext['wasm4pm.membrane.thresholds.automl_warn'] = config.membrane.thresholds.automl_warn;
    ext['wasm4pm.membrane.drift.stable_threshold'] = config.membrane.drift.stable_threshold;
    ext['wasm4pm.membrane.drift.moderate_threshold'] = config.membrane.drift.moderate_threshold;
    ext['wasm4pm.membrane.drift.high_threshold'] = config.membrane.drift.high_threshold;
    ext['wasm4pm.membrane.drift.severe_threshold'] = config.membrane.drift.severe_threshold;
    ext['wasm4pm.membrane.envelopes.persist'] = config.membrane.envelopes.persist;
    ext['wasm4pm.membrane.envelopes.path'] = config.membrane.envelopes.path;
  }

  // --- Swarm (only when present) ---
  if (config.swarm !== undefined) {
    ext['wasm4pm.swarm.max_episodes'] = config.swarm.max_episodes;
    ext['wasm4pm.swarm.convergence_runs'] = config.swarm.convergence_runs;
    ext['wasm4pm.swarm.convergence_threshold'] = config.swarm.convergence_threshold;
    ext['wasm4pm.swarm.worker_model'] = config.swarm.worker_model;
    ext['wasm4pm.swarm.algorithm_ids'] = config.swarm.algorithm_ids;
  }

  return ext;
}

// ---------------------------------------------------------------------------
// configToConformanceThresholds
// ---------------------------------------------------------------------------

/**
 * Maps wasm4pm execution profile to mcpp `ConformanceThresholds`.
 *
 * Profile semantics:
 *
 *   fast      — Only `fitness` is required (0.70). Latency > accuracy.
 *               precision/lifecycle/cardinality/receipt are unconstrained.
 *
 *   balanced  — fitness (0.80) + precision (0.70). Middle ground.
 *
 *   quality   — All five dimensions required at high thresholds.
 *               This is the strictest profile; receipt chain is mandatory.
 *
 *   stream    — fitness only (0.65). Streaming never has full causal/receipt
 *               chains; cardinality tracking is too expensive at rate.
 *
 * If the config carries a `membrane` section, `receipt` is always required
 * regardless of profile, because the membrane emits envelopes that must
 * be chain-linked. The threshold is 1.0 (exact match) in that case.
 */
export function configToConformanceThresholds(config: Config): ConformanceThresholds {
  const profile = config.execution.profile;
  const membraneActive = config.membrane?.enabled === true;

  let thresholds: ConformanceThresholds;

  switch (profile) {
    case 'fast':
      thresholds = {
        fitness: 0.70,
      };
      break;

    case 'balanced':
      thresholds = {
        fitness: 0.80,
        precision: 0.70,
      };
      break;

    case 'quality':
      thresholds = {
        fitness: 0.90,
        precision: 0.85,
        lifecycle: 0.80,
        cardinality: 0.80,
        receipt: 1.0,
      };
      break;

    case 'stream':
      thresholds = {
        fitness: 0.65,
      };
      break;

    default: {
      // Exhaustive check — TypeScript will error if a new profile is added
      // to the schema without updating this switch.
      const _exhaustive: never = profile;
      thresholds = { fitness: 0.70 };
      void _exhaustive;
      break;
    }
  }

  // Membrane override: if AutoMembrane is active, the receipt chain must
  // be present and valid. Enforce receipt: 1.0 regardless of profile.
  if (membraneActive) {
    thresholds = { ...thresholds, receipt: 1.0 };
  }

  return thresholds;
}

// ---------------------------------------------------------------------------
// buildMcppRequest
// ---------------------------------------------------------------------------

/**
 * Builds a complete `McpplusRequest` from a resolved wasm4pm config.
 *
 * The request is assembled as follows:
 *   - `mcpp_version`: frozen at "1.0" (MCPP_VERSION constant)
 *   - `part_id`: caller-supplied identifier for the process-mining part
 *   - `input_objects`: caller-supplied array of ObjectRef (event log refs, model refs, etc.)
 *   - `required_conformance`: derived from execution profile via configToConformanceThresholds
 *   - `policy`: strict defaults (refuse on nonconformance, proof + receipt required)
 *               relaxed for "fast" and "stream" profiles (no proof_pack, no receipt)
 *   - `route_class`: set to the algorithm name (e.g. "dfg", "heuristic_miner")
 *   - `extensions`: full wasm4pm config serialised via configToMcppExtensions
 *   - `trace_parent`: optional W3C traceparent header value for OTEL correlation
 *
 * @param config      Resolved wasm4pm config (from resolveConfig())
 * @param partId      Unique identifier for the manufacturing part (e.g. UUIDv4)
 * @param inputObjects ObjectRefs to the event log(s) and/or normative model(s)
 * @param options     Optional: trace_parent for distributed tracing
 *
 * @example
 * ```ts
 * import { resolveConfig } from '@wasm4pm/config';
 * import { buildMcppRequest } from '@wasm4pm/config/mcpp-bridge';
 *
 * const config = await resolveConfig({ cliOverrides: { profile: 'quality' } });
 * const request = buildMcppRequest(config, 'part-abc-123', [
 *   { id: 'log-1', type: 'EventLog', hash: 'blake3:abc...' }, // @lint-allow-fakery
 * ]);
 * ```
 */
export function buildMcppRequest(
  config: Config,
  partId: string,
  inputObjects: ObjectRef[],
  options?: { traceParent?: string }
): McpplusRequest {
  const profile = config.execution.profile;
  const isLowLatencyProfile = profile === 'fast' || profile === 'stream';

  const policy: Policy = isLowLatencyProfile
    ? {
        // Fast/stream: admit without requiring full proof pack or receipt chain.
        // Callers in these profiles trade auditability for speed.
        on_nonconformance: 'refuse',
        proof_pack_required: false,
        receipt_required: false,
      }
    : {
        // balanced/quality: strictest defaults — refuse, require proof, require receipt.
        on_nonconformance: 'refuse',
        proof_pack_required: true,
        receipt_required: true,
      };

  // Membrane override: if membrane is active, always require receipt regardless
  // of profile (membrane envelopes must be chain-linked for custody tracking).
  if (config.membrane?.enabled) {
    policy.receipt_required = true;
  }

  const request: McpplusRequest = {
    mcpp_version: MCPP_VERSION,
    part_id: partId,
    route_class: config.algorithm.name,
    input_objects: inputObjects,
    required_conformance: configToConformanceThresholds(config),
    policy,
    extensions: configToMcppExtensions(config),
  };

  if (options?.traceParent !== undefined) {
    request.trace_parent = options.traceParent;
  }

  return request;
}
