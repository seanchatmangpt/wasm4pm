import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../truex/canonical.js';

describe('canonicalStringify', () => {
  it('sorts object keys lexicographically', () => {
    // FM-5: exact byte-level string comparison proves key ordering, not just
    // that the output is a JSON string — a wrong order would fail this.
    const input = { 'ocel:type': 'Order', 'ocel:id': 'ORD_1' };
    expect(canonicalStringify(input)).toBe('{"ocel:id":"ORD_1","ocel:type":"Order"}');
  });

  it('sorts events by ocel:id', () => {
    // FM-5: reversed input produces deterministically ordered output — proves
    // the sort is applied, not that output happens to be ordered by insertion.
    const input = [{ 'ocel:id': 'b' }, { 'ocel:id': 'a' }];
    expect(canonicalStringify(input)).toBe('[{"ocel:id":"a"},{"ocel:id":"b"}]');
  });

  it('is idempotent: canonicalStringify(JSON.parse(canonicalStringify(x))) === canonicalStringify(x)', () => {
    // FM-5: canonical form must be stable under round-trip — proves it is a true
    // canonical form, not just "sorted once."
    const input = { 'ocel:type': 'Order', 'ocel:id': 'ORD_1', nested: { z: 1, a: 2 } };
    const first = canonicalStringify(input);
    const second = canonicalStringify(JSON.parse(first) as typeof input);
    expect(second).toBe(first);
  });

  it('produces the same output regardless of original key insertion order', () => {
    // FM-5: two objects with identical content but different key order must
    // canonicalize identically — this is the core contract for BLAKE3 receipts.
    const a = { z: 'last', a: 'first', m: 'middle' };
    const b = { m: 'middle', z: 'last', a: 'first' };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('preserves number, boolean, and null values as valid JSON primitives', () => {
    // Edge case: custom serializers may coerce primitives to strings; verify they are not.
    const input = { z: null, a: true, m: 42 };
    const result = canonicalStringify(input);
    const parsed = JSON.parse(result);
    expect(parsed.a).toBe(true);
    expect(parsed.m).toBe(42);
    expect(parsed.z).toBeNull();
    // Keys must still be sorted lexicographically
    expect(result).toBe('{"a":true,"m":42,"z":null}');
  });

  it('handles events without an ocel:id field by sorting remaining keys', () => {
    // Undocumented edge case: events lacking ocel:id must still be deterministically ordered.
    const input = { 'ocel:type': 'Order', 'ocel:time': '2026-01-01' };
    const result = canonicalStringify(input);
    // Should not throw, and keys should be lexicographically sorted.
    expect(result).toBe('{"ocel:time":"2026-01-01","ocel:type":"Order"}');
  });
});
