/**
 * Test: Verbose Flag Parser
 * Validates verbose level extraction and normalization
 */

import { describe, it, expect } from 'vitest';
import { extractVerboseLevel, VERBOSE_HELP } from '../verbose-flag-parser.js';
import { normalizeVerboseLevel } from '../output.js';

describe('verbose-flag-parser', () => {
  describe('extractVerboseLevel', () => {
    it('returns 0 when verbose is false', () => {
      const level = extractVerboseLevel({ verbose: false });
      expect(level).toBe(0);
    });

    it('returns 1-3 when verbose is true', () => {
      const level = extractVerboseLevel({ verbose: true });
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(3);
    });

    it('returns numeric value when verbose is a number', () => {
      expect(extractVerboseLevel({ verbose: 0 })).toBe(0);
      expect(extractVerboseLevel({ verbose: 1 })).toBe(1);
      expect(extractVerboseLevel({ verbose: 2 })).toBe(2);
      expect(extractVerboseLevel({ verbose: 3 })).toBe(3);
    });

    it('clamps numeric values to 0-3 range', () => {
      expect(extractVerboseLevel({ verbose: -5 })).toBe(0);
      expect(extractVerboseLevel({ verbose: 10 })).toBe(3);
    });

    it('returns 0 when no verbose flag present', () => {
      const level = extractVerboseLevel({});
      expect(level).toBe(0);
    });
  });

  describe('normalizeVerboseLevel', () => {
    it('handles explicit verboseLevel option', () => {
      expect(normalizeVerboseLevel({ verboseLevel: 2 })).toBe(2);
    });

    it('converts boolean true to level 1', () => {
      expect(normalizeVerboseLevel({ verbose: true })).toBe(1);
    });

    it('converts numeric verbose to clamped value', () => {
      expect(normalizeVerboseLevel({ verbose: 2 })).toBe(2);
      expect(normalizeVerboseLevel({ verbose: 5 })).toBe(3);
    });

    it('defaults to 0 with no verbose option', () => {
      expect(normalizeVerboseLevel({})).toBe(0);
    });

    it('prioritizes verboseLevel over verbose', () => {
      expect(normalizeVerboseLevel({ verbose: true, verboseLevel: 3 })).toBe(3);
    });
  });

  describe('VERBOSE_HELP', () => {
    it('provides documented verbose levels', () => {
      expect(VERBOSE_HELP).toContain('-v');
      expect(VERBOSE_HELP).toContain('-vv');
      expect(VERBOSE_HELP).toContain('-vvv');
      expect(VERBOSE_HELP).toContain('Debug');
      expect(VERBOSE_HELP).toContain('Decisions');
      expect(VERBOSE_HELP).toContain('Spans');
    });
  });
});
