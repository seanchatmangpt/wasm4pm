/**
 * Hard-break table: every retired wpm v1 invocation mapped to its v2
 * noun/verb equivalent. `bin/wpm.ts` checks argv against this table BEFORE
 * dispatching to `buildCli()`; on a match it prints
 * `error: 'wpm <old>' was removed — use 'wpm <new>'` to stderr and exits 1.
 * Never surfaced in `--help` or generated docs — this is a migration aid,
 * not part of the CLI's public surface.
 *
 * Matching is longest-prefix-first: a 2-token entry (e.g. `oracle conform`)
 * is checked before falling back to a 1-token entry (`oracle`), so a noun
 * that survived the rebuild (e.g. `config`, `pipeline`, `lab`) is never
 * shadowed just because one of its OLD subcommands was retired — only the
 * specific old subcommand pairing is intercepted.
 *
 * Deliberately absent from this table (still valid, unchanged as a noun):
 * `config`, `pipeline`, `lab` bare tokens; only their genuinely-retired
 * subcommands (`config validate`, `pipeline create`, ...) get an entry.
 */

export interface RemovedEntry {
  readonly old: string;
  readonly replacement: string;
}

/** Two-token entries — checked first (more specific than a bare noun match). */
const TWO_TOKEN_ENTRIES: readonly RemovedEntry[] = [
  { old: 'oracle conform', replacement: 'model check --mode oracle' },
  { old: 'oracle attest', replacement: 'model check --mode oracle' },
  { old: 'config validate', replacement: 'config check' },
  { old: 'config verify', replacement: 'config check' },
  { old: 'config doctor', replacement: 'config check' },
  { old: 'truex verify', replacement: 'evidence verify' },
  { old: 'prolog8 replay', replacement: 'evidence replay' },
  { old: 'cognition receipt', replacement: 'evidence show' },
  { old: 'pipeline create', replacement: 'pipeline plan' },
  { old: 'pipeline list', replacement: 'pipeline plan' },
  { old: 'pipeline validate', replacement: 'pipeline plan' },
  { old: 'powl replay', replacement: 'model check --mode replay' },
  { old: 'powl construct', replacement: 'model discover' },
];

/** One-token entries — every wholly-retired top-level command from wpm v1. */
const ONE_TOKEN_ENTRIES: readonly RemovedEntry[] = [
  { old: 'run', replacement: 'model discover' },
  { old: 'analyze', replacement: 'pipeline run' },
  { old: 'suggest', replacement: 'pipeline suggest' },
  { old: 'autopilot', replacement: 'pipeline run --auto' },
  { old: 'compare', replacement: 'model compare' },
  { old: 'quality', replacement: 'log stats' },
  { old: 'conformance', replacement: 'model check --mode replay' },
  { old: 'predict', replacement: 'model predict' },
  { old: 'validate', replacement: 'log validate' },
  { old: 'diff', replacement: 'model diff' },
  { old: 'doctor', replacement: 'system doctor' },
  { old: 'init', replacement: 'config init' },
  { old: 'results', replacement: 'evidence report' },
  { old: 'repl', replacement: 'lab repl' },
  { old: 'explain', replacement: 'model explain' },
  { old: 'bench-data', replacement: 'log sample' },
  { old: 'data', replacement: 'log, system, or lab (data was a grouping alias, not a noun)' },
  { old: 'dev', replacement: 'lab or system (dev was a grouping alias, not a noun)' },
  { old: 'membrane', replacement: 'lab membrane' },
  { old: 'cell', replacement: 'lab cell' },
  { old: 'oracle', replacement: 'lab oracle' },
  { old: 'adversary', replacement: 'lab adversary' },
  { old: 'truex', replacement: 'lab truex' },
  { old: 'autoprocess', replacement: 'lab autoprocess' },
  { old: 'agent', replacement: 'lab agent' },
  { old: 'cache', replacement: 'system cache' },
  { old: 'models', replacement: 'system models' },
  { old: 'deduplicate', replacement: 'log dedupe' },
  { old: 'batch', replacement: 'pipeline run' },
  { old: 'supabase', replacement: 'lab supabase' },
  { old: 'wasm-server', replacement: 'lab wasm-server' },
  { old: 'trace', replacement: 'lab trace' },
  { old: 'prolog8', replacement: 'lab prolog8' },
  { old: 'claude', replacement: 'lab claude' },
  { old: 'proof', replacement: 'evidence report' },
  { old: 'benchmark', replacement: 'lab benchmark' },
  { old: 'timeout', replacement: 'lab timeout' },
  { old: 'feedback', replacement: 'lab feedback' },
  { old: 'completions', replacement: 'system completions' },
  { old: 'watch', replacement: 'pipeline watch' },
  { old: 'status', replacement: 'system status' },
  { old: 'drift-watch', replacement: 'model check --mode drift' },
  { old: 'ml', replacement: 'lab ml' },
  { old: 'powl', replacement: 'model discover' },
  { old: 'simulate', replacement: 'model simulate' },
  { old: 'temporal', replacement: 'lab temporal' },
  { old: 'social', replacement: 'lab social' },
  { old: 'verify', replacement: 'evidence verify' },
  { old: 'cognition', replacement: 'lab cognition' },
  { old: 'compile', replacement: 'pipeline plan' },
  { old: 'prefix-conformance', replacement: 'model check --mode prefix' },
  { old: 'algorithms', replacement: 'help algorithms' },
  { old: 'examples', replacement: 'help examples' },
  { old: 'interpret', replacement: 'model explain' },
  { old: 'exit-codes', replacement: 'help exit-codes' },
  { old: 'receipt', replacement: 'evidence show' },
  { old: 'workflow', replacement: 'pipeline plan' },
  { old: 'select-algorithm', replacement: 'model discover --auto-select' },
  { old: 'self-conformance', replacement: 'model check --mode self' },
  { old: 'query', replacement: 'log query' },
];

export const REMOVED_COMMANDS: readonly RemovedEntry[] = [...TWO_TOKEN_ENTRIES, ...ONE_TOKEN_ENTRIES];

/**
 * Look up `argv` (the raw CLI arguments, before any parsing) against the
 * hard-break table. Returns the matched entry (`old` is exactly the retired
 * invocation prefix that matched, 1 or 2 tokens), or `undefined` if `argv`
 * doesn't match a retired command.
 */
export function findRemovedEntry(argv: readonly string[]): RemovedEntry | undefined {
  const positional = argv.filter((a) => !a.startsWith('-'));
  if (positional.length >= 2) {
    const twoToken = `${positional[0]} ${positional[1]}`;
    const hit = TWO_TOKEN_ENTRIES.find((e) => e.old === twoToken);
    if (hit) return hit;
  }
  if (positional.length >= 1) {
    const hit = ONE_TOKEN_ENTRIES.find((e) => e.old === positional[0]);
    if (hit) return hit;
  }
  return undefined;
}

/** Back-compat convenience: just the replacement string, or `undefined`. */
export function findRemovedReplacement(argv: readonly string[]): string | undefined {
  return findRemovedEntry(argv)?.replacement;
}

/**
 * Check argv and, if it matches a retired command, print the standard
 * removal error to stderr and return the exit code to use (always 1).
 * Returns `undefined` (no-op) if argv does not match — the caller should
 * continue to normal dispatch in that case.
 */
export function checkRemoved(argv: readonly string[]): number | undefined {
  const entry = findRemovedEntry(argv);
  if (entry === undefined) return undefined;
  process.stderr.write(`error: 'wpm ${entry.old}' was removed — use 'wpm ${entry.replacement}'\n`);
  return 1;
}
