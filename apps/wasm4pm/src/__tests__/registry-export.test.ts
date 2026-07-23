/**
 * registry-export.test.ts — CLI-level registry marketplace-compatibility tests
 *
 * Tests that the wasm4pm CLI exposes the algorithm registry data in a format
 * that external marketplace/catalog consumers can use, via two CLI commands:
 *
 *   R2 — wpm system status: algorithm registry section
 *        algorithmBreakdown shape + count invariants for monitoring integrations.
 *
 *   R3 — wpm model explain <algo>: per-algorithm marketplace fields
 *        quality_score, speed_score, output_type, deployment_profiles,
 *        quality_dimensions — the 5 fields an external system needs to route/price.
 *
 * MIGRATION NOTE: `status` -> `system status` and `explain` -> `model
 * explain` per nouns/_removed.ts. Both are bridged verbs (nouns/system/
 * status.ts, nouns/model/explain.ts) that return the full legacy
 * `{command, status, payload, meta}` envelope unchanged on success — only
 * the invocation prefix changes, not the payload shape. `--format json` is
 * dropped from invocations below: bridged verbs force `--format json`
 * internally regardless of what's passed (nouns/_bridge.ts), and passing it
 * again is harmless (stripped before forwarding) but redundant.
 *
 * Oracle ranks (Chicago TDD):
 *   Rank 1 — Mathematical invariant (holds for any correct implementation)
 *   Rank 2 — Domain contract (design-decided property documented in CLAUDE.md)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 *
 * Pure unit tests for the registry module (algorithmToJsonSchema, registryToJsonSchema,
 * AlgorithmMetadata field contracts) live in:
 *   packages/kernel/src/__tests__/registry-export-unit.test.ts
 *
 * These CLI tests use execFile against dist/bin/wpm.js — no module-level WASM
 * import, no vite WASM loading issue. Run `pnpm build` in apps/wasm4pm first.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

// ─── CLI helper (mirrors status-cli.test.ts pattern) ─────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], opts: { timeoutMs?: number } = {}): Promise<CliResult> {
  const cliPath = path.resolve(__dirname, '../../dist/bin/wpm.js');
  const cwd = path.resolve(__dirname, '../..');
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd, env },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function tryParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// R2 — wpm status --format json: algorithm registry section (Rank 2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('R2 — wpm status --format json: registry metadata in JSON payload (Rank 2)', () => {
  it('payload.engine.algorithmBreakdown section is present and an object', async () => {
    const r = await runCli(['system', 'status']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as
      | Record<string, unknown>
      | undefined;
    expect(engine).toHaveProperty('algorithmBreakdown');
    expect(typeof engine?.algorithmBreakdown).toBe('object');
    expect(engine?.algorithmBreakdown).not.toBeNull();
  }, 30_000);

  it('algorithmBreakdown has exactly 3 categories: discovery, ml, analytics', async () => {
    const r = await runCli(['system', 'status']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as
      | Record<string, unknown>
      | undefined;
    const breakdown = engine?.algorithmBreakdown as Record<string, unknown> | undefined;
    expect(breakdown).toHaveProperty('discovery');
    expect(breakdown).toHaveProperty('ml');
    expect(breakdown).toHaveProperty('analytics');
  }, 30_000);

  it('all breakdown values are non-negative integers', async () => {
    const r = await runCli(['system', 'status']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as
      | Record<string, unknown>
      | undefined;
    const breakdown = engine?.algorithmBreakdown as Record<string, unknown> | undefined;
    for (const key of ['discovery', 'ml', 'analytics'] as const) {
      const val = breakdown?.[key];
      expect(Number.isInteger(val), `breakdown.${key} is not an integer`).toBe(true);
      expect((val as number) >= 0, `breakdown.${key} is negative`).toBe(true);
    }
  }, 30_000);

  it('breakdown.discovery + breakdown.ml + breakdown.analytics = algorithmCount (Rank 1)', async () => {
    /**
     * The three breakdown categories must be exhaustive: their sum must equal
     * the total algorithmCount. If a new outputType is added without updating
     * the breakdown, this test will catch the discrepancy.
     */
    const r = await runCli(['system', 'status']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as
      | Record<string, unknown>
      | undefined;
    const breakdown = engine?.algorithmBreakdown as Record<string, unknown> | undefined;
    const algorithmCount = engine?.algorithmCount as number | undefined;
    const breakdownSum =
      (breakdown?.discovery as number) +
      (breakdown?.ml as number) +
      (breakdown?.analytics as number);
    expect(breakdownSum).toBe(algorithmCount);
  }, 30_000);

  it('breakdown.discovery >= 15 (at least the 15 registered discovery algorithms)', async () => {
    const r = await runCli(['system', 'status']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as
      | Record<string, unknown>
      | undefined;
    const breakdown = engine?.algorithmBreakdown as Record<string, unknown> | undefined;
    expect((breakdown?.discovery as number) >= 15).toBe(true);
  }, 30_000);

  it('payload.engine.deploymentProfile is one of the 5 canonical profiles', async () => {
    const r = await runCli(['system', 'status']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as
      | Record<string, unknown>
      | undefined;
    const profile = engine?.deploymentProfile as string | undefined;
    const validProfiles = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    expect(validProfiles).toContain(profile);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// R3 — wpm explain <algo> --format json: per-algorithm marketplace fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('R3 — wpm explain dfg --format json: 5 marketplace fields in payload (Rank 2)', () => {
  /**
   * These are the 5 fields an external marketplace needs to catalog an algorithm:
   *   quality_score      — numeric (0-100) for SLA tier selection
   *   speed_score        — numeric (0-100) for latency SLA
   *   output_type        — string: which downstream pipeline to route to
   *   deployment_profiles — string[]: where the algorithm can be deployed
   *   quality_dimensions  — object: Van der Aalst 4D breakdown for display
   *
   * The test uses 'dfg' because it is the canonical, always-registered algorithm.
   */

  it('exits 0 for wpm explain dfg --format json', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('stdout is valid JSON', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    expect(tryParseJson(r.stdout)).not.toBeNull();
  }, 30_000);

  it('payload has all 5 marketplace fields present (not missing keys)', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    for (const field of [
      'quality_score',
      'speed_score',
      'output_type',
      'deployment_profiles',
      'quality_dimensions',
    ]) {
      expect(payload, `field "${field}" missing from dfg explain payload`).toHaveProperty(field);
    }
  }, 30_000);

  it('payload.quality_score is a number when present (not undefined)', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (payload?.quality_score !== null) {
      expect(typeof payload?.quality_score).toBe('number');
    }
  }, 30_000);

  it('payload.speed_score is a number when present', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (payload?.speed_score !== null) {
      expect(typeof payload?.speed_score).toBe('number');
    }
  }, 30_000);

  it('payload.output_type is a non-empty string when present', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (payload?.output_type !== null) {
      expect(typeof payload?.output_type).toBe('string');
      expect((payload?.output_type as string).length).toBeGreaterThan(0);
    }
  }, 30_000);

  it('payload.deployment_profiles is an array when present', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (payload?.deployment_profiles !== null) {
      expect(Array.isArray(payload?.deployment_profiles)).toBe(true);
    }
  }, 30_000);

  it('payload.quality_dimensions is an object with 4 Van der Aalst keys when present', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (payload?.quality_dimensions !== null && payload?.quality_dimensions !== undefined) {
      const qd = payload.quality_dimensions as Record<string, unknown>;
      expect(qd).toHaveProperty('fitness');
      expect(qd).toHaveProperty('precision');
      expect(qd).toHaveProperty('generalization');
      expect(qd).toHaveProperty('simplicity');
    }
  }, 30_000);

  it('payload.subject is "dfg" (the queried algorithm)', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload?.subject).toBe('dfg');
  }, 30_000);

  it('payload.level is "detailed" by default', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload?.level).toBe('detailed');
  }, 30_000);

  it('payload.content is a non-empty string (the explanation text)', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(typeof payload?.content).toBe('string');
    expect((payload?.content as string).length).toBeGreaterThan(10);
  }, 30_000);
});

