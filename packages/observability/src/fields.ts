/**
 * Required OTEL fields that must be present on all spans.
 * Per PRD SS18.2-3: every span must carry these attributes
 * for correlation, auditing, and reproducibility.
 */

/**
 * Required attributes on every OTEL span.
 */
export interface RequiredFields {
  /** Unique execution run identifier (UUID) */
  'run.id': string;
  /** BLAKE3 hash of the resolved configuration */
  'config.hash': string;
  /** BLAKE3 hash of the input data */
  'input.hash': string;
  /** BLAKE3 hash of the execution plan */
  'plan.hash': string;
  /** Execution profile name (e.g. "fast", "balanced", "quality") */
  'execution.profile': string;
  /** Source connector kind (e.g. "xes", "csv", "parquet") */
  'source.kind': string;
  /** Sink connector kind (e.g. "petri_net", "dfg", "json") */
  'sink.kind': string;
}

/** Names of all required fields for validation */
export const REQUIRED_FIELD_NAMES: ReadonlyArray<keyof RequiredFields> = [
  'run.id',
  'config.hash',
  'input.hash',
  'plan.hash',
  'execution.profile',
  'source.kind',
  'sink.kind',
] as const;

/**
 * Validate that all required fields are present and non-empty.
 * Returns list of missing/empty field names, or empty array if valid.
 */
export function validateRequiredFields(
  attrs: Record<string, unknown>
): string[] {
  const missing: string[] = [];
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
export function createRequiredFields(
  partial: Partial<RequiredFields> = {}
): RequiredFields {
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
