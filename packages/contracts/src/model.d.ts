/**
 * ModelIR - Canonical Intermediate Representation of Process Models
 *
 * Section 2.2 of the Three-Layer Architecture Contract Specification.
 * This is the substrate-neutral representation used across all layer boundaries.
 *
 * @example
 * ```ts
 * const model: ModelIR = {
 *   format_version: "1.0",
 *   model_type: "dfg",
 *   algorithm_id: "dfg",
 *   capabilities: {
 *     online_safe: true,
 *     offline_only: false,
 *     replay_ready: true,
 *     alignment_ready: false,
 *     streaming_compatible: true,
 *     exportable_to_pnml: false,
 *     exportable_to_bpmn: false,
 *   },
 *   nodes: [
 *     { id: "start", label: "Start", type: "place" },
 *     { id: "register", label: "Register", type: "transition" },
 *   ],
 *   edges: [
 *     { from: "start", to: "register", weight: 100 },
 *   ],
 *   quality: {
 *     fitness: 0.95,
 *     precision: 0.92,
 *     generalization: 0.88,
 *     simplicity: 0.85,
 *   }
 * };
 * ```
 */
/**
 * Capabilities of a process model.
 *
 * These fields declare what operations can be performed on the model:
 * - `online_safe`: Model can execute conformance checking in <1s on WASM.
 * - `offline_only`: Model requires Python or external network (pm4py-only).
 * - `replay_ready`: Model supports token-based replay for fitness.
 * - `alignment_ready`: Model supports exact alignment computation.
 * - `streaming_compatible`: Model can process incremental trace updates.
 * - `exportable_to_pnml`: Can be serialized to PNML (Petri Net Markup Language).
 * - `exportable_to_bpmn`: Can be serialized to BPMN (Business Process Model Notation).
 */
export interface ModelCapabilities {
  online_safe: boolean;
  offline_only: boolean;
  replay_ready: boolean;
  alignment_ready: boolean;
  streaming_compatible: boolean;
  exportable_to_pnml: boolean;
  exportable_to_bpmn: boolean;
}
/**
 * Quality metrics of a discovered or conformance-checked model.
 *
 * All scores are bounded [0, 1]. Scores outside this range are clamped and flagged in OTEL.
 * This field is optional; not all algorithms produce quality metrics.
 *
 * - `fitness`: How much of the observed behavior is explained by the model.
 *   Computed as `1 - (missing + consumed) / (produced + remaining)`.
 * - `precision`: How much of the model behavior is observed in the log.
 *   Avoid underfitting (model too general).
 * - `generalization`: How well the model generalizes to unseen behavior.
 *   Avoid overfitting (model too specific).
 * - `simplicity`: Inverse of element count (places + transitions).
 *   Fewer elements = higher simplicity.
 */
export interface QualityMetrics {
  fitness?: number;
  precision?: number;
  generalization?: number;
  simplicity?: number;
}
/**
 * Node in the process model graph (place, transition, activity, etc.).
 */
export interface ModelNode {
  id: string;
  label: string;
  type: string;
}
/**
 * Edge in the process model graph (flow, arc, directly-follows, etc.).
 *
 * - `weight` is optional and represents frequency or strength.
 */
export interface ModelEdge {
  from: string;
  to: string;
  weight?: number;
}
/**
 * Canonical Intermediate Representation of a process model.
 *
 * This is the contract between:
 * - Control plane (packages/kernel, packages/planner)
 * - Execution substrates (wasm4pm, pm4py-mcp, @wasm4pm/ml)
 *
 * No backend ever returns raw PNML, BPMN, or Petri net structures — they return ModelIR.
 * No backend receives raw model files — they receive EventLogIR and return ModelIR.
 *
 * **Format Versioning:** `format_version: "1.0"` gates the schema. Version mismatch → error.
 *
 * **Model Types:**
 * - `dfg`: Directly-Follows Graph (fastest, lower quality)
 * - `petri_net`: Petri Net (balanced speed/quality)
 * - `process_tree`: Process Tree (inductive miner output)
 * - `declare`: Declare constraints (constraint-based discovery)
 * - `powl`: Partial-Order Workflow Language
 *
 * **Cross-Boundary Invariants:**
 * 1. `capabilities` is always populated (no null or missing).
 * 2. `quality` is optional but when present, all fields must be in [0, 1].
 * 3. `model_type` must match the algorithm that produced it.
 * 4. Nodes and edges form a DAG or cyclic graph; no isolated nodes.
 */
export interface ModelIR {
  readonly format_version: '1.0';
  readonly model_type: 'dfg' | 'petri_net' | 'process_tree' | 'declare' | 'powl';
  readonly algorithm_id: string;
  readonly capabilities: ModelCapabilities;
  readonly nodes: ReadonlyArray<ModelNode>;
  readonly edges: ReadonlyArray<ModelEdge>;
  readonly quality?: QualityMetrics;
}
/**
 * Guard function to check if a value is a valid ModelIR.
 *
 * Validates:
 * - format_version is "1.0"
 * - model_type is one of the allowed values
 * - capabilities exists and is a valid object
 * - nodes array is not empty
 * - edges array (can be empty for disconnected models)
 * - quality scores (if present) are in [0, 1]
 *
 * @param value The value to check
 * @returns true if value is a valid ModelIR, false otherwise
 */
export declare function isModelIR(value: unknown): value is ModelIR;
//# sourceMappingURL=model.d.ts.map
