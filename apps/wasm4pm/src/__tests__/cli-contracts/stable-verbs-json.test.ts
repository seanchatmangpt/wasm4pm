/**
 * Defect #3 regression: "`--json` prints human text to stdout."
 *
 * The noun-verb framework's output layer (`packages/noun-verb/src/output.ts`)
 * makes this true by construction: every verb writes exactly one JSON value
 * to stdout by default (its plain result, or a structured error envelope),
 * even when required args are missing — citty's own requiredness check is
 * relaxed so the verb's handler (not citty's usage-text path) always gets
 * control and always produces the JSON envelope.
 *
 * This test EXECUTES the built CLI for every 'stable' verb in the live
 * registry (imported from `cli.ts`'s `ALL_NOUNS`, not hand-copied) with no
 * extra arguments, and asserts stdout parses as JSON. `wpm lab *` verbs are
 * explicitly `stability: 'experimental'` and out of scope for this check —
 * see `pipeline watch` (experimental) for a real example of a bridged
 * long-running command that does NOT hold this contract when it crashes
 * outside the framework's own try/catch (chokidar EMFILE) — noted in the
 * final verification report, not asserted here since watch is not stable.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { ALL_NOUNS } from '../../cli.js';
import { runCli, tryParseJson, CLI_PATH } from './_helpers.js';

beforeAll(() => {
  expect(fs.existsSync(CLI_PATH), `Built CLI missing at ${CLI_PATH} — run "pnpm --filter @wasm4pm/cli build" first`).toBe(true);
});

const stableVerbs = ALL_NOUNS.flatMap((noun) =>
  noun.verbs.filter((v) => v.stability === 'stable').map((v) => ({ noun: noun.name, verb: v.verb }))
);

describe('defect #3 regression — every stable verb prints exactly one JSON value to stdout', () => {
  it('the registry has the expected stable-verb count (sanity floor, catches accidental registry shrinkage)', () => {
    expect(stableVerbs.length).toBeGreaterThanOrEqual(35);
  });

  it.each(stableVerbs)('wpm $noun $verb — bare invocation, stdout JSON.parses', async ({ noun, verb }) => {
    const r = await runCli([noun, verb], { timeoutMs: 20_000 });
    const parsed = tryParseJson(r.stdout);
    expect(parsed, `wpm ${noun} ${verb}: stdout was not valid JSON.\nexit=${r.exitCode}\nstdout=${r.stdout.slice(0, 500)}\nstderr=${r.stderr.slice(0, 500)}`).toBeDefined();
  });
});
