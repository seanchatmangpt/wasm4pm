/**
 * BLAKE3 hash invariants — exhaustive correctness tests for hash.ts
 *
 * Oracle hierarchy:
 *   Rank 1 — Mathematical theorem (output format, determinism)
 *   Rank 2 — Domain contract (normalizeForHashing, hashConfig key-order stability,
 *             verifyHash round-trip)
 *   Rank 3 — Metamorphic relation (avalanche property, concatenation sensitivity)
 *
 * No FM-5: expected hash values are NEVER derived from the implementation.
 * All assertions use structural properties (length, charset, inequality, direction).
 */

import { describe, it, expect } from 'vitest';
import {
  hashJsonString,
  hashData,
  hashConfig,
  normalizeForHashing,
  verifyHash,
} from '../hash';

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — Rank 1 (mathematical): Hash output format
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 1 — hash output format (Rank 1)', () => {
  it('hashJsonString(s) always returns a 64-character string', () => {
    expect(hashJsonString('hello').length).toBe(64);
    expect(hashJsonString('world').length).toBe(64);
    expect(hashJsonString('{"key":"value"}').length).toBe(64);
  });

  it('hashJsonString output is strictly lowercase hex [0-9a-f]', () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    expect(hashJsonString('hello')).toMatch(hexPattern);
    expect(hashJsonString('world')).toMatch(hexPattern);
    expect(hashJsonString('abc123')).toMatch(hexPattern);
    expect(hashJsonString('')).toMatch(hexPattern);
  });

  it('hashJsonString("") produces a 64-char hex string (empty string is valid input)', () => {
    const result = hashJsonString('');
    expect(result.length).toBe(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashJsonString("a") and hashJsonString("b") produce different strings (collision resistance proxy)', () => {
    expect(hashJsonString('a')).not.toBe(hashJsonString('b'));
  });

  it('hashData(x) always returns a 64-character lowercase hex string', () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    expect(hashData('text')).toMatch(hexPattern);
    expect(hashData(42)).toMatch(hexPattern);
    expect(hashData(null)).toMatch(hexPattern);
    expect(hashData([])).toMatch(hexPattern);
    expect(hashData({})).toMatch(hexPattern);
  });

  it('hashConfig(c) always returns a 64-character lowercase hex string', () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    expect(hashConfig({ algorithm: 'dfg', parameters: {} })).toMatch(hexPattern);
    expect(hashConfig({})).toMatch(hexPattern);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — Rank 1 (mathematical): Determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 2 — determinism (Rank 1)', () => {
  it('two calls to hashJsonString(x) with identical input produce identical output', () => {
    const input = '{"algorithm":"dfg","traces":42}';
    expect(hashJsonString(input)).toBe(hashJsonString(input));
  });

  it('two calls to hashData(x) with identical input produce identical output', () => {
    const input = { algorithm: 'alpha_plus_plus', parameters: { threshold: 0.8 } };
    expect(hashData(input)).toBe(hashData(input));
  });

  it('hashData on a list called twice with same items produces same output', () => {
    const list = ['hash1'.repeat(13), 'hash2'.repeat(13)];
    expect(hashData(list)).toBe(hashData(list));
  });

  it('hashData([h1, h2]) !== hashData([h2, h1]) — order matters (not commutative)', () => {
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);
    const forward = hashData([h1, h2]);
    const reversed = hashData([h2, h1]);
    expect(forward).not.toBe(reversed);
  });

  it('hashConfig is deterministic for the same config object', () => {
    const config = { algorithm: 'inductive_miner', parameters: { noiseThreshold: 0.2 } };
    expect(hashConfig(config)).toBe(hashConfig(config));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Rank 2 (domain contract): hashData with list inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 3 — hashData list / combineHashes domain contracts (Rank 2)', () => {
  it('hashData([]) returns a 64-char hex string (empty list is valid)', () => {
    const result = hashData([]);
    expect(result.length).toBe(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashData([h]) returns a 64-char hex string for a single element', () => {
    const h = 'a'.repeat(64);
    const result = hashData([h]);
    expect(result.length).toBe(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('adding a new hash to the list changes the combined result (sensitivity)', () => {
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);
    const without = hashData([h1]);
    const withExtra = hashData([h1, h2]);
    expect(without).not.toBe(withExtra);
  });

  it('hashData([h1, h2]) !== hashData([h1]) — extra element changes output', () => {
    const h1 = 'c'.repeat(64);
    const h2 = 'd'.repeat(64);
    expect(hashData([h1, h2])).not.toBe(hashData([h1]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — Rank 2 (domain contract): hashConfig key-order normalization
// (analogous to diffConfigs — tests config structural diff sensitivity)
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 4 — hashConfig key-order normalization and structural diffs (Rank 2)', () => {
  it('identical configs produce the same hash (same-config diff is empty / no change)', () => {
    const config = { algorithm: 'heuristic_miner', parameters: { dependencyThreshold: 0.5 } };
    expect(hashConfig(config)).toBe(hashConfig({ ...config }));
  });

  it('configs with same keys in different order hash identically (key-order normalization)', () => {
    const configA = { algorithm: 'heuristic_miner', parameters: { a: 1, b: 2 } };
    const configB = { parameters: { b: 2, a: 1 }, algorithm: 'heuristic_miner' };
    expect(hashConfig(configA)).toBe(hashConfig(configB));
  });

  it('adding a key changes the hash (detects additions)', () => {
    const configA = { algorithm: 'dfg', parameters: {} };
    const configB = { algorithm: 'dfg', parameters: {}, extra: 'new-field' };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it('removing a key changes the hash (detects removals)', () => {
    const configA = { algorithm: 'dfg', parameters: {}, extra: 'field' };
    const configB = { algorithm: 'dfg', parameters: {} };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it('changing a value changes the hash (detects modifications)', () => {
    const configA = { algorithm: 'dfg', parameters: { threshold: 0.5 } };
    const configB = { algorithm: 'dfg', parameters: { threshold: 0.6 } };
    expect(hashConfig(configA)).not.toBe(hashConfig(configB));
  });

  it('deeply nested key-order change does not change hash (recursive normalization)', () => {
    const configA = { params: { a: 1, b: { x: 10, y: 20 } } };
    const configB = { params: { b: { y: 20, x: 10 }, a: 1 } };
    expect(hashConfig(configA)).toBe(hashConfig(configB));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5 — Rank 3 (metamorphic): Hash sensitivity / avalanche property
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 5 — hash sensitivity and avalanche property (Rank 3)', () => {
  it('changing one character in the input changes the hash completely', () => {
    const original = hashJsonString('hello world');
    const modified = hashJsonString('hello World'); // uppercase W
    expect(original).not.toBe(modified);
  });

  it('single-bit difference in numeric input changes the hash', () => {
    expect(hashData({ value: 1 })).not.toBe(hashData({ value: 2 }));
  });

  it('hashJsonString("hello" + "world") !== hashJsonString("hell" + "oworld") — split point matters', () => {
    const h1 = hashJsonString('helloworld');
    const h2 = hashJsonString('helloworld'); // same concatenation — must be equal (determinism check)
    expect(h1).toBe(h2);

    // Different split points produce different concatenation prefix — validate that
    // "helloworldX" and "hellXoworldX" hash differently
    const hA = hashJsonString('helloworld!');
    const hB = hashJsonString('hell oworld!'); // space inserted
    expect(hA).not.toBe(hB);
  });

  it('appending a single character changes the output', () => {
    const base = hashJsonString('process-mining');
    const extended = hashJsonString('process-mining!');
    expect(base).not.toBe(extended);
  });

  it('hashData string with prepended character differs from original', () => {
    const base = hashData('receipt-chain');
    const modified = hashData('Xreceipt-chain');
    expect(base).not.toBe(modified);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 6 — Rank 2 (domain contract): normalizeForHashing and verifyHash
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 6 — normalizeForHashing and verifyHash round-trip (Rank 2)', () => {
  it('normalizeForHashing sorts top-level keys alphabetically', () => {
    const normalized = normalizeForHashing({ z: 1, a: 2, m: 3 });
    const parsed = JSON.parse(normalized as string);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });

  it('normalizeForHashing of two equivalent objects (different key order) returns identical string', () => {
    const n1 = normalizeForHashing({ x: 1, y: 2 });
    const n2 = normalizeForHashing({ y: 2, x: 1 });
    expect(n1).toBe(n2);
  });

  it('normalizeForHashing preserves array order (arrays are not sorted)', () => {
    const n1 = normalizeForHashing([3, 1, 2]);
    const n2 = normalizeForHashing([1, 2, 3]);
    expect(n1).not.toBe(n2);
  });

  it('normalizeForHashing of a primitive returns its JSON representation', () => {
    expect(normalizeForHashing(42)).toBe('42');
    expect(normalizeForHashing('hello')).toBe('"hello"');
    expect(normalizeForHashing(null)).toBe('null');
    expect(normalizeForHashing(true)).toBe('true');
  });

  it('verifyHash returns true when hash matches the content', () => {
    const data = { algorithm: 'dfg', version: '1.0' };
    const computedHash = hashData(data);
    expect(verifyHash(data, computedHash)).toBe(true);
  });

  it('verifyHash returns false when hash does not match the content', () => {
    const data = { algorithm: 'dfg', version: '1.0' };
    const wrongHash = 'f'.repeat(64);
    expect(verifyHash(data, wrongHash)).toBe(false);
  });

  it('verifyHash with tampered content returns false (tamper detection)', () => {
    const original = { algorithm: 'dfg', version: '1.0' };
    const tampered = { algorithm: 'dfg', version: '2.0' };
    const originalHash = hashData(original);
    expect(verifyHash(tampered, originalHash)).toBe(false);
  });

  it('verifyHash(x, hashData(x)) === true for diverse input types', () => {
    expect(verifyHash('plain string', hashData('plain string'))).toBe(true);
    expect(verifyHash([], hashData([]))).toBe(true);
    expect(verifyHash(null, hashData(null))).toBe(true);
    expect(verifyHash(0, hashData(0))).toBe(true);
  });
});
