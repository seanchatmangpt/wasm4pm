/**
 * wpm help examples — a generated (data-table-driven, not prose-authored)
 * catalog of one example invocation per noun/verb. Replaces `wpm examples`.
 *
 * Scope note: this is generated from a static table mirroring the
 * noun/verb tree, not by reflecting the live registry at runtime — doing
 * the latter would need every noun module importable from `help`, which
 * risks a module-cycle with `lab` (whose verbs are themselves large
 * command groups). See the migration report.
 */
import { defineVerb } from '@wasm4pm/noun-verb';

interface ExampleEntry {
  noun: string;
  verb: string;
  example: string;
}

const EXAMPLES: readonly ExampleEntry[] = [
  { noun: 'log', verb: 'validate', example: 'wpm log validate event-log.xes' },
  { noun: 'log', verb: 'stats', example: 'wpm log stats event-log.xes' },
  { noun: 'log', verb: 'dedupe', example: 'wpm log dedupe scan ./logs' },
  { noun: 'log', verb: 'query', example: 'wpm log query --ocel world.ocel.json --query query.json' },
  { noun: 'log', verb: 'convert', example: 'wpm log convert v1-log.json -o v2-log.json' },
  { noun: 'log', verb: 'sample', example: 'wpm log sample event-log.xes --count 5' },
  { noun: 'model', verb: 'discover', example: 'wpm model discover event-log.xes --algorithm heuristic_miner' },
  { noun: 'model', verb: 'check', example: 'wpm model check event-log.xes --model net.pnml --mode replay' },
  { noun: 'model', verb: 'compare', example: 'wpm model compare dfg,heuristic_miner -i event-log.xes' },
  { noun: 'model', verb: 'diff', example: 'wpm model diff log1.xes log2.xes' },
  { noun: 'model', verb: 'explain', example: 'wpm model explain heuristic_miner' },
  { noun: 'model', verb: 'simulate', example: 'wpm model simulate -i event-log.xes' },
  { noun: 'model', verb: 'predict', example: 'wpm model predict next-activity -i event-log.xes --prefix "Submit,Approve"' },
  { noun: 'pipeline', verb: 'plan', example: 'wpm pipeline plan --preset full --input event-log.xes' },
  { noun: 'pipeline', verb: 'run', example: 'wpm pipeline run full -i event-log.xes' },
  { noun: 'pipeline', verb: 'suggest', example: 'wpm pipeline suggest event-log.xes --goal quality' },
  { noun: 'pipeline', verb: 'watch', example: 'wpm pipeline watch event-log.xes' },
  { noun: 'pipeline', verb: 'resume', example: 'wpm pipeline resume' },
  { noun: 'evidence', verb: 'show', example: 'wpm evidence show <run-id>' },
  { noun: 'evidence', verb: 'verify', example: 'wpm evidence verify .wasm4pm/receipts/latest.json' },
  { noun: 'evidence', verb: 'chain', example: 'wpm evidence chain' },
  { noun: 'evidence', verb: 'keygen', example: 'wpm evidence keygen' },
  { noun: 'evidence', verb: 'report', example: 'wpm evidence report --last' },
  { noun: 'evidence', verb: 'replay', example: 'wpm evidence replay -i receipt.json' },
  { noun: 'config', verb: 'show', example: 'wpm config show --source' },
  { noun: 'config', verb: 'get', example: 'wpm config get algorithm.name' },
  { noun: 'config', verb: 'set', example: 'wpm config set algorithm.name dfg' },
  { noun: 'config', verb: 'reset', example: 'wpm config reset' },
  { noun: 'config', verb: 'env', example: 'wpm config env' },
  { noun: 'config', verb: 'export', example: 'wpm config export --format json' },
  { noun: 'config', verb: 'diff', example: 'wpm config diff --env production' },
  { noun: 'config', verb: 'check', example: 'wpm config check' },
  { noun: 'config', verb: 'init', example: 'wpm config init' },
  { noun: 'system', verb: 'doctor', example: 'wpm system doctor' },
  { noun: 'system', verb: 'status', example: 'wpm system status' },
  { noun: 'system', verb: 'cache', example: 'wpm system cache stats' },
  { noun: 'system', verb: 'models', example: 'wpm system models list' },
  { noun: 'system', verb: 'completions', example: 'wpm system completions zsh' },
  { noun: 'lab', verb: 'membrane', example: 'wpm lab membrane show' },
  { noun: 'lab', verb: 'oracle', example: 'wpm lab oracle conform log.ndjson --model v1' },
  { noun: 'help', verb: 'algorithms', example: 'wpm help algorithms' },
  { noun: 'help', verb: 'examples', example: 'wpm help examples' },
  { noun: 'help', verb: 'exit-codes', example: 'wpm help exit-codes' },
];

export const examplesVerb = defineVerb({
  noun: 'help',
  verb: 'examples',
  summary: 'Browse one example invocation per noun/verb (was: wpm examples)',
  args: {
    noun: { type: 'string', description: 'Filter to a single noun (e.g. model, log, pipeline)' },
  } as const,
  handler: async (args) => {
    const filterNoun = args.noun as string | undefined;
    const examples = filterNoun ? EXAMPLES.filter((e) => e.noun === filterNoun) : EXAMPLES;
    return { count: examples.length, examples };
  },
});
