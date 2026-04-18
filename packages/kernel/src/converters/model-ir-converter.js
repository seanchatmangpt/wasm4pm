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
/**
 * Infer start activities from node/edge topology.
 * Start activities are transitions with no incoming edges.
 *
 * @param nodes - List of model nodes
 * @param edges - List of model edges
 * @returns Array of start activity IDs
 */
export function inferStartActivities(nodes, edges) {
    const incoming = new Set();
    for (const edge of edges) {
        incoming.add(edge.to);
    }
    return nodes
        .filter(node => node.type === 'transition' && !incoming.has(node.id))
        .map(node => node.id);
}
/**
 * Infer end activities from node/edge topology.
 * End activities are transitions with no outgoing edges.
 *
 * @param nodes - List of model nodes
 * @param edges - List of model edges
 * @returns Array of end activity IDs
 */
export function inferEndActivities(nodes, edges) {
    const outgoing = new Set();
    for (const edge of edges) {
        outgoing.add(edge.from);
    }
    return nodes
        .filter(node => node.type === 'transition' && !outgoing.has(node.id))
        .map(node => node.id);
}
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
export function modelIrToDfg(ir) {
    const startActivities = inferStartActivities(ir.nodes, ir.edges);
    const endActivities = inferEndActivities(ir.nodes, ir.edges);
    return {
        format: "dfg",
        model_type: "dfg",
        algorithm_id: ir.algorithm_id,
        nodes: ir.nodes.map(node => ({
            id: node.id,
            label: node.label,
        })),
        edges: ir.edges.map(edge => ({
            from: edge.from,
            to: edge.to,
            ...(edge.weight !== undefined && { weight: edge.weight }),
        })),
        start_activities: startActivities,
        end_activities: endActivities,
        ...(ir.quality && { quality: ir.quality }),
    };
}
/**
 * Infer initial marking for a Petri net.
 * Places with no incoming arcs from transitions get 1 token.
 * (Represents source places for trace replay.)
 *
 * @param places - List of place IDs
 * @param transitions - List of transition IDs
 * @param arcs - List of arcs
 * @returns Initial marking (place_id -> token count)
 */
function inferInitialMarking(places, transitions, arcs) {
    const incomingToPlace = new Set();
    for (const arc of arcs) {
        // Only count arcs from transitions to places
        if (transitions.includes(arc.from) && places.includes(arc.to)) {
            incomingToPlace.add(arc.to);
        }
    }
    const marking = {};
    for (const place of places) {
        if (!incomingToPlace.has(place)) {
            marking[place] = 1; // Source place gets 1 token
        }
    }
    return marking;
}
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
export function modelIrToPetriNet(ir) {
    const places = ir.nodes.filter(n => n.type === 'place').map(n => n.id);
    const transitions = ir.nodes.filter(n => n.type === 'transition').map(n => n.id);
    const placeIds = new Set(places);
    const transitionIds = new Set(transitions);
    // Build arcs (preserve weights from ModelIR edges)
    const arcs = ir.edges.map(edge => ({
        source: edge.from,
        target: edge.to,
        ...(edge.weight !== undefined && { weight: edge.weight }),
    }));
    // Infer initial marking
    const initialMarking = inferInitialMarking(places, transitions, ir.edges);
    // Infer final markings: places with no outgoing arcs to transitions
    const outgoingFromPlace = new Set();
    for (const arc of ir.edges) {
        if (placeIds.has(arc.from) && transitionIds.has(arc.to)) {
            outgoingFromPlace.add(arc.from);
        }
    }
    const finalMarkings = [];
    const finalMarking = {};
    for (const place of places) {
        if (!outgoingFromPlace.has(place)) {
            finalMarking[place] = 1; // Sink place gets 1 token in final marking
        }
    }
    finalMarkings.push(finalMarking);
    return {
        format: "petri_net",
        model_type: "petri_net",
        algorithm_id: ir.algorithm_id,
        places: places.map(id => {
            const node = ir.nodes.find(n => n.id === id);
            return {
                id,
                label: node?.label,
            };
        }),
        transitions: transitions.map(id => {
            const node = ir.nodes.find(n => n.id === id);
            return {
                id,
                label: node?.label || id,
            };
        }),
        arcs,
        initial_marking: initialMarking,
        final_markings: finalMarkings,
        ...(ir.quality && { quality: ir.quality }),
    };
}
/**
 * Allocate arena indices for POWL nodes.
 * Creates bidirectional mapping between string IDs and u32 indices.
 *
 * @param nodes - List of model nodes
 * @returns { arena indices, reverse map (string -> u32) }
 */
