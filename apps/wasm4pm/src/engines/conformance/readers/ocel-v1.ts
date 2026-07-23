/**
 * OCEL 1.0 JSON ("JSONOCEL") reader — normalizes the ID-keyed-map dialect
 * (`ocel:events`, `ocel:objects`, per-event `ocel:omap`) into the same
 * `EpisodeSet` shape `ocel-v2.ts` produces.
 *
 * This is the direct fix for defect #2: the old `oracle conform` fed OCEL
 * through a v2-only path (`export_ocel2_to_json` + `event.relationships`),
 * so a v1 export — which has no `relationships[]` at all, only a flat
 * `ocel:omap` object-id list with no qualifier — silently produced zero
 * episode groups and a vacuous "Admitted". Here, v1's `ocel:omap` is
 * resolved against `ocel:objects` to find a member of `groupByObjectType`,
 * exactly mirroring what a qualifier-less v2 relationship match does.
 */
import type { Episode, EpisodeSet } from '../types.js';

interface OcelV1EventRaw {
  'ocel:activity': string;
  'ocel:timestamp'?: string;
  'ocel:omap'?: string[];
}

interface OcelV1ObjectRaw {
  'ocel:type': string;
}

export interface OcelV1Document {
  /** `ocel:events` is an ID-keyed map in the v1 spec, not an array. */
  events: Record<string, OcelV1EventRaw>;
  objects: Record<string, OcelV1ObjectRaw>;
}

export function parseOcelV1Json(raw: string): OcelV1Document {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid OCEL 1.0 JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`OCEL 1.0 JSON must be an object, got ${typeof parsed}`);
  }
  const obj = parsed as Record<string, unknown>;
  const events = (obj['ocel:events'] as Record<string, OcelV1EventRaw> | undefined) ?? {};
  const objects = (obj['ocel:objects'] as Record<string, OcelV1ObjectRaw> | undefined) ?? {};
  return { events, objects };
}

/**
 * Convert a parsed OCEL 1.0 document to OCEL 2.0 JSON text. Used so
 * downstream WASM entrypoints that only understand the v2 shape
 * (`load_ocel_from_json`) can still accept a v1 export, instead of the
 * caller having to special-case the dialect at every call site.
 */
export function ocelV1ToV2Json(doc: OcelV1Document): string {
  const objectTypes = new Set<string>();
  const eventTypes = new Set<string>();
  const objects = Object.entries(doc.objects).map(([id, o]) => {
    objectTypes.add(o['ocel:type']);
    return { id, type: o['ocel:type'], attributes: [], relationships: [] as unknown[] };
  });
  const events = Object.entries(doc.events).map(([id, e]) => {
    eventTypes.add(e['ocel:activity']);
    return {
      id,
      type: e['ocel:activity'],
      time: e['ocel:timestamp'] ?? new Date(0).toISOString(),
      attributes: [],
      relationships: (e['ocel:omap'] ?? []).map((objectId) => ({ objectId, qualifier: undefined })),
    };
  });
  return JSON.stringify({
    eventTypes: [...eventTypes].map((name) => ({ name, attributes: [] })),
    objectTypes: [...objectTypes].map((name) => ({ name, attributes: [] })),
    events,
    objects,
  });
}

export interface OcelToEpisodeSetOptions {
  groupByObjectType?: string;
}

export function ocelV1ToEpisodeSet(doc: OcelV1Document, options: OcelToEpisodeSetOptions = {}): EpisodeSet {
  const groupType = options.groupByObjectType ?? 'episode';
  const groups = new Map<string, { activity: string; timestamp?: string }[]>();
  const eventIds = Object.keys(doc.events);
  let ungrouped = 0;

  for (const eventId of eventIds) {
    const event = doc.events[eventId];
    const omap = event['ocel:omap'] ?? [];
    let episodeId: string | undefined;
    for (const objectId of omap) {
      const obj = doc.objects[objectId];
      if (obj && obj['ocel:type'] === groupType) {
        episodeId = objectId;
        break;
      }
    }
    if (episodeId === undefined) {
      ungrouped++;
      continue;
    }
    const list = groups.get(episodeId) ?? [];
    list.push({ activity: event['ocel:activity'], timestamp: event['ocel:timestamp'] });
    groups.set(episodeId, list);
  }

  const episodes: Episode[] = [...groups.entries()].map(([id, events]) => {
    const sorted = [...events].sort((a, b) => {
      const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
      return ta - tb;
    });
    return {
      id,
      activities: sorted.map((e) => e.activity),
      eventCount: sorted.length,
    };
  });

  return {
    sourceFormat: 'ocel-v1',
    episodes,
    totalEvents: eventIds.length,
    ungroupedEventCount: ungrouped,
  };
}
