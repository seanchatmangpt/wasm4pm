/**
 * Explain Snapshot Schema
 * Schema version 1.0
 *
 * An explain snapshot captures the complete execution result for
 * introspection/debugging. It mirrors the execution result structure
 * exactly, adding provenance and timing information.
 */
/**
 * Type guard for ExplainSnapshot objects
 */
export function isExplainSnapshot(value) {
    if (!value || typeof value !== 'object')
        return false;
    const e = value;
    return (e.schema_version === '1.0' &&
        typeof e.receipt === 'object' &&
        e.receipt !== null &&
        typeof e.plan === 'object' &&
        e.plan !== null &&
        typeof e.status === 'object' &&
        e.status !== null &&
        typeof e.execution_profile === 'object' &&
        e.execution_profile !== null &&
        typeof e.output_hash === 'string' &&
        typeof e.captured_at === 'string' &&
        typeof e.environment === 'object' &&
        e.environment !== null);
}
/**
 * JSON Schema for ExplainSnapshot (for external validation)
 */
export const EXPLAIN_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wasm4pm.dev/schemas/explain/1.0',
    title: 'ExplainSnapshot',
    description: 'Complete execution snapshot for debugging and reproducibility',
    type: 'object',
    required: [
        'schema_version',
        'receipt',
        'plan',
        'status',
        'execution_profile',
        'output_hash',
        'captured_at',
        'environment',
    ],
    properties: {
        schema_version: { type: 'string', const: '1.0' },
        receipt: { $ref: 'https://wasm4pm.dev/schemas/receipt/1.0' },
        plan: { $ref: 'https://wasm4pm.dev/schemas/plan/1.0' },
        status: { $ref: 'https://wasm4pm.dev/schemas/status/1.0' },
        execution_profile: {
            type: 'object',
            required: ['phases', 'resources', 'total_duration_ms'],
            properties: {
                phases: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['phase', 'start', 'end', 'duration_ms'],
                        properties: {
                            phase: { type: 'string' },
                            start: { type: 'string', format: 'date-time' },
                            end: { type: 'string', format: 'date-time' },
                            duration_ms: { type: 'number', minimum: 0 },
                        },
                        additionalProperties: false,
                    },
                },
                resources: {
                    type: 'object',
                    required: ['peak_memory_bytes', 'events_processed', 'algorithm_invocations'],
                    properties: {
                        peak_memory_bytes: { type: 'integer', minimum: 0 },
                        events_processed: { type: 'integer', minimum: 0 },
                        algorithm_invocations: { type: 'integer', minimum: 0 },
                    },
                    additionalProperties: false,
                },
                total_duration_ms: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
        },
        output_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        captured_at: { type: 'string', format: 'date-time' },
        environment: {
            type: 'object',
            required: ['platform', 'runtime_version', 'package_version'],
            properties: {
                platform: { type: 'string' },
                runtime_version: { type: 'string' },
                package_version: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    additionalProperties: false,
};
//# sourceMappingURL=explain.js.map