/**
 * Receipt types and interfaces for process mining runtime
 * Schema version 1.0
 *
 * Provides cryptographic proof of execution with BLAKE3 hashing.
 * Deterministic: sorted keys ensure same input → same hash.
 */
/**
 * Type guard to check if a value is a valid Receipt
 */
export function isReceipt(value) {
    if (!value || typeof value !== 'object')
        return false;
    const receipt = value;
    return (typeof receipt.run_id === 'string' &&
        typeof receipt.schema_version === 'string' &&
        typeof receipt.config_hash === 'string' &&
        typeof receipt.input_hash === 'string' &&
        typeof receipt.plan_hash === 'string' &&
        typeof receipt.output_hash === 'string' &&
        typeof receipt.start_time === 'string' &&
        typeof receipt.end_time === 'string' &&
        typeof receipt.duration_ms === 'number' &&
        ['success', 'partial', 'failed'].includes(receipt.status) &&
        typeof receipt.summary === 'object' &&
        typeof receipt.algorithm === 'object' &&
        typeof receipt.model === 'object');
}
/**
 * JSON Schema for Receipt (for external validation)
 */
export const RECEIPT_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wasm4pm.dev/schemas/receipt/1.0',
    title: 'Receipt',
    description: 'Cryptographic proof of execution',
    type: 'object',
    required: [
        'run_id',
        'schema_version',
        'config_hash',
        'input_hash',
        'plan_hash',
        'output_hash',
        'start_time',
        'end_time',
        'duration_ms',
        'status',
        'summary',
        'algorithm',
        'model',
    ],
    properties: {
        run_id: { type: 'string', format: 'uuid' },
        schema_version: { type: 'string', const: '1.0' },
        config_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        input_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        plan_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        output_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        start_time: { type: 'string', format: 'date-time' },
        end_time: { type: 'string', format: 'date-time' },
        duration_ms: { type: 'number', minimum: 0 },
        status: { type: 'string', enum: ['success', 'partial', 'failed'] },
        error: {
            type: 'object',
            properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                stack: { type: 'string' },
                context: { type: 'object' },
            },
            required: ['code', 'message'],
        },
        summary: {
            type: 'object',
            required: ['traces_processed', 'objects_processed', 'variants_discovered'],
            properties: {
                traces_processed: { type: 'integer', minimum: 0 },
                objects_processed: { type: 'integer', minimum: 0 },
                variants_discovered: { type: 'integer', minimum: 0 },
            },
            additionalProperties: false,
        },
        algorithm: {
            type: 'object',
            required: ['name', 'version', 'parameters'],
            properties: {
                name: { type: 'string' },
                version: { type: 'string' },
                parameters: { type: 'object' },
            },
            additionalProperties: false,
        },
        model: {
            type: 'object',
            required: ['nodes', 'edges'],
            properties: {
                nodes: { type: 'integer', minimum: 0 },
                edges: { type: 'integer', minimum: 0 },
                artifacts: { type: 'object' },
            },
            additionalProperties: false,
        },
        profile: {
            type: 'object',
            required: ['peak_memory_bytes', 'phase_timings'],
            properties: {
                peak_memory_bytes: { type: 'integer', minimum: 0 },
                phase_timings: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['phase', 'duration_ms'],
                        properties: {
                            phase: { type: 'string' },
                            duration_ms: { type: 'number', minimum: 0 },
                        },
                        additionalProperties: false,
                    },
                },
                cpu_time_ms: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
        },
    },
    additionalProperties: false,
};
//# sourceMappingURL=receipt.js.map