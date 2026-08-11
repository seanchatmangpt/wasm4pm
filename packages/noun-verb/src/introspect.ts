/**
 * `--introspect` emits machine-consumable tool schemas. The registry is
 * sufficient for an agent to discover commands without parsing help text.
 */

import type { ArgDef } from 'citty';
import { MACHINE_PROTOCOL } from './machine.js';
import type { NounDefinition, TypedArgSpec, VerbDefinition } from './types.js';
import { writeJson } from './output.js';

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Record<string, { type: string; description?: string; default?: unknown }>;
  readonly required: readonly string[];
}

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly input_schema: ToolInputSchema;
  readonly x_wasm4pm: {
    readonly protocol: typeof MACHINE_PROTOCOL;
    readonly noun: string;
    readonly verb: string;
    readonly stability: string;
    readonly machine_contract: VerbDefinition['machine'] | null;
  };
}

function argJsonType(argDef: ArgDef): string {
  switch (argDef.type) {
    case 'boolean':
      return 'boolean';
    case 'string':
    case 'positional':
    case undefined:
      return 'string';
    default:
      return 'string';
  }
}

function isRequiredArg(argDef: ArgDef): boolean {
  if (argDef.type === 'positional') {
    return argDef.default === undefined && argDef.required !== false;
  }
  return argDef.required === true;
}

export function buildToolSchema(nounName: string, verb: VerbDefinition<any, any>): ToolSchema {
  const properties: ToolInputSchema['properties'] = {};
  const required: string[] = [];

  const args: TypedArgSpec = verb.args ?? {};
  for (const [name, argDef] of Object.entries(args)) {
    const property: { type: string; description?: string; default?: unknown } = {
      type: argJsonType(argDef),
    };
    if (argDef.description) property.description = argDef.description;
    if (argDef.default !== undefined) property.default = argDef.default;
    properties[name] = property;
    if (isRequiredArg(argDef)) required.push(name);
  }

  return {
    name: `${nounName}_${verb.verb}`,
    description: verb.stability === 'experimental' ? `[experimental] ${verb.summary}` : verb.summary,
    input_schema: { type: 'object', properties, required },
    x_wasm4pm: {
      protocol: MACHINE_PROTOCOL,
      noun: nounName,
      verb: verb.verb,
      stability: verb.stability,
      machine_contract: verb.machine ?? null,
    },
  };
}

export function buildRegistrySchema(nouns: readonly NounDefinition[]): {
  readonly protocol: typeof MACHINE_PROTOCOL;
  readonly transport: {
    readonly invocation: string;
    readonly stdout: 'single-json-value';
    readonly stderr: 'diagnostic-only';
  };
  readonly tools: readonly ToolSchema[];
} {
  const tools: ToolSchema[] = [];
  for (const noun of nouns) {
    for (const verb of noun.verbs) tools.push(buildToolSchema(noun.name, verb));
  }
  return {
    protocol: MACHINE_PROTOCOL,
    transport: {
      invocation: `printf '%s' '<json>' | wpm --machine`,
      stdout: 'single-json-value',
      stderr: 'diagnostic-only',
    },
    tools,
  };
}

export function tryHandleRegistryIntrospect(
  rawArgs: readonly string[],
  nouns: readonly NounDefinition[]
): boolean {
  const hasNounToken = rawArgs.some((token) => !token.startsWith('-'));
  if (hasNounToken || !rawArgs.includes('--introspect')) return false;
  writeJson(buildRegistrySchema(nouns));
  process.exitCode = 0;
  return true;
}
