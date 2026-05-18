import { describe, it, expect } from 'vitest';
import { validateTimeout } from '../param-validators.js';
import { STANDARD_EXIT_CODE_DOCS, STANDARD_HELP } from '../help-standards.js';

describe('UX Audit Improvements', () => {
  describe('Gap 1: Timeout Unit Clarification', () => {
    it('should document timeout range in STANDARD_HELP', () => {
      expect(STANDARD_HELP.timeout).toContain('range 1-3600');
      expect(STANDARD_HELP.timeout).toContain('seconds');
      expect(STANDARD_HELP.timeout).toContain('clamped');
    });

    it('should clamp timeout values outside valid range [1, 3600]', () => {
      // Below minimum
      const tooLow = validateTimeout('0');
      expect(tooLow.valid).toBe(true);
      expect(tooLow.value).toBe(1);
      expect(tooLow.wasClamped).toBe(true);
      expect(tooLow.error).toContain('Clamped to 1s');

      // Above maximum
      const tooHigh = validateTimeout('9999');
      expect(tooHigh.valid).toBe(true);
      expect(tooHigh.value).toBe(3600);
      expect(tooHigh.wasClamped).toBe(true);
      expect(tooHigh.error).toContain('Clamped to 3600s');
    });

    it('should accept valid timeout values', () => {
      const valid = validateTimeout('300');
      expect(valid.valid).toBe(true);
      expect(valid.value).toBe(300);
      expect(valid.wasClamped).toBe(false);
    });

    it('should reject non-integer timeout values', () => {
      const invalid = validateTimeout('abc');
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain('must be an integer');
    });

    it('should use default timeout when undefined', () => {
      const result = validateTimeout(undefined, 300);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(300);
      expect(result.wasClamped).toBe(false);
    });
  });

  describe('Gap 5: Exit Code Documentation Standard', () => {
    it('should define STANDARD_EXIT_CODE_DOCS constant', () => {
      expect(STANDARD_EXIT_CODE_DOCS).toBeDefined();
      expect(typeof STANDARD_EXIT_CODE_DOCS).toBe('string');
    });

    it('should include all exit codes in standard documentation', () => {
      expect(STANDARD_EXIT_CODE_DOCS).toContain('0');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('success');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('1');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('config');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('2');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('source');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('3');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('execution');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('4');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('partial');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('5');
      expect(STANDARD_EXIT_CODE_DOCS).toContain('system');
    });

    it('should provide consistent exit code reference', () => {
      // This constant should be usable in multiple commands
      expect(STANDARD_EXIT_CODE_DOCS.length).toBeGreaterThan(50);
    });
  });

  describe('Gap 4: Help Text Clarity', () => {
    it('should provide clear help descriptions in STANDARD_HELP', () => {
      // Sample important flags
      const importantFlags = [
        'verbose',
        'quiet',
        'format',
        'input',
        'algorithm',
        'timeout',
      ];

      for (const flag of importantFlags) {
        expect(STANDARD_HELP[flag as keyof typeof STANDARD_HELP]).toBeDefined();
        const desc = STANDARD_HELP[flag as keyof typeof STANDARD_HELP];
        expect(desc.length).toBeGreaterThan(10);
      }
    });

    it('should include algorithm guidance in STANDARD_HELP', () => {
      expect(STANDARD_HELP.algorithm).toContain('algorithm');
      expect(STANDARD_HELP.algorithm).toContain('default');
      expect(STANDARD_HELP.algorithm).toContain('wpm');
    });

    it('should document input/output flags clearly', () => {
      expect(STANDARD_HELP.input).toContain('xes');
      expect(STANDARD_HELP.input).toContain('stdin');
      expect(STANDARD_HELP.output).toContain('file');
    });
  });

  describe('Gap 3: Profile and Execution Control Guidance', () => {
    it('should document profile options in STANDARD_HELP', () => {
      expect(STANDARD_HELP.profile).toContain('fast');
      expect(STANDARD_HELP.profile).toContain('balanced');
      expect(STANDARD_HELP.profile).toContain('quality');
    });

    it('should document threshold/fitness assertions', () => {
      expect(STANDARD_HELP.threshold).toContain('Fitness');
      expect(STANDARD_HELP.threshold).toContain('0-1');
      expect(STANDARD_HELP.threshold).toContain('0.75');
    });
  });
});
