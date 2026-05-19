/**
 * Input validation utilities for CLI commands.
 * Prevents cryptic WASM panics and provides actionable error messages.
 *
 * Key gaps addressed:
 * 1. File path validation (existence + permissions)
 * 2. Algorithm name validation against kernel registry
 * 3. Parameter range validation (k-NN k, PCA components, thresholds)
 * 4. Enum validation (precision modes, output formats)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  absPath?: string;
}

export interface AlgorithmValidationResult {
  valid: boolean;
  error?: string;
  registryId?: string; // The canonical kernel registry ID
  suggestion?: string;
}

/**
 * Validate that a file exists and is readable.
 * Returns absolute path on success.
 */
export async function validateInputFile(filePath: string): Promise<FileValidationResult> {
  if (!filePath || filePath.trim().length === 0) {
    return { valid: false, error: 'File path must not be empty' };
  }

  const absPath = path.resolve(filePath);

  try {
    await fs.access(absPath, fs.constants.F_OK);
  } catch {
    return {
      valid: false,
      error: `Input file not found: ${absPath}\n\nCheck that the path is correct and the file exists.`,
    };
  }

  try {
    await fs.access(absPath, fs.constants.R_OK);
  } catch {
    return {
      valid: false,
      error: `Input file is not readable: ${absPath}\n\nCheck file permissions with: ls -la "${absPath}"`,
    };
  }

  return { valid: true, absPath };
}

/**
 * Validate that output directory is writable.
 */
export async function validateOutputDir(dirPath: string): Promise<FileValidationResult> {
  if (!dirPath || dirPath.trim().length === 0) {
    return { valid: false, error: 'Output directory path must not be empty' };
  }

  const absPath = path.resolve(dirPath);
  const parentDir = path.dirname(absPath);

  try {
    await fs.access(parentDir, fs.constants.W_OK);
  } catch {
    return {
      valid: false,
      error: `Output directory is not writable: ${parentDir}\n\nCheck permissions with: chmod 755 "${parentDir}"`,
    };
  }

  return { valid: true, absPath };
}

/**
 * Validate an algorithm name against the kernel registry.
 * Accepts both CLI aliases (heuristic) and kernel IDs (heuristic_miner).
 */
export function validateAlgorithm(algoName: string): AlgorithmValidationResult {
  if (!algoName || algoName.trim().length === 0) {
    return {
      valid: false,
      error: 'Algorithm name must not be empty',
      suggestion: 'Run: wpm algorithms',
    };
  }

  // Lazy import to avoid WASM initialization in tests
  const { getRegistry } = require('@wasm4pm/kernel');
  const registry = getRegistry();
  const allAlgos = registry.list();
  const algoIds = (allAlgos as { id: string }[]).map((a) => a.id);

  // Try exact match first
  if (algoIds.includes(algoName)) {
    return { valid: true, registryId: algoName };
  }

  // Try lowercase match
  const lowerAlgo = algoName.toLowerCase().replace(/[+_]/g, '-');
  const matched = algoIds.find(
    (id: string) => id === lowerAlgo || id === lowerAlgo.replace(/-plus-plus/, '-')
  );

  if (matched) {
    return { valid: true, registryId: matched };
  }

  // Suggest similar names using Levenshtein distance
  const suggestion = findClosestAlgorithm(algoName, algoIds);
  return {
    valid: false,
    error: `Unknown algorithm: "${algoName}"`,
    suggestion: suggestion ? `Did you mean: "${suggestion}"?` : 'Run: wpm algorithms',
  };
}

/**
 * Find the closest matching algorithm name using simple string distance.
 */
function findClosestAlgorithm(target: string, candidates: string[]): string | null {
  let closest: string | null = null;
  let minDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshteinDistance(target.toLowerCase(), candidate.toLowerCase());
    if (dist < minDist && dist <= target.length / 2 + 1) {
      closest = candidate;
      minDist = dist;
    }
  }

  return closest;
}

/**
 * Levenshtein distance for typo detection.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Validate k-NN k value (number of neighbors or clusters).
 * Common issues: k > sample size, k < 1, non-integer.
 */
export function validateKValue(
  rawK: string | undefined,
  sampleSize?: number,
  maxK?: number
): { valid: boolean; value?: number; error?: string } {
  if (rawK === undefined || rawK.trim().length === 0) {
    return { valid: true, value: 3 }; // default
  }

  const k = parseInt(rawK, 10);

  if (Number.isNaN(k)) {
    return {
      valid: false,
      error: `Invalid --k value: "${rawK}" must be a positive integer (got NaN)`,
    };
  }

  if (k < 1) {
    return {
      valid: false,
      error: `Invalid --k value: ${k} must be ≥ 1 (k-NN requires at least 1 neighbor)`,
    };
  }

  if (sampleSize && k > sampleSize) {
    return {
      valid: false,
      error: `Invalid --k value: ${k} exceeds sample size (${sampleSize} cases).\n\nk-NN requires k < sample size. Use: --k ${Math.max(1, sampleSize - 1)}`,
    };
  }

  if (maxK && k > maxK) {
    return {
      valid: false,
      error: `Invalid --k value: ${k} exceeds maximum (${maxK})`,
    };
  }

  return { valid: true, value: k };
}

