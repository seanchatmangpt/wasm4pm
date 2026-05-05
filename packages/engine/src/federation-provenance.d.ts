/**
 * federation-provenance.ts - Provenance chain computation and result envelope wrapping
 *
 * Builds complete ProvenanceChain from inputs with BLAKE3 hashing.
 * Constructs full ResultEnvelope<T> for all algorithm outputs.
 *
 * Section 2.4 & 2.3 of the Three-Layer Architecture Contract Specification.
 */
import { ProvenanceChain, ResultEnvelope, ModelIR } from '@wasm4pm/contracts';
import type { BaseConfig } from '@wasm4pm/config';
import type { Plan } from '@wasm4pm/contracts';
import type { EventLogIR } from '@wasm4pm/contracts';
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
export declare function canonicalJson(obj: unknown): string;
/**
 * Computes BLAKE3 hash of an object as a 64-character hex string.
 *
 * Uses canonical JSON serialization to ensure deterministic hashing.
 * Result is always lowercase hex, exactly 64 characters (256 bits = 32 bytes).
 *
 * @param obj The object to hash
 * @returns BLAKE3 hex string (64 character string)
 */
export declare function blake3Hex(obj: unknown): string;
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
 * - `kernelVersion`: @seanchatmangpt/wasm4pm npm package version
 * - `wasmBuildHash`: Content hash of wasm4pm.wasm binary
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
export declare function computeProvenanceChain(
  eventLogIR: EventLogIR,
  config: BaseConfig,
  plan: Plan,
  modelHash: string,
  algorithmId: string,
  algorithmVersion: string,
  backendId: string,
  kernelVersion: string,
  wasmBuildHash: string
): ProvenanceChain;
/**
 * RawModelOutput type matching WASM serialization.
 *
 * This matches the Rust struct in wasm4pm/src/provenance.rs.
 * JavaScript receives this as JSON from WASM discovery functions.
 */
export interface RawModelOutput {
  model: Record<string, unknown>;
  model_hash: string;
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
export declare function buildModelIR(
  rawOutput: RawModelOutput,
  algorithmId: string,
  capabilities: ModelIR['capabilities']
): ModelIR;
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
 * - `kernelVersion`: @seanchatmangpt/wasm4pm package version
 * - `wasmBuildHash`: Content hash of wasm4pm.wasm
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
export declare function wrapDiscoveryResult(
  rawOutput: RawModelOutput,
  eventLogIR: EventLogIR,
  config: BaseConfig,
  plan: Plan,
  algorithmId: string,
  backendId: string,
  kernelVersion: string,
  wasmBuildHash: string,
  cycleSeq: number,
  modelCapabilities: ModelIR['capabilities']
): ResultEnvelope<ModelIR>;
//# sourceMappingURL=federation-provenance.d.ts.map
