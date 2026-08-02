import { NounVerbError, type NounDefinition, type VerbContext } from '@wasm4pm/noun-verb';
import type { StepDispatcher } from '../../engines/orchestrator/types.js';

function argsToArgv(args: Readonly<Record<string, unknown>>): string[] {
  const argv: string[] = [];
  if (args.input !== undefined && args.input !== null) argv.push(String(args.input));
  for (const [key, value] of Object.entries(args)) {
    if (key === 'input' || value === undefined || value === null) continue;
    if (value === true) argv.push(`--${key}`);
    else if (value !== false) argv.push(`--${key}`, String(value));
  }
  return argv;
}

export function makeRegistryDispatcher(): StepDispatcher {
  return async (nounName, verbName, args) => {
    const { ALL_NOUNS } = (await import('../../cli.js')) as unknown as { ALL_NOUNS: readonly NounDefinition[] };
    const noun = ALL_NOUNS.find((candidate) => candidate.name === nounName);
    if (!noun) throw NounVerbError.commandNotFound(nounName, ALL_NOUNS.map((candidate) => candidate.name));
    const verb = noun.verbs.find((candidate) => candidate.verb === verbName);
    if (!verb) throw NounVerbError.verbNotFound(nounName, verbName, noun.verbs.map((candidate) => candidate.verb));
    const context: VerbContext = {
      noun: noun.name,
      verb: verb.verb,
      cwd: process.cwd(),
      env: process.env,
      rawArgs: argsToArgv(args),
    };
    return verb.handler(args as never, context);
  };
}
