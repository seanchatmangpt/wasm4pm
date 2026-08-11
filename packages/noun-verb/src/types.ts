import type { ArgsDef, ParsedArgs } from 'citty';

/**
 * Argument spec for a verb — reuses citty's `ArgsDef` shape directly
 * (boolean | string | enum | positional) so `buildCli()` can fold verbs
 * straight into a citty command tree with zero translation. Re-exported
 * under the framework's own name because callers of `@wasm4pm/noun-verb`
 * shouldn't need to know citty is the parser underneath.
 */
export type TypedArgSpec = ArgsDef;

/** Parsed argument bag for a given `TypedArgSpec`. */
export type ParsedVerbArgs<TArgs extends TypedArgSpec> = ParsedArgs<TArgs>;

/**
 * `stable` verbs are part of the CLI's public contract. `experimental`
 * verbs (the `wpm lab` namespace) print a `[experimental]` banner to
 * stderr on every invocation, automatically, before the handler runs.
 */
export type VerbStability = 'stable' | 'experimental';

/** Machine-visible authority classification. Only BRCE-governed verbs may claim DO. */
export type MachineAuthority = 'OBSERVE' | 'SELECT' | 'CONSTRUCT' | 'DO';

/** Coarse consequence classes used by machine planners before invocation. */
export type MachineEffect =
  | 'NONE'
  | 'STDOUT'
  | 'STDERR'
  | 'FILESYSTEM'
  | 'NETWORK'
  | 'PROCESS'
  | 'TELEMETRY';

export type MachineIdempotency = 'IDEMPOTENT' | 'CONDITIONAL' | 'NON_IDEMPOTENT' | 'UNKNOWN';
export type MachineDeterminism =
  | 'DETERMINISTIC'
  | 'INPUT_DETERMINISTIC'
  | 'ENVIRONMENT_DEPENDENT'
  | 'UNKNOWN';
export type MachineReceiptPolicy = 'REQUIRED' | 'OPTIONAL' | 'NONE';

/**
 * Optional execution contract exposed through `--introspect` for machine planners.
 * This is descriptive metadata, never ambient execution authority.
 */
export interface MachineContract {
  readonly authority: MachineAuthority;
  readonly effects: readonly MachineEffect[];
  readonly idempotency: MachineIdempotency;
  readonly determinism: MachineDeterminism;
  readonly receipts: MachineReceiptPolicy;
}

/** Reserved argument names the framework injects into every verb — user args may not use these. */
export const RESERVED_ARG_NAMES: readonly string[] = ['human', 'introspect'];

/** A verb-name-safe identifier: lowercase, starts with a letter, hyphen-separated. */
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function assertValidIdentifier(kind: 'noun' | 'verb', name: string): void {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(
      `Invalid ${kind} name '${name}': must be lowercase, start with a letter, and use hyphens to separate words (e.g. 'model', 'log-validate').`
    );
  }
}

/** Context passed to every verb handler alongside its parsed args. */
export interface VerbContext {
  /** The noun this invocation was dispatched under. */
  readonly noun: string;
  /** The verb that was invoked. */
  readonly verb: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Raw argv the citty command received (post noun/verb tokens). */
  readonly rawArgs: readonly string[];
}

/**
 * Optional human-readable renderer for a verb's result. Only ever
 * invoked when `--human` is passed, and its output is written to
 * STDERR (never stdout) — see src/output.ts for why.
 */
export type HumanRenderer<TResult> = (result: TResult, ctx: VerbContext) => string;

/**
 * Declarative spec for a single verb — the TS analog of `#[verb]`.
 * Handlers are THIN: pure business logic in, a plain serializable
 * result out. Handlers never print; the framework owns all I/O.
 */
export interface VerbSpec<TArgs extends TypedArgSpec = TypedArgSpec, TResult = unknown> {
  readonly noun: string;
  readonly verb: string;
  readonly summary: string;
  readonly args?: TArgs;
  /** Default: 'stable'. */
  readonly stability?: VerbStability;
  /** Optional machine-planning contract surfaced through introspection. */
  readonly machine?: MachineContract;
  readonly handler: (args: ParsedVerbArgs<TArgs>, ctx: VerbContext) => TResult | Promise<TResult>;
  /** Optional formatter used only for `--human` (stderr-only, see output.ts). */
  readonly human?: HumanRenderer<TResult>;
}

/** A validated, registrable verb. Produced only by `defineVerb()`. */
export interface VerbDefinition<TArgs extends TypedArgSpec = TypedArgSpec, TResult = unknown>
  extends VerbSpec<TArgs, TResult> {
  readonly __kind: 'verb';
  readonly stability: VerbStability;
}

/**
 * Declarative spec for a noun — the TS analog of the crate's
 * auto-discovered noun table. TS has no proc-macro auto-discovery, so
 * the convention is one registry file per noun directory
 * (`src/nouns/<noun>/index.ts`) that exports its verbs into this table.
 */
export interface NounSpec {
  readonly name: string;
  readonly description?: string;
  readonly verbs: readonly VerbDefinition<any, any>[];
}

/** A validated, registrable noun. Produced only by `defineNoun()`. */
export interface NounDefinition extends NounSpec {
  readonly __kind: 'noun';
}
