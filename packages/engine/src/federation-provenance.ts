/**
 * federation-provenance.ts - Provenance chain computation and result envelope wrapping
 *
 * Builds complete ProvenanceChain from inputs with BLAKE3 hashing.
 * Constructs full ResultEnvelope<T> for all algorithm outputs.
 *
 * Section 2.4 & 2.3 of the Three-Layer Architecture Contract Specification.
 */

import { hash as blake3 } from 'blake3';
import {
  ProvenanceChain,
  ResultEnvelope,
  LatencyClass,
  deriveLatencyClass,
  ModelIR,
} from '@pictl/contracts';
import type { BaseConfig } from '@pictl/config';
import type { Plan } from '@pictl/contracts';
import type { EventLogIR } from '@pictl/contracts';
import { v4 as uuidv4 } from 'uuid';

/**
 * Deterministic JSON serialization with sorted keys at all levels.
 *
 * Ensures that the same object produces the same JSON string regardless of
 * property insertion order. Required for deterministic hashing.
 *
 * **Algorithm:**
 * 1. Recursively traverse the object tree
 * 2. For each object, sort keys alphabetically
 * 3. Skip undefined values
 * 4. Arrays preserve order (not sorted)
 * 5. Primitives and null pass through unchanged
 *
 * @param obj The object to serialize
 * @returns Canonical JSON string with sorted keys
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';

  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    const items = obj.map(canonicalJson);
    return '[' + items.join(',') + ']';
  }

  if (typeof obj === 'object') {
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = sortedKeys
      .filter(k => (obj as Record<string, unknown>)[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]));
    return '{' + pairs.join(',') + '}';
  }

  return JSON.stringify(obj);
}

/**
 * Computes BLAKE3 hash of an object as a 64-character hex string.
 *
 * Uses canonical JSON serialization to ensure deterministic hashing.
 * Result is always lowercase hex, exactly 64 characters (256 bits = 32 bytes).
 *
 * @param obj The object to hash
 * @returns BLAKE3 hex string (64 character string)
 */
export function blake3Hex(obj: unknown): string {
  const json = canonicalJson(obj);
  const digest = blake3(json);
  return digest.toString('hex');
}

/**
 * Computes complete ProvenanceChain from inputs and outputs.
 *
 * **Parameters:**
 * - `eventLogIR`: The input event log (canonical IR)
 * - `config`: The resolved configuration
 * - `plan`: The execution plan DAG
 * - `modelHash`: BLAKE3 of output model JSON (from WASM)
 * - `algorithmId`: Which algorithm was executed
 * - `algorithmVersion`: Semver or CalVer of the algorithm
 * - `backendId`: Which backend executed it (wasm, pm4py, ml, null)
 * - `kernelVersion`: @seanchatmangpt/pictl npm package version
 * - `wasmBuildHash`: Content hash of pictl.wasm binary
 *
 * **Returns:**
 * A ProvenanceChain with all 10 fields populated:
 * - `input_hash`: BLAKE3 of EventLogIR
 * - `config_hash`: BLAKE3 of resolved Config
 * - `plan_hash`: BLAKE3 of ExecutionPlan
 * - `output_hash`: BLAKE3 of model JSON (supplied by caller)
 * - `combined_hash`: BLAKE3 of all four hashes concatenated
 * - `algorithm_id`, `algorithm_version`, `backend_id`, `kernel_version`, `wasm_build_hash`
 *
 * **Invariants:**
 * - All hash fields are non-empty strings (64 hex characters = 256 bits)
 * - `combined_hash` is computed as `blake3(input_hash + config_hash + plan_hash + output_hash)`
 * - The result is immutable once computed
 *
 * **Example:**
 * ```ts
 * const provenance = computeProvenanceChain(
 *   eventLogIR,
 *   config,
 *   plan,
 *   rawOutput.model_hash,
 *   'dfg',
 *   '26.4.8.dfg_v1',
 *   'wasm',
 *   '26.4.8',
 *   '7f3c8e...'
 * );
 * ```
 */
export function computeProvenanceChain(
  eventLogIR: EventLogIR,
  config: BaseConfig,
  plan: Plan,
  modelHash: string,
  algorithmId: string,
  algorithmVersion: string,
  backendId: string,
  kernelVersion: string,
  wasmBuildHash: string,
): ProvenanceChain {
  // Compute individual hashes
  const input_hash = blake3Hex(eventLogIR);
  const config_hash = blake3Hex(config);
  const plan_hash = blake3Hex(plan);
  const output_hash = modelHash;

  // Combine all four hashes and hash the concatenation
  const combined = input_hash + config_hash + plan_hash + output_hash;
  const combined_hash = blake3Hex(combined);

  return {
    input_hash,
    config_hash,
    plan_hash,
    output_hash,
    combined_hash,
    algorithm_id: algorithmId,
    algorithm_version: algorithmVersion,
    backend_id: backendId,
    kernel_version: kernelVersion,
    wasm_build_hash: wasmBuildHash,
  };
}

/**
 * RawModelOutput type matching WASM serialization.
 *
 * This matches the Rust struct in wasm4pm/src/provenance.rs.
 * JavaScript receives this as JSON from WASM discovery functions.
 */
export interface RawModelOutput {
  model: Record<string, unknown>; // Discovered model JSON (DFG, PetriNet, etc.)
  model_hash: string; // BLAKE3 hash (64 hex characters = 256 bits)
  deterministic: boolean;
  algorithm_version: string;
  latency_class: string;
  algorithm_duration_ms: number;
}

