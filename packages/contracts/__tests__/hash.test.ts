/**
 * Tests for BLAKE3 hashing with determinism guarantees
 */

import { describe, it, expect } from 'vitest';
import {
  hashConfig,
  hashData,
  hashJsonString,
  verifyHash,
  normalizeForHashing,
} from '../src/hash';

describe('hash module', () => {
  describe('normalizeForHashing', () => {
    it('should sort object keys deterministically', () => {
      const obj1 = { z: 1, a: 2, m: 3 };
      const obj2 = { a: 2, m: 3, z: 1 };

      const normalized1 = normalizeForHashing(obj1);
      const normalized2 = normalizeForHashing(obj2);

      expect(normalized1).toBe(normalized2);
      expect(normalized1).toEqual('{"a":2,"m":3,"z":1}');
    });

    it('should handle nested objects with sorted keys', () => {
      const obj1 = { outer: { z: 1, a: 2 }, key: 'value' };
      const obj2 = { key: 'value', outer: { a: 2, z: 1 } };

      const normalized1 = normalizeForHashing(obj1);
      const normalized2 = normalizeForHashing(obj2);

      expect(normalized1).toBe(normalized2);
    });

    it('should handle arrays', () => {
      const arr1 = [1, { z: 1, a: 2 }, 'test'];
      const arr2 = [1, { a: 2, z: 1 }, 'test'];

      const normalized1 = normalizeForHashing(arr1);
      const normalized2 = normalizeForHashing(arr2);

      expect(normalized1).toBe(normalized2);
    });

    it('should handle primitives', () => {
      expect(normalizeForHashing(42)).toBe('42');
      expect(normalizeForHashing('string')).toBe('"string"');
      expect(normalizeForHashing(true)).toBe('true');
      expect(normalizeForHashing(null)).toBe('null');
    });

    it('should throw for non-serializable values', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      expect(() => normalizeForHashing(circular)).toThrow();
    });
  });

  describe('hashConfig', () => {
    it('should produce deterministic hashes for identical configs', () => {
      const config = {
        algorithm: 'alpha',
        parameters: { threshold: 0.8 },
      };

      const hash1 = hashConfig(config);
      const hash2 = hashConfig(config);

      expect(hash1).toBe(hash2);
    });

    it('should produce identical hashes for equivalent configs with different key order', () => {
      const config1 = { a: 1, b: 2, c: 3 };
      const config2 = { c: 3, a: 1, b: 2 };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different configs', () => {
      const config1 = { algorithm: 'alpha', threshold: 0.8 };
      const config2 = { algorithm: 'alpha', threshold: 0.9 };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should return 64-character hex string (BLAKE3)', () => {
      const config = { test: true };
      const hash = hashConfig(config);

      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });
  });

  describe('hashData', () => {
    it('should produce deterministic hashes for identical data', () => {
      const data = { traces: [{ events: [{ id: 1 }] }] };

      const hash1 = hashData(data);
      const hash2 = hashData(data);

      expect(hash1).toBe(hash2);
    });

    it('should handle any JSON-serializable value', () => {
      const values = [
        123,
        'string',
        [1, 2, 3],
        { key: 'value' },
        null,
        true,
      ];

      for (const value of values) {
        expect(() => hashData(value)).not.toThrow();
        expect(hashData(value)).toMatch(/^[0-9a-f]{64}$/i);
      }
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hashData([1, 2, 3]);
      const hash2 = hashData([1, 2, 4]);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashJsonString', () => {
    it('should hash pre-serialized JSON', () => {
      const json = '{"a":1,"b":2}';
      const hash = hashJsonString(json);

      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should produce different hash from normalized object', () => {
      // JSON string without normalization is hashed as-is
      const json1 = '{"a":1,"b":2}';
      const json2 = '{"b":2,"a":1}';

      const hash1 = hashJsonString(json1);
      const hash2 = hashJsonString(json2);

      // These should be different because JSON strings are hashed directly
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyHash', () => {
    it('should verify correct hashes', () => {
      const data = { test: 'value' };
      const hash = hashData(data);

      expect(verifyHash(data, hash)).toBe(true);
    });

    it('should reject incorrect hashes', () => {
      const data = { test: 'value' };
      const wrongHash = 'a'.repeat(64);

      expect(verifyHash(data, wrongHash)).toBe(false);
    });

    it('should detect data tampering', () => {
      const data1 = { value: 100 };
      const hash = hashData(data1);

      const data2 = { value: 200 };
      expect(verifyHash(data2, hash)).toBe(false);
    });

    it('should be order-independent', () => {
      const obj1 = { x: 1, y: 2 };
      const obj2 = { y: 2, x: 1 };

      const hash1 = hashData(obj1);
      expect(verifyHash(obj2, hash1)).toBe(true);
    });
  });

  describe('hash consistency', () => {
    it('should produce BLAKE3 64-character hashes', () => {
      const configs = [
        { simple: true },
        { complex: { nested: { deep: [1, 2, 3] } } },
        { arrays: [{ a: 1 }, { b: 2 }] },
      ];

      for (const config of configs) {
        const hash = hashConfig(config);
        expect(hash).toMatch(/^[0-9a-f]{64}$/i);
        expect(hash.length).toBe(64);
      }
    });

    it('should handle large objects', () => {
      const largeObject: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`key_${i}`] = { value: i, nested: { data: [1, 2, 3] } };
      }

      const hash = hashData(largeObject);
      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });
  });
});
