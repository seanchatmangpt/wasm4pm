/**
 * BLAKE3 hashing module for deterministic content hashing
 * All inputs are normalized via JSON serialization with sorted keys
 * Guarantees: same input -> same hash always
 */

import { hash } from 'blake3';

/**
 * Recursively sort object keys to ensure deterministic serialization
 * @param obj Any JSON-serializable value
 * @returns Sorted object or primitive value
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();

  for (const key of keys) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }

  return sorted;
}

/**
 * Normalize a value for hashing: sort keys and serialize to JSON
 */
export function normalizeForHashing(data: unknown): string {
  const sorted = sortKeys(data);
  return JSON.stringify(sorted);
}

/**
 * Compute BLAKE3 hash of a configuration object
 */
export function hashConfig(config: Record<string, any>): string {
  const normalized = normalizeForHashing(config);
  const hashResult = hash(Buffer.from(normalized, 'utf-8'));
  return hashResult.toString('hex');
}

/**
 * Compute BLAKE3 hash of arbitrary data
 * Deterministic: same data -> same hash always
 * @param data Any value to hash
 * @returns Hex-encoded BLAKE3 hash
 */
export function hashData(data: unknown): string {
  const normalized = normalizeForHashing(data);
  const hashResult = hash(Buffer.from(normalized, 'utf-8'));
  return hashResult.toString('hex');
}

/**
 * Compute BLAKE3 hash of a JSON string
 * Useful for pre-serialized data
 */
export function hashJsonString(jsonString: string): string {
  const hashResult = hash(Buffer.from(jsonString, 'utf-8'));
  return hashResult.toString('hex');
}

/**
 * Verify a hash matches the content
 * @param content Data to hash
 * @param expectedHash Expected hex-encoded BLAKE3 hash
 * @returns True if hash matches, false otherwise
 */
export function verifyHash(content: unknown, expectedHash: string): boolean {
  const computedHash = hashData(content);
  return computedHash === expectedHash;
}
