/**
 * BLAKE3 hashing module for deterministic content hashing
 * All inputs are normalized via JSON serialization with sorted keys
 * Guarantees: same input -> same hash always
 */
/**
 * Normalize a value for hashing: sort keys and serialize to JSON
 */
export declare function normalizeForHashing(data: unknown): string;
/**
 * Compute BLAKE3 hash of a configuration object
 */
export declare function hashConfig(config: Record<string, unknown>): string;
/**
 * Compute BLAKE3 hash of arbitrary data
 * Deterministic: same data -> same hash always
 * @param data Any value to hash
 * @returns Hex-encoded BLAKE3 hash
 */
export declare function hashData(data: unknown): string;
/**
 * Compute BLAKE3 hash of a JSON string
 * Useful for pre-serialized data
 */
export declare function hashJsonString(jsonString: string): string;
/**
 * Verify a hash matches the content
 * @param content Data to hash
 * @param expectedHash Expected hex-encoded BLAKE3 hash
 * @returns True if hash matches, false otherwise
 */
export declare function verifyHash(content: unknown, expectedHash: string): boolean;
//# sourceMappingURL=hash.d.ts.map