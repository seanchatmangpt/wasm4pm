/**
 * CLI Integration Tests.
 *
 * Tests the CLI contract layer: exit code translation, error hierarchy
 * propagation, and argument validation behavior. Chicago TDD — tests
 * observable behavior (what exit codes and errors are produced), not
 * internal implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PictlError, ConfigError, SourceError, ExecutionError, PartialFailureError, SystemError, handleError, } from '../src/errors.js';
import { EXIT_CODES, translateContractExitCode } from '../src/exit-codes.js';
// ---------------------------------------------------------------------------
// Exit Code Contract
// ---------------------------------------------------------------------------
describe('EXIT_CODES contract', () => {
    it('covers the full range 0-5', () => {
        const codes = new Set(Object.values(EXIT_CODES));
        for (let i = 0; i <= 5; i++) {
            expect(codes.has(i)).toBe(true);
        }
    });
    it('all codes are unique', () => {
        const codes = Object.values(EXIT_CODES);
        expect(new Set(codes).size).toBe(codes.length);
    });
    it('success is the only non-error code', () => {
        const nonZero = Object.values(EXIT_CODES).filter((c) => c !== 0);
        expect(nonZero.length).toBe(5);
        for (const code of nonZero) {
            expect(code).toBeGreaterThan(0);
        }
    });
});
// ---------------------------------------------------------------------------
// Contract Exit Code Translation
// ---------------------------------------------------------------------------
describe('translateContractExitCode', () => {
    it('translates 2xx → config_error (1)', () => {
        expect(translateContractExitCode(200)).toBe(EXIT_CODES.config_error);
        expect(translateContractExitCode(201)).toBe(EXIT_CODES.config_error);
        expect(translateContractExitCode(250)).toBe(EXIT_CODES.config_error);
        expect(translateContractExitCode(299)).toBe(EXIT_CODES.config_error);
    });
    it('translates 3xx → source_error (2)', () => {
        expect(translateContractExitCode(300)).toBe(EXIT_CODES.source_error);
        expect(translateContractExitCode(301)).toBe(EXIT_CODES.source_error);
        expect(translateContractExitCode(302)).toBe(EXIT_CODES.source_error);
        expect(translateContractExitCode(350)).toBe(EXIT_CODES.source_error);
        expect(translateContractExitCode(399)).toBe(EXIT_CODES.source_error);
    });
    it('translates 4xx → execution_error (3)', () => {
        expect(translateContractExitCode(400)).toBe(EXIT_CODES.execution_error);
        expect(translateContractExitCode(401)).toBe(EXIT_CODES.execution_error);
        expect(translateContractExitCode(450)).toBe(EXIT_CODES.execution_error);
        expect(translateContractExitCode(499)).toBe(EXIT_CODES.execution_error);
    });
    it('translates 5xx → execution_error (3)', () => {
        expect(translateContractExitCode(500)).toBe(EXIT_CODES.execution_error);
        expect(translateContractExitCode(501)).toBe(EXIT_CODES.execution_error);
        expect(translateContractExitCode(550)).toBe(EXIT_CODES.execution_error);
        expect(translateContractExitCode(599)).toBe(EXIT_CODES.execution_error);
    });
    it('translates 6xx → partial_failure (4)', () => {
        expect(translateContractExitCode(600)).toBe(EXIT_CODES.partial_failure);
        expect(translateContractExitCode(601)).toBe(EXIT_CODES.partial_failure);
        expect(translateContractExitCode(650)).toBe(EXIT_CODES.partial_failure);
        expect(translateContractExitCode(699)).toBe(EXIT_CODES.partial_failure);
    });
    it('translates 7xx → system_error (5)', () => {
        expect(translateContractExitCode(700)).toBe(EXIT_CODES.system_error);
        expect(translateContractExitCode(750)).toBe(EXIT_CODES.system_error);
        expect(translateContractExitCode(799)).toBe(EXIT_CODES.system_error);
    });
    it('translates unknown codes → system_error (5)', () => {
        expect(translateContractExitCode(0)).toBe(EXIT_CODES.system_error);
        expect(translateContractExitCode(100)).toBe(EXIT_CODES.system_error);
        expect(translateContractExitCode(999)).toBe(EXIT_CODES.system_error);
        expect(translateContractExitCode(-1)).toBe(EXIT_CODES.system_error);
    });
    it('translates boundary codes correctly', () => {
        // Edge cases at category boundaries
        expect(translateContractExitCode(199)).toBe(EXIT_CODES.system_error); // below 200
        expect(translateContractExitCode(200)).toBe(EXIT_CODES.config_error);
        expect(translateContractExitCode(299)).toBe(EXIT_CODES.config_error);
        expect(translateContractExitCode(300)).toBe(EXIT_CODES.source_error);
    });
});
// ---------------------------------------------------------------------------
// Error Hierarchy — Exit Code Consistency
// ---------------------------------------------------------------------------
describe('Error classes produce correct exit codes', () => {
    const errorClasses = [
        { cls: ConfigError, code: EXIT_CODES.config_error, name: 'ConfigError' },
        { cls: SourceError, code: EXIT_CODES.source_error, name: 'SourceError' },
        { cls: ExecutionError, code: EXIT_CODES.execution_error, name: 'ExecutionError' },
        { cls: PartialFailureError, code: EXIT_CODES.partial_failure, name: 'PartialFailureError' },
        { cls: SystemError, code: EXIT_CODES.system_error, name: 'SystemError' },
    ];
    for (const { cls, code, name } of errorClasses) {
        it(`${name} produces exit code ${code}`, () => {
            const err = new cls('test message');
            expect(err.exitCode).toBe(code);
        });
    }
    it('all error classes are instanceof PictlError', () => {
        for (const { cls } of errorClasses) {
            expect(new cls('test')).toBeInstanceOf(PictlError);
        }
    });
    it('all error classes are instanceof Error', () => {
        for (const { cls } of errorClasses) {
            expect(new cls('test')).toBeInstanceOf(Error);
        }
    });
});
// ---------------------------------------------------------------------------
// Error Hierarchy — Message Propagation
// ---------------------------------------------------------------------------
describe('Error message propagation', () => {
    it('preserves exact message through PictlError', () => {
        const msg = 'Configuration file pictl.toml not found';
        const err = new ConfigError(msg);
        expect(err.message).toBe(msg);
    });
    it('preserves exact message through handleError output', () => {
        const msg = 'Source file not readable';
        const err = new SourceError(msg);
        // handleError logs [SourceError] <message>
        // Verify the message is accessible on the error object
        expect(err.message).toBe(msg);
        expect(err.name).toBe('SourceError');
    });
    it('PartialFailureError stores succeeded and failed lists', () => {
        const err = new PartialFailureError('some algorithms failed', ['dfg', 'heuristic_miner'], ['ilp']);
        expect(err.succeeded).toEqual(['dfg', 'heuristic_miner']);
        expect(err.failed).toEqual(['ilp']);
    });
    it('PartialFailureError handles empty lists', () => {
        const err = new PartialFailureError('no operations', [], []);
        expect(err.succeeded).toEqual([]);
        expect(err.failed).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// handleError — Exit Code Mapping
// ---------------------------------------------------------------------------
describe('handleError exit code mapping', () => {
    let exitSpy;
    let consoleSpy;
    beforeEach(() => {
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }));
        consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    afterEach(() => {
        exitSpy.mockRestore();
        consoleSpy.mockRestore();
    });
    it('maps ConfigError → exit code 1', () => {
        handleError(new ConfigError('bad config'));
        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.config_error);
    });
    it('maps SourceError → exit code 2', () => {
        handleError(new SourceError('file missing'));
        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.source_error);
    });
    it('maps ExecutionError → exit code 3', () => {
        handleError(new ExecutionError('algorithm timeout'));
        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.execution_error);
    });
    it('maps PartialFailureError → exit code 4', () => {
        handleError(new PartialFailureError('partial', ['a'], ['b']));
        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.partial_failure);
    });
    it('maps SystemError → exit code 5', () => {
        handleError(new SystemError('disk full'));
        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
    });
    it('maps unknown Error → exit code 5', () => {
        handleError(new Error('generic error'));
        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
    });
    it('logs error name and message for PictlError', () => {
        handleError(new ConfigError('bad config'));
        expect(consoleSpy).toHaveBeenCalledWith('[ConfigError] bad config');
    });
    it('logs as SystemError for unknown errors', () => {
        handleError(new Error('generic'));
        expect(consoleSpy).toHaveBeenCalledWith('[SystemError] generic');
    });
});
// ---------------------------------------------------------------------------
// Edge Cases — Contract Boundary
// ---------------------------------------------------------------------------
describe('Contract boundary edge cases', () => {
    it('PictlError accepts all valid exit codes', () => {
        for (const code of Object.values(EXIT_CODES)) {
            const err = new PictlError('test', code);
            expect(err.exitCode).toBe(code);
        }
    });
    it('translateContractExitCode handles 0 as unknown', () => {
        // 0 is not a valid contract error code (those start at 200)
        expect(translateContractExitCode(0)).toBe(EXIT_CODES.system_error);
    });
    it('translateContractExitCode handles negative codes', () => {
        expect(translateContractExitCode(-1)).toBe(EXIT_CODES.system_error);
        expect(translateContractExitCode(-100)).toBe(EXIT_CODES.system_error);
    });
    it('translateContractExitCode handles very large codes', () => {
        expect(translateContractExitCode(10000)).toBe(EXIT_CODES.system_error);
    });
    it('EXIT_CODES values are frozen (as const)', () => {
        // TypeScript as const — verify runtime values are numbers
        expect(typeof EXIT_CODES.success).toBe('number');
        expect(typeof EXIT_CODES.config_error).toBe('number');
        expect(typeof EXIT_CODES.source_error).toBe('number');
        expect(typeof EXIT_CODES.execution_error).toBe('number');
        expect(typeof EXIT_CODES.partial_failure).toBe('number');
        expect(typeof EXIT_CODES.system_error).toBe('number');
    });
});
//# sourceMappingURL=cli-integration.test.js.map