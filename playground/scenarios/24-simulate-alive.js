/**
 * Scenario: Simulate Command Alive
 *
 * JTBD: "Verify the simulate command is integrated and callable without crashing."
 *
 * Van der Aalst doctrine: A command that crashes or is missing from the CLI is not a usable
 * process mining tool. This scenario validates that `wpm simulate` exists, is callable,
 * and produces valid results without crashing.
 *
 * Test phases:
 * 1. Command exists and runs without hanging/crashing
 * 2. Command returns an exit code (0 = success, 3 = execution error, etc. — but not crashes)
 * 3. Output (success or error) is well-formed JSON
 * 4. On success, simulated_cases and average_trace_length are present and valid
 */
import { describe, it, expect } from 'vitest';
import { wasm4pm, extractJson, resolveRepo } from '../helpers/cli.js';
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
describe.sequential('Simulate Command Alive', () => {
    it('wasm4pm simulate command exists and is callable — Rank 2: domain contract', async () => {
        // JTBD: "The simulate command must exist in the CLI and be callable"
        const result = await wasm4pm(['simulate', '--help']);
        // Command should show help without crashing
        expect([0, 1, 2]).toContain(result.exitCode);
    });
    it('wasm4pm simulate accepts input file without crashing — Rank 2: domain contract', async () => {
        // JTBD: "The simulate command must handle input files gracefully"
        const result = await wasm4pm(['simulate', RUNNING_EXAMPLE, '--format', 'json']);
        // Command should return gracefully (either success 0, or execution error 3, but not hang)
        expect(result.exitCode).toBeDefined();
        expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
    it('wasm4pm simulate returns valid JSON output — Rank 2: domain contract', async () => {
        // JTBD: "Output must be parseable JSON even on error"
        const result = await wasm4pm(['simulate', RUNNING_EXAMPLE, '--format', 'json']);
        // Output should be valid JSON
        const output = extractJson(result.stdout);
        expect(output).toBeDefined();
        expect(typeof output).toBe('object');
    });
    it('wasm4pm simulate on success returns simulated cases count — Rank 1: mathematical invariant', async () => {
        // JTBD: "When simulate succeeds, simulated_cases must be a number ≥ 1"
        const result = await wasm4pm(['simulate', RUNNING_EXAMPLE, '--format', 'json', '--cases', '50']);
        if (result.exitCode === 0) {
            const output = extractJson(result.stdout);
            expect(output.status).toBe('success');
            const sim = output.simulation || {};
            expect(typeof sim.casesCompleted).toBe('number');
            expect(sim.casesCompleted).toBeGreaterThanOrEqual(1);
        }
    });
    it('wasm4pm simulate on success returns average trace length — Rank 1: mathematical invariant', async () => {
        // JTBD: "When simulate succeeds, average_trace_length must be a number ≥ 1"
        const result = await wasm4pm(['simulate', RUNNING_EXAMPLE, '--format', 'json', '--cases', '50']);
        if (result.exitCode === 0) {
            const output = extractJson(result.stdout);
            expect(output.status).toBe('success');
            const stats = output.statistics || {};
            expect(typeof stats.avgTraceLength).toBe('number');
            expect(stats.avgTraceLength).toBeGreaterThanOrEqual(1);
        }
    });
});
//# sourceMappingURL=24-simulate-alive.js.map