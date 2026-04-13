/**
 * BLAKE3 hashing module for deterministic content hashing
 * All inputs are normalized via JSON serialization with sorted keys
 * Guarantees: same input -> same hash always
 */
/**
 * Compute BLAKE3 hash of arbitrary data
 * Deterministic: same data -> same hash always
 * @param data Any value to hash
 * @returns Hex-encoded BLAKE3 hash
 */
export declare function hashData(data: any): string;
/**
 * Verify a hash matches the content
 * @param content Data to hash
 * @param expectedHash Expected hex-encoded BLAKE3 hash
 * @returns True if hash matches, false otherwise
 */
export declare function verifyHash(content: any, expectedHash: string): boolean;
//# sourceMappingURL=hash.d.ts.map