/**
 * hashing.ts
 * Deterministic hashing for algorithm output
 * Ensures same input always produces the same hash, regardless of key ordering
 *
 * Uses Node.js built-in crypto (SHA-256) for zero-dependency portability.
 * For receipt/config hashing, use @pictl/contracts hashData() (BLAKE3).
 */

import { createHash } from 'node:crypto';

/**
 * Recursively sort object keys for deterministic serialization
 */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Normalize a value to a canonical JSON string (sorted keys)
 * Guarantees deterministic serialization
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/**
 * Compute SHA-256 hash of arbitrary data
 * Deterministic: same data -> same hash, always
 *
 * @param data - Any JSON-serializable value
 * @returns Hex-encoded SHA-256 hash
 */
export function hashOutput(data: unknown): string {
  const normalized = canonicalize(data);
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * Compute SHA-256 hash of a raw string (no normalization)
 * Use when data is already in canonical form
 *
 * @param raw - Pre-normalized string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashRaw(raw: string): string {
  return createHash('sha256').update(raw, 'utf-8').digest('hex');
}

/**
 * Verify that data matches an expected hash
 *
 * @param data - Data to verify
 * @param expectedHash - Expected hex-encoded SHA-256 hash
 * @returns true if hash matches
 */
export function verifyOutputHash(data: unknown, expectedHash: string): boolean {
  return hashOutput(data) === expectedHash;
}

/**
 * Hash an algorithm result with metadata for provenance tracking
 *
 * @param algorithmId - Algorithm that produced the result
 * @param params - Parameters used
 * @param output - Algorithm output data
 * @returns Hex-encoded SHA-256 hash covering algorithm + params + output
 */
export function hashAlgorithmResult(
  algorithmId: string,
  params: Record<string, unknown>,
  output: unknown
): string {
  const envelope = {
    algorithm: algorithmId,
    params,
    output,
  };
  return hashOutput(envelope);
}
