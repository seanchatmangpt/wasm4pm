/**
 * hashing.ts
 * Deterministic hashing for algorithm output
 * Ensures same input always produces the same hash, regardless of key ordering
 *
 * Uses Node.js built-in crypto (SHA-256) for zero-dependency portability.
 * For receipt/config hashing, use @wasm4pm/contracts hashData() (BLAKE3).
 */
/**
 * Normalize a value to a canonical JSON string (sorted keys)
 * Guarantees deterministic serialization
 */
export declare function canonicalize(value: unknown): string;
/**
 * Compute SHA-256 hash of arbitrary data
 * Deterministic: same data -> same hash, always
 *
 * @param data - Any JSON-serializable value
 * @returns Hex-encoded SHA-256 hash
 */
export declare function hashOutput(data: unknown): string;
/**
 * Compute SHA-256 hash of a raw string (no normalization)
 * Use when data is already in canonical form
 *
 * @param raw - Pre-normalized string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export declare function hashRaw(raw: string): string;
/**
 * Verify that data matches an expected hash
 *
 * @param data - Data to verify
 * @param expectedHash - Expected hex-encoded SHA-256 hash
 * @returns true if hash matches
 */
export declare function verifyOutputHash(data: unknown, expectedHash: string): boolean;
/**
 * Hash an algorithm result with metadata for provenance tracking
 *
 * @param algorithmId - Algorithm that produced the result
 * @param params - Parameters used
 * @param output - Algorithm output data
 * @returns Hex-encoded SHA-256 hash covering algorithm + params + output
 */
export declare function hashAlgorithmResult(algorithmId: string, params: Record<string, unknown>, output: unknown): string;
//# sourceMappingURL=hashing.d.ts.map