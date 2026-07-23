/**
 * POWL replayer — thin wrapper over the existing `token_replay_fitness` /
 * `footprints_conformance` WASM exports (`wasm4pm/src/powl_api.rs`). Unlike
 * the Petri/DFG replayers these take the POWL model and log as JSON strings
 * directly rather than pre-loaded handles.
 */
import type { Episode, EpisodeVerdict } from '../types.js';

export interface PowlWasmModule {
  token_replay_fitness(powlJson: string, logJson: string): unknown;
  footprints_conformance(powlJson: string, logJson: string): unknown;
}

function asJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

/** Whole-log token-replay fitness against a POWL model, projected per-episode. */
export function replayPowlTokenBased(
  wasm: PowlWasmModule,
  powlJson: string,
  episodes: readonly Episode[],
  fitnessThreshold = 1.0
): EpisodeVerdict[] {
  const logJson = JSON.stringify(episodes.map((e) => e.activities));
  const result = asJson(wasm.token_replay_fitness(powlJson, logJson));
  const fitness = typeof result['fitness'] === 'number' ? (result['fitness'] as number) : 0;
  const conforms = fitness >= fitnessThreshold;
  return episodes.map((ep) => ({
    episodeId: ep.id,
    conforms,
    reason: conforms ? undefined : `POWL token-replay fitness ${fitness.toFixed(4)} < threshold ${fitnessThreshold}`,
    details: result,
  }));
}

/** Footprint-matrix conformance against a POWL model, projected per-episode. */
export function replayPowlFootprints(
  wasm: PowlWasmModule,
  powlJson: string,
  episodes: readonly Episode[]
): EpisodeVerdict[] {
  const logJson = JSON.stringify(episodes.map((e) => e.activities));
  const result = asJson(wasm.footprints_conformance(powlJson, logJson));
  const conforms = result['conforms'] === true || result['is_conformant'] === true;
  return episodes.map((ep) => ({
    episodeId: ep.id,
    conforms,
    reason: conforms ? undefined : 'POWL footprints conformance failed',
    details: result,
  }));
}
