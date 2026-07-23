/**
 * Algorithm registry engine — declarative `{id, formats, modelType, wasmExport}`
 * lookup used by `wpm model discover`.
 *
 * This is the fix for defect #1 ("`run -a <ocel_alg>` silently routes all 6
 * OCEL algorithms to `ocel_dfg_per_type`"): `resolveAlgorithm()` validates the
 * requested id/alias against the format the input log actually is, and
 * `discover()` dispatches through `Kernel.runRaw()` — which already contains a
 * correct per-algorithm switch for every OCEL id (see
 * `packages/kernel/src/api.ts`) — instead of the hand-rolled bypass that used
 * to live in `commands/run.ts`'s `runOcelDiscovery()`. There is no fallback
 * branch here: an unresolvable or format-incompatible id throws, it never
 * silently substitutes a different algorithm.
 *
 * Reuses (does not reimplement) existing WASM bindings and metadata:
 *  - `@wasm4pm/contracts`: `WASM_FUNCTION_NAMES`, `findClosestMatch`
 *  - `wasm4pm` (packages/kernel): `getRegistry()` for `outputType`/tier metadata, `Kernel` for dispatch
 *
 * IMPORTANT: `@wasm4pm/contracts` re-exports TWO different, out-of-sync
 * `ALGORITHM_IDS`/`resolveAlgorithmId` pairs — the public one (from
 * `src/templates/algorithm-registry.ts`, wired up in the package's
 * `index.ts`) does NOT include any `ocel_*` id, while `WASM_FUNCTION_NAMES`
 * (from `src/algorithm-registry.ts`) does. Importing `ALGORITHM_IDS`
 * "from @wasm4pm/contracts" silently gets the incomplete one, which made
 * `resolveAlgorithm('ocel_dfg')` throw `UnknownAlgorithmError` — caught by
 * this engine's own smoke test, not by a type error, since both exports are
 * plausibly-typed string arrays. This engine therefore derives its id
 * universe from `Object.keys(WASM_FUNCTION_NAMES)` (confirmed complete) and
 * does its own resolution, rather than trusting the package's
 * `ALGORITHM_IDS`/`resolveAlgorithmId` re-export's DEFAULT id list. The
 * `resolveAlgorithmId()` FUNCTION itself (and its `ALGORITHM_CLI_ALIASES`
 * table — short CLI aliases like "inductive" -> "inductive_miner",
 * "heuristic" -> "heuristic_miner") is still reused below, just called with
 * this engine's own complete `ALL_ALGORITHM_IDS` instead of the package's
 * incomplete default.
 */
import { WASM_FUNCTION_NAMES, findClosestMatch, resolveAlgorithmId } from '@wasm4pm/contracts';
import { getRegistry } from 'wasm4pm';
import type { LogFormat } from './conformance/readers/detect.js';
import { runDiscovery } from '../commands/run.js';

/** Every algorithm id with a known WASM export — the authoritative id universe for this engine. */
const ALL_ALGORITHM_IDS: readonly string[] = Object.keys(WASM_FUNCTION_NAMES);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[-+]/g, '_');
}

/**
 * Resolve `input` against `ALL_ALGORITHM_IDS`: exact match, then a known CLI
 * alias (e.g. "inductive" -> "inductive_miner", via the shared
 * `ALGORITHM_CLI_ALIASES` table), then a `-`/`_`-insensitive normalized match.
 */
function resolveId(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (ALL_ALGORITHM_IDS.includes(trimmed)) return trimmed;
  const aliased = resolveAlgorithmId(trimmed, ALL_ALGORITHM_IDS);
  if (aliased) return aliased;
  const normalized = normalizeToken(trimmed);
  return ALL_ALGORITHM_IDS.find((id) => normalizeToken(id) === normalized);
}

/** Formats a discovery algorithm can be fed. OCEL ids (prefixed `ocel_`) take object-centric logs only. */
export type AlgorithmFormat = LogFormat;

export interface AlgorithmDescriptor {
  readonly id: string;
  readonly formats: readonly AlgorithmFormat[];
  readonly modelType: string;
  readonly wasmExport: string;
  readonly category: 'event-log' | 'object-centric';
}