describe('R3 — wpm explain ilp --format json: high-quality algorithm format stability (Rank 3)', () => {
  /**
   * Metamorphic test: ILP is the highest-quality, slowest algorithm.
   * If dfg and ilp both expose the same JSON shape, the format is stable
   * across the quality spectrum — a Rank 3 (metamorphic) guarantee.
   */

  it('exits 0 for wpm explain ilp --format json', async () => {
    const r = await runCli(['model', 'explain', 'ilp']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('payload.subject is "ilp"', async () => {
    const r = await runCli(['model', 'explain', 'ilp']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload?.subject).toBe('ilp');
  }, 30_000);

  it('payload has the same 5 marketplace fields as dfg (format stability across algorithms)', async () => {
    const r = await runCli(['model', 'explain', 'ilp']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    for (const field of [
      'quality_score',
      'speed_score',
      'output_type',
      'deployment_profiles',
      'quality_dimensions',
    ]) {
      expect(payload, `field "${field}" missing from ilp explain payload`).toHaveProperty(field);
    }
  }, 30_000);
});

describe('R3 — wpm explain: unknown algorithm returns exit 0 with null scores (Rank 2)', () => {
  /**
   * An unrecognised algorithm name still exits 0 — the explain command falls through
   * to content generation which returns a generic explanation.
   * Marketplace-critical fields default to null rather than crashing.
   * This ensures the CLI does not blow up when a consumer queries an unknown algorithm.
   */

  it('exits 0 for wpm explain unknown_algo_xyz --format json', async () => {
    const r = await runCli(['model', 'explain', 'unknown_algo_xyz']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('quality_score is null for an unknown algorithm (no registry entry, no fabricated number)', async () => {
    const r = await runCli(['model', 'explain', 'unknown_algo_xyz']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (parsed !== null) {
      expect(payload?.quality_score).toBeNull();
    }
  }, 30_000);

  it('deployment_profiles is null for an unknown algorithm', async () => {
    const r = await runCli(['model', 'explain', 'unknown_algo_xyz']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    if (parsed !== null) {
      expect(payload?.deployment_profiles).toBeNull();
    }
  }, 30_000);
});
