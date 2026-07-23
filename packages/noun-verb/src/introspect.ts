/**
 * `--introspect` — emits Anthropic/OpenAI tool-schema-shaped JSON so an
 * agent can discover a verb's (or the whole registry's) calling
 * convention without parsing `--help` text.
 *
 * Two entry points, mirroring the two invocation shapes:
 *   - `wpm <noun> <verb> --introspect` -> `buildToolSchema()` for one verb
 *     (wired into `buildVerbCommand()` in cli.ts).
 *   - `wpm --introspect` (no noun given) -> `buildRegistrySchema()` for
 *     every verb in the registry (wired into `runCli()` in entry.ts, and
 *     into `buildCli()`'s root command for hosts that drive the returned
 *     `CommandDef` directly through citty's own `runMain`/`runCommand`).
 *
 * Schemas are generated purely from each verb's `TypedArgSpec` — never
 * from the framework-injected `--human`/`--introspect` flags, since those
 * are CLI plumbing, not part of the verb's actual contract.
 */

import type { ArgDef } from 'citty';
import type { NounDefinition, TypedArgSpec, VerbDefinition } from './types.js';
import { writeJson } from './output.js';

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Record<string, { type: string; description?: string; default?: unknown }>;
  readonly required: readonly string[];
}

/** Anthropic/OpenAI tool-use style schema for a single verb. */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly input_schema: ToolInputSchema;
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

/** Build the Anthropic/OpenAI-style tool schema for a single verb, from its `TypedArgSpec`. */
export function buildToolSchema(nounName: string, verb: VerbDefinition<any, any>): ToolSchema {
  const properties: ToolInputSchema['properties'] = {};
  const required: string[] = [];

  const args: TypedArgSpec = verb.args ?? {};
  for (const [name, argDef] of Object.entries(args)) {
    const property: { type: string; description?: string; default?: unknown } = {
      type: argJsonType(argDef),
    };
    if (argDef.description) {
      property.description = argDef.description;
    }
    if (argDef.default !== undefined) {
      property.default = argDef.default;
    }
    properties[name] = property;
    if (isRequiredArg(argDef)) {
      required.push(name);
    }
  }

  return {
    name: `${nounName}_${verb.verb}`,
    description: verb.stability === 'experimental' ? `[experimental] ${verb.summary}` : verb.summary,
    input_schema: { type: 'object', properties, required },
  };
}

/** Build tool schemas for every verb across every noun in the registry. */
export function buildRegistrySchema(nouns: readonly NounDefinition[]): { readonly tools: readonly ToolSchema[] } {
  const tools: ToolSchema[] = [];
  for (const noun of nouns) {
    for (const verb of noun.verbs) {
      tools.push(buildToolSchema(noun.name, verb));
    }
  }
  return { tools };
}

/**
 * If `rawArgs` is a bare `--introspect` invocation with no noun token
 * (i.e. `wpm --introspect`), write the whole-registry schema to stdout
 * and return `true`. Otherwise does nothing and returns `false`, leaving
 * dispatch to proceed normally (including per-verb `--introspect`, which
 * `buildVerbCommand()` handles once a noun/verb has actually matched).
 */
export function tryHandleRegistryIntrospect(
  rawArgs: readonly string[],
  nouns: readonly NounDefinition[]
): boolean {
  const hasNounToken = rawArgs.some((token) => !token.startsWith('-'));
  if (hasNounToken || !rawArgs.includes('--introspect')) {
    return false;
  }
  writeJson(buildRegistrySchema(nouns));
  process.exitCode = 0;
  return true;
}
