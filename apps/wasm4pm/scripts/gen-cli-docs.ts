#!/usr/bin/env npx tsx
/**
 * Generates `docs/reference/cli_commands.md` from the live noun/verb
 * registry (`apps/wasm4pm/src/cli.ts`'s `ALL_NOUNS`) — the same data
 * `buildCli()` folds into the actual citty dispatch tree. This is the
 * fix for "taxonomy drift": the registry, the citty tree, and the docs
 * can never disagree, because the docs are rendered from the registry
 * itself rather than hand-maintained.
 *
 * Usage:
 *   pnpm --filter @wasm4pm/cli run gen:docs           # regenerate the file
 *   pnpm --filter @wasm4pm/cli run gen:docs -- --check  # CI drift check (no write)
 *
 * `--check` renders the doc in memory and compares it against what's on
 * disk; exits 1 (and prints a diff-ish notice) if they differ, without
 * writing anything. Used in CI to catch a registry change that wasn't
 * followed by a `gen:docs` re-run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArgDef } from 'citty';
import type { NounDefinition, VerbDefinition } from '@wasm4pm/noun-verb';
import { ALL_NOUNS } from '../src/cli.js';
import { REMOVED_COMMANDS } from '../src/nouns/_removed.js';
import pkg from '../package.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUT_PATH = path.join(REPO_ROOT, 'docs/reference/cli_commands.md');

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function argTypeLabel(argDef: ArgDef): string {
  switch (argDef.type) {
    case 'positional':
      return 'positional';
    case 'boolean':
      return 'boolean';
    case 'string':
    case undefined:
      return 'string';
    default:
      // citty's `ArgDef.type` union ("boolean" | "string" | "positional" |
      // undefined) is exhaustively covered above, so this branch is
      // unreachable for the current type — but kept as a defensive fallback
      // in case a future citty version adds an arg type this file doesn't
      // know about yet. Widen through `unknown` rather than relying on the
      // (here provably `never`) narrowed type of `argDef`.
      return String((argDef as { type?: unknown }).type);
  }
}

function isRequiredArg(argDef: ArgDef): boolean {
  if (argDef.type === 'positional') {
    return argDef.default === undefined && argDef.required !== false;
  }
  return argDef.required === true;
}

/** One markdown row per declared arg (excludes the framework-injected --human/--introspect). */
function renderArgsTable(verb: VerbDefinition<any, any>): string {
  // `verb.args` is `TArgs | undefined` with `TArgs = any` here, and
  // `Object.entries(x ?? {})` on an `any`-typed `x` resolves through the
  // `entries(o: {}): [string, unknown][]` overload rather than an
  // `any`-typed result — annotate explicitly so downstream `argDef` accesses
  // stay `ArgDef`, not `unknown`.
  const entries = Object.entries(verb.args ?? {}) as [string, ArgDef][];
  if (entries.length === 0) {
    return '_No arguments._';
  }
  const lines = ['| Arg | Type | Required | Default | Description |', '|-----|------|:--------:|---------|-------------|'];
  for (const [name, argDef] of entries) {
    const flag = argDef.type === 'positional' ? `\`<${name}>\`` : `\`--${name}\`${(argDef as { alias?: string }).alias ? ` / \`-${(argDef as { alias?: string }).alias}\`` : ''}`;
    const required = isRequiredArg(argDef) ? 'yes' : 'no';
    const def = argDef.default !== undefined ? `\`${JSON.stringify(argDef.default)}\`` : '—';
    const desc = argDef.description ?? '—';
    lines.push(`| ${flag} | ${argTypeLabel(argDef)} | ${required} | ${def} | ${desc} |`);
  }
  return lines.join('\n');
}

function renderVerb(noun: NounDefinition, verb: VerbDefinition<any, any>): string {
  const badge = verb.stability === 'experimental' ? ' `[experimental]`' : '';
  return [
    `#### \`wpm ${noun.name} ${verb.verb}\`${badge}`,
    '',
    verb.summary,
    '',
    renderArgsTable(verb),
    '',
  ].join('\n');
}

function renderNoun(noun: NounDefinition): string {
  const verbList = noun.verbs.map((v) => `\`${v.verb}\``).join(', ');
  const parts = [
    `### \`wpm ${noun.name}\``,
    '',
    noun.description ?? '',
    '',
    `Verbs: ${verbList}`,
    '',
    ...noun.verbs.map((v) => renderVerb(noun, v)),
  ];
  return parts.join('\n');
}

function renderSummaryTable(nouns: readonly NounDefinition[]): string {
  const lines = ['| Noun | Verbs | Stability |', '|------|-------|-----------|'];
  for (const noun of nouns) {
    const stableVerbs = noun.verbs.filter((v) => v.stability === 'stable');
    const experimentalCount = noun.verbs.length - stableVerbs.length;
    const stability = experimentalCount === noun.verbs.length ? 'experimental' : experimentalCount > 0 ? 'mixed' : 'stable';
    const verbNames = noun.verbs.map((v) => v.verb).join(', ');
    lines.push(`| \`${noun.name}\` | ${verbNames} | ${stability} |`);
  }
  return lines.join('\n');
}

