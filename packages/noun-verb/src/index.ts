/**
 * @wasm4pm/noun-verb — declarative noun-verb CLI framework on citty.
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
  readBoundedStdin,
  readProcessStdin,
  stdinReadLimitsFromEnv,
  type StdinReadLimits,
} from './stdin.js';

export {
  DEFAULT_STDIN_MAX_BYTES,
  DEFAULT_STDIN_TIMEOUT_MS,
  DEFAULT_OUTPUT_MAX_BYTES,
  boundedIntegerFromEnv,
} from './limits.js';

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

export {
  writeJson,
  serializeJson,
  outputMaxBytesFromEnv,
  writeHumanToStderr,
  defaultHumanFormat,
} from './output.js';
