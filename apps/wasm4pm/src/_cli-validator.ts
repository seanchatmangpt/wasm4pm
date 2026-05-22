/**
 * CLI Parameter Validation Utility — Centralized numeric arg validation
 *
 * Standardizes parameter parsing and error messages across all commands.
 * Prevents silent failures with NaN/Infinity values.
 */

export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  error?: string;
}

/**
 * Validate and parse a positive integer parameter
 * @param value Raw string value from CLI
 * @param paramName Human-readable parameter name (for error messages)
 * @param defaultValue Default to use if value is undefined
 * @param options Optional constraints (min, max)
 */
export function validatePositiveInt(
  value: string | undefined,
  paramName: string,
  defaultValue: number,
  options?: { min?: number; max?: number }
): ValidationResult<number> {
  if (value === undefined) {
    return { success: true, value: defaultValue };
  }

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be a positive integer, got '${value}'`,
    };
  }

  if (parsed <= 0) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be positive, got ${parsed}`,
    };
  }

  if (options?.min !== undefined && parsed < options.min) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be >= ${options.min}, got ${parsed}`,
    };
  }

  if (options?.max !== undefined && parsed > options.max) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be <= ${options.max}, got ${parsed}`,
    };
  }

  return { success: true, value: parsed };
}

/**
 * Validate and parse a floating-point parameter within a range
 * @param value Raw string value from CLI
 * @param paramName Human-readable parameter name
 * @param defaultValue Default to use if value is undefined
 * @param min Inclusive minimum (for range parameters like alpha, threshold)
 * @param max Inclusive maximum
 */
export function validateFloatInRange(
  value: string | undefined,
  paramName: string,
  defaultValue: number,
  min: number = 0,
  max: number = 1
): ValidationResult<number> {
  if (value === undefined) {
    return { success: true, value: defaultValue };
  }

  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be a number, got '${value}'`,
    };
  }

  if (parsed < min || parsed > max) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be in range [${min}, ${max}], got ${parsed}`,
    };
  }

  return { success: true, value: parsed };
}

/**
 * Validate and parse a string parameter from an enum of allowed values
 * @param value Raw string value from CLI
 * @param paramName Human-readable parameter name
 * @param defaultValue Default to use if value is undefined
 * @param allowed Array of allowed string values
 */
export function validateEnum<T extends string>(
  value: string | undefined,
  paramName: string,
  defaultValue: T,
  allowed: readonly T[]
): ValidationResult<T> {
  if (value === undefined) {
    return { success: true, value: defaultValue };
  }

  if (!allowed.includes(value as T)) {
    return {
      success: false,
      error: `Invalid --${paramName}: must be one of [${allowed.join(', ')}], got '${value}'`,
    };
  }

  return { success: true, value: value as T };
}

/**
 * Exit with validation error message
 * @param error Error message to display
 * @param exitCode Exit code to use (defaults to 1)
 */
export function exitValidationError(error: string, exitCode: number = 1): void {
  console.error(error);
  process.exit(exitCode);
}
