/**
 * model-ir-converter.ts
 *
 * Converts between ModelIR (canonical substrate-neutral representation)
 * and various process model formats (DFG, Petri Net, POWL, etc.)
 * for pm4wasm integration.
 *
 * Key invariants:
 * - ModelIR nodes/edges: direct 1:1 mapping to pm4wasm structures
 * - DFG conversion: preserves nodes and edges, infers start/end activities
 * - Petri net conversion: infers initial/final markings from topology
 * - POWL arena allocation: bidirectional ID mapping (string ↔ u32 indices)
 * - Round-trip losslessness: ModelIR → format → ModelIR is semantically equivalent
 */
import type { ModelIR, ModelNode, ModelEdge, QualityMetrics } from '@wasm4pm/contracts';
/**
 * Directly-Follows Graph (DFG) - simplest process model format.
 * Suitable for fast streaming and online discovery.
 */
export interface DirectlyFollowsGraph {
  format: 'dfg';
  model_type: 'dfg';
  algorithm_id: string;
  nodes: Array<{
    id: string;
    label: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    weight?: number;
  }>;
  start_activities: string[];
  end_activities: string[];
  quality?: QualityMetrics;
}
/**
 * Petri Net representation (places, transitions, arcs, markings).
 * Suitable for conformance checking and replays.
 */
export interface PetriNet {
  format: 'petri_net';
  model_type: 'petri_net';
  algorithm_id: string;
  places: Array<{
    id: string;
    label?: string;
  }>;
  transitions: Array<{
    id: string;
    label: string;
  }>;
  arcs: Array<{
    source: string;
    target: string;
    weight?: number;
  }>;
  initial_marking: Record<string, number>;
  final_markings: Array<Record<string, number>>;
  quality?: QualityMetrics;
}
/**
 * Partial-Order Workflow Language (POWL) arena-based representation.
 * Supports complex control flow with concurrency.
 */
export interface PowlModel {
  format: 'powl';
  model_type: 'powl';
  algorithm_id: string;
  arena: Array<{
    id: number;
    label: string;
    node_type: 'activity' | 'operator' | 'gateway';
  }>;
  edges: Array<{
    from: number;
    to: number;
  }>;
  index_map: Record<string, number>;
  quality?: QualityMetrics;
}
/**
 * Infer start activities from node/edge topology.
 * Start activities are transitions with no incoming edges.
 *
 * @param nodes - List of model nodes
 * @param edges - List of model edges
 * @returns Array of start activity IDs
 */
export declare function inferStartActivities(
  nodes: ReadonlyArray<ModelNode>,
  edges: ReadonlyArray<ModelEdge>
): string[];
/**
 * Infer end activities from node/edge topology.
 * End activities are transitions with no outgoing edges.
 *
 * @param nodes - List of model nodes
 * @param edges - List of model edges
 * @returns Array of end activity IDs
 */
export declare function inferEndActivities(
  nodes: ReadonlyArray<ModelNode>,
  edges: ReadonlyArray<ModelEdge>
): string[];
/**
 * Convert ModelIR to Directly-Follows Graph (DFG).
 *
 * Process:
 * 1. Extract transition nodes (activity nodes)
 * 2. Keep all edges as-is
 * 3. Infer start/end activities from topology
 * 4. Preserve quality metrics
 *
 * DFG is the simplest and fastest format, suitable for streaming discovery.
 *
 * @param ir - ModelIR to convert (typically model_type: "dfg")
 * @returns DirectlyFollowsGraph
 *
 * @example
 * ```ts
 * const ir: ModelIR = {
 *   format_version: "1.0",
 *   model_type: "dfg",
 *   algorithm_id: "dfg",
 *   capabilities: { ... },
 *   nodes: [
 *     { id: "a", label: "Activity A", type: "transition" },
 *     { id: "b", label: "Activity B", type: "transition" }
 *   ],
 *   edges: [
 *     { from: "a", to: "b", weight: 100 }
 *   ]
 * };
 *
 * const dfg = modelIrToDfg(ir);
 * // dfg.start_activities === ["a"]
 * // dfg.end_activities === ["b"]
 * ```
 */
