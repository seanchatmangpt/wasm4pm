/**
 * Petri-net replayer — thin wrapper over the existing token-based-replay,
 * alignment-fitness, and prefix-conformance WASM exports (reused, not
 * reimplemented; see `commands/conformance.ts`, `commands/oracle.ts`,
 * `commands/prefix-conformance.ts` for the call sites this was extracted
 * from).
 */
import type { Episode, EpisodeVerdict } from '../types.js';

export interface PetriWasmModule {
  from_pnml_wasm?(content: string): string;
  check_prefix_conformance(modelHandle: string, prefixJson: string): unknown;
  check_token_based_replay?(eventLogHandle: string, petriNetHandle: string, activityKey: string): unknown;
  alignment_fitness?(logHandle: string, petriNetHandle: string, configJson: string): unknown;
}

function asJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

/** Load a Petri net model from a PNML file's text content into a WASM handle. */
export function loadPetriNetFromPnml(wasm: PetriWasmModule, pnmlContent: string): string {
  if (!wasm.from_pnml_wasm) throw new Error('WASM build has no from_pnml_wasm export');
  const res = asJson(wasm.from_pnml_wasm(pnmlContent));
  const handle = res['handle'];
  if (typeof handle !== 'string') throw new Error('from_pnml_wasm did not return a handle');
  return handle;
}

/**
 * Prefix conformance for one episode against a Petri net (or DFG — the WASM
 * primitive is model-handle-agnostic; see `dfg.ts`). Mirrors the Allow/Deny
 * decision `oracle.ts`/`prefix-conformance.ts` already made, just reusable
 * per-episode rather than duplicated per call site.
 */
export function replayPrefix(wasm: PetriWasmModule, modelHandle: string, episode: Episode): EpisodeVerdict {
  const result = asJson(wasm.check_prefix_conformance(modelHandle, JSON.stringify(episode.activities)));
  const report = result['report'];
  const blocked = report === 'BLOCKED' || report === 'FAKE-LIVE';
  return {
    episodeId: episode.id,
    conforms: !blocked,
    reason: typeof result['andon_reason'] === 'string' ? (result['andon_reason'] as string) : undefined,
    details: result['details'] ?? result,
  };
}

/** Full-log token-based-replay fitness check, projected onto a per-episode verdict list. */
export function replayTokenBased(
  wasm: PetriWasmModule,
  eventLogHandle: string,
  petriNetHandle: string,
  activityKey: string,
  episodes: readonly Episode[],
  fitnessThreshold = 1.0
): EpisodeVerdict[] {
  if (!wasm.check_token_based_replay) throw new Error('WASM build has no check_token_based_replay export');
  const result = asJson(wasm.check_token_based_replay(eventLogHandle, petriNetHandle, activityKey));
  const fitness = typeof result['fitness'] === 'number' ? (result['fitness'] as number) : 0;
  const conforms = fitness >= fitnessThreshold;
  // Token-based replay is a whole-log metric; project the single verdict
  // across every episode so callers get one finding per episode either way.
  return episodes.map((ep) => ({
    episodeId: ep.id,
    conforms,
    reason: conforms ? undefined : `Token-based replay fitness ${fitness.toFixed(4)} < threshold ${fitnessThreshold}`,
    details: result,
  }));
}

export function replayAlignment(
  wasm: PetriWasmModule,
  logHandle: string,
  petriNetHandle: string,
  episodes: readonly Episode[],
  fitnessThreshold = 1.0,
  configJson = '{}'
): EpisodeVerdict[] {
  if (!wasm.alignment_fitness) throw new Error('WASM build has no alignment_fitness export');
  const result = asJson(wasm.alignment_fitness(logHandle, petriNetHandle, configJson));
  const fitness = typeof result['fitness'] === 'number' ? (result['fitness'] as number) : 0;
  const conforms = fitness >= fitnessThreshold;
  return episodes.map((ep) => ({
    episodeId: ep.id,
    conforms,
    reason: conforms ? undefined : `Alignment fitness ${fitness.toFixed(4)} < threshold ${fitnessThreshold}`,
    details: result,
  }));
}
