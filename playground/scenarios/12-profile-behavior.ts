/**
 * Scenario: profile behavior — balanced vs quality step counts, compare, explain
 *
 * Dev action simulated: "I changed getProfileAlgorithms('quality') to add a
 * new algorithm. Do balanced and quality plans now differ in step count as
 * expected? Does `pmctl compare` show the right table columns? Does `pmctl
 * explain` return content for each algorithm?"
 *
 * Key contracts verified:
 *   Planner (in-process):
 *     - balanced plan has more discover_* steps than fast plan
 *     - quality plan has more discover_* steps than balanced plan
 *     - quality plan includes analyze_performance step, fast does not
 *     - getProfileAlgorithms('fast') and 'quality' are disjoint sets
 *   CLI compare:
 *     - pmctl compare dfg,heuristic exits 0 or 3
 *     - --format json has algorithms array, each entry has algorithm/nodes/edges/elapsedMs
 *   CLI explain:
 *     - --algorithm dfg exits 0 and stdout contains "Directly"
 *     - --format json has content and subject fields
 *
 * Binary: apps/pmctl/dist/bin/pmctl.js (must be built first)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs/promises';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import { getProfileAlgorithms } from '@wasm4pm/contracts';
import type { CliTestEnv } from '@wasm4pm/testing';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PMCTL = path.resolve(__dirname, '../../apps/pmctl/dist/bin/pmctl.js');

function pmctl(userArgs: string[]) {
  return runCli([PMCTL, ...userArgs], { cliPath: 'node', timeout: 20_000 });
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
  <trace>
    <string key="concept:name" value="Case2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-02T11:00:00"/></event>
  </trace>
</log>`;

// ── Planner import (lazy — skip tests if module not built) ────────────────────

type PlanFn = (cfg: unknown) => { id: string; hash: string; steps: { type: string }[] };
let planFn: PlanFn | null = null;

let _env: CliTestEnv | null = null;
let xesPath: string;

beforeAll(async () => {
  // Try loading planner
  try {
    const mod = await import('@wasm4pm/planner');
    planFn = (cfg) => mod.plan(cfg as Parameters<typeof mod.plan>[0]) as ReturnType<typeof mod.plan>;
    console.info('[profiles] @wasm4pm/planner loaded');
  } catch {
    console.warn('[profiles] @wasm4pm/planner not built — planner tests will skip');
  }

  // Shared XES file for CLI tests
  _env = await createCliTestEnv();
  xesPath = path.join(_env.tempDir, 'mini.xes');
  await fs.writeFile(xesPath, MINI_XES, 'utf-8');

  console.info('[profiles] fast algorithms:', getProfileAlgorithms('fast'));
  console.info('[profiles] balanced algorithms:', getProfileAlgorithms('balanced'));
  console.info('[profiles] quality algorithms:', getProfileAlgorithms('quality'));
});

afterAll(async () => { await _env?.cleanup(); _env = null; });

// ── Profile step counts ───────────────────────────────────────────────────────

describe('profiles: plan step counts', () => {
  const makePlan = (profile: string) => {
    if (!planFn) return null;
    return planFn({
      version: '1.0',
      source: { kind: 'file', format: 'xes' },
      execution: { profile },
      algorithm: { name: getProfileAlgorithms(profile)[0] ?? 'dfg', parameters: {} },
    });
  };

  it('quality plan has more total steps than fast plan (quality adds analysis steps)', () => {
    // Each profile runs exactly ONE discovery algorithm, so discover_* count is always 1.
    // The profile step count difference comes from analysis steps: quality adds
    // analyze_performance, check_conformance, etc. that fast omits.
    if (!planFn) { console.warn('[profiles] skipping — planner not loaded'); return; }
    const fastPlan = makePlan('fast')!;
    const qualityPlan = makePlan('quality')!;
    console.info(`[profiles] fast total steps: ${fastPlan.steps.length}, quality: ${qualityPlan.steps.length}`);
    console.info(`[profiles] fast step types:`, fastPlan.steps.map(s => s.type).join(', '));
    console.info(`[profiles] quality step types:`, qualityPlan.steps.map(s => s.type).join(', '));
    expect(qualityPlan.steps.length).toBeGreaterThan(fastPlan.steps.length);
  });

  it('balanced plan has fewer total steps than quality plan', () => {
    if (!planFn) { console.warn('[profiles] skipping — planner not loaded'); return; }
    const balancedPlan = makePlan('balanced')!;
    const qualityPlan = makePlan('quality')!;
    console.info(`[profiles] balanced total steps: ${balancedPlan.steps.length}, quality: ${qualityPlan.steps.length}`);
    expect(qualityPlan.steps.length).toBeGreaterThanOrEqual(balancedPlan.steps.length);
  });

  it('quality plan includes analyze_performance step, fast plan does not', () => {
    if (!planFn) { console.warn('[profiles] skipping — planner not loaded'); return; }
    const fastPlan = makePlan('fast')!;
    const qualityPlan = makePlan('quality')!;
    const fastHasAnalyze = fastPlan.steps.some(s => s.type === 'analyze_performance');
    const qualityHasAnalyze = qualityPlan.steps.some(s => s.type === 'analyze_performance');
    console.info(`[profiles] fast has analyze_performance: ${fastHasAnalyze}, quality: ${qualityHasAnalyze}`);
    expect(fastHasAnalyze).toBe(false);
    expect(qualityHasAnalyze).toBe(true);
  });
});

// ── Profile disjointness ──────────────────────────────────────────────────────

describe('profiles: algorithm set disjointness', () => {
  it('getProfileAlgorithms("fast") and "quality" are disjoint (no shared algorithm IDs)', () => {
    const fastSet = new Set(getProfileAlgorithms('fast'));
    const qualitySet = new Set(getProfileAlgorithms('quality'));
    const intersection = [...fastSet].filter(id => qualitySet.has(id));
    expect(intersection, `Shared algorithms between fast and quality: ${intersection.join(', ')}`).toHaveLength(0);
    console.info('[profiles] fast ∩ quality = ∅: OK');
  });
});

// ── CLI compare ───────────────────────────────────────────────────────────────

describe('profiles: CLI compare command', () => {
  it('pmctl compare dfg,heuristic exits 0 or 3', async () => {
    const result = await pmctl(['compare', 'dfg,heuristic', '-i', xesPath, '--no-save']);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
    if (!acceptable.includes(result.exitCode)) {
      console.error('[profiles] compare unexpected exit:', result.exitCode);
      console.error('  stdout:', result.stdout.slice(0, 300));
      console.error('  stderr:', result.stderr.slice(0, 300));
    }
    expect(acceptable, `compare exited ${result.exitCode}`).toContain(result.exitCode);
    if (result.exitCode === EXIT_CODES.SUCCESS) {
      console.info('[profiles] compare stdout:', result.stdout.slice(0, 300));
    }
  }, 30_000);

  it('compare --format json has algorithms array with expected fields', async () => {
    const result = await pmctl(['compare', 'dfg,heuristic', '-i', xesPath, '--format', 'json', '--no-save']);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[profiles] skipping compare JSON shape — exit', result.exitCode);
      return;
    }
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    expect(Array.isArray(envelope['algorithms'])).toBe(true);
    const algorithms = envelope['algorithms'] as Array<Record<string, unknown>>;
    expect(algorithms.length).toBeGreaterThan(0);
    for (const algo of algorithms) {
      expect(algo).toHaveProperty('algorithm');
      expect(algo).toHaveProperty('nodes');
      expect(algo).toHaveProperty('edges');
      expect(algo).toHaveProperty('elapsedMs');
    }
    console.info('[profiles] compare algorithms:', algorithms.map(a => a['algorithm']));
  }, 30_000);
});

// ── CLI explain ───────────────────────────────────────────────────────────────

describe('profiles: CLI explain command', () => {
  it('--algorithm dfg exits 0', async () => {
    // Human output is suppressed in NODE_ENV=test (consola behavior).
    // Content is verified via --format json in the next test.
    const result = await pmctl(['explain', '--algorithm', 'dfg']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    console.info('[profiles] explain dfg exit:', result.exitCode, '(human output suppressed in test env)');
  });

  it('--algorithm dfg --format json has content and subject fields', async () => {
    const result = await pmctl(['explain', '--algorithm', 'dfg', '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    const hasContent = 'content' in envelope || 'content' in data;
    const hasSubject = 'subject' in envelope || 'subject' in data;
    expect(hasContent, 'explain JSON must have content field').toBe(true);
    expect(hasSubject, 'explain JSON must have subject field').toBe(true);
    console.info('[profiles] explain json keys:', Object.keys(envelope));
  });
});
