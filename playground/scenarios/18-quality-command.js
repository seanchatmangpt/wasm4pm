/**
 * Scenario: quality command — pictl quality <log.xes>
 *
 * Tests multi-dimensional quality assessment using real WASM.
 *
 * Key contracts verified:
 *   - Missing input exits 2 (source_error)
 *   - Missing file exits 2 (source_error)
 *   - Invalid metric exits 1 (config_error)
 *   - Valid log computes quality scores (fitness, precision, generalization, simplicity)
 *   - JSON output has status=success and quality scores field
 *   - Human output is readable and shows quality metrics
 *   - -i alias for input file works
 *   - --file alias for input file works
 *   - --activity-key flag is accepted
 *
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first)
 */
import { describe, it, expect } from 'vitest';
import { assertExitCode, pictl, extractJson, combinedOutput, EXIT_CODES, resolveRepo } from '../helpers/cli.js';
// Real XES fixture files
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
const BPI_DOMESTIC = resolveRepo('wasm4pm/tests/fixtures/BPI_2020_DomesticDeclarations.xes');
describe.sequential('quality command', () => {
    // ── Error cases ───────────────────────────────────────────────────────────
    describe('error handling', () => {
        it('exits 2 when no input provided', async () => {
            const result = await pictl(['quality']);
            assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
        });
        it('exits 2 when input file does not exist', async () => {
            const result = await pictl(['quality', '/tmp/nonexistent-xyz.xes']);
            assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
            expect(combinedOutput(result)).toContain('not found');
        });
        it('exits 1 for invalid metric name', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--metrics', 'nonexistent_metric', '--format', 'json']);
            assertExitCode(result, EXIT_CODES.CONFIG_ERROR);
            expect(combinedOutput(result)).toContain('Invalid metric');
        });
        it('exits 1 for mix of valid and invalid metrics', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--metrics', 'fitness,ghost_metric', '--format', 'json']);
            assertExitCode(result, EXIT_CODES.CONFIG_ERROR);
            expect(combinedOutput(result)).toContain('ghost_metric');
        });
    });
    // ── Quality pipeline (WASM interaction) ───────────────────────────────────
    describe('quality pipeline', () => {
        it('computes quality scores and returns structured success output (JSON)', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--format', 'json']);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = extractJson(result.stdout);
            expect(json.status).toBe('success');
            expect(json.scores).toBeDefined();
        });
        it('returns readable success output in human format', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE]);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
            // Human output contains quality assessment results
            expect(combinedOutput(result)).toContain('Quality Scores:');
        });
        it('quality scores include fitness metric', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            const scores = json.scores;
            expect(scores.fitness).toBeDefined();
            expect(typeof scores.fitness).toBe('number');
        });
        it('quality scores include precision metric', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            const scores = json.scores;
            expect(scores.precision).toBeDefined();
            expect(typeof scores.precision).toBe('number');
        });
        it('aggregate quality score is bounded [0, 1]', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            const aggregate = json.aggregate;
            const score = aggregate.score;
            expect(score).toBeGreaterThanOrEqual(0.0);
            expect(score).toBeLessThanOrEqual(1.0);
        });
    });
    // ── Single metric selection ───────────────────────────────────────────────
    describe('metric selection', () => {
        it('computes fitness metric when requested', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--metrics', 'fitness', '--format', 'json']);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = extractJson(result.stdout);
            const scores = json.scores;
            expect(scores.fitness).toBeDefined();
            expect(typeof scores.fitness).toBe('number');
        });
        it('computes precision metric when requested', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--metrics', 'precision', '--format', 'json']);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = extractJson(result.stdout);
            const scores = json.scores;
            expect(scores.precision).toBeDefined();
            expect(typeof scores.precision).toBe('number');
        });
        it('computes all four metrics by default', async () => {
            const result = await pictl(['quality', RUNNING_EXAMPLE, '--format', 'json']);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = extractJson(result.stdout);
            const scores = json.scores;
            expect(scores.fitness).toBeDefined();
            expect(scores.precision).toBeDefined();
            expect(scores.generalization).toBeDefined();
            expect(scores.simplicity).toBeDefined();
        });
    });
    // ── Flag variants ─────────────────────────────────────────────────────────
    it('supports -i alias for input file', async () => {
        const result = await pictl(['quality', '-i', RUNNING_EXAMPLE, '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SUCCESS);
        const json = extractJson(result.stdout);
        expect(json.status).toBe('success');
        expect(json.scores.fitness).toBeDefined();
    });
    it('supports --file alias for input file', async () => {
        const result = await pictl(['quality', '--file', RUNNING_EXAMPLE, '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SUCCESS);
        const json = extractJson(result.stdout);
        expect(json.status).toBe('success');
    });
    it('supports --activity-key flag', async () => {
        const result = await pictl(['quality', RUNNING_EXAMPLE, '--activity-key', 'concept:name', '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SUCCESS);
        const json = extractJson(result.stdout);
        expect(json.status).toBe('success');
    });
});
//# sourceMappingURL=18-quality-command.js.map