export declare function modelIrToDfg(ir: ModelIR): DirectlyFollowsGraph;
/**
 * Convert ModelIR to Petri Net.
 *
 * Process:
 * 1. Separate nodes into places and transitions
 * 2. Build arcs (from ModelIR edges)
 * 3. Infer initial marking from topology
 * 4. Compute final markings (places with no outgoing arcs)
 * 5. Preserve quality metrics
 *
 * Petri net supports conformance checking and token-based replay.
 *
 * @param ir - ModelIR to convert (typically model_type: "petri_net")
 * @returns PetriNet
 *
 * @example
 * ```ts
 * const ir: ModelIR = {
 *   format_version: "1.0",
 *   model_type: "petri_net",
 *   algorithm_id: "alpha_plus_plus",
 *   capabilities: { ... },
 *   nodes: [
 *     { id: "p1", label: "Start", type: "place" },
 *     { id: "t1", label: "Activity A", type: "transition" },
 *     { id: "p2", label: "End", type: "place" }
 *   ],
 *   edges: [
 *     { from: "p1", to: "t1" },
 *     { from: "t1", to: "p2" }
 *   ]
 * };
 *
 * const net = modelIrToPetriNet(ir);
 * // net.initial_marking === { p1: 1 }
 * // net.final_markings === [{ p2: 1 }]
 * ```
 */
export declare function modelIrToPetriNet(ir: ModelIR): PetriNet;
/**
 * Convert ModelIR to POWL (Partial-Order Workflow Language) arena model.
 *
 * Process:
 * 1. Allocate arena indices for all nodes (string ID -> u32 index)
 * 2. Remap edges from string IDs to arena indices
 * 3. Build index_map for reverse lookup
 * 4. Preserve quality metrics
 *
 * POWL supports complex control flow with concurrency and partial orders.
 *
 * @param ir - ModelIR to convert (typically model_type: "powl")
 * @returns PowlModel with arena indices and bidirectional ID mapping
 *
 * @example
 * ```ts
 * const ir: ModelIR = {
 *   format_version: "1.0",
 *   model_type: "powl",
 *   algorithm_id: "powl_discovery",
 *   capabilities: { ... },
 *   nodes: [
 *     { id: "a1", label: "Activity A", type: "activity" },
 *     { id: "op1", label: "AND", type: "operator" },
 *     { id: "a2", label: "Activity B", type: "activity" }
 *   ],
 *   edges: [
 *     { from: "a1", to: "op1" },
 *     { from: "op1", to: "a2" }
 *   ]
 * };
 *
 * const powl = modelIrToPowlModel(ir);
 * // powl.arena[0].id === 0, powl.arena[0].label === "Activity A"
 * // powl.index_map["a1"] === 0
 * // powl.edges === [{ from: 0, to: 1 }, { from: 1, to: 2 }]
 * ```
 */
export declare function modelIrToPowlModel(ir: ModelIR): PowlModel;
/**
 * Reverse a DFG back to ModelIR.
 * Lossless round-trip: DFG → ModelIR → DFG preserves structure.
 *
 * @param dfg - DirectlyFollowsGraph to convert
 * @returns ModelIR equivalent
 */
export declare function dfgToModelIr(dfg: DirectlyFollowsGraph): ModelIR;
/**
 * Reverse a Petri Net back to ModelIR.
 * Lossless round-trip: PetriNet → ModelIR → PetriNet preserves structure.
 *
 * @param net - PetriNet to convert
 * @returns ModelIR equivalent
 */
export declare function petriNetToModelIr(net: PetriNet): ModelIR;
/**
 * Reverse a POWL model back to ModelIR.
 * Uses index_map to restore string IDs.
 * Lossless round-trip: POWL → ModelIR → POWL preserves structure.
 *
 * @param powl - PowlModel to convert
 * @returns ModelIR equivalent
 */
export declare function powlModelToModelIr(powl: PowlModel): ModelIR;
//# sourceMappingURL=model-ir-converter.d.ts.map