function allocateArenaIndices(nodes) {
    const indexMap = {};
    const arena = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        indexMap[node.id] = i;
        arena.push({
            id: i,
            label: node.label,
            node_type: node.type,
        });
    }
    return [arena, indexMap];
}
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
export function modelIrToPowlModel(ir) {
    const [arena, indexMap] = allocateArenaIndices(ir.nodes);
    // Remap edges to arena indices
    const edges = ir.edges.map(edge => {
        const fromIndex = indexMap[edge.from];
        const toIndex = indexMap[edge.to];
        if (fromIndex === undefined || toIndex === undefined) {
            throw new Error(`Invalid edge: ${edge.from} -> ${edge.to}. Node not found in arena.`);
        }
        return {
            from: fromIndex,
            to: toIndex,
        };
    });
    return {
        format: "powl",
        model_type: "powl",
        algorithm_id: ir.algorithm_id,
        arena: arena.map(node => ({
            id: node.id,
            label: node.label,
            node_type: node.node_type,
        })),
        edges,
        index_map: indexMap,
        ...(ir.quality && { quality: ir.quality }),
    };
}
/**
 * Reverse a DFG back to ModelIR.
 * Lossless round-trip: DFG → ModelIR → DFG preserves structure.
 *
 * @param dfg - DirectlyFollowsGraph to convert
 * @returns ModelIR equivalent
 */
export function dfgToModelIr(dfg) {
    return {
        format_version: "1.0",
        model_type: "dfg",
        algorithm_id: dfg.algorithm_id,
        capabilities: {
            online_safe: true,
            offline_only: false,
            replay_ready: true,
            alignment_ready: false,
            streaming_compatible: true,
            exportable_to_pnml: false,
            exportable_to_bpmn: false,
        },
        nodes: dfg.nodes.map(node => ({
            id: node.id,
            label: node.label,
            type: "transition",
        })),
        edges: dfg.edges.map(edge => ({
            from: edge.from,
            to: edge.to,
            ...(edge.weight !== undefined && { weight: edge.weight }),
        })),
        ...(dfg.quality && { quality: dfg.quality }),
    };
}
/**
 * Reverse a Petri Net back to ModelIR.
 * Lossless round-trip: PetriNet → ModelIR → PetriNet preserves structure.
 *
 * @param net - PetriNet to convert
 * @returns ModelIR equivalent
 */
export function petriNetToModelIr(net) {
    const nodes = [
        ...net.places.map(place => ({
            id: place.id,
            label: place.label || place.id,
            type: "place",
        })),
        ...net.transitions.map(transition => ({
            id: transition.id,
            label: transition.label,
            type: "transition",
        })),
    ];
    const edges = net.arcs.map(arc => ({
        from: arc.source,
        to: arc.target,
        ...(arc.weight !== undefined && { weight: arc.weight }),
    }));
    return {
        format_version: "1.0",
        model_type: "petri_net",
        algorithm_id: net.algorithm_id,
        capabilities: {
            online_safe: true,
            offline_only: false,
            replay_ready: true,
            alignment_ready: true,
            streaming_compatible: false,
            exportable_to_pnml: true,
            exportable_to_bpmn: false,
        },
        nodes,
        edges,
        ...(net.quality && { quality: net.quality }),
    };
}
/**
 * Reverse a POWL model back to ModelIR.
 * Uses index_map to restore string IDs.
 * Lossless round-trip: POWL → ModelIR → POWL preserves structure.
 *
 * @param powl - PowlModel to convert
 * @returns ModelIR equivalent
 */
export function powlModelToModelIr(powl) {
    // Reverse the index_map to get ID -> string
    const reverseIndexMap = {};
    for (const [id, idx] of Object.entries(powl.index_map)) {
        reverseIndexMap[idx] = id;
    }
    const nodes = powl.arena.map(arenaNode => ({
        id: reverseIndexMap[arenaNode.id] || `node_${arenaNode.id}`,
        label: arenaNode.label,
        type: arenaNode.node_type,
    }));
    const edges = powl.edges.map(edge => ({
        from: reverseIndexMap[edge.from] || `node_${edge.from}`,
        to: reverseIndexMap[edge.to] || `node_${edge.to}`,
    }));
    return {
        format_version: "1.0",
        model_type: "powl",
        algorithm_id: powl.algorithm_id,
        capabilities: {
            online_safe: true,
            offline_only: false,
            replay_ready: false,
            alignment_ready: false,
            streaming_compatible: false,
            exportable_to_pnml: false,
            exportable_to_bpmn: false,
        },
        nodes,
        edges,
        ...(powl.quality && { quality: powl.quality }),
    };
}
//# sourceMappingURL=model-ir-converter.js.map