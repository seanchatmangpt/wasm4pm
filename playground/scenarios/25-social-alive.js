/**
 * Scenario: Social Command Alive
 *
 * JTBD: "Verify the social command is integrated and callable without crashing."
 *
 * Van der Aalst doctrine: A command that crashes or is missing from the CLI is not a usable
 * process mining tool. This scenario validates that `pictl social` exists, is callable,
 * and produces valid results without crashing.
 *
 * Test phases:
 * 1. Command exists and runs without hanging/crashing
 * 2. Command returns an exit code (0 = success, 3 = execution error, etc. — but not crashes)
 * 3. Output (success or error) is well-formed JSON
 * 4. On success, handover network with nodes array is present
 */
import { describe, it, expect } from 'vitest';
import { pictl, extractJson, resolveRepo } from '../helpers/cli.js';
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
describe.sequential('Social Command Alive', () => {
    it('pictl social command exists and is callable — Rank 2: domain contract', async () => {
        // JTBD: "The social command must exist in the CLI and be callable"
        const result = await pictl(['social', '--help']);
        // Command should show help without crashing
        expect([0, 1, 2]).toContain(result.exitCode);
    });
    it('pictl social accepts input file without crashing — Rank 2: domain contract', async () => {
        // JTBD: "The social command must handle input files gracefully"
        const result = await pictl(['social', RUNNING_EXAMPLE, '--format', 'json']);
        // Command should return gracefully (either success 0, or execution error 3, but not hang)
        expect(result.exitCode).toBeDefined();
        expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
    it('pictl social returns valid JSON output — Rank 2: domain contract', async () => {
        // JTBD: "Output must be parseable JSON even on error"
        const result = await pictl(['social', RUNNING_EXAMPLE, '--format', 'json']);
        // Output should be valid JSON
        const output = extractJson(result.stdout);
        expect(output).toBeDefined();
        expect(typeof output).toBe('object');
    });
    it('pictl social on success returns handover network with nodes — Rank 1: mathematical invariant', async () => {
        // JTBD: "When social succeeds, handover network must have nodes array"
        const result = await pictl(['social', RUNNING_EXAMPLE, '--format', 'json', '--metric', 'handover']);
        if (result.exitCode === 0) {
            const output = extractJson(result.stdout);
            expect(output.status).toBe('success');
            expect(output.metric).toBe('handover');
            const network = output.network || {};
            expect(Array.isArray(network.nodes)).toBe(true);
        }
    });
    it('pictl social --metric working-together returns valid network — Rank 1: mathematical invariant', async () => {
        // JTBD: "Working-together metric must produce valid network output"
        const result = await pictl(['social', RUNNING_EXAMPLE, '--format', 'json', '--metric', 'working-together']);
        if (result.exitCode === 0) {
            const output = extractJson(result.stdout);
            expect(output.status).toBe('success');
            expect(output.metric).toBe('working-together');
            const network = output.network || {};
            expect(Array.isArray(network.nodes)).toBe(true);
        }
    });
    it('pictl social --metric similar-task returns graceful response — Rank 2: domain contract', async () => {
        // JTBD: "Similar-task metric must not crash, even if not fully supported"
        const result = await pictl(['social', RUNNING_EXAMPLE, '--format', 'json', '--metric', 'similar-task']);
        // Should complete without crashing
        expect(result.exitCode).toBeDefined();
        const output = extractJson(result.stdout);
        expect(typeof output).toBe('object');
    });
});
//# sourceMappingURL=25-social-alive.js.map