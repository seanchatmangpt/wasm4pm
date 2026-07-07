/**
 * Defect #1 regression: "`run -a <ocel_alg>` silently routes all 6 OCEL
 * algorithms to `ocel_dfg_per_type`."
 *
 * Executes the BUILT CLI (`wpm model discover`) for every algorithm id in
 * the live registry (`engines/algorithms.ts` — the same list `model
 * discover` resolves against) and asserts, for each one:
 *
 *   - exit 0 AND the JSON result's `algorithm` field equals the id we
 *     asked for (never a different, silently-substituted algorithm), OR
 *   - a non-zero exit (the algorithm legitimately can't run against this
 *     input shape — e.g. a conformance-metric id fed only a bare log) —
 *     but NEVER a "success" that ran the wrong algorithm.
 *
 * The registry list is imported directly from source (not re-derived by
 * hand) so this test can never drift from what `model discover` actually
 * resolves against.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { listAlgorithms } from '../../engines/algorithms.js';
import { runCli, tryParseJson, fixture, CLI_PATH } from './_helpers.js';

const SEPSIS_XES = fixture('examples/fixtures/sepsis.xes');
const OCEL_V2 = fixture('fixtures/world/ocel-v2.json');

interface DiscoverResult {
  algorithm?: string;
  requestedAlgorithm?: string;
  modelType?: string;
}

beforeAll(() => {
  expect(fs.existsSync(CLI_PATH), `Built CLI missing at ${CLI_PATH} — run "pnpm --filter @wasm4pm/cli build" first`).toBe(true);
  expect(fs.existsSync(SEPSIS_XES)).toBe(true);
  expect(fs.existsSync(OCEL_V2)).toBe(true);
});

/** Run a bounded number of async jobs concurrently (child processes are cheap; the WASM VM inside each is not). */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

describe('defect #1 regression — algorithm registry never silently substitutes', () => {
  const algorithms = listAlgorithms();

  it('the registry is non-empty and includes all 6 OCEL algorithms (the historical defect surface)', () => {
    expect(algorithms.length).toBeGreaterThanOrEqual(60);
    const ocelIds = algorithms.filter((a) => a.category === 'object-centric').map((a) => a.id);
    expect(new Set(ocelIds)).toEqual(
      new Set(['ocel_dfg', 'ocel_dfg_per_type', 'ocel_encode', 'ocel_oc_declare', 'ocel_ocla', 'ocel_petri_net'])
    );
  });

  it(
    'every one of the 6 OCEL algorithms resolves to itself (or a clean non-zero exit) — never silently to ocel_dfg_per_type',
    async () => {
      const ocelAlgorithms = algorithms.filter((a) => a.category === 'object-centric');
      const outcomes = await mapWithConcurrency(ocelAlgorithms, 6, async (algo) => {
        const r = await runCli(['model', 'discover', OCEL_V2, '-a', algo.id], { timeoutMs: 20_000 });
        return { algo: algo.id, r };
      });

      for (const { algo, r } of outcomes) {
        if (r.exitCode === 0) {
          const parsed = tryParseJson(r.stdout) as DiscoverResult | undefined;
          expect(parsed, `stdout must be JSON for '${algo}': ${r.stdout.slice(0, 300)}`).toBeDefined();
          expect(parsed?.algorithm, `algorithm '${algo}' silently substituted a different id`).toBe(algo);
          // The historical defect: everything routed to this one id regardless of request.
          if (algo !== 'ocel_dfg_per_type') {
            expect(parsed?.algorithm).not.toBe('ocel_dfg_per_type');
          }
        } else {
          // Non-zero exit is an acceptable outcome (format/WASM-export gap) —
          // the only forbidden outcome is a *successful* silent substitution.
          expect(r.exitCode).not.toBe(0);
        }
      }
    },
    120_000
  );

  it(
    'the 6 OCEL algorithms that DO succeed produce distinct algorithm ids from each other (not all collapsed to one)',
    async () => {
      const ocelAlgorithms = algorithms.filter((a) => a.category === 'object-centric');
      const outcomes = await mapWithConcurrency(ocelAlgorithms, 6, async (algo) => {
        const r = await runCli(['model', 'discover', OCEL_V2, '-a', algo.id], { timeoutMs: 20_000 });
        return { algo: algo.id, r };
      });
      const succeeded = outcomes.filter(({ r }) => r.exitCode === 0);
      // At least the two most basic OCEL discovery algorithms must be runnable
      // against a plain OCEL 2.0 log — if this drops to <=1, the "distinct
      // ids" assertion below is vacuous, so assert a floor.
      expect(succeeded.length).toBeGreaterThanOrEqual(2);
      const resultIds = succeeded.map(({ r }) => (tryParseJson(r.stdout) as DiscoverResult)?.algorithm);
      expect(new Set(resultIds).size, `expected distinct algorithm ids, got: ${JSON.stringify(resultIds)}`).toBe(resultIds.length);
    },
    120_000
  );

  it(
    'every algorithm id in the full registry either resolves to itself or exits non-zero — never a silent substitution',
    async () => {
      const outcomes = await mapWithConcurrency(algorithms, 8, async (algo) => {
        const fixturePath = algo.category === 'object-centric' ? OCEL_V2 : SEPSIS_XES;
        const r = await runCli(['model', 'discover', fixturePath, '-a', algo.id], { timeoutMs: 20_000 });
        return { algo: algo.id, r };
      });

      const violations: string[] = [];
      for (const { algo, r } of outcomes) {
        if (r.exitCode === 0) {
          const parsed = tryParseJson(r.stdout) as DiscoverResult | undefined;
          if (!parsed || parsed.algorithm !== algo) {
            violations.push(`'${algo}' succeeded but returned algorithm='${parsed?.algorithm}' (silent substitution)`);
          }
        }
        // Non-zero exit is always acceptable — that's "never silently substitutes", not "always succeeds".
      }
      expect(violations, violations.join('\n')).toEqual([]);
    },
    180_000
  );
});
