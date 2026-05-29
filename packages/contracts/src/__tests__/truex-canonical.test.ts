import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../truex/canonical.js';

describe('canonicalStringify', () => {
  it('sorts object keys lexicographically', () => {
    const input = { 'ocel:type': 'Order', 'ocel:id': 'ORD_1' };
    expect(canonicalStringify(input)).toBe('{"ocel:id":"ORD_1","ocel:type":"Order"}');
  });

  it('sorts events by ocel:id', () => {
    const input = [{ 'ocel:id': 'b' }, { 'ocel:id': 'a' }];
    expect(canonicalStringify(input)).toBe('[{"ocel:id":"a"},{"ocel:id":"b"}]');
  });
});
