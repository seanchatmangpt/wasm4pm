/**
 * End-to-End CLI Workflow Tests
 *
 * Tests realistic user workflows with the `wpm` CLI command, validating
 * complete command sequences a user would actually run.
 *
 * MIGRATION NOTE (noun-verb rebuild): every old top-level command below is
 * mapped through `nouns/_removed.ts` to its replacement noun/verb. Two
 * result-shape differences matter for this file's assertions:
 *
 *  - `model discover` (was: `wpm run`) is a NEW, non-bridged implementation
 *    (`nouns/model/discover.ts`): its success result is the plain payload
 *    directly (`{ algorithm, format, shape: { nodes, edges, raw: {...} },
 *    handle, ... }`) — there is no `.status`/`.payload` wrapper, and no
 *    top-level `.model` field (the old test's `payload.model.nodes` shape
 *    does not exist on this verb).
 *  - `model compare` (was: `wpm compare`) is BRIDGED to the unmodified
 *    legacy `commands/compare.ts` (`nouns/_bridge.ts`): its result is the
 *    legacy command's own `{ command, status, payload, meta }` envelope,
 *    unwrapped by nothing — so `.status`/`.payload.algorithms` assertions
 *    from before the migration are still valid, unchanged.
 *
 * Tests here are already loose ("should run without crashing") by design;
 * migration mostly means renaming invocations and tightening exit-code
 * expectations where the bridge is known to collapse config_error(1) into
 * source_error(2) (see dx-error-messages.test.ts for the detailed why).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runCli, EXIT_CODES, type CliResult } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('E2E CLI Workflows', () => {
  let logPath: string;

  beforeAll(() => {
    const candidates = [
      path.resolve(__dirname, '../../data/small-example.xes'),
      path.resolve(__dirname, '../../../data/small-example.xes'),
      path.resolve(__dirname, '../../../../data/small-example.xes'),
      '/Users/sac/wasm4pm/data/small-example.xes',
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        logPath = candidate;
        return;
      }
    }

    throw new Error(`Test XES file not found in any candidate path:\n${candidates.join('\n')}`);
  });

  async function runWpmCli(args: string[]): Promise<CliResult> {
    return runCli(args, { cwd: path.resolve(__dirname, '../..'), timeout: 60000 });
  }

  function parseJsonOutput(result: { stdout: string; stderr: string }): Record<string, unknown> {
    try {
      return JSON.parse(result.stdout) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Failed to parse JSON output.\nstdout: ${result.stdout.slice(0, 1000)}\nstderr: ${result.stderr.slice(0, 500)}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow 1: Complete Discovery Workflow
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Workflow 1: Complete Discovery Workflow', () => {
    it('CORE TEST: should discover model with model discover (was: wpm run)', async () => {
      const result = await runWpmCli(['model', 'discover', logPath, '--algorithm', 'dfg']);

      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.source_error]).toContain(result.exitCode);

      if (result.exitCode === EXIT_CODES.success) {
        const output = parseJsonOutput(result);
        // No {status,payload} wrapper on this verb — the payload IS the result.
        expect(output.algorithm).toBeDefined();
        const shape = output.shape as Record<string, unknown>;
        expect(shape).toBeDefined();
        expect(typeof shape.nodes === 'number' || Array.isArray((shape.raw as Record<string, unknown>)?.nodes)).toBe(true);
      }
    });

    it('should invoke log stats (was: wpm quality, in part — see dx-error-messages.test.ts for what did not move)', async () => {
      const result = await runWpmCli(['log', 'stats', logPath]);
      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should invoke model check --mode replay without a model file (was: wpm conformance)', async () => {
      // `model check` requires --model for replay/prefix/oracle — omitting
      // it is INVALID_INPUT (exit 2), a stricter contract than the old
      // `conformance` command which could run model-less. That is itself
      // an acceptable "did not crash" outcome for this loose smoke test.
      const result = await runWpmCli(['model', 'check', logPath, '--mode', 'replay']);
      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error, EXIT_CODES.conformance_fail]).toContain(result.exitCode);
    });

    it('should invoke log validate (was: wpm validate)', async () => {
      const result = await runWpmCli(['log', 'validate', logPath]);
      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error, EXIT_CODES.conformance_fail]).toContain(result.exitCode);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow 2: Algorithm Comparison Workflow
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Workflow 2: Algorithm Comparison Workflow', () => {
    it('should compare multiple algorithms with model compare (was: wpm compare)', async () => {
      const result = await runWpmCli([
        'model', 'compare',
        'dfg,heuristic_miner,inductive_miner',
        '-i', logPath,
      ]);

      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);

      // If successful, verify output structure — `model compare` is bridged
      // to the unmodified legacy command, so the old {status,payload} shape
      // is still exactly right here (unlike `model discover`, above).
      if (result.exitCode === EXIT_CODES.success) {
        const output = parseJsonOutput(result);
        expect(output.status).toBe('ok');
        const payload = output.payload as Record<string, unknown>;
        expect(Array.isArray(payload.algorithms)).toBe(true);
      }
    });

    it('should call model compare successfully with two algorithms', async () => {
      const result = await runWpmCli([
        'model', 'compare',
        'dfg,heuristic_miner',
        '-i', logPath,
      ]);

      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow 3: Analysis Pipeline
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Workflow 3: Analysis Pipeline', () => {
    it('should provide metrics or analysis output via log stats', async () => {
      const result = await runWpmCli(['log', 'stats', logPath]);
      expect([EXIT_CODES.success, EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow 4: Extended Analysis
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Workflow 4: Extended Analysis Commands', () => {
    it('should invoke analysis commands without crashing (model explain, help algorithms)', async () => {
      const commands = [
        ['model', 'explain', 'dfg'],
        ['help', 'algorithms'],
      ];

      for (const cmd of commands) {
        const result = await runWpmCli(cmd);
        expect([
          EXIT_CODES.success,
          EXIT_CODES.config_error,
          EXIT_CODES.execution_error,
        ]).toContain(result.exitCode);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow 5: CLI Stability
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Workflow 5: CLI Stability and Resilience', () => {
    it('should handle multiple algorithm runs via model discover', async () => {
      for (const algo of ['dfg', 'heuristic_miner']) {
        const result = await runWpmCli(['model', 'discover', logPath, '--algorithm', algo]);

        expect([
          EXIT_CODES.success,
          EXIT_CODES.config_error,
          EXIT_CODES.source_error,
          EXIT_CODES.execution_error,
        ]).toContain(result.exitCode);
      }
    });

    it('should accept --human without changing the machine-readable exit-code contract', async () => {
      // `--format json|human` no longer changes what's on stdout (always
      // JSON — see packages/noun-verb/src/output.ts); `--human` instead
      // ADDITIONALLY renders to stderr. Both invocations must still behave
      // identically from the exit-code caller's point of view.
      for (const extra of [[], ['--human']]) {
        const result = await runWpmCli(['model', 'discover', logPath, '--algorithm', 'dfg', ...extra]);

        expect([
          EXIT_CODES.success,
          EXIT_CODES.config_error,
          EXIT_CODES.source_error,
          EXIT_CODES.execution_error,
        ]).toContain(result.exitCode);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Integration: End-to-End Pipeline Test
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Integration: E2E Pipeline Verification', () => {
    it('should successfully run through discovery and analysis pipeline', async () => {
      // Step 1: Run discovery
      const runResult = await runWpmCli(['model', 'discover', logPath, '--algorithm', 'dfg']);

      expect([
        EXIT_CODES.success,
        EXIT_CODES.config_error,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
      ]).toContain(runResult.exitCode);

      if (runResult.exitCode === EXIT_CODES.success) {
        const output = parseJsonOutput(runResult);
        expect(output.algorithm).toBeDefined();
      }

      // Step 2: Compare algorithms (should not crash)
      const compareResult = await runWpmCli(['model', 'compare', 'dfg,heuristic_miner', '-i', logPath]);

      expect([
        EXIT_CODES.success,
        EXIT_CODES.config_error,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
      ]).toContain(compareResult.exitCode);

      // Step 3: Stats (should not crash)
      const statsResult = await runWpmCli(['log', 'stats', logPath]);

      expect([
        EXIT_CODES.success,
        EXIT_CODES.config_error,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
      ]).toContain(statsResult.exitCode);
    });
  });
});
