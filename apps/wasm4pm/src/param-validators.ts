/**
 * Parameter validation helpers for CLI commands.
 * Provides actionable error messages with suggestions.
 */

export interface ValidationResult {
  valid: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Validate and parse an integer parameter within a range.
 */
export function validatePositiveInteger(
  raw: string | undefined,
  name: string,
  defaultValue?: number,
  maxValue?: number
): ValidationResult {
  if (raw === undefined) {
    return defaultValue !== undefined
      ? { valid: true, value: defaultValue }
      : { valid: true, value: undefined };
  }

  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return {
      valid: false,
      error: `Invalid --${name} value: must be a positive integer (got "${raw}")`,
    };
  }

  if (parsed <= 0) {
    return {
      valid: false,
      error: `Invalid --${name} value: must be > 0 (got ${parsed})`,
    };
  }

  if (maxValue !== undefined && parsed > maxValue) {
    return {
      valid: false,
      error: `Invalid --${name} value: must be ≤ ${maxValue} (got ${parsed})`,
    };
  }

  return { valid: true, value: parsed };
}

/**
 * Validate and parse a float parameter within a range.
 */
export function validateFloatRange(
  raw: string | undefined,
  name: string,
  min: number,
  max: number,
  defaultValue?: number
): ValidationResult {
  if (raw === undefined) {
    return defaultValue !== undefined
      ? { valid: true, value: defaultValue }
      : { valid: true, value: undefined };
  }

  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) {
    return {
      valid: false,
      error: `Invalid --${name} value: must be a number in [${min}, ${max}] (got "${raw}")`,
    };
  }

  if (parsed < min || parsed > max) {
    return {
      valid: false,
      error: `Invalid --${name} value: must be in [${min}, ${max}] (got ${parsed})`,
    };
  }

  return { valid: true, value: parsed };
}

/**
 * Validate that a value is one of allowed choices.
 */
export function validateChoice(
  raw: string | undefined,
  name: string,
  allowed: string[],
  defaultValue?: string
): ValidationResult {
  if (raw === undefined) {
    return defaultValue !== undefined
      ? { valid: true, value: defaultValue }
      : { valid: true, value: undefined };
  }

  if (!allowed.includes(raw)) {
    return {
      valid: false,
      error: `Invalid --${name} value: must be one of [${allowed.join(', ')}] (got "${raw}")`,
    };
  }

  return { valid: true, value: raw };
}

/**
 * Format a validation error for CLI output.
 */
export function formatValidationError(error: string, hint?: string): string {
  const base = `✗ ${error}`;
  return hint ? `${base}\n  Hint: ${hint}` : base;
}
