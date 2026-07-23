/**
 * @wasm4pm/noun-verb — declarative noun-verb CLI framework on citty.
 *
 * TS port of ~/clap-noun-verb: nouns/verbs are declared with
 * `defineVerb`/`defineNoun`, folded into a citty command tree with
 * `buildCli`, JSON is the default stdout contract, and every failure
 * normalizes to a structured `{ error: { code, message, action_template } }`
 * envelope with a pluggable exit-code mapping.
 */

export type {
  TypedArgSpec,
  ParsedVerbArgs,
  VerbStability,
  VerbContext,
  HumanRenderer,
  VerbSpec,
  VerbDefinition,
  NounSpec,
  NounDefinition,
} from './types.js';

export { defineVerb } from './verb.js';
export { defineNoun } from './noun.js';

export {
  buildCli,
  type BuildCliOptions,
  type VerbResultInfo,
  type VerbErrorInfo,
} from './cli.js';

export { runCli, type RunCliIo } from './entry.js';

export {
  buildToolSchema,
  buildRegistrySchema,
  tryHandleRegistryIntrospect,
  type ToolSchema,
  type ToolInputSchema,
} from './introspect.js';

export { splitChainSegments, resolveChainRef, runChain, type ChainStepResult } from './chain.js';

export {
  STDIN_TOKEN,
  STDIN_PATH_PREFIX,
  needsStdin,
  substituteStdinToken,
  resolveStdinRefs,
  readProcessStdin,
} from './stdin.js';

export { getByPath, stringifyExtractedValue } from './path.js';

export {
  NounVerbError,
  ERROR_CODES,
  DEFAULT_ERROR_EXIT_CODES,
  resolveExitCode,
  type ErrorCode,
  type ErrorCodeMap,
  type ActionTemplate,
  type ErrorEnvelope,
} from './errors.js';

export { writeJson, writeHumanToStderr, defaultHumanFormat } from './output.js';
