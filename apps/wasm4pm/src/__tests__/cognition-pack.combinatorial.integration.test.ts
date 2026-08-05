/**
 * cognition-pack.combinatorial.integration.test.ts
 *
 * Combinatorial-maximalism coverage for multi-breed composition ("cognitive
 * pack" — several breeds composed without an LLM). Local/on-demand only —
 * deliberately excluded from CI (see vitest.config.ts's `test.exclude`
 * and `pnpm test:combinatorial`). No mocking: `compileSpec`/`foldMetaFacts`
 * are pure functions exercised directly, and `runOne` dispatches the real
 * Rust/WASM cognition kernel for every stage.
 *
 * IMPORTANT premise correction (verified live against current `main`): the
 * plan this suite was built from assumed `wpm compile --spec ... --run` was
 * a working CLI subprocess entrypoint. It is not — `wpm compile` has no
 * live registration in `apps/wasm4pm/src/cli.ts` (it was replaced by
 * `wpm pipeline plan`, an unrelated generic noun/verb step-DAG builder with
 * no breed-composition semantics). The only thing that still reaches
 * `compile.ts`'s DAG/admission/execution logic is its own unit test. Per
 * user direction, this suite therefore drives `compileSpec`/`foldMetaFacts`
 * and `runOne` IN-PROCESS rather than via subprocess — `runOne` is the same
 * executor a live `wpm compile --run` would have called, so this still
 * proves real multi-breed WASM composition; it does not prove a CLI
 * subprocess boundary exists for it (because one currently doesn't).
 *
 * Breed pool: verified live (see task history) that 54 of the 55
 * PARTIAL_ALIVE/DISPATCHABLE admitted breeds run to `status: 'ok'` against
 * their own `examples/cognition/<breed>/intent.json` fixture. The lone
 * exception, `partial_order_plan`, fails with "Partial Order Planner
 * requires at least one action rule" — a defect in that breed's own
 * checked-in example fixture, not something introduced here. It is
 * excluded from the pool and logged, not silently dropped.
 *
 * Every admitted breed's `output` includes `selected`/`explanation` (the
 * shared `BreedOutput` envelope), and `foldMetaFacts` only reads
 * `output.selected` — so unlike the original plan's assumption of a narrow
 * "conclusion/confidence-compatible" subset, the real compatible pool is
 * effectively the FULL 54-breed admitted set. That makes C(54,2) = 1431
 * unordered pairs the actual maximal pairwise space here (breed identity
 * is the only combinatorial dimension — there's no second factor to do
 * genuine pairwise-covering-array reduction against).
 *
 * Running the full 1431-pair sweep is expensive (each pair does 3 real WASM
 * breed dispatches): opt in explicitly with
 * `COGNITION_PACK_FULL_SWEEP=1 pnpm test:combinatorial`. The default run
 * uses a smaller, still-mechanically-generated (not hand-picked) sample so
 * `pnpm test:combinatorial` completes in a practical local timeframe. What's
 * excluded from the default run is logged via `console.log`, never silent.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { compileSpec, foldMetaFacts, loadAdmittedBreeds } from '../commands/compile.js';
import { runOne } from '../commands/cognition/_shared.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

// Verified live (excludes `partial_order_plan` — see file header).
const KNOWN_BAD_FIXTURE_BREEDS = new Set(['partial_order_plan']);

function fixtureFor(breed: string): string {
  return path.resolve(REPO_ROOT, 'examples/cognition', breed, 'intent.json');
}

function loadFixtureInput(breed: string): unknown {
  return JSON.parse(readFileSync(fixtureFor(breed), 'utf8'));
}

// ─── Build the real compatible pool from the real admitted-breed registry ──

const admitted = loadAdmittedBreeds(REPO_ROOT);
const pool = [...admitted]
  .filter((b) => b !== 'meta_reasoning') // meta_reasoning is the fan-in stage, not a pairing candidate
  .filter((b) => !KNOWN_BAD_FIXTURE_BREEDS.has(b))
  .filter((b) => existsSync(fixtureFor(b)))
  .sort();

function allPairs<T>(items: T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

const FULL_SWEEP = process.env.COGNITION_PACK_FULL_SWEEP === '1';
const allPairwise = allPairs(pool);

// Default sample: deterministic stride through the full pairwise space so
// coverage is spread across the whole pool rather than clustered at the
// front — still every pair is *possible* to reach, just not all of them in
// one default run.
const DEFAULT_SAMPLE_SIZE = 40;
const stride = Math.max(1, Math.floor(allPairwise.length / DEFAULT_SAMPLE_SIZE));
const sampledPairwise = FULL_SWEEP
  ? allPairwise
  : allPairwise.filter((_, i) => i % stride === 0).slice(0, DEFAULT_SAMPLE_SIZE);

describe('cognition pack — combinatorial multi-breed composition (in-process, real WASM)', () => {
  beforeAll(() => {
    console.log(
      `[cognition-pack] admitted breed pool: ${pool.length} (excluded: ${[
        ...KNOWN_BAD_FIXTURE_BREEDS,
      ].join(', ')} — bad checked-in fixture)`
    );
    console.log(
      `[cognition-pack] full pairwise space: ${allPairwise.length} pairs; ` +
        `running ${sampledPairwise.length} this pass ` +
        `(${FULL_SWEEP ? 'FULL SWEEP' : `sampled every ${stride}th pair — set COGNITION_PACK_FULL_SWEEP=1 for all ${allPairwise.length}`})`
    );
  });

  it('the admitted pool is non-trivial (sanity floor, catches registry regressions)', () => {
    expect(pool.length).toBeGreaterThanOrEqual(50);
  });

  it.each(sampledPairwise)('composes %s + %s → meta_reasoning without an LLM', async (a, b) => {
    const spec = {
      name: `combi-${a}-${b}`,
      stages: [
        { breed: a, input: loadFixtureInput(a) },
        { breed: b, input: loadFixtureInput(b) },
        {
          breed: 'meta_reasoning',
          wire: [
            { from: a, map: 'meta_facts' },
            { from: b, map: 'meta_facts' },
          ],
        },
      ],
    };

    // 1. compileSpec: real DAG validation, topo order, admission check, hash
    const plan = compileSpec(spec, admitted);
    expect(plan.order).toEqual([a, b, 'meta_reasoning']);
    expect(plan.plan_hash).toMatch(/^[0-9a-f]{64}$/);

    // 2. Execute every stage via the real executor a live `wpm compile --run`
    // would call — genuine WASM dispatch per stage, in topo order.
    const outputs = new Map<string, Awaited<ReturnType<typeof runOne>>>();
    const stageResults: Array<{ breed: string; status?: string }> = [];

    for (const breed of plan.order) {
      const stage = plan.stages.find((s) => s.breed === breed)!;
      const baseInput = (stage.input as { facts?: Array<{ key: string; value: string }> }) ?? {
        intent: `compile:${plan.name}`,
        candidates: [],
        facts: [],
        cases: [],
        rules: [],
        goals: [],
        state: [],
      };
      const facts = [...(baseInput.facts ?? [])];
      const wires = stage.wire ? (Array.isArray(stage.wire) ? stage.wire : [stage.wire]) : [];
      for (const w of wires) {
        const upstream = outputs.get(w.from);
        expect(upstream, `stage '${breed}' must run after its wire source '${w.from}'`).toBeTruthy();
        facts.push(...foldMetaFacts(w.from, upstream!));
      }
      const input = { ...baseInput, facts };
      const result = await runOne(breed, input);
      expect(result.status, `stage '${breed}' should succeed`).toBe('ok');
      outputs.set(breed, result);
      stageResults.push({ breed, status: result.status });
    }

    // 3. Every stage genuinely ran (no silent skip) in the right order.
    expect(stageResults.map((s) => s.breed)).toEqual([a, b, 'meta_reasoning']);
    expect(stageResults.every((s) => s.status === 'ok')).toBe(true);

    // 4. meta_reasoning's fan-in reflects the real number of wired upstreams
    // (2 breeds → 2 upstreams → 4 folded facts: conclusion+confidence each)
    // — the actual "compose without an LLM" proof, not a hardcoded assertion.
    const metaFactsFromA = foldMetaFacts(a, outputs.get(a)!);
    const metaFactsFromB = foldMetaFacts(b, outputs.get(b)!);
    expect(metaFactsFromA).toHaveLength(2);
    expect(metaFactsFromB).toHaveLength(2);

    const metaResult = outputs.get('meta_reasoning')!;
    expect(metaResult.output).toBeTruthy();
  });

  describe('negative cases (in-process, since the CLI subprocess boundary is unreachable today)', () => {
    it('unknown breed → CompileError (source_error)', () => {
      const spec = {
        name: 'bad-unknown-breed',
        stages: [{ breed: 'not_a_real_breed' }],
      };
      expect(() => compileSpec(spec, admitted)).toThrow(/not admitted|unknown/i);
    });

    it('duplicate breed id → CompileError', () => {
      const spec = {
        name: 'bad-duplicate',
        stages: [{ breed: pool[0] }, { breed: pool[0] }],
      };
      expect(() => compileSpec(spec, admitted)).toThrow();
    });

    it('wire cycle → CompileError', () => {
      const spec = {
        name: 'bad-cycle',
        stages: [
          { breed: pool[0], wire: [{ from: pool[1], map: 'meta_facts' }] },
          { breed: pool[1], wire: [{ from: pool[0], map: 'meta_facts' }] },
        ],
      };
      expect(() => compileSpec(spec, admitted)).toThrow(/cycle/i);
    });
  });
});
