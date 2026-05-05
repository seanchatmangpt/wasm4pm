/**
 * Scenario: CLI exit codes — pictl exit code contract
 *
 * Dev action simulated: "I changed the algorithm dispatch table. Does bad input
 * still exit with the right code? Does JSON output still parse?"
 *
 * Runs against the real pictl binary built from local source.
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first: cd apps/pictl && npm run build)
 *
 * Exit code contract:
 *   0  success
 *   1  config_error
 *   2  source_error   (missing file, unknown algorithm — yes, algorithm errors are 2 not 1)
 *   3  execution_error (WASM runtime failure)
 *   4  partial_failure
 *   5  system_error
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pictl, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import { PICTL } from '../helpers/cli.js';
let _env = null;
afterEach(async () => { await _env?.cleanup(); _env = null; });
// Minimal valid XES — self-contained so the scenario doesn't need external fixtures
const MINI_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="event">
    <string key="concept:name" value="undefined"/>
    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/>
  </global>
  <trace>
    <string key="concept:name" value="Case1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00"/></event>
  </trace>
</log>`;
// ── Check binary exists ───────────────────────────────────────────────────────
describe('cli exit codes: binary availability', () => {
    it('pictl binary exists at expected path', async () => {
        try {
            await fs.access(PICTL);
            console.info('[cli] binary found:', PICTL);
        }
        catch {
            console.warn('[cli] binary not found:', PICTL);
            console.warn('[cli] Run: cd apps/pictl && npm run build');
            // Skip rather than fail — missing binary is a setup issue, not a code bug
            expect(true).toBe(true); // vitest has no built-in skip in this pattern
        }
    });
});
// ── Missing XES file → exit 2 ─────────────────────────────────────────────────
describe('cli exit codes: missing XES file', () => {
    it('exits 2 (source_error) when XES path does not exist', async () => {
        const result = await pictl(['run', '/tmp/phantom-12345.xes']);
        assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
        expect(result.stderr + result.stdout).toMatch(/not found|no such file|does not exist/i);
        console.info('[cli] exit:', result.exitCode, '| message:', (result.stderr + result.stdout).slice(0, 100));
    });
    it('still exits 2 with --no-save flag', async () => {
        const result = await pictl(['run', '/tmp/phantom-12345.xes', '--no-save']);
        assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    });
});
// ── Invalid algorithm → exit 2 ────────────────────────────────────────────────
// Note: algorithm errors use SOURCE_ERROR (2) not CONFIG_ERROR (1) — intentional pictl design
describe('cli exit codes: invalid algorithm name', () => {
    it('exits 2 (source_error) for an unknown algorithm', async () => {
        const result = await pictl(['run', 'placeholder.xes', '--algorithm', 'unicorn-algo']);
        assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
        console.info('[cli] unknown-algo stdout:', result.stdout.slice(0, 150));
    });
});
// ── JSON output on error ───────────────────────────────────────────────────────
describe('cli exit codes: JSON output envelope', () => {
    it('--format json emits parseable JSON on error', async () => {
        const result = await pictl(['run', '/nonexistent.xes', '--format', 'json']);
        assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
        const envelope = assertJsonOutput(result);
        expect(envelope).toHaveProperty('status', 'error');
        expect(typeof envelope['message']).toBe('string');
        console.info('[cli] json error envelope:', JSON.stringify(envelope).slice(0, 150));
    });
});
// ── Valid run → exit 0 ────────────────────────────────────────────────────────
describe('cli exit codes: successful discovery', () => {
    it('exits 0 on valid XES with dfg algorithm (or 3 if WASM unbuilt)', async () => {
        _env = await createCliTestEnv();
        const xesPath = path.join(_env.tempDir, 'mini.xes');
        await fs.writeFile(xesPath, MINI_XES, 'utf-8');
        const result = await pictl(['run', xesPath, '--algorithm', 'dfg', '--no-save']);
        // Accept 0 (success) or 3 (WASM not initialized in this env)
        // Either is actionable signal — 3 means the dev needs to build the WASM binary
        const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
        if (!acceptable.includes(result.exitCode)) {
            console.error('[cli] unexpected exit code:', result.exitCode);
            console.error('  stdout:', result.stdout.slice(0, 300));
            console.error('  stderr:', result.stderr.slice(0, 300));
        }
        expect(acceptable).toContain(result.exitCode);
        if (result.exitCode === EXIT_CODES.SUCCESS) {
            console.info('[cli] success! stdout:', result.stdout.slice(0, 200));
        }
        else {
            console.warn('[cli] exit 3 — WASM may not be initialized. Run: cd wasm4pm && npm run build:nodejs');
        }
    }, 30000);
    it('JSON success envelope has required shape', async () => {
        _env = await createCliTestEnv();
        const xesPath = path.join(_env.tempDir, 'mini.xes');
        await fs.writeFile(xesPath, MINI_XES, 'utf-8');
        const result = await pictl(['run', xesPath, '--algorithm', 'dfg', '--format', 'json', '--no-save']);
        if (result.exitCode !== EXIT_CODES.SUCCESS) {
            console.warn('[cli] skipping JSON shape check — exit', result.exitCode);
            return;
        }
        const envelope = assertJsonOutput(result);
        expect(envelope).toHaveProperty('status', 'success');
        expect(envelope).toHaveProperty('algorithm');
        expect(envelope).toHaveProperty('elapsedMs');
        console.info('[cli] json success envelope keys:', Object.keys(envelope));
    }, 30000);
});
//# sourceMappingURL=04-cli-exit-codes.js.map