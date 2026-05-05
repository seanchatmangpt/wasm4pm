/**
 * Tests for `pictl doctor` — zero-argument environment health check.
 *
 * Chicago TDD: tests command metadata (shape, args, meta) which is
 * observable behavior. Removed re-implemented logic sections that
 * just duplicated what the source already does.
 */
import { describe, it, expect } from 'vitest';
import { doctor } from '../src/cli.js';
describe('doctor command — metadata', () => {
    it('has name "doctor"', () => {
        expect(doctor.meta?.name).toBe('doctor');
    });
    it('describes its purpose', () => {
        expect(doctor.meta?.description).toContain('health');
    });
    it('has an async run function', () => {
        expect(typeof doctor.run).toBe('function');
    });
});
describe('doctor command — arguments', () => {
    it('accepts --format (human/json)', () => {
        expect(doctor.args?.format).toBeDefined();
        expect(doctor.args?.format?.type).toBe('string');
    });
    it('defaults --format to "human"', () => {
        expect(doctor.args?.format?.default).toBe('human');
    });
    it('accepts --verbose flag with alias -v', () => {
        expect(doctor.args?.verbose).toBeDefined();
        expect(doctor.args?.verbose?.type).toBe('boolean');
        expect(doctor.args?.verbose?.alias).toBe('v');
    });
    it('accepts --quiet flag with alias -q', () => {
        expect(doctor.args?.quiet).toBeDefined();
        expect(doctor.args?.quiet?.type).toBe('boolean');
        expect(doctor.args?.quiet?.alias).toBe('q');
    });
    it('requires zero positional arguments', () => {
        const positionals = Object.values(doctor.args ?? {}).filter((a) => a && typeof a === 'object' && 'type' in a && a.type === 'positional');
        expect(positionals).toHaveLength(0);
    });
});
describe('doctor — is a valid citty command', () => {
    it('has meta, args, and run', () => {
        expect(doctor.meta).toBeDefined();
        expect(doctor.args).toBeDefined();
        expect(typeof doctor.run).toBe('function');
    });
});
//# sourceMappingURL=doctor.test.js.map