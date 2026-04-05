/**
 * Required OTEL fields that must be present on all spans.
 * Per PRD SS18.2-3: every span must carry these attributes
 * for correlation, auditing, and reproducibility.
 */
/** Names of all required fields for validation */
export const REQUIRED_FIELD_NAMES = [
    'run.id',
    'config.hash',
    'input.hash',
    'plan.hash',
    'execution.profile',
    'source.kind',
    'sink.kind',
];
/**
 * Validate that all required fields are present and non-empty.
 * Returns list of missing/empty field names, or empty array if valid.
 */
export function validateRequiredFields(attrs) {
    const missing = [];
    for (const name of REQUIRED_FIELD_NAMES) {
        const val = attrs[name];
        if (val === undefined || val === null || val === '') {
            missing.push(name);
        }
    }
    return missing;
}
/**
 * Create a RequiredFields object with defaults for unset values.
 * Useful for early bootstrap when not all values are known yet.
 */
export function createRequiredFields(partial = {}) {
    return {
        'run.id': partial['run.id'] ?? 'unknown',
        'config.hash': partial['config.hash'] ?? 'unknown',
        'input.hash': partial['input.hash'] ?? 'unknown',
        'plan.hash': partial['plan.hash'] ?? 'unknown',
        'execution.profile': partial['execution.profile'] ?? 'default',
        'source.kind': partial['source.kind'] ?? 'unknown',
        'sink.kind': partial['sink.kind'] ?? 'unknown',
    };
}
