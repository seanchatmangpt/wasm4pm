import { describe, it, expect } from 'vitest';
import {
  KERNEL_VERSION,
  MIN_WASM4PM_VERSION,
  parseSemVer,
  compareSemVer,
  satisfiesMinimum,
  isMajorCompatible,
  checkCompatibility,
  assertCompatibility,
} from '../src/versioning';

describe('parseSemVer', () => {
  it('should parse standard version', () => {
    const v = parseSemVer('26.4.5');
    expect(v).toEqual({ major: 26, minor: 4, patch: 5 });
  });

  it('should parse version with prerelease', () => {
    const v = parseSemVer('1.0.0-beta.1');
    expect(v).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'beta.1' });
  });

  it('should parse simple version', () => {
    const v = parseSemVer('0.1.0');
    expect(v).toEqual({ major: 0, minor: 1, patch: 0 });
  });

  it('should return null for invalid version', () => {
    expect(parseSemVer('not-a-version')).toBeNull();
    expect(parseSemVer('')).toBeNull();
    expect(parseSemVer('1.2')).toBeNull();
    expect(parseSemVer('v1.2.3')).toBeNull();
  });
});

describe('compareSemVer', () => {
  it('should compare equal versions', () => {
    const a = parseSemVer('1.0.0')!;
    const b = parseSemVer('1.0.0')!;
    expect(compareSemVer(a, b)).toBe(0);
  });

  it('should compare major version difference', () => {
    const a = parseSemVer('1.0.0')!;
    const b = parseSemVer('2.0.0')!;
    expect(compareSemVer(a, b)).toBe(-1);
    expect(compareSemVer(b, a)).toBe(1);
  });

  it('should compare minor version difference', () => {
    const a = parseSemVer('1.1.0')!;
    const b = parseSemVer('1.2.0')!;
    expect(compareSemVer(a, b)).toBe(-1);
  });

  it('should compare patch version difference', () => {
    const a = parseSemVer('1.0.1')!;
    const b = parseSemVer('1.0.2')!;
    expect(compareSemVer(a, b)).toBe(-1);
  });

  it('should rank prerelease lower than release', () => {
    const pre = parseSemVer('1.0.0-beta.1')!;
    const rel = parseSemVer('1.0.0')!;
    expect(compareSemVer(pre, rel)).toBe(-1);
    expect(compareSemVer(rel, pre)).toBe(1);
  });
});

describe('satisfiesMinimum', () => {
  it('should satisfy when version equals minimum', () => {
    expect(satisfiesMinimum('26.4.5', '26.4.5')).toBe(true);
  });

  it('should satisfy when version exceeds minimum', () => {
    expect(satisfiesMinimum('26.4.5', '26.0.0')).toBe(true);
  });

  it('should not satisfy when version is below minimum', () => {
    expect(satisfiesMinimum('25.0.0', '26.0.0')).toBe(false);
  });

  it('should return false for invalid versions', () => {
    expect(satisfiesMinimum('invalid', '1.0.0')).toBe(false);
    expect(satisfiesMinimum('1.0.0', 'invalid')).toBe(false);
  });
});

describe('isMajorCompatible', () => {
  it('should be compatible with same major version', () => {
    expect(isMajorCompatible('26.4.5', '26.0.0')).toBe(true);
    expect(isMajorCompatible('26.0.0', '26.9.9')).toBe(true);
  });

  it('should not be compatible with different major version', () => {
    expect(isMajorCompatible('25.0.0', '26.0.0')).toBe(false);
    expect(isMajorCompatible('27.0.0', '26.0.0')).toBe(false);
  });
});

describe('checkCompatibility', () => {
  it('should be compatible with same version', () => {
    const result = checkCompatibility(KERNEL_VERSION);
    expect(result.compatible).toBe(true);
    expect(result.current).toBe(KERNEL_VERSION);
    expect(result.required).toBe(KERNEL_VERSION);
  });

  it('should be compatible with lower minor/patch in same major', () => {
    const result = checkCompatibility('26.0.0');
    expect(result.compatible).toBe(true);
  });

  it('should be incompatible with different major', () => {
    const result = checkCompatibility('25.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('Major version mismatch');
  });

  it('should be incompatible with higher version than current', () => {
    const result = checkCompatibility('26.99.99');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('older than required');
  });

  it('should report invalid version strings', () => {
    const result = checkCompatibility('not-a-version');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('Invalid required version');
  });
});

describe('assertCompatibility', () => {
  it('should not throw for compatible version', () => {
    expect(() => assertCompatibility('26.0.0')).not.toThrow();
  });

  it('should throw for incompatible version', () => {
    expect(() => assertCompatibility('25.0.0')).toThrow('Kernel version incompatible');
  });
});

describe('Constants', () => {
  it('KERNEL_VERSION should be a valid semver', () => {
    expect(parseSemVer(KERNEL_VERSION)).not.toBeNull();
  });

  it('MIN_WASM4PM_VERSION should be a valid semver', () => {
    expect(parseSemVer(MIN_WASM4PM_VERSION)).not.toBeNull();
  });

  it('KERNEL_VERSION should satisfy MIN_WASM4PM_VERSION', () => {
    expect(satisfiesMinimum(KERNEL_VERSION, MIN_WASM4PM_VERSION)).toBe(true);
  });
});
