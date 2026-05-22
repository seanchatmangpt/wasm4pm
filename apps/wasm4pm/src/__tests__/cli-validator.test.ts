import { describe, it, expect } from 'vitest';
import {
  validatePositiveInt,
  validateFloatInRange,
  validateEnum,
} from '../_cli-validator.js';

describe('CLI Parameter Validator', () => {
  describe('validatePositiveInt', () => {
    it('should return default when value is undefined', () => {
      const result = validatePositiveInt(undefined, 'window', 50);
      expect(result.success).toBe(true);
      expect(result.value).toBe(50);
    });

    it('should parse valid positive integer', () => {
      const result = validatePositiveInt('100', 'window', 50);
      expect(result.success).toBe(true);
      expect(result.value).toBe(100);
    });

    it('should reject NaN', () => {
      const result = validatePositiveInt('abc', 'window', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a positive integer');
    });

    it('should reject zero', () => {
      const result = validatePositiveInt('0', 'window', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be positive');
    });

    it('should reject negative numbers', () => {
      const result = validatePositiveInt('-5', 'window', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be positive');
    });

    it('should enforce min constraint', () => {
      const result = validatePositiveInt('2', 'k', 5, { min: 3 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be >= 3');
    });

    it('should enforce max constraint', () => {
      const result = validatePositiveInt('100', 'depth', 5, { max: 50 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be <= 50');
    });
  });

  describe('validateFloatInRange', () => {
    it('should return default when value is undefined', () => {
      const result = validateFloatInRange(undefined, 'alpha', 0.3, 0, 1);
      expect(result.success).toBe(true);
      expect(result.value).toBe(0.3);
    });

    it('should parse valid float in range', () => {
      const result = validateFloatInRange('0.5', 'alpha', 0.3, 0, 1);
      expect(result.success).toBe(true);
      expect(result.value).toBe(0.5);
    });

    it('should reject NaN', () => {
      const result = validateFloatInRange('xyz', 'alpha', 0.3, 0, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    it('should reject Infinity', () => {
      const result = validateFloatInRange('Infinity', 'alpha', 0.3, 0, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    it('should reject value below min', () => {
      const result = validateFloatInRange('-0.1', 'alpha', 0.3, 0, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be in range [0, 1]');
    });

    it('should reject value above max', () => {
      const result = validateFloatInRange('1.5', 'alpha', 0.3, 0, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be in range [0, 1]');
    });

    it('should accept boundary values', () => {
      const result1 = validateFloatInRange('0', 'alpha', 0.3, 0, 1);
      const result2 = validateFloatInRange('1', 'alpha', 0.3, 0, 1);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('validateEnum', () => {
    const ALLOWED = ['fast', 'balanced', 'quality'] as const;

    it('should return default when value is undefined', () => {
      const result = validateEnum(undefined, 'profile', 'balanced', ALLOWED);
      expect(result.success).toBe(true);
      expect(result.value).toBe('balanced');
    });

    it('should accept valid enum value', () => {
      const result = validateEnum('fast', 'profile', 'balanced', ALLOWED);
      expect(result.success).toBe(true);
      expect(result.value).toBe('fast');
    });

    it('should reject invalid enum value', () => {
      const result = validateEnum('turbo', 'profile', 'balanced', ALLOWED);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should be case-sensitive', () => {
      const result = validateEnum('FAST', 'profile', 'balanced', ALLOWED);
      expect(result.success).toBe(false);
    });
  });
});