/**
 * Builds a complete ModelIR from a RawModelOutput.
 *
 * Transforms WASM discovery output into the canonical ModelIR representation.
 * This layer-0 → layer-1 translation is deterministic and reversible.
 *
 * **Parameters:**
 * - `rawOutput`: WASM discovery output with model JSON
 * - `algorithmId`: Algorithm that produced this model
 * - `capabilities`: Declared capabilities (online_safe, replay_ready, etc.)
 *
 * **Returns:**
 * A ModelIR with:
 * - format_version: "1.0"
 * - model_type: Inferred from algorithm or rawOutput
 * - nodes/edges extracted from rawOutput.model
 * - quality metrics (if present in rawOutput.model)
 *
 * **Example:**
 * ```ts
 * const modelIR = buildModelIR(rawOutput, 'dfg', {
 *   online_safe: true,
 *   offline_only: false,
 *   // ... other capabilities
 * });
 * ```
 */
export function buildModelIR(
  rawOutput: RawModelOutput,
  algorithmId: string,
  capabilities: ModelIR['capabilities'],
): ModelIR {
  const model = rawOutput.model as Record<string, unknown>;

  // Extract nodes and edges (structure varies by model type)
  const nodes = Array.isArray(model.nodes)
    ? (model.nodes as any[]).map(n => ({
        id: String(n.id),
        label: String(n.label),
        type: String(n.type || 'activity'),
      }))
    : [];

  const edges = Array.isArray(model.edges)
    ? (model.edges as any[]).map(e => ({
        from: String(e.from),
        to: String(e.to),
        weight: typeof e.weight === 'number' ? e.weight : undefined,
      }))
    : [];

  // Extract quality metrics if present
  const quality = model.quality as ModelIR['quality'] | undefined;

  // Infer model type from algorithm ID
  const model_type = inferModelType(algorithmId);

  return {
    format_version: '1.0',
    model_type,
    algorithm_id: algorithmId,
    capabilities,
    nodes,
    edges,
    quality,
  };
}

/**
 * Infers the model type from algorithm ID.
 *
 * Maps algorithm names to ModelIR types:
 * - dfg, process_skeleton, streaming_dfg → "dfg"
 * - alpha_plus_plus, inductive_miner, hill_climbing, etc. → "petri_net"
 * - declare → "declare"
 * - powl_* → "powl"
 *
 * @param algorithmId The algorithm identifier
 * @returns ModelIR model_type
 */
function inferModelType(algorithmId: string): ModelIR['model_type'] {
  const lower = algorithmId.toLowerCase();

  if (lower.includes('dfg') || lower === 'process_skeleton' || lower.includes('streaming')) {
    return 'dfg';
  }
  if (lower.includes('powl')) {
    return 'powl';
  }
  if (lower === 'declare') {
    return 'declare';
  }
  if (lower.includes('process_tree')) {
    return 'process_tree';
  }

  // Default to petri_net for discovery algorithms
  return 'petri_net';
}

/**
 * Wraps a discovery result in a complete ResultEnvelope<ModelIR>.
 *
 * This is the primary function for constructing full typed result envelopes
 * from layer-0 (WASM) discovery outputs to layer-2 (frontend).
 *
 * **Parameters:**
 * - `rawOutput`: WASM discovery output from layer 0
 * - `eventLogIR`: The input event log
 * - `config`: The resolved configuration
 * - `plan`: The execution plan
 * - `algorithmId`: Which algorithm was executed
 * - `backendId`: Which backend executed it
 * - `kernelVersion`: @seanchatmangpt/pictl package version
 * - `wasmBuildHash`: Content hash of pictl.wasm
 * - `cycleSeq`: Monotonic counter from FederationController
 * - `modelCapabilities`: Declared capabilities for the model
 *
 * **Returns:**
 * A complete ResultEnvelope with:
 * - `run_id`: Generated UUID v4
 * - `status`: "success"
 * - `payload`: null (model_ir is separate field)
 * - `latency_ms`: From rawOutput.algorithm_duration_ms
 * - `latency_class`: Derived from latency_ms
 * - `backend_id`, `invocation_id`, `cycle_seq`, `algorithm_id`
 * - `model_ir`: Complete ModelIR
 * - `provenance`: Full ProvenanceChain with all 10 fields
 * - `stale`: false (first execution)
 *
 * **Example:**
 * ```ts
 * const envelope = wrapDiscoveryResult(
 *   rawOutput,
 *   eventLogIR,
 *   config,
 *   plan,
 *   'dfg',
 *   'wasm',
 *   '26.4.8',
 *   '7f3c8e...',
 *   42,
 *   modelCapabilities
 * );
 * ```
 */
export function wrapDiscoveryResult(
  rawOutput: RawModelOutput,
  eventLogIR: EventLogIR,
  config: BaseConfig,
  plan: Plan,
  algorithmId: string,
  backendId: string,
  kernelVersion: string,
  wasmBuildHash: string,
  cycleSeq: number,
  modelCapabilities: ModelIR['capabilities'],
): ResultEnvelope<ModelIR> {
  // Build model IR from raw output
  const model_ir = buildModelIR(rawOutput, algorithmId, modelCapabilities);

  // Compute provenance chain
  const provenance = computeProvenanceChain(
    eventLogIR,
    config,
    plan,
    rawOutput.model_hash,
    algorithmId,
    rawOutput.algorithm_version,
    backendId,
    kernelVersion,
    wasmBuildHash,
  );

  // Derive latency class
  const latency_class = deriveLatencyClass(rawOutput.algorithm_duration_ms);

  // Construct envelope
  const envelope: ResultEnvelope<ModelIR> = {
    run_id: uuidv4(),
    status: 'success',
    payload: model_ir,
    latency_ms: rawOutput.algorithm_duration_ms,
    latency_class,
    backend_id: backendId,
    invocation_id: uuidv4(),
    cycle_seq: cycleSeq,
    algorithm_id: algorithmId,
    model_ir,
    provenance,
    stale: false,
  };

  return envelope;
}
