import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  hashOutput,
  hashRaw,
  hashAlgorithmResult,
  verifyOutputHash,
} from '../src/hashing';

describe('canonicalize', () => {
  it('should sort object keys alphabetically', () => {
    const result = canonicalize({ b: 1, a: 2 });
    expect(result).toBe('{"a":2,"b":1}');
  });

  it('should handle nested objects', () => {
    const result = canonicalize({ z: { b: 1, a: 2 }, a: 3 });
    expect(result).toBe('{"a":3,"z":{"a":2,"b":1}}');
  });

  it('should handle arrays (preserve order)', () => {
    const result = canonicalize([3, 1, 2]);
    expect(result).toBe('[3,1,2]');
  });

  it('should handle arrays of objects', () => {
    const result = canonicalize([{ b: 1, a: 2 }]);
    expect(result).toBe('[{"a":2,"b":1}]');
  });

  it('should handle primitives', () => {
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(null)).toBe('null');
  });

  it('should produce identical output for differently-ordered but equal objects', () => {
    const a = canonicalize({ x: 1, y: 2, z: 3 });
    const b = canonicalize({ z: 3, x: 1, y: 2 });
    expect(a).toBe(b);
  });
});

describe('hashOutput', () => {
  it('should return a 64-char hex string (SHA-256)', () => {
    const hash = hashOutput({ test: true });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    const data = { algorithm: 'dfg', handle: 'obj_1', events: 100 };
    const hash1 = hashOutput(data);
    const hash2 = hashOutput(data);
    expect(hash1).toBe(hash2);
  });

  it('should produce same hash for differently-ordered keys', () => {
    const hash1 = hashOutput({ a: 1, b: 2 });
    const hash2 = hashOutput({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different data', () => {
    const hash1 = hashOutput({ value: 1 });
    const hash2 = hashOutput({ value: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it('should handle nested data deterministically', () => {
    const data1 = { outer: { b: 2, a: 1 }, top: 'x' };
    const data2 = { top: 'x', outer: { a: 1, b: 2 } };
    expect(hashOutput(data1)).toBe(hashOutput(data2));
  });
});

describe('hashRaw', () => {
  it('should hash a raw string', () => {
    const hash = hashRaw('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    expect(hashRaw('test')).toBe(hashRaw('test'));
  });

  it('should differ from hashOutput for same string', () => {
    // hashOutput wraps in JSON, hashRaw does not
    const raw = hashRaw('test');
    const output = hashOutput('test');
    expect(raw).not.toBe(output);
  });
});

describe('hashAlgorithmResult', () => {
  it('should produce consistent hash for algorithm + params + output', () => {
    const hash1 = hashAlgorithmResult('dfg', { activity_key: 'concept:name' }, { handle: 'obj_1' });
    const hash2 = hashAlgorithmResult('dfg', { activity_key: 'concept:name' }, { handle: 'obj_1' });
    expect(hash1).toBe(hash2);
  });

  it('should differ when algorithm changes', () => {
    const params = { activity_key: 'concept:name' };
    const output = { handle: 'obj_1' };
    const h1 = hashAlgorithmResult('dfg', params, output);
    const h2 = hashAlgorithmResult('alpha_plus_plus', params, output);
    expect(h1).not.toBe(h2);
  });

  it('should differ when params change', () => {
    const output = { handle: 'obj_1' };
    const h1 = hashAlgorithmResult('heuristic_miner', { threshold: 0.5 }, output);
    const h2 = hashAlgorithmResult('heuristic_miner', { threshold: 0.8 }, output);
    expect(h1).not.toBe(h2);
  });

  it('should differ when output changes', () => {
    const params = { activity_key: 'concept:name' };
    const h1 = hashAlgorithmResult('dfg', params, { handle: 'obj_1' });
    const h2 = hashAlgorithmResult('dfg', params, { handle: 'obj_2' });
    expect(h1).not.toBe(h2);
  });
});

describe('verifyOutputHash', () => {
  it('should verify matching hash', () => {
    const data = { result: 'test' };
    const hash = hashOutput(data);
    expect(verifyOutputHash(data, hash)).toBe(true);
  });

  it('should reject non-matching hash', () => {
    const data = { result: 'test' };
    expect(verifyOutputHash(data, 'badhash')).toBe(false);
  });

  it('should reject tampered data', () => {
    const original = { result: 'test' };
    const hash = hashOutput(original);
    const tampered = { result: 'tampered' };
    expect(verifyOutputHash(tampered, hash)).toBe(false);
  });
});
