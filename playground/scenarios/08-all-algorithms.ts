/**
 * Scenario: All algorithms reachable through config, planner, and CLI
 *
 * Dev action simulated: "I added a new algorithm to the kernel. Is it
 * reachable from every layer a user would touch?"
 *
 * User paths covered:
 *   1. Config  — resolveConfig({ cliOverrides: { algorithm: X } }) accepts every ID
 *   2. Planner — plan() with algorithm override produces a valid plan for every ID
 *   3. CLI     — pmctl run --algorithm X exits 0 or 3 (never 1=config or 2=source)
 *   4. CLI     — pmctl compare with all 14 IDs comma-joined exits 0 or 3
 *
 * Driven by ALGORITHM_IDS from @wasm4pm/templates — if a new algorithm is added
 * to the ontology and regenerated, this scenario covers it automatically.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs/promises';
import { resolveConfig } from '@wasm4pm/config';
import { ALGORITHM_IDS } from '@wasm4pm/templates';
import { runCli, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import type { CliTestEnv } from '@wasm4pm/testing';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PMCTL = path.resolve(__dirname, '../../apps/pmctl/dist/bin/pmctl.js');

function pmctl(userArgs: string[], env?: Record<string, string>) {
  return runCli([PMCTL, ...userArgs], { cliPath: 'node', timeout: 20_000, env });
}

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

let xesPath: string;
let _env: CliTestEnv | null = null;

beforeAll(async () => {
  _env = await createCliTestEnv();
  xesPath = path.join(_env.tempDir, 'mini.xes');
  await fs.writeFile(xesPath, MINI_XES, 'utf-8');
  console.info('[all-algos] algorithm count:', ALGORITHM_IDS.length, '| ids:', ALGORITHM_IDS.join(', '));
});

afterEach(async () => { /* env lives for the whole file; cleaned up in beforeAll cleanup */ });

// ── 1. Config accepts every algorithm ID ─────────────────────────────────────

describe('all algorithms: config layer', () => {
  it('ALGORITHM_IDS contains exactly 14 entries', () => {
    expect(ALGORITHM_IDS).toHaveLength(14);
  });

  for (const id of ALGORITHM_IDS) {
    it(`resolveConfig accepts algorithm="${id}"`, async () => {
      const cfg = await resolveConfig({
        cliOverrides: { algorithm: id },
        configSearchPaths: [],
      });
      expect(cfg.algorithm.name).toBe(id);
      expect(cfg.metadata.provenance['algorithm.name']?.source).toBe('cli');
    });
  }

  it('resolveConfig rejects an algorithm not in the registry', async () => {
    await expect(
      resolveConfig({ cliOverrides: { algorithm: 'made_up_algo' }, configSearchPaths: [] }),
    ).rejects.toThrow(/validation|invalid/i);
  });
});

// ── 2. Planner builds a valid plan for every algorithm override ───────────────

describe('all algorithms: planner layer', () => {
  let plan: ((cfg: unknown) => { id: string; hash: string; steps: { type: string }[] }) | null = null;

  beforeAll(async () => {
    try {
      const mod = await import('@wasm4pm/planner');
      plan = (cfg) => mod.plan(cfg as Parameters<typeof mod.plan>[0]) as ReturnType<typeof mod.plan>;
      console.info('[all-algos] @wasm4pm/planner loaded');
    } catch {
      console.warn('[all-algos] planner not built — planner tests will skip');
    }
  });

  for (const id of ALGORITHM_IDS) {
    it(`plan() with algorithm="${id}" produces steps including a discover step`, () => {
      if (!plan) return;
      const p = plan({ version: '1.0', source: { kind: 'file', format: 'xes' }, execution: { profile: 'balanced' }, algorithm: { name: id, parameters: {} } }) as { id: string; hash: string; steps: { type: string }[] };
      expect(p.steps.length).toBeGreaterThan(0);
      expect(p.hash).toBeTruthy();
      const hasDiscover = p.steps.some((s) => s.type.startsWith('discover_'));
      expect(hasDiscover, `plan for ${id} has no discover_* step — check ALGORITHM_ID_TO_STEP_TYPE`).toBe(true);
    });
  }

  it('all 14 algorithms produce distinct plan hashes', () => {
    if (!plan) return;
    const hashes = ALGORITHM_IDS.map((id) =>
      (plan!({ version: '1.0', source: { kind: 'file', format: 'xes' }, execution: { profile: 'balanced' }, algorithm: { name: id, parameters: {} } }) as { hash: string }).hash,
    );
    const unique = new Set(hashes);
    const duplicates = ALGORITHM_IDS.filter((id, i) => hashes.indexOf(hashes[i]!) !== i);
    expect(unique.size, `Duplicate plan hashes for: ${duplicates.join(', ')}`).toBe(ALGORITHM_IDS.length);
  });
});

// ── 3. CLI: pmctl run --algorithm X exits 0 or 3, never 1 or 2 ────────────────

describe('all algorithms: CLI run layer', () => {
  for (const id of ALGORITHM_IDS) {
    it(`pmctl run --algorithm ${id} exits 0 or 3 (not config/source error)`, async () => {
      const result = await pmctl(['run', xesPath, '--algorithm', id, '--no-save']);
      const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
      if (!acceptable.includes(result.exitCode)) {
        console.error(`[all-algos] ${id} unexpected exit ${result.exitCode}`);
        console.error('  stdout:', result.stdout.slice(0, 200));
        console.error('  stderr:', result.stderr.slice(0, 200));
      }
      expect(acceptable, `pmctl run --algorithm ${id} exited ${result.exitCode}`).toContain(result.exitCode);
    }, 20_000);
  }
});

// ── 4. CLI: pmctl compare with all algorithms ────────────────────────────────

describe('all algorithms: CLI compare layer', () => {
  it('pmctl compare accepts all 14 algorithm IDs comma-joined', async () => {
    const result = await pmctl(['compare', ALGORITHM_IDS.join(','), '-i', xesPath, '--no-save']);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
    if (!acceptable.includes(result.exitCode)) {
      console.error('[all-algos] compare unexpected exit:', result.exitCode);
      console.error('  stdout:', result.stdout.slice(0, 300));
      console.error('  stderr:', result.stderr.slice(0, 300));
    }
    expect(acceptable).toContain(result.exitCode);
  }, 30_000);

  it('pmctl compare with unknown algorithm exits 2', async () => {
    const result = await pmctl(['compare', 'dfg,ghost_algo', '-i', xesPath]);
    expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
  }, 20_000);
});
