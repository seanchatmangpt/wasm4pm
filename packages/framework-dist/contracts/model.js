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
    if (model.format_version !== '1.0')
        return false;
    // Check model_type
    const validTypes = ['dfg', 'petri_net', 'process_tree', 'declare', 'powl'];
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