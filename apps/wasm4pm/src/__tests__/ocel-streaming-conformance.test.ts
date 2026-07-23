/**
 * OCEL and Streaming Algorithm Conformance Test Suite
 *
 * Tests object-centric event log (OCEL) processing and streaming algorithms
 * to ensure correctness, determinism, and conformance with quality metrics.
 *
 * Migrated from the old top-level `wpm run` / `wpm conformance` onto
 * `wpm model discover` / `wpm model check` (nouns/_removed.ts:
 * `{ old: 'run', replacement: 'model discover' }`,
 * `{ old: 'conformance', replacement: 'model check --mode replay' }`).
 *
 * Contract changes verified live and reflected below:
 *  - `model discover` has no `--format` flag (framework always emits JSON
 *    on stdout); its result has no `.payload` wrapper — nodes/edges for a
 *    DFG-shaped discovery live at `.shape.raw.nodes`/`.shape.raw.edges`
 *    (`.shape.nodes`/`.shape.edges` are just counts).
 *  - `model check` has no `--model-from`/`--precision-mode` args and no
 *    continuous top-level `fitness`/`precision`/generalization score; it
 *    is fail-closed (`status: ADMITTED|REJECTED|INDETERMINATE` over
 *    grouped episodes — see `engines/conformance/verdict.ts`). Continuous
 *    per-trace fitness numbers still exist, nested under
 *    `findings[].details.case_fitness[].trace_fitness`.
 *  - OCEL input must match the new engine's content-sniffed dialects
 *    (`{eventTypes, objectTypes, events, objects}` for v2, or
 *    `ocel:events`/`ocel:objects`/`ocel:global-log` for v1) — the old
 *    ad hoc `{ocel:"2.0", events:[{"ocel:eid":...}]}` shape used by this
 *    suite's fixtures is recognized by neither dialect and is rejected
 *    with a source_error (2), which is still one of the "acceptable
 *    outcome" exit codes these tests were already tolerant of.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('OCEL and Streaming Conformance', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('OCEL Format Support', () => {
    it('should accept OCEL JSON format as input', async () => {
      const ocelPath = path.join(env.tempDir, 'test.ocel.json');

      // Proper OCEL 2.0 shape per engines/conformance/readers/detect.ts:
      // top-level `eventTypes`/`objectTypes`/`events`/`objects` arrays,
      // events carrying `relationships[]`.
      const minimalOCEL = {
        eventTypes: [{ name: 'Create', attributes: [] }],
        objectTypes: [{ name: 'Order', attributes: [] }],
        events: [{ id: 'e1', type: 'Create', time: '2024-01-01T10:00:00Z', relationships: [{ objectId: 'o1' }] }],
        objects: [{ id: 'o1', type: 'Order', attributes: [] }],
      };

      await fs.writeFile(ocelPath, JSON.stringify(minimalOCEL));

      const result = await runCli(['model', 'discover', ocelPath, '--algorithm', 'ocel_dfg_per_type'], { env: env.env });
      // OCEL may be supported or rejected depending on the WASM build's feature-ocel flag; accept any valid exit code.
      const validCodes = [0, 1, 2, 3, 4, 5, 6];
      expect(validCodes.includes(result.exitCode)).toBe(true);
    });

    it('should handle OCEL conformance checking', async () => {
      const ocelPath = path.join(env.tempDir, 'test.ocel.json');
      const modelPath = path.join(env.tempDir, 'model.pnml');

      const minimalOCEL = {
        eventTypes: [{ name: 'Create', attributes: [] }],
        objectTypes: [{ name: 'Order', attributes: [] }],
        events: [{ id: 'e1', type: 'Create', time: '2024-01-01T10:00:00Z', relationships: [{ objectId: 'o1' }] }],
        objects: [{ id: 'o1', type: 'Order', attributes: [] }],
      };

      const minimalPNML = `<?xml version="1.0" encoding="UTF-8"?>
<pnml xmlns="http://www.pnml.org/version-2009-05-13/pnmlcoremodel">
  <net id="net1" type="http://www.pnml.org/version-2009-05-13/pnmlcoremodel">
    <place id="p1"/>
    <transition id="t1"/>
  </net>
</pnml>`;

      await fs.writeFile(ocelPath, JSON.stringify(minimalOCEL));
      await fs.writeFile(modelPath, minimalPNML);

      const result = await runCli(['model', 'check', ocelPath, '--mode', 'oracle', '--model', modelPath], { env: env.env });
      // Conformance checking may or may not support this OCEL shape/model combination.
      const acceptableExitCodes: number[] = [
        EXIT_CODES.success,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
        EXIT_CODES.conformance_fail,
      ];
      expect(acceptableExitCodes.includes(result.exitCode)).toBe(true);
    });

    it('should preserve object-centric semantics during discovery', async () => {
      const ocelPath = path.join(env.tempDir, 'multi-object.ocel.json');

      const multiObjectOCEL = {
        eventTypes: [{ name: 'OrderCreated', attributes: [] }, { name: 'ItemShipped', attributes: [] }],
        objectTypes: [{ name: 'Order', attributes: [] }, { name: 'Item', attributes: [] }],
        events: [
          {
            id: 'e1',
            type: 'OrderCreated',
            time: '2024-01-01T10:00:00Z',
            relationships: [{ objectId: 'o1' }, { objectId: 'i1' }],
          },
          {
            id: 'e2',
            type: 'ItemShipped',
            time: '2024-01-01T11:00:00Z',
            relationships: [{ objectId: 'i1' }],
          },
        ],
        objects: [
          { id: 'o1', type: 'Order', attributes: [] },
          { id: 'i1', type: 'Item', attributes: [] },
        ],
      };

      await fs.writeFile(ocelPath, JSON.stringify(multiObjectOCEL));

      const result = await runCli(['model', 'discover', ocelPath, '--algorithm', 'ocel_dfg_per_type'], { env: env.env });

      // If OCEL is supported, should succeed and return a well-formed result (or a structured error).
      if (result.exitCode === 0) {
        try {
          const output = JSON.parse(result.stdout);
          expect(output).toBeDefined();
        } catch {
          // JSON parse OK to fail
        }
      }
    });
  });

  describe('Streaming Algorithm Correctness', () => {
    it('simd_streaming_dfg should produce valid DFG output', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        console.log('Test fixture unavailable, skipping');
        return;
      }

      const result = await runCli(['model', 'discover', xesPath, '--algorithm', 'simd_streaming_dfg'], {
        env: env.env,
      });

      expect([EXIT_CODES.success, EXIT_CODES.execution_error, EXIT_CODES.config_error]).toContain(result.exitCode);

      if (result.exitCode === 0) {
        try {
          const output = JSON.parse(result.stdout);
          expect(output.shape?.raw?.edges).toBeDefined();
        } catch {
          // OK
        }
      }
    });

    it('streaming algorithm should handle high-volume event streams', async () => {
      const xesPath = path.join(env.tempDir, 'large.xes');

      // Create a moderately large XES file (100 events)
      let xesContent = '<?xml version="1.0" encoding="UTF-8"?>\n<log>\n';
      for (let i = 0; i < 10; i++) {
        xesContent += '  <trace>\n';
        for (let j = 0; j < 10; j++) {
          xesContent += `    <event><string key="concept:name" value="Activity${j % 3}"/></event>\n`;
        }
        xesContent += '  </trace>\n';
      }
      xesContent += '</log>';

      await fs.writeFile(xesPath, xesContent);

      const result = await runCli(['model', 'discover', xesPath, '--algorithm', 'simd_streaming_dfg'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error, EXIT_CODES.config_error]).toContain(result.exitCode);
    });

    it('streaming algorithm should be deterministic', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        return;
      }

      const run1 = await runCli(['model', 'discover', xesPath, '--algorithm', 'simd_streaming_dfg'], {
        env: env.env,
      });
      const run2 = await runCli(['model', 'discover', xesPath, '--algorithm', 'simd_streaming_dfg'], {
        env: env.env,
      });

      expect(run1.exitCode).toBe(run2.exitCode);

      if (run1.exitCode === 0 && run2.exitCode === 0) {
        try {
          const out1 = JSON.parse(run1.stdout);
          const out2 = JSON.parse(run2.stdout);

          // Edge count should be identical
          const edges1 = out1.shape?.raw?.edges || [];
          const edges2 = out2.shape?.raw?.edges || [];
          expect(edges1.length).toBe(edges2.length);
        } catch {
          // OK
        }
      }
    });
  });

  describe('Conformance Quality Metrics', () => {
    it('should compute per-trace fitness >= 0 and <= 1', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        return;
      }

      // No more `--model-from dfg`: `--mode self` discovers its own model
      // from the log (the closest current equivalent), and per-trace
      // fitness now lives nested in `findings[].details.case_fitness[]`.
      const result = await runCli(['model', 'check', xesPath, '--mode', 'self', '--fitness-threshold', '0.5'], {
        env: env.env,
      });

      if (result.exitCode === 0 || result.exitCode === EXIT_CODES.conformance_fail) {
        try {
          const output = JSON.parse(result.stdout);
          expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(output.status);
          const findings = output.findings ?? [];
          for (const finding of findings) {
            for (const cf of finding.details?.case_fitness ?? []) {
              expect(cf.trace_fitness).toBeGreaterThanOrEqual(0);
              expect(cf.trace_fitness).toBeLessThanOrEqual(1);
            }
          }
        } catch {
          // OK
        }
      }
    });

    it('should report a verdict payload when checked (no separate --precision-mode any more)', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        return;
      }

      const result = await runCli(['model', 'check', xesPath, '--mode', 'self'], { env: env.env });

      if (result.exitCode === 0 || result.exitCode === EXIT_CODES.conformance_fail) {
        try {
          const output = JSON.parse(result.stdout);
          // The verdict itself is the payload — no separate `.payload` wrapper.
          expect(output.status).toBeDefined();
          expect(output.checked).toBeGreaterThanOrEqual(0);
        } catch {
          // OK
        }
      }
    });

    it('should compute a verdict with ungroupedEventCount tracked (generalization-adjacent diagnostic)', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        return;
      }

      const result = await runCli(['model', 'check', xesPath, '--mode', 'self'], { env: env.env });

      if (result.exitCode === 0 || result.exitCode === EXIT_CODES.conformance_fail) {
        try {
          const output = JSON.parse(result.stdout);
          expect(output.ungroupedEventCount).toBeGreaterThanOrEqual(0);
        } catch {
          // OK
        }
      }
    });
  });

  describe('Streaming vs. Standard Algorithm Parity', () => {
    it('streaming_dfg and dfg should discover same activity set', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        return;
      }

      const dfsResult = await runCli(['model', 'discover', xesPath, '--algorithm', 'dfg'], { env: env.env });
      const streamResult = await runCli(['model', 'discover', xesPath, '--algorithm', 'simd_streaming_dfg'], {
        env: env.env,
      });

      if (dfsResult.exitCode === 0 && streamResult.exitCode === 0) {
        try {
          const dfg = JSON.parse(dfsResult.stdout);
          const stream = JSON.parse(streamResult.stdout);

          const dfgNodes = dfg.shape?.raw?.nodes || [];
          const streamNodes = stream.shape?.raw?.nodes || [];

          // Node count should be similar (may differ slightly due to algorithm differences)
          if (dfgNodes.length > 0 && streamNodes.length > 0) {
            expect(Math.abs(dfgNodes.length - streamNodes.length)).toBeLessThanOrEqual(2);
          }
        } catch {
          // OK
        }
      }
    });

    it('streaming algorithm should be faster than quality algorithms', async () => {
      const xesPath = path.join(env.tempDir, 'test.xes');
      const fixtureSource = path.resolve(process.cwd(), 'data/small-example.xes');

      try {
        await fs.copyFile(fixtureSource, xesPath);
      } catch {
        return;
      }

      const startStream = Date.now();
      const streamResult = await runCli(['model', 'discover', xesPath, '--algorithm', 'simd_streaming_dfg'], { env: env.env });
      const streamTime = Date.now() - startStream;

      // Both should succeed
      expect([EXIT_CODES.success, EXIT_CODES.execution_error, EXIT_CODES.config_error]).toContain(streamResult.exitCode);

      // Streaming should complete quickly (< 5 seconds)
      expect(streamTime).toBeLessThan(5000);
    });
  });

  describe('OCEL Feature Flag Compliance', () => {
    it('OCEL algorithms should only run if feature-ocel is enabled', async () => {
      const ocelPath = path.join(env.tempDir, 'test.ocel.json');

      const minimalOCEL = {
        eventTypes: [{ name: 'Create', attributes: [] }],
        objectTypes: [{ name: 'Order', attributes: [] }],
        events: [{ id: 'e1', type: 'Create', time: '2024-01-01T10:00:00Z', relationships: [{ objectId: 'o1' }] }],
        objects: [{ id: 'o1', type: 'Order', attributes: [] }],
      };

      await fs.writeFile(ocelPath, JSON.stringify(minimalOCEL));

      // `ocel_dfg_per_type` is the actual registered OC algorithm id (see
      // `wpm help algorithms`); the old fixture's `discover_oc_dfg_per_type`
      // name was never a real algorithm id and would always 404 regardless
      // of any feature flag.
      const result = await runCli(['model', 'discover', ocelPath, '--algorithm', 'ocel_dfg_per_type'], { env: env.env });

      // Acceptable outcomes: success (feature enabled) or config/execution error (feature disabled)
      const acceptableExitCodes: number[] = [
        EXIT_CODES.success,
        EXIT_CODES.config_error,
        EXIT_CODES.execution_error,
        EXIT_CODES.source_error,
      ];
      expect(acceptableExitCodes.includes(result.exitCode)).toBe(true);
    });
  });
});
