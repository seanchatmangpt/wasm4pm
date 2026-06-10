import { z } from 'zod';

// ── Zod schemas (source of truth for runtime validation) ──────────────────────

export const ModelCapabilitiesSchema = z.object({
  online_safe: z.boolean(),
  offline_only: z.boolean(),
  replay_ready: z.boolean(),
  alignment_ready: z.boolean(),
  streaming_compatible: z.boolean(),
  exportable_to_pnml: z.boolean(),
  exportable_to_bpmn: z.boolean(),
});

export const QualityMetricsSchema = z.object({
  fitness: z.number().min(0).max(1).optional(),
  precision: z.number().min(0).max(1).optional(),
  generalization: z.number().min(0).max(1).optional(),
  simplicity: z.number().min(0).max(1).optional(),
});

export const ModelNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
});

export const ModelEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number().optional(),
});

export const ModelIRSchema = z.object({
  format_version: z.literal('1.0'),
  model_type: z.enum(['dfg', 'petri_net', 'process_tree', 'declare', 'powl']),
  algorithm_id: z.string(),
  capabilities: ModelCapabilitiesSchema,
  nodes: z.array(ModelNodeSchema),
  edges: z.array(ModelEdgeSchema),
  quality: QualityMetricsSchema.optional(),
});

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
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

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
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

/**
 * Node in the process model graph (place, transition, activity, etc.).
 */
export type ModelNode = z.infer<typeof ModelNodeSchema>;

/**
 * Edge in the process model graph (flow, arc, directly-follows, etc.).
 *
 * - `weight` is optional and represents frequency or strength.
 */
export type ModelEdge = z.infer<typeof ModelEdgeSchema>;

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
export type ModelIR = z.infer<typeof ModelIRSchema>;

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
export function isModelIR(value: unknown): value is ModelIR {
  if (!value || typeof value !== 'object') return false;

  const model = value as Record<string, unknown>;

  // Check format_version
  if (model.format_version !== '1.0') return false;

  // Check model_type
  const validTypes = ['dfg', 'petri_net', 'process_tree', 'declare', 'powl'];
  if (!validTypes.includes(model.model_type as string)) return false;

  // Check algorithm_id
  if (typeof model.algorithm_id !== 'string') return false;

  // Check capabilities
  if (!model.capabilities || typeof model.capabilities !== 'object') return false;
  const caps = model.capabilities as Record<string, unknown>;
  if (
    typeof caps.online_safe !== 'boolean' ||
    typeof caps.offline_only !== 'boolean' ||
    typeof caps.replay_ready !== 'boolean' ||
    typeof caps.alignment_ready !== 'boolean' ||
    typeof caps.streaming_compatible !== 'boolean' ||
    typeof caps.exportable_to_pnml !== 'boolean' ||
    typeof caps.exportable_to_bpmn !== 'boolean'
  )
    return false;

  // Check nodes (non-empty array)
  if (!Array.isArray(model.nodes) || model.nodes.length === 0) return false;
  for (const node of model.nodes) {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string' || typeof n.label !== 'string' || typeof n.type !== 'string')
      return false;
  }

  // Check edges (array, can be empty)
  if (!Array.isArray(model.edges)) return false;
  for (const edge of model.edges) {
    if (!edge || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    if (typeof e.from !== 'string' || typeof e.to !== 'string') return false;
    if (e.weight !== undefined && (typeof e.weight !== 'number' || !Number.isFinite(e.weight)))
      return false;
  }

  // Check quality (optional but must be valid if present)
  if (model.quality !== undefined) {
    if (!model.quality || typeof model.quality !== 'object') return false;
    const qual = model.quality as Record<string, unknown>;
    const validScores = ['fitness', 'precision', 'generalization', 'simplicity'];
    for (const key of validScores) {
      if (qual[key] !== undefined) {
        const score = qual[key] as unknown;
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
          return false;
        }
      }
    }
  }

  return true;
}
