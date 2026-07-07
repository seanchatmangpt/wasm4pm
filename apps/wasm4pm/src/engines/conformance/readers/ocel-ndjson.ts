/**
 * OCEL 2.0 NDJSON reader — one v2-shaped event object per line (the wasm4pm
 * server's streaming/episode ingestion format; see `wasm.load_ocel2_from_ndjson`).
 * Objects are not carried line-by-line, so qualifier-less relationships
 * (object-id → object-type lookups) are not resolvable here; only relationships
 * whose `qualifier` names the group type directly are honored. This is a
 * strict subset of `ocel-v2.ts`'s matching, documented rather than silently
 * approximated.
 */
import type { Episode, EpisodeSet } from '../types.js';

interface NdjsonEvent {
  id: string;
  type: string;
  time?: string;
  relationships?: { objectId: string; qualifier?: string }[];
}

export function parseOcelNdjson(raw: string): NdjsonEvent[] {
  const events: NdjsonEvent[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      throw new Error(`Invalid OCEL NDJSON at line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`OCEL NDJSON line ${i + 1} is not an object`);
    }
    events.push(parsed as NdjsonEvent);
  }
  return events;
}

export interface OcelToEpisodeSetOptions {
  groupByObjectType?: string;
}

export function ocelNdjsonToEpisodeSet(events: NdjsonEvent[], options: OcelToEpisodeSetOptions = {}): EpisodeSet {
  const groupType = options.groupByObjectType ?? 'episode';
  const groups = new Map<string, NdjsonEvent[]>();
  let ungrouped = 0;

  for (const event of events) {
    const match = (event.relationships ?? []).find((rel) => rel.qualifier === groupType);
    if (!match) {
      ungrouped++;
      continue;
    }
    const list = groups.get(match.objectId) ?? [];
    list.push(event);
    groups.set(match.objectId, list);
  }

  const episodes: Episode[] = [...groups.entries()].map(([id, evs]) => {
    const sorted = [...evs].sort((a, b) => {
      const ta = a.time ? Date.parse(a.time) : 0;
      const tb = b.time ? Date.parse(b.time) : 0;
      return ta - tb;
    });
    return { id, activities: sorted.map((e) => e.type), eventCount: sorted.length };
  });

  return {
    sourceFormat: 'ocel-ndjson',
    episodes,
    totalEvents: events.length,
    ungroupedEventCount: ungrouped,
  };
}
