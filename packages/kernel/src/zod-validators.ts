/**
 * zod-validators.ts
 * Zod schemas for WASM output payloads in the kernel.
 *
 * Schemas for well-known algorithm outputs are copied from wasm4pm-compat
 * bindings. Wave-2 analytics outputs are defined inline.
 *
 * Use `validateWasmPayload(algorithmId, parsed)` to safeParse and throw on
 * schema violations before the result propagates to callers.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas copied from wasm4pm-compat/bindings/zod_schemas.ts
// ---------------------------------------------------------------------------

const ArcSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number().optional(),
});

const PlaceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

const TransitionSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
});

export const PetriNetSchema = z.object({
  arcs: z.array(ArcSchema),
  places: z.array(PlaceSchema),
  transitions: z.array(TransitionSchema),
});

const DFGNodeSchema = z.object({
  activity: z.string(),
  frequency: z.number(),
});

const DFGEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  frequency: z.number(),
});

export const DFGSchema = z.object({
  nodes: z.array(DFGNodeSchema),
  edges: z.array(DFGEdgeSchema),
});

export const ConformanceResultSchema = z.object({
  fitness: z.number(),
  deviating_traces: z.number(),
  fitting_traces: z.number(),
  total_traces: z.number(),
  precision: z.number().optional(),
});

export const TokenReplayResultSchema = z.object({
  fitness: z.number(),
  consumed_tokens: z.number(),
  missing_tokens: z.number(),
  produced_tokens: z.number(),
  remaining_tokens: z.number(),
});

const BpmnNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string().optional(),
});

const BpmnEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});

const BpmnLaneSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(z.string()),
});

export const BpmnProcessSchema = z.object({
  nodes: z.array(BpmnNodeSchema),
  edges: z.array(BpmnEdgeSchema),
  lanes: z.array(BpmnLaneSchema),
});

const DeclareConstraintSchema = z.object({
  constraint_type: z.string(),
  activities: z.array(z.string()),
});

export const DeclareModelSchema = z.object({
  constraints: z.array(DeclareConstraintSchema),
});

const ConformanceVerdictSchema = z.object({
  is_perfect: z.boolean(),
});

export const ReceiptSchema = z.object({
  final_hash_chain: z.string(),
  model_id: z.string(),
  verdict: ConformanceVerdictSchema,
});

// ---------------------------------------------------------------------------
// Wave-2 analytics schemas (defined inline — no pre-built schema in compat)
// ---------------------------------------------------------------------------

export const DetectDriftSchema = z.object({
  drift_points: z.array(z.number()),
});

export const ComputeEwmaSchema = z.object({
  values: z.array(z.number()),
});

export const AnalyzeVariantComplexitySchema = z.object({
  variants: z.array(
    z.object({
      trace: z.array(z.string()),
      count: z.number(),
      complexity: z.number().optional(),
    })
  ),
});

export const TransitionMatrixSchema = z.record(z.string(), z.record(z.string(), z.number()));

export const AnalyzeProcessSpeedupSchema = z.object({
  speedup_factor: z.number().optional(),
  baseline_ms: z.number().optional(),
  accelerated_ms: z.number().optional(),
});

export const TraceSimilarityMatrixSchema = z.array(z.array(z.number()));

export const AutomlResultSchema = z.object({
  model_type: z.string().optional(),
  accuracy: z.number().optional(),
  predictions: z.array(z.unknown()).optional(),
});

// Inductive miner returns nested recursive tree (not the flattened ProcessTreeSchema)
const InductiveMinerNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    node_type: z.enum(['sequence', 'xor', 'parallel', 'loop', 'leaf']),
    label: z.string().optional(),
    children: z.array(InductiveMinerNodeSchema),
  })
);
export const InductiveMinerResultSchema = z.object({
  algorithm: z.literal('inductive_miner'),
  root: InductiveMinerNodeSchema,
  nodes: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Algorithm-id → schema registry
// ---------------------------------------------------------------------------

type AnyZodSchema = z.ZodTypeAny;

const ALGORITHM_SCHEMAS: Record<string, AnyZodSchema> = {
  dfg: DFGSchema,
  hierarchical_dfg: DFGSchema,
  streaming_log: DFGSchema,
  simd_streaming_dfg: DFGSchema,
  declare: DeclareModelSchema,
  bpmn_import: BpmnProcessSchema,
  alpha_plus_plus: PetriNetSchema,
  heuristic_miner: PetriNetSchema,
  ilp: PetriNetSchema,
  aco: PetriNetSchema,
  genetic_algorithm: PetriNetSchema,
  pso: PetriNetSchema,
  petri_net_reduction: PetriNetSchema,
  ocel_petri_net: PetriNetSchema,
  token_replay: TokenReplayResultSchema,
  alignments: ConformanceResultSchema,
  etconformance_precision: ConformanceResultSchema,
  precision: ConformanceResultSchema,
  detect_drift: DetectDriftSchema,
  compute_ewma: ComputeEwmaSchema,
  analyze_variant_complexity: AnalyzeVariantComplexitySchema,
  compute_activity_transition_matrix: TransitionMatrixSchema,
  analyze_process_speedup: AnalyzeProcessSpeedupSchema,
  compute_trace_similarity_matrix: TraceSimilarityMatrixSchema,
  automl_classify: AutomlResultSchema,
  automl_forecast: AutomlResultSchema,
  automl_regress: AutomlResultSchema,
  inductive_miner: InductiveMinerResultSchema,
};

// ---------------------------------------------------------------------------
// Public validation entry point
// ---------------------------------------------------------------------------

/**
 * Validate a parsed WASM payload against the schema registered for the given
 * algorithm ID. Throws with a descriptive message if safeParse fails.
 * Returns silently when the algorithm has no registered schema.
 */
export function validateWasmPayload(algorithmId: string, parsed: unknown): void {
  const schema = ALGORITHM_SCHEMAS[algorithmId];
  if (!schema) return;

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  [${i.path.join('.')}] ${i.message}`)
      .join('\n');
    throw new Error(
      `WASM payload schema violation for algorithm "${algorithmId}":\n${issues}`
    );
  }
}
