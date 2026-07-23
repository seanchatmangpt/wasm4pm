/**
 * DFG replayer — loads a DFG model JSON into WASM state and reuses the same
 * `check_prefix_conformance` primitive `petri.ts` uses (it accepts any
 * stored model handle, not just Petri nets — see `commands/prefix-conformance.ts`).
 */
import type { Episode, EpisodeVerdict } from '../types.js';
import { replayPrefix, type PetriWasmModule } from './petri.js';

export interface DfgWasmModule extends PetriWasmModule {
  store_dfg_from_json(dfgJson: string): string;
}

export function loadDfgFromJson(wasm: DfgWasmModule, dfgJson: string): string {
  return wasm.store_dfg_from_json(dfgJson);
}

export function replayPrefixAgainstDfg(wasm: DfgWasmModule, dfgHandle: string, episode: Episode): EpisodeVerdict {
  return replayPrefix(wasm, dfgHandle, episode);
}
