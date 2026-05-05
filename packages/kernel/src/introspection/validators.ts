/**
 * introspection/validators.ts
 *
 * Zod validation schemas for ML, prediction, and RL inputs.
 * Provides type-safe, domain-oracle-backed validation with detailed error paths.
 *
 * Domain oracle: Validation rules are derived from ml-rl-testing.md (Rank 2: domain contract).
 */

import { z } from 'zod';
import { type PredictionPerspective } from '../prediction/types.js';

/**
 * Result of validation operation.
 */
export interface ValidatorResult<T = unknown> {
  /** Validation passed? */
  success: boolean;

  /** Parsed/validated data (if success) */
  data?: T;

  /** Validation errors (if failure) */
  errors?: Array<{
    path: string;
    message: string;
    hint?: string;
  }>;
}

/**
 * Configuration for algorithm-specific parameters.
 */
export const algorithmConfigSchema = z.object({
  method: z.string().min(1).optional(),
  k: z.number().int().positive().max(50).optional(),
  eps: z.number().positive().max(5).optional(),
  minPts: z.number().int().positive().max(50).optional(),
  alpha: z.number().positive().max(1).optional(),
  testSplit: z.number().min(0.05).max(0.5).optional(),
  nComponents: z.number().int().positive().max(50).optional(),
  forecastHorizon: z.number().int().positive().max(100).optional(),
});

/**
 * Configuration for ML feature extraction.
 */
export const featureMatrixConfigSchema = z.object({
  includeRework: z.boolean().optional(),
  activityKey: z.string().min(1).default('concept:name'),
  normalizeFeatures: z.boolean().optional(),
});

/**
 * Configuration for prediction tasks.
 */
export const predictionTaskConfigSchema = z.object({
  perspective: z.enum([
    'next_activity',
    'remaining_time',
    'outcome',
    'drift',
    'features',
    'resource',
  ] as const),
  activityKey: z.string().min(1).default('concept:name'),
  maxPrefixLength: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
  // perspective-specific overrides
  ngramOrder: z.number().int().min(1).max(8).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  aggregator: z.enum(['mean', 'median']).optional(),
  windowSize: z.number().int().min(5).max(10000).optional(),
  ewmaAlpha: z.number().positive().max(1).optional(),
  driftThreshold: z.number().min(0).max(1).optional(),
  ucbC: z.number().positive().optional(),
});

/**
 * Feature matrix validation: row count, column count consistency, numeric content.
 */
export const featureMatrixSchema = z.object({
  data: z.array(z.array(z.number())).min(1).describe('At least 1 row'),
  featureNames: z.array(z.string()).describe('Feature column names'),
  caseIds: z.array(z.string()).describe('Row identifiers'),
  targets: z.array(z.number()).optional(),
  labels: z.array(z.string()).optional(),
});

/**
 * Collection of validators for easy access.
 */
export class Validators {
  /**
   * Validate feature matrix.
   *
   * @example
   * ```typescript
   * const result = validators.validateFeatureMatrix({
   *   data: [[1, 2], [3, 4]],
   *   featureNames: ['f1', 'f2'],
   *   caseIds: ['case-1', 'case-2']
   * });
   * ```
   */
  public static validateFeatureMatrix(value: unknown): ValidatorResult {
    try {
      // First, basic row consistency check
      if (typeof value !== 'object' || value === null) {
        return {
          success: false,
          errors: [
            {
              path: 'root',
              message: 'Expected object',
              hint: 'Feature matrix should be { data, featureNames, caseIds }',
            },
          ],
        };
      }

      const obj = value as any;
      if (!Array.isArray(obj.data)) {
        return {
          success: false,
          errors: [
            {
              path: 'data',
              message: 'Expected array of arrays',
              hint: 'data should be number[][] where each row has the same column count',
            },
          ],
        };
      }

      // Check consistency
      if (obj.data.length === 0) {
        return {
          success: false,
          errors: [
            {
              path: 'data',
              message: 'Feature matrix is empty (0 rows)',
              hint: 'Provide at least 1 row of data for training',
            },
          ],
        };
      }

      const firstRowLen = obj.data[0].length;
      for (let i = 0; i < obj.data.length; i++) {
        const row = obj.data[i];
        if (!Array.isArray(row)) {
          return {
            success: false,
            errors: [
              {
                path: `data[${i}]`,
                message: 'Expected array',
                hint: 'Each row should be an array of numbers',
              },
            ],
          };
        }

        if (row.length !== firstRowLen) {
          return {
            success: false,
            errors: [
              {
                path: `data[${i}]`,
                message: `Inconsistent column count: row ${i} has ${row.length} columns, expected ${firstRowLen}`,
                hint: `Ensure all rows have the same number of columns`,
              },
            ],
          };
        }

        for (let j = 0; j < row.length; j++) {
          const val = row[j];
          if (!Number.isFinite(val)) {
            return {
              success: false,
              errors: [
                {
                  path: `data[${i}][${j}]`,
                  message: `Invalid numeric value: ${typeof val === 'number' ? 'NaN or Infinity' : typeof val}`,
                  hint: 'Feature values must be finite numbers (no NaN, no Infinity, no null)',
                },
              ],
            };
          }
        }
      }

      // Validate featureNames array length
      if (obj.featureNames && Array.isArray(obj.featureNames)) {
        if (obj.featureNames.length !== firstRowLen) {
          return {
            success: false,
            errors: [
              {
                path: 'featureNames',
                message: `Feature count mismatch: ${obj.featureNames.length} names for ${firstRowLen} columns`,
              },
            ],
          };
        }
      }

      // If we got here, basic validation passed
      const parsed = featureMatrixSchema.parse(value);
      return { success: true, data: parsed };
    } catch (error: any) {
      return {
        success: false,
        errors: [
          {
            path: 'validation',
            message: error.message || 'Validation failed',
          },
        ],
      };
    }
  }