function renderRemovedTable(): string {
  const lines = ['| Old (wpm v1) | Replacement (wpm v2) |', '|--------------|------------------------|'];
  for (const entry of REMOVED_COMMANDS) {
    lines.push(`| \`wpm ${entry.old}\` | \`wpm ${entry.replacement}\` |`);
  }
  return lines.join('\n');
}

function countVerbs(nouns: readonly NounDefinition[]): { total: number; stable: number; experimental: number } {
  let total = 0;
  let stable = 0;
  let experimental = 0;
  for (const noun of nouns) {
    for (const verb of noun.verbs) {
      total += 1;
      if (verb.stability === 'experimental') experimental += 1;
      else stable += 1;
    }
  }
  return { total, stable, experimental };
}

// ---------------------------------------------------------------------------
// Top-level document
// ---------------------------------------------------------------------------

function renderDoc(nouns: readonly NounDefinition[]): string {
  const { total, stable, experimental } = countVerbs(nouns);
  const nounOrder = nouns.map((n) => n.name).join(', ');

  return `# Reference: CLI Commands

> **Generated from the live noun/verb registry.** Do not hand-edit — run
> \`pnpm --filter @wasm4pm/cli run gen:docs\` after changing anything under
> \`apps/wasm4pm/src/nouns/\`. CI checks this file for drift with
> \`pnpm --filter @wasm4pm/cli run gen:docs -- --check\`.
>
> Source of truth: \`apps/wasm4pm/src/cli.ts\` (\`ALL_NOUNS\`), the exact
> registry \`buildCli()\` dispatches from — this doc, \`--help\`, and
> \`--introspect\` can never drift from each other or from actual dispatch.
>
> Version: **v${pkg.version}** · **${total}** verbs across **${nouns.length}** nouns
> (${stable} stable, ${experimental} experimental under \`wpm lab\`).

## Noun tree

\`wpm <noun> <verb> [args]\` — nouns: ${nounOrder}.

${renderSummaryTable(nouns)}

## Output contract

Every verb prints **exactly one JSON value to stdout** by default — either
the verb's plain result, or a structured error envelope
\`{ error: { code, message, action_template } }\`. \`JSON.parse(stdout)\`
always succeeds, success or failure. Human-readable text (from \`--human\`,
or the \`[experimental]\` banner for \`wpm lab\` verbs) is written to
**stderr only**, never stdout.

\`\`\`bash
wpm model discover log.xes -a heuristic_miner   # JSON result on stdout
wpm model discover log.xes --human              # same stdout JSON, plus a
                                                 # human summary on stderr
\`\`\`

## Introspection

Every verb accepts \`--introspect\` to print its Anthropic/OpenAI tool-schema
JSON instead of running:

\`\`\`bash
wpm model discover --introspect       # schema for one verb
wpm --introspect                      # schema for the whole registry
\`\`\`

## Chaining (\`++\`) and stdin extraction (\`@-\`)

\`\`\`bash
# Run two verbs in one process; @{1.field} extracts from step 1's JSON result
wpm model discover log.xes ++ model check --mode replay --model @{1.handle}

# @- injects stdin; @-::json.path extracts a field from it
cat receipt.json | wpm evidence verify @-
echo '{"model":{"handle":"abc"}}' | wpm model check --model @-::model.handle
\`\`\`

## Removed commands (hard break)

wpm v1's flat ~44-command surface was retired in this release. Every
removed invocation exits \`1\` and names its replacement — see
\`apps/wasm4pm/src/nouns/_removed.ts\`:

${renderRemovedTable()}

## Exit codes

| Code | Meaning |
|-----:|---------|
| 0 | success |
| 1 | config_error |
| 2 | source_error |
| 3 | execution_error |
| 4 | partial_failure |
| 5 | system_error |
| 6 | conformance_fail |

Run \`wpm help exit-codes\` for the live, generated version of this table.

## Full noun/verb reference

${nouns.map(renderNoun).join('\n')}
`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const checkMode = process.argv.includes('--check');
  const rendered = renderDoc(ALL_NOUNS);

  if (checkMode) {
    const onDisk = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf-8') : undefined;
    if (onDisk === rendered) {
      console.log(`OK: ${path.relative(REPO_ROOT, OUT_PATH)} matches the registry (${ALL_NOUNS.length} nouns).`);
      return;
    }
    console.error(`DRIFT: ${path.relative(REPO_ROOT, OUT_PATH)} does not match the current noun/verb registry.`);
    if (onDisk === undefined) {
      console.error('  (file does not exist on disk)');
    } else {
      const onDiskLines = onDisk.split('\n');
      const renderedLines = rendered.split('\n');
      const max = Math.max(onDiskLines.length, renderedLines.length);
      let shown = 0;
      for (let i = 0; i < max && shown < 10; i++) {
        if (onDiskLines[i] !== renderedLines[i]) {
          console.error(`  line ${i + 1}:`);
          console.error(`    - ${onDiskLines[i] ?? '(missing)'}`);
          console.error(`    + ${renderedLines[i] ?? '(missing)'}`);
          shown += 1;
        }
      }
    }
    console.error('Run: pnpm --filter @wasm4pm/cli run gen:docs');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT_PATH, rendered);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)} (${ALL_NOUNS.length} nouns, ${countVerbs(ALL_NOUNS).total} verbs)`);
}

main();