/**
 * Validate PCA n-components value.
 * Common issue: n-components >= feature count, or n-components < 1.
 */
export function validateNComponents(
  rawN: string | undefined,
  featureCount?: number
): { valid: boolean; value?: number; error?: string } {
  if (rawN === undefined || rawN.trim().length === 0) {
    return { valid: true, value: 2 }; // default
  }

  const n = parseInt(rawN, 10);

  if (Number.isNaN(n)) {
    return {
      valid: false,
      error: `Invalid --n-components value: "${rawN}" must be a positive integer`,
    };
  }

  if (n < 1) {
    return {
      valid: false,
      error: `Invalid --n-components value: ${n} must be ≥ 1`,
    };
  }

  if (featureCount && n > featureCount) {
    return {
      valid: false,
      error: `Invalid --n-components value: ${n} exceeds feature count (${featureCount}).\n\nPCA requires n-components < feature count. Use: --n-components ${Math.max(1, featureCount - 1)}`,
    };
  }

  return { valid: true, value: n };
}

/**
 * Validate fitness/precision threshold (0-1 range).
 */
export function validateThreshold(
  rawThreshold: string | undefined
): { valid: boolean; value?: number; error?: string } {
  if (rawThreshold === undefined || rawThreshold.trim().length === 0) {
    return { valid: true, value: 0.8 }; // default
  }

  const thresh = parseFloat(rawThreshold);

  if (Number.isNaN(thresh)) {
    return {
      valid: false,
      error: `Invalid threshold value: "${rawThreshold}" must be a number in [0, 1]`,
    };
  }

  if (thresh < 0 || thresh > 1) {
    return {
      valid: false,
      error: `Invalid threshold value: ${thresh} must be in [0, 1] (got ${thresh})`,
    };
  }

  return { valid: true, value: thresh };
}

/**
 * Validate forecast periods (must be positive).
 */
export function validateForecastPeriods(
  rawPeriods: string | undefined
): { valid: boolean; value?: number; error?: string } {
  if (rawPeriods === undefined || rawPeriods.trim().length === 0) {
    return { valid: true, value: 5 }; // default
  }

  const periods = parseInt(rawPeriods, 10);

  if (Number.isNaN(periods)) {
    return {
      valid: false,
      error: `Invalid --forecast-periods value: "${rawPeriods}" must be a positive integer`,
    };
  }

  if (periods < 1) {
    return {
      valid: false,
      error: `Invalid --forecast-periods value: ${periods} must be ≥ 1`,
    };
  }

  if (periods > 365) {
    return {
      valid: false,
      error: `Invalid --forecast-periods value: ${periods} exceeds maximum (365 periods).\n\nLong forecasts have low reliability. Use: --forecast-periods 30 or less`,
    };
  }

  return { valid: true, value: periods };
}

/**
 * Validate DBSCAN epsilon (must be positive).
 */
export function validateEpsilon(
  rawEps: string | undefined
): { valid: boolean; value?: number; error?: string } {
  if (rawEps === undefined || rawEps.trim().length === 0) {
    return { valid: true, value: 1.0 }; // default
  }

  const eps = parseFloat(rawEps);

  if (Number.isNaN(eps)) {
    return {
      valid: false,
      error: `Invalid --eps value: "${rawEps}" must be a positive number`,
    };
  }

  if (eps <= 0) {
    return {
      valid: false,
      error: `Invalid --eps value: ${eps} must be > 0 (epsilon is the DBSCAN neighborhood radius)`,
    };
  }

  return { valid: true, value: eps };
}

/**
 * Resolve the input path from a positional argument or a named --input/-i flag.
 * Returns the first defined non-empty string, or undefined if neither is set.
 * Callers should emit a MISSING_INPUT config error when the return value is undefined.
 */
export function resolveInputPath(
  positional: string | undefined,
  named: string | undefined
): string | undefined {
  const resolved = positional || named;
  return resolved && resolved.trim().length > 0 ? resolved.trim() : undefined;
}

/**
 * Validate activity key is not empty.
 */
export function validateActivityKey(
  rawKey: string | undefined
): { valid: boolean; value?: string; error?: string } {
  if (rawKey === undefined || rawKey.trim().length === 0) {
    return { valid: true, value: 'concept:name' }; // XES default
  }

  if (rawKey.includes('\n') || rawKey.includes('\0')) {
    return {
      valid: false,
      error: `Invalid activity key: contains null or newline characters`,
    };
  }

  return { valid: true, value: rawKey.trim() };
}