  /**
   * Validate prediction task configuration.
   *
   * @example
   * ```typescript
   * const result = validators.validatePredictionTask({
   *   perspective: 'next_activity',
   *   ngramOrder: 2,
   *   topK: 5
   * });
   * ```
   */
  public static validatePredictionTask(value: unknown): ValidatorResult {
    try {
      const parsed = predictionTaskConfigSchema.parse(value);
      return { success: true, data: parsed };
    } catch (error: any) {
      const errors = [];
      if (error.issues) {
        errors.push(
          ...error.issues.map((issue: any) => ({
            path: issue.path.join('.') || 'root',
            message: issue.message,
            hint: `Expected ${issue.expected}, got ${issue.received}`,
          }))
        );
      }
      return {
        success: false,
        errors: errors.length > 0 ? errors : [{ path: 'unknown', message: error.message }],
      };
    }
  }

  /**
   * Validate algorithm-specific parameters.
   *
   * @example
   * ```typescript
   * const result = validators.validateAlgorithmConfig({
   *   method: 'kmeans',
   *   k: 5
   * });
   * ```
   */
  public static validateAlgorithmConfig(value: unknown): ValidatorResult {
    try {
      const parsed = algorithmConfigSchema.parse(value);
      return { success: true, data: parsed };
    } catch (error: any) {
      return {
        success: false,
        errors: [{ path: 'root', message: error.message }],
      };
    }
  }

  /**
   * Validate numeric parameter is within bounds.
   *
   * @example
   * ```typescript
   * validators.validateRange('k', 5, { min: 1, max: 50 });
   * ```
   */
  public static validateRange(
    paramName: string,
    value: number,
    constraints: { min?: number; max?: number }
  ): ValidatorResult {
    if (!Number.isFinite(value)) {
      return {
        success: false,
        errors: [
          {
            path: paramName,
            message: `Expected finite number, got ${value}`,
          },
        ],
      };
    }

    if (constraints.min !== undefined && value < constraints.min) {
      return {
        success: false,
        errors: [
          {
            path: paramName,
            message: `Value ${value} is less than minimum ${constraints.min}`,
            hint: `Try: ${paramName} = ${Math.max(value, constraints.min)}`,
          },
        ],
      };
    }

    if (constraints.max !== undefined && value > constraints.max) {
      return {
        success: false,
        errors: [
          {
            path: paramName,
            message: `Value ${value} exceeds maximum ${constraints.max}`,
            hint: `Try: ${paramName} = ${Math.min(value, constraints.max)}`,
          },
        ],
      };
    }

    return { success: true, data: value };
  }

  /**
   * Validate that prediction perspective is supported.
   *
   * @example
   * ```typescript
   * validators.validatePerspective('next_activity');
   * ```
   */
  public static validatePerspective(value: string): ValidatorResult {
    const valid = ['next_activity', 'remaining_time', 'outcome', 'drift', 'features', 'resource'];

    if (!valid.includes(value)) {
      return {
        success: false,
        errors: [
          {
            path: 'perspective',
            message: `Invalid perspective: '${value}'`,
            hint: `Valid options: ${valid.join(', ')}`,
          },
        ],
      };
    }

    return { success: true, data: value as PredictionPerspective };
  }
}

/**
 * Get the validators singleton.
 *
 * @returns Validators instance
 *
 * @example
 * ```typescript
 * import { getConfigValidators } from '@wasm4pm/kernel/introspection';
 *
 * const validators = getConfigValidators();
 * const result = validators.validateFeatureMatrix(data);
 * if (!result.success) {
 *   console.error(result.errors);
 * }
 * ```
 */
export function getConfigValidators(): typeof Validators {
  return Validators;
}

/**
 * Helper to format validation errors for console output.
 *
 * @param result - Validation result
 * @returns Formatted error string
 */
export function formatValidationErrors(result: ValidatorResult): string {
  if (result.success) return 'Validation passed ✓';

  const lines: string[] = ['Validation failed:'];
  result.errors?.forEach((err) => {
    lines.push(`  ${err.path}: ${err.message}`);
    if (err.hint) {
      lines.push(`    💡 ${err.hint}`);
    }
  });

  return lines.join('\n');
}
