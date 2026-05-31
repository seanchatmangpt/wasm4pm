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

  // TODO(test): add test that canonicalStringify of an object with number, boolean,
  // and null values produces valid JSON (edge case: JSON.stringify handles these
  // natively but a custom serializer might coerce them to strings).

  // TODO(test): add test that events without an ocel:id field are handled
  // gracefully (either sorted last, sorted by stringified content, or throw a
  // typed error — the current behavior is undocumented).
});
