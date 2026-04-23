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
export function isModelIR(value) {
    if (!value || typeof value !== 'object')
        return false;
    const model = value;
    // Check format_version
    if (model.format_version !== "1.0")
        return false;
    // Check model_type
    const validTypes = ["dfg", "petri_net", "process_tree", "declare", "powl"];
    if (!validTypes.includes(model.model_type))
        return false;
    // Check algorithm_id
    if (typeof model.algorithm_id !== 'string')
        return false;
    // Check capabilities
    if (!model.capabilities || typeof model.capabilities !== 'object')
        return false;
    const caps = model.capabilities;
    if (typeof caps.online_safe !== 'boolean' ||
        typeof caps.offline_only !== 'boolean' ||
        typeof caps.replay_ready !== 'boolean' ||
        typeof caps.alignment_ready !== 'boolean' ||
        typeof caps.streaming_compatible !== 'boolean' ||
        typeof caps.exportable_to_pnml !== 'boolean' ||
        typeof caps.exportable_to_bpmn !== 'boolean')
        return false;
    // Check nodes (non-empty array)
    if (!Array.isArray(model.nodes) || model.nodes.length === 0)
        return false;
    for (const node of model.nodes) {
        if (!node || typeof node !== 'object')
            return false;
        const n = node;
        if (typeof n.id !== 'string' || typeof n.label !== 'string' || typeof n.type !== 'string')
            return false;
    }
    // Check edges (array, can be empty)
    if (!Array.isArray(model.edges))
        return false;
    for (const edge of model.edges) {
        if (!edge || typeof edge !== 'object')
            return false;
        const e = edge;
        if (typeof e.from !== 'string' || typeof e.to !== 'string')
            return false;
        if (e.weight !== undefined && (typeof e.weight !== 'number' || !Number.isFinite(e.weight)))
            return false;
    }
    // Check quality (optional but must be valid if present)
    if (model.quality !== undefined) {
        if (!model.quality || typeof model.quality !== 'object')
            return false;
        const qual = model.quality;
        const validScores = ['fitness', 'precision', 'generalization', 'simplicity'];
        for (const key of validScores) {
            if (qual[key] !== undefined) {
                const score = qual[key];
                if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
                    return false;
                }
            }
        }
    }
    return true;
}
//# sourceMappingURL=model.js.map