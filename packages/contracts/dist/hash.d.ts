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
 * Compute BLAKE3 hash of a configuration object.
 *
 * @param config A non-null configuration record.
 * @returns 64-character hex-encoded BLAKE3 hash.
 * @throws {TypeError} When `config` is null or undefined (see `hashData`).
 */
export declare function hashConfig(config: Record<string, unknown>): string;
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