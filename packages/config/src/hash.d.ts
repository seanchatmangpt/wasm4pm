import type { BaseConfig } from './types.js';
/**
 * Deterministic JSON.stringify with sorted keys at all levels.
 *
 * Used throughout the hashing layer to ensure that the same object
 * produces the same JSON string regardless of property insertion order.
 *
 * **Algorithm:**
 * 1. Recursively traverse the object tree
 * 2. For each object, sort keys alphabetically
 * 3. Skip undefined values
 * 4. Arrays preserve order (not sorted)
 * 5. Primitives and null pass through unchanged
 *
 * @param obj The object to stringify
 * @returns Canonical JSON string with sorted keys
 */
export declare function stableStringify(obj: unknown): string;
/**
 * Computes BLAKE3 hash of an object as a 128-character hex string.
 *
 * Uses stable stringification to ensure deterministic hashing.
 * Result is always lowercase hex, exactly 128 characters (256 bits).
 *
 * @param obj The object to hash
 * @returns BLAKE3 hex-64 (128 character string)
 */
export declare function blake3Hex(obj: unknown): string;
/**
 * Compute BLAKE3 hash of configuration.
 */
export declare function hashConfig(config: BaseConfig): string;
//# sourceMappingURL=hash.d.ts.map