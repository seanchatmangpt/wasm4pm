/**
 * End-to-End Test: wasm4pm autoprocess persistence and state management
 *
 * Complementary to the existing 30-autoprocess-e2e.test.ts, this scenario
 * focuses on the specific persistence and state recovery behavior of AutoProcess.
 *
 * Tests:
 * 1. Basic invocation: wasm4pm autoprocess <log.xes> --format json returns required fields
 * 2. Persistence across runs: State restored on subsequent runs with cycle count
 * 3. Error handling: Bad file paths return SOURCE_ERROR (exit code 2)
 *
 * Uses @wasm4pm/testing CLI harness and real XES fixtures from lab/fixtures/
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES, } from '@wasm4pm/testing';
// Resolve paths relative to the project root
const PROJECT_ROOT = path.join(__dirname, '../..');
const FIXTURE_LOG = path.join(PROJECT_ROOT, 'lab/fixtures/sample-xes-1.0.xes');
const AUTOPROCESS_STATE_FILE = '.wasm4pm/autoprocess-state.json';
const CLI_PATH = path.join(PROJECT_ROOT, 'apps/wasm4pm/dist/bin/wpm.js');
async function runWasm4pm(args, cwd) {
    // Use the compiled Node.js CLI by passing cliPath as 'node' and prepending the script
    const fullArgs = [CLI_PATH, ...args];
    return runCli(fullArgs, {
        cwd,
        cliPath: 'node',
        timeout: 30000,
    });
}
describe('wpm autoprocess persistence (E2E)', () => {
    let testEnv;
    beforeEach(async () => {
        testEnv = await createCliTestEnv();
    });
    afterEach(async () => {
        await testEnv.cleanup();
    });
    // Test 1: Basic invocation
    describe('Test 1: Basic invocation with JSON output', () => {
        it('should run autoprocess on valid XES and exit 0', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
        }, { timeout: 30000 });
        it('should return JSON with required response structure', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = assertJsonOutput(result);
            // Verify JSON structure
            expect(json).toBeDefined();
            expect(typeof json).toBe('object');
            // Check top-level fields
            expect(json).toHaveProperty('status');
            expect(json).toHaveProperty('data');
            // Check data fields
            const data = json.data;
            expect(data).toHaveProperty('cycle_result');
            expect(data).toHaveProperty('timing');
        }, { timeout: 30000 });
        it('should have cycle_result with 4 AutoProcess layers', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = assertJsonOutput(result);
            const data = json.data;
            const cycle = data.cycle_result;
            // Verify 4 AutoProcess layers: Perception, Decision, Protection, Optimization
            expect(cycle).toHaveProperty('perception');
            expect(cycle).toHaveProperty('decision');
            expect(cycle).toHaveProperty('protection');
            expect(cycle).toHaveProperty('optimization');
            expect(cycle).toHaveProperty('success');
        }, { timeout: 30000 });
        it('should populate perception layer with event/activity/trace counts', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = assertJsonOutput(result);
            const data = json.data;
            const perception = data.cycle_result.perception;
            expect(perception).toHaveProperty('event_count');
            expect(perception).toHaveProperty('unique_activities');
            expect(perception).toHaveProperty('trace_count');
            expect(perception).toHaveProperty('health_state');
            expect(perception).toHaveProperty('health_score');
            // Verify numeric values
            expect(typeof perception.event_count).toBe('number');
            expect(perception.event_count).toBeGreaterThanOrEqual(0);
            expect(typeof perception.trace_count).toBe('number');
            expect(perception.trace_count).toBeGreaterThanOrEqual(0);
        }, { timeout: 30000 });
        it('should populate decision layer with guard and pattern results', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = assertJsonOutput(result);
            const data = json.data;
            const decision = data.cycle_result.decision;
            expect(decision).toHaveProperty('guard_result');
            expect(decision).toHaveProperty('pattern_result');
            expect(decision).toHaveProperty('pattern_ticks');
            expect(typeof decision.guard_result).toBe('boolean');
        }, { timeout: 30000 });
        it('should populate protection layer with circuit state and SPC results', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = assertJsonOutput(result);
            const data = json.data;
            const protection = data.cycle_result.protection;
            expect(protection).toHaveProperty('circuit_state');
            expect(protection).toHaveProperty('spc_results');
            expect(protection).toHaveProperty('special_causes');
            expect(typeof protection.circuit_state).toBe('string');
            expect(Array.isArray(protection.special_causes)).toBe(true);
        }, { timeout: 30000 });
        it('should populate optimization layer with RL action', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const json = assertJsonOutput(result);
            const data = json.data;
            const optimization = data.cycle_result.optimization;
            expect(optimization).toHaveProperty('rl_action');
            expect(typeof optimization.rl_action).toBe('string');
        }, { timeout: 30000 });
    });
    // Test 2: Persistence across runs
    describe('Test 2: Persistence across runs', () => {
        it('should create .wasm4pm/autoprocess-state.json on first run', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            // Check if state file exists
            const stateFile = path.join(testEnv.tempDir, AUTOPROCESS_STATE_FILE);
            const exists = await fs.stat(stateFile).then(() => true).catch(() => false);
            expect(exists).toBe(true);
        }, { timeout: 30000 });
        it('should contain spc_history with snapshots in persisted state', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const stateFile = path.join(testEnv.tempDir, AUTOPROCESS_STATE_FILE);
            const content = await fs.readFile(stateFile, 'utf-8');
            const state = JSON.parse(content);
            expect(state).toHaveProperty('spc_history');
            expect(state.spc_history).toHaveProperty('snapshots');
            expect(Array.isArray(state.spc_history.snapshots)).toBe(true);
        }, { timeout: 30000 });
        it('should contain rl_state and circuit_breaker_state in persisted state', async () => {
            const result = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SUCCESS);
            const stateFile = path.join(testEnv.tempDir, AUTOPROCESS_STATE_FILE);
            const content = await fs.readFile(stateFile, 'utf-8');
            const state = JSON.parse(content);
            expect(state).toHaveProperty('rl_state');
            expect(state).toHaveProperty('circuit_breaker_state');
            expect(state).toHaveProperty('saved_at');
        }, { timeout: 30000 });
        it('should restore and reload state on subsequent runs', async () => {
            // Run 1: Initial state
            const result1 = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result1, EXIT_CODES.SUCCESS);
            const json1 = assertJsonOutput(result1);
            expect(json1.status).toBe('success');
            // Verify state file was created
            const stateFile = path.join(testEnv.tempDir, AUTOPROCESS_STATE_FILE);
            const state1Content = await fs.readFile(stateFile, 'utf-8');
            const state1 = JSON.parse(state1Content);
            const savedAt1 = state1.saved_at;
            // Run 2: State should be restored
            const result2 = await runWasm4pm(['autoprocess', FIXTURE_LOG, '--format', 'json'], testEnv.tempDir);
            assertExitCode(result2, EXIT_CODES.SUCCESS);
            const json2 = assertJsonOutput(result2);
            expect(json2.status).toBe('success');
            // Verify state file was updated (new timestamp)
            const state2Content = await fs.readFile(stateFile, 'utf-8');
            const state2 = JSON.parse(state2Content);
            const savedAt2 = state2.saved_at;
            // saved_at should be different (newer) after second run
            expect(new Date(savedAt2).getTime()).toBeGreaterThan(new Date(savedAt1).getTime());
        }, { timeout: 60000 });
    });
    // Test 3: Error handling
    describe('Test 3: Error handling', () => {
        it('should exit with SOURCE_ERROR (exit code 2) for nonexistent file', async () => {
            const result = await runWasm4pm(['autoprocess', '/nonexistent/path/to/missing.xes', '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
        }, { timeout: 30000 });
        it('should return JSON error response on SOURCE_ERROR', async () => {
            const result = await runWasm4pm(['autoprocess', '/nonexistent/path.xes', '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
            const json = assertJsonOutput(result);
            expect(json).toHaveProperty('status');
            expect(json.status).toBe('error');
        }, { timeout: 30000 });
        it('should include readable error message on SOURCE_ERROR', async () => {
            const result = await runWasm4pm(['autoprocess', '/nonexistent/missing.xes', '--format', 'json'], testEnv.tempDir);
            assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
            // Either stdout or stderr should contain error info
            const output = result.stdout + result.stderr;
            expect(output.length).toBeGreaterThan(0);
        }, { timeout: 30000 });
    });
});
//# sourceMappingURL=31-autoprocess-persistence.test.js.map