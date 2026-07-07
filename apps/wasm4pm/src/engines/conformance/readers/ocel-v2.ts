/**
 * OCEL 2.0 JSON reader — normalizes `{eventTypes, objectTypes, events, objects}`
 * into an `EpisodeSet`, grouping events by their relationship to an object of
 * a given type (default: `episode`, matching the old `oracle conform`'s
 * grouping convention — see `../modes/oracle.ts`).
 */
import type { Episode, EpisodeSet } from '../types.js';

interface OcelV2Relationship {
  objectId: string;
  qualifier?: string;
}

interface OcelV2Event {
  id: string;
  type: string;
  time?: string;
  relationships?: OcelV2Relationship[];
}

interface OcelV2Object {
  id: string;
  type: string;
}

export interface OcelV2Document {
  events: OcelV2Event[];
  objects: OcelV2Object[];
}

export function parseOcelV2Json(raw: string): OcelV2Document {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid OCEL 2.0 JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`OCEL 2.0 JSON must be an object, got ${typeof parsed}`);
  }
  const obj = parsed as Record<string, unknown>;
  const events = Array.isArray(obj['events']) ? (obj['events'] as OcelV2Event[]) : [];
  const objects = Array.isArray(obj['objects']) ? (obj['objects'] as OcelV2Object[]) : [];
  return { events, objects };
}

export interface OcelToEpisodeSetOptions {
  /** Object type used as the grouping key. Default: 'episode'. */
  groupByObjectType?: string;
}

/**
 * Group OCEL v2 events into episodes by their relationship to an object of
 * `groupByObjectType`. An event qualifies if either:
 *  - one of its `relationships[]` has `qualifier === groupByObjectType`, or
 *  - one of its `relationships[]` points at an object whose `type` is
 *    `groupByObjectType` (qualifier-less relationship, e.g. a plain object
 *    reference with no named role).
 * Events matching neither count toward `ungroupedEventCount` instead of
 * silently disappearing (the old code's failure mode).
 */
export function ocelV2ToEpisodeSet(doc: OcelV2Document, options: OcelToEpisodeSetOptions = {}): EpisodeSet {
  const groupType = options.groupByObjectType ?? 'episode';
  const objectsById = new Map(doc.objects.map((o) => [o.id, o] as const));
  const groups = new Map<string, { events: OcelV2Event[] }>();
  let ungrouped = 0;

  for (const event of doc.events) {
    let episodeId: string | undefined;
    for (const rel of event.relationships ?? []) {
      if (rel.qualifier === groupType) {
        episodeId = rel.objectId;
        break;
      }
      const obj = objectsById.get(rel.objectId);
      if (obj && obj.type === groupType) {
        episodeId = rel.objectId;
        break;
      }
    }
    if (episodeId === undefined) {
      ungrouped++;
      continue;
    }
    const group = groups.get(episodeId) ?? { events: [] };
    group.events.push(event);
    groups.set(episodeId, group);
  }

  const episodes: Episode[] = [...groups.entries()].map(([id, { events }]) => {
    const sorted = [...events].sort((a, b) => {
      const ta = a.time ? Date.parse(a.time) : 0;
      const tb = b.time ? Date.parse(b.time) : 0;
      return ta - tb;
    });
    return {
      id,
      activities: sorted.map((e) => e.type),
      eventCount: sorted.length,
    };
  });

  return {
    sourceFormat: 'ocel-v2',
    episodes,
    totalEvents: doc.events.length,
    ungroupedEventCount: ungrouped,
  };
}
