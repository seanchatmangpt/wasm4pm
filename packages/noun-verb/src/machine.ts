import { NounVerbError } from './errors.js';
import type { NounDefinition, TypedArgSpec } from './types.js';

export const MACHINE_PROTOCOL = 'wasm4pm.machine.v1' as const;

export interface MachineInvocation {
  readonly protocol: typeof MACHINE_PROTOCOL;
  readonly noun: string;
  readonly verb: string;
  readonly args?: Readonly<Record<string, string | number | boolean>>;
}

const ALLOWED_TOP_LEVEL = new Set(['protocol', 'noun', 'verb', 'args']);

type TypedArgEntry = [string, TypedArgSpec[string]];

function typedArgEntries(args: TypedArgSpec): TypedArgEntry[] {
  return Object.entries(args) as TypedArgEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, details?: Record<string, unknown>): never {
  throw NounVerbError.invalidInput(`MACHINE_INVOCATION_REFUSED: ${message}`, details);
}

function requiredArgNames(args: TypedArgSpec): string[] {
  return typedArgEntries(args)
    .filter(([, def]) =>
      def.type === 'positional'
        ? def.default === undefined && def.required !== false
        : def.required === true
    )
    .map(([name]) => name);
}

/**
 * Parse and strictly admit one machine invocation. The result is ordinary argv;
 * callers must dispatch it through the same noun/verb command tree as humans.
 */
export function machineInvocationToArgv(
  input: string | unknown,
  nouns: readonly NounDefinition[]
): string[] {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (error) {
      invalid('stdin is not valid JSON', { cause: (error as Error).message });
    }
  }

  if (!isRecord(value)) invalid('envelope must be a JSON object');
  for (const key of Object.keys(value)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) invalid(`unknown top-level field '${key}'`);
  }

  if (value.protocol !== MACHINE_PROTOCOL) {
    invalid(`protocol must equal '${MACHINE_PROTOCOL}'`, { observed: value.protocol });
  }
  if (typeof value.noun !== 'string' || value.noun.length === 0) invalid('noun must be a non-empty string');
  if (typeof value.verb !== 'string' || value.verb.length === 0) invalid('verb must be a non-empty string');

  const noun = nouns.find((candidate) => candidate.name === value.noun);
  if (!noun) throw NounVerbError.commandNotFound(value.noun, nouns.map((candidate) => candidate.name));
  const verb = noun.verbs.find((candidate) => candidate.verb === value.verb);
  if (!verb) {
    throw NounVerbError.verbNotFound(noun.name, value.verb, noun.verbs.map((candidate) => candidate.verb));
  }

  const rawArgs = value.args ?? {};
  if (!isRecord(rawArgs)) invalid('args must be a JSON object');
  const spec: TypedArgSpec = verb.args ?? {};
  for (const name of Object.keys(rawArgs)) {
    if (!Object.prototype.hasOwnProperty.call(spec, name)) {
      invalid(`unknown argument '${name}' for ${noun.name} ${verb.verb}`, {
        candidates: Object.keys(spec),
      });
    }
  }

  const missing = requiredArgNames(spec).filter(
    (name) => !Object.prototype.hasOwnProperty.call(rawArgs, name)
  );
  if (missing.length > 0) invalid(`missing required arguments: ${missing.join(', ')}`);

  const argv: string[] = [noun.name, verb.verb];
  for (const [name, def] of typedArgEntries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(rawArgs, name)) continue;
    const raw = rawArgs[name];
    if (!['string', 'number', 'boolean'].includes(typeof raw)) {
      invalid(`argument '${name}' must be a string, number, or boolean`);
    }

    if (def.type === 'positional') {
      argv.push(String(raw));
      continue;
    }

    if (def.type === 'boolean') {
      if (typeof raw !== 'boolean') invalid(`boolean argument '${name}' must be true or false`);
      if (raw) {
        argv.push(`--${name}`);
      } else if (def.default === true) {
        invalid(`boolean argument '${name}=false' is unsupported when the CLI default is true`);
      }
      continue;
    }

    argv.push(`--${name}`, String(raw));
  }

  return argv;
}
