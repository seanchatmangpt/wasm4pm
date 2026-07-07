/**
 * OCPN (object-centric Petri net) replayer.
 *
 * KNOWN LIMITATION: there is no dedicated OCPN token-replay/alignment WASM
 * export in this build (only per-object-type discovery via
 * `discover_oc_petri_net`, which returns inline net JSON — not a
 * `check_token_based_replay`-compatible stored handle). Rather than fabricate
 * a plausible-looking full replay this module cannot actually perform, it
 * implements the one thing it can verify honestly: label-set coverage — does
 * every activity in the episode appear as a transition label in at least one
 * object type's discovered net? This is a materially weaker signal than true
 * replay/alignment fitness and MUST NOT be presented as equivalent to the
 * petri/dfg/powl replayers' conformance guarantee. `wpm model check --mode
 * replay` against an OCPN model surfaces this distinction in its result
 * payload (`method: 'label-coverage'` vs `'token-replay'`/`'alignment'`).
 */
import type { Episode, EpisodeVerdict } from '../types.js';

export interface OcpnNet {
  places?: unknown[];
  transitions?: Array<{ label?: string; name?: string } | string>;
}

export type OcpnDocument = Record<string, OcpnNet>;

function transitionLabels(net: OcpnNet): Set<string> {
  const labels = new Set<string>();
  for (const t of net.transitions ?? []) {
    if (typeof t === 'string') labels.add(t);
    else if (t && typeof t === 'object') {
      const label = t.label ?? t.name;
      if (typeof label === 'string') labels.add(label);
    }
  }
  return labels;
}

/** Union of transition labels across every object type's discovered net. */
function allLabels(doc: OcpnDocument): Set<string> {
  const union = new Set<string>();
  for (const net of Object.values(doc)) {
    for (const label of transitionLabels(net)) union.add(label);
  }
  return union;
}

export function replayLabelCoverage(doc: OcpnDocument, episode: Episode): EpisodeVerdict {
  const known = allLabels(doc);
  const missing = episode.activities.filter((a) => !known.has(a));
  const conforms = missing.length === 0;
  return {
    episodeId: episode.id,
    conforms,
    reason: conforms
      ? undefined
      : `${missing.length} activit${missing.length === 1 ? 'y' : 'ies'} not present in any discovered OCPN transition: ${[...new Set(missing)].join(', ')}`,
    details: { method: 'label-coverage', objectTypes: Object.keys(doc) },
  };
}
