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
 * Compute BLAKE3 hash of a configuration object.
 *
 * @param config A non-null configuration record.
 * @returns 64-character hex-encoded BLAKE3 hash.
 * @throws {TypeError} When `config` is null or undefined (see `hashData`).
 */
export function hashConfig(config: Record<string, unknown>): string {
  const normalized = normalizeForHashing(config);
  const hashResult = hash(Buffer.from(normalized, 'utf-8'));
  return hashResult.toString('hex');
}

/**
 * Compute BLAKE3 hash of arbitrary data.
 * Deterministic: same input always produces the same hash.
 *
 * @param data Any JSON-serialisable value to hash.
 * @returns 64-character hex-encoded BLAKE3 hash (256 bits).
 * @throws {TypeError} When `data` is `undefined` or `null`, because hashing
 *   empty/absent data produces a valid-looking hash that is indistinguishable
 *   from a hash of real content — a silent falsification of the provenance chain.
 *   Pass a concrete value or an explicit sentinel (e.g. `hashData('')`) instead.
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