const OCEL_FORMATS: readonly AlgorithmFormat[] = ['ocel-v1', 'ocel-v2', 'ocel-ndjson'];
const EVENT_LOG_FORMATS: readonly AlgorithmFormat[] = ['xes', 'csv'];

export class UnknownAlgorithmError extends Error {
  constructor(
    public readonly input: string,
    public readonly suggestion?: string
  ) {
    super(
      `Unknown algorithm '${input}'.` + (suggestion ? ` Did you mean '${suggestion}'?` : ' Run "wpm help algorithms" for the full list.')
    );
    this.name = 'UnknownAlgorithmError';
  }
}

export class IncompatibleFormatError extends Error {
  constructor(
    public readonly algorithmId: string,
    public readonly detectedFormat: AlgorithmFormat,
    public readonly acceptedFormats: readonly AlgorithmFormat[]
  ) {
    super(
      `Algorithm '${algorithmId}' does not accept '${detectedFormat}' input ` +
        `(accepts: ${acceptedFormats.join(', ')}). ` +
        (acceptedFormats === OCEL_FORMATS || acceptedFormats.includes('ocel-v2')
          ? 'This is an object-centric algorithm — pass an OCEL 2.0 log.'
          : 'This is an event-log algorithm — pass an XES or CSV log.')
    );
    this.name = 'IncompatibleFormatError';
  }
}

function descriptorFor(id: string): AlgorithmDescriptor {
  const wasmExport = (WASM_FUNCTION_NAMES as Record<string, string | undefined>)[id];
  if (!wasmExport) {
    // Should be unreachable if `id` came from resolveAlgorithmId/ALGORITHM_IDS,
    // but never silently degrade — an algorithm with no known WASM export is
    // exactly the class of bug this engine exists to prevent.
    throw new UnknownAlgorithmError(id);
  }
  const isOcel = id.startsWith('ocel_');
  const metadata = getRegistry().get(id);
  return {
    id,
    formats: isOcel ? OCEL_FORMATS : EVENT_LOG_FORMATS,
    modelType: metadata?.outputType ?? 'unknown',
    wasmExport,
    category: isOcel ? 'object-centric' : 'event-log',
  };
}

/** List every algorithm the registry knows about, in declarative descriptor form. */
export function listAlgorithms(): AlgorithmDescriptor[] {
  return ALL_ALGORITHM_IDS.map((id) => descriptorFor(id));
}

/**
 * Resolve a user-provided algorithm name/alias to its canonical descriptor.
 * Throws `UnknownAlgorithmError` — never falls back to a default algorithm.
 */
export function resolveAlgorithm(input: string): AlgorithmDescriptor {
  const id = resolveId(input);
  if (!id) {
    const suggestion = findClosestMatch(input, ALL_ALGORITHM_IDS as string[]) ?? undefined;
    throw new UnknownAlgorithmError(input, suggestion);
  }
  return descriptorFor(id);
}

/** Throws `IncompatibleFormatError` if `descriptor` cannot accept `format`. Never silently substitutes. */
export function assertFormatCompatible(descriptor: AlgorithmDescriptor, format: AlgorithmFormat): void {
  if (!descriptor.formats.includes(format)) {
    throw new IncompatibleFormatError(descriptor.id, format, descriptor.formats);
  }
}

/**
 * Run a resolved, format-checked algorithm against an already-loaded WASM
 * handle (event log or OCEL — both flow through `Kernel.runRaw` inside
 * `runDiscovery()`, which is what actually fixes defect #1: every `ocel_*`
 * id has its own correctly-wired case there, e.g. `ocel_petri_net` calls
 * `discover_oc_petri_net`, not a hardcoded `ocel_dfg_per_type`). Reuses
 * `commands/run.ts`'s `runDiscovery()` — the same Kernel-backed dispatch
 * the (non-OCEL) discovery path already used correctly — rather than
 * re-deriving it, so both this engine and any remaining direct callers of
 * `runDiscovery()` share one implementation.
 */
export async function discover(
  wasm: Record<string, unknown>,
  descriptor: AlgorithmDescriptor,
  logHandle: string,
  activityKey: string,
  params: Record<string, unknown> = {}
): Promise<{ raw: unknown; elapsedMs: number }> {
  return runDiscovery(wasm, descriptor.id, logHandle, activityKey, params);
}
