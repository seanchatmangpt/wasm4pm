import { describe, it, expect } from 'vitest';
import {
  validatePositiveInteger,
  validateFloatRange,
  validateChoice,
  formatValidationError,
} from '../param-validators';

describe('param-validators', () => {
  describe('validatePositiveInteger', () => {
    it('parses valid positive integer', () => {
      const result = validatePositiveInteger('42', 'window');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });

    it('rejects zero', () => {
      const result = validatePositiveInteger('0', 'window');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be > 0');
    });

    it('rejects negative', () => {
      const result = validatePositiveInteger('-5', 'window');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be > 0');
    });

    it('rejects non-numeric', () => {
      const result = validatePositiveInteger('abc', 'window');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a positive integer');
    });

    it('uses default when undefined', () => {
      const result = validatePositiveInteger(undefined, 'window', 50);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
    });

    it('respects max value constraint', () => {
      const result = validatePositiveInteger('101', 'window', undefined, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be ≤ 100');
    });

    it('allows value at max boundary', () => {
      const result = validatePositiveInteger('100', 'window', undefined, 100);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(100);
    });
  });

  describe('validateFloatRange', () => {
    it('parses valid float in range', () => {
      const result = validateFloatRange('0.5', 'alpha', 0, 1);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(0.5);
    });

    it('rejects value below min', () => {
      const result = validateFloatRange('0.0', 'alpha', 0.01, 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be in [0.01, 1]');
    });

    it('rejects value above max', () => {
      const result = validateFloatRange('1.1', 'alpha', 0, 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be in [0, 1]');
    });

    it('rejects non-numeric', () => {
      const result = validateFloatRange('abc', 'alpha', 0, 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    it('uses default when undefined', () => {
      const result = validateFloatRange(undefined, 'alpha', 0, 1, 0.3);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(0.3);
    });

    it('allows boundary values', () => {
      const r1 = validateFloatRange('0', 'alpha', 0, 1);
      const r2 = validateFloatRange('1', 'alpha', 0, 1);
      expect(r1.valid).toBe(true);
      expect(r2.valid).toBe(true);
    });
  });

  describe('validateChoice', () => {
    const allowed = ['kmeans', 'hierarchical', 'dbscan'];

    it('accepts valid choice', () => {
      const result = validateChoice('kmeans', 'method', allowed);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('kmeans');
    });

    it('rejects invalid choice', () => {
      const result = validateChoice('invalid', 'method', allowed);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[kmeans, hierarchical, dbscan]');
    });

    it('uses default when undefined', () => {
      const result = validateChoice(undefined, 'method', allowed, 'kmeans');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('kmeans');
    });

    it('is case-sensitive', () => {
      const result = validateChoice('KMeans', 'method', allowed);
      expect(result.valid).toBe(false);
    });
  });

  describe('formatValidationError', () => {
    it('formats error without hint', () => {
      const formatted = formatValidationError('test error');
      expect(formatted).toBe('✗ test error');
    });

    it('formats error with hint', () => {
      const formatted = formatValidationError('test error', 'try this instead');
      expect(formatted).toContain('✗ test error');
      expect(formatted).toContain('Hint: try this instead');
    });
  });
});
