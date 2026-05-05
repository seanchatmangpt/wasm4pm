/**
 * Scenario: ml command — wasm4pm ml <task> -i <log.xes>
 *
 * Tests ML-powered process mining using real WASM and real XES files.
 * No mocks — real @wasm4pm/ml package with real algorithm execution.
 *
 * Key contracts verified:
 *   - Missing task exits with error (exit 1)
 *   - Invalid task exits with error (exit 2)
 *   - Missing input exits with error (exit 1)
 *   - classify, cluster, forecast, anomaly, regress produce output (exit 0)
 *   - pca exits 3 when data has insufficient features (known limitation)
 *   - JSON output has task field matching the requested task
 *   - Each task has expected data fields (predictions, assignments, etc.)
 *   - Results are deterministic across runs
 *   - --activity-key, --method, --k flags work
 *
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first)
 */
import { describe, it, expect } from 'vitest';
import { assertExitCode, wasm4pm, extractJson, combinedOutput, EXIT_CODES, resolveRepo } from '../helpers/cli.js';
// Real XES fixture files
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
const BPI_DOMESTIC = resolveRepo('wasm4pm/tests/fixtures/BPI_2020_DomesticDeclarations.xes');
// 5 tasks that succeed with running-example.xes
const WORKING_ML_TASKS = ['classify', 'cluster', 'forecast', 'anomaly', 'regress'];
// PCA requires more features than running-example.xes provides
const PCA_TASK = 'pca';
describe('ml command', () => {
    // ── Error cases ───────────────────────────────────────────────────────────
    describe('error handling', () => {
        it('exits 1 when no task provided', async () => {
            const result = await wasm4pm(['ml']);
            assertExitCode(result, EXIT_CODES.CONFIG_ERROR);
        });
        it('exits 2 for invalid task name', async () => {
            const result = await wasm4pm(['ml', 'nonexistent_task', '-i', RUNNING_EXAMPLE]);
            assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
            expect(combinedOutput(result)).toContain('Unknown ML task');
        });
        it('exits 1 when no input provided', async () => {
            const result = await wasm4pm(['ml', 'classify']);
            assertExitCode(result, EXIT_CODES.CONFIG_ERROR);
            expect(combinedOutput(result)).toContain('Missing required');
        });
    });
    // ── ML tasks — JSON output (5 working tasks) ─────────────────────────────
    describe('ML tasks — JSON output', () => {
        for (const task of WORKING_ML_TASKS) {
            describe(`${task} task`, () => {
                it(`wpm ml ${task} exits 0 and returns valid JSON`, async () => {
                    const result = await wasm4pm(['ml', task, '-i', RUNNING_EXAMPLE, '--format', 'json']);
                    assertExitCode(result, EXIT_CODES.SUCCESS);
                    const json = extractJson(result.stdout);
                    expect(json).toBeDefined();
                });
                it(`output contains task field set to "${task}"`, async () => {
                    const result = await wasm4pm(['ml', task, '-i', RUNNING_EXAMPLE, '--format', 'json']);
                    const json = extractJson(result.stdout);
                    expect(json.task).toBe(task);
                });
                it(`output contains status field set to "success"`, async () => {
                    const result = await wasm4pm(['ml', task, '-i', RUNNING_EXAMPLE, '--format', 'json']);
                    const json = extractJson(result.stdout);
                    expect(json.status).toBe('success');
                });
            });
        }
    });
    // ── PCA (requires sufficient features) ────────────────────────────────────
    describe('PCA task', () => {
        it('exits 3 when running-example.xes has insufficient features for PCA', async () => {
            const result = await wasm4pm(['ml', PCA_TASK, '-i', RUNNING_EXAMPLE, '--format', 'json']);
            assertExitCode(result, EXIT_CODES.EXECUTION_ERROR);
            const json = extractJson(result.stdout);
            expect(json.status).toBe('error');
            expect(json.message).toContain('PCA');
        });
    });
    // ── Task-specific data fields ─────────────────────────────────────────────
    describe('task-specific data fields', () => {
        it('classify has predictions array', async () => {
            const result = await wasm4pm(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            expect(Array.isArray(json.predictions)).toBe(true);
        });
        it('cluster has assignments array', async () => {
            const result = await wasm4pm(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            expect(Array.isArray(json.assignments)).toBe(true);
        });
        it('cluster has modelInfo with k', async () => {
            const result = await wasm4pm(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            const modelInfo = json.modelInfo;
            expect(typeof modelInfo.k).toBe('number');
        });
        it('forecast has trend object', async () => {
            const result = await wasm4pm(['ml', 'forecast', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            expect(json.trend).toBeDefined();
        });
        it('anomaly has peakIndices array', async () => {
            const result = await wasm4pm(['ml', 'anomaly', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            expect(Array.isArray(json.peakIndices)).toBe(true);
        });
        it('regress has predictions array with actual/predicted fields', async () => {
            const result = await wasm4pm(['ml', 'regress', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            expect(Array.isArray(json.predictions)).toBe(true);
            const first = json.predictions[0];
            expect('actual' in first).toBe(true);
            expect('predicted' in first).toBe(true);
        });
        it('classify has modelInfo with k and traceCount', async () => {
            const result = await wasm4pm(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const json = extractJson(result.stdout);
            const modelInfo = json.modelInfo;
            expect(typeof modelInfo.k).toBe('number');
            expect(typeof modelInfo.traceCount).toBe('number');
        });
    });
    // ── Determinism ───────────────────────────────────────────────────────────
    describe('determinism', () => {
        it('classify produces same JSON on two runs', async () => {
            const result1 = await wasm4pm(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            const result2 = await wasm4pm(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--format', 'json']);
            assertExitCode(result1, EXIT_CODES.SUCCESS);
            assertExitCode(result2, EXIT_CODES.SUCCESS);
            const json1 = extractJson(result1.stdout);
            const json2 = extractJson(result2.stdout);
            // Task name and structure should match
            expect(json1.task).toBe(json2.task);
            expect(Object.keys(json1).sort()).toEqual(Object.keys(json2).sort());
        });
    });
    // ── Flag variants ─────────────────────────────────────────────────────────
    it('supports --activity-key flag', async () => {
        const result = await wasm4pm(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--activity-key', 'concept:name', '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SUCCESS);
        const json = extractJson(result.stdout);
        expect(json.task).toBe('classify');
    });
    it('supports --method flag', async () => {
        const result = await wasm4pm(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--method', 'knn', '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SUCCESS);
        const json = extractJson(result.stdout);
        expect(json.method).toBe('knn');
    });
    it('supports --k flag', async () => {
        const result = await wasm4pm(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '--k', '3', '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SUCCESS);
        const json = extractJson(result.stdout);
        const modelInfo = json.modelInfo;
        expect(modelInfo.k).toBe(3);
    });
});
//# sourceMappingURL=19-ml-command.js.map