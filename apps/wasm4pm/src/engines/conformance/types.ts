/**
 * Unified shapes every conformance reader normalizes into, regardless of
 * source dialect (XES trace, OCEL v1 `ocel:omap`, OCEL v2 `relationships[]`,
 * OCEL NDJSON, CSV). This is the fix for defect #2: the old `oracle conform`
 * only understood OCEL v2 `relationships[]`, so an OCEL v1 export (using
 * `ocel:omap`) silently produced zero episode groups and vacuously "passed".
 * Every reader in `./readers/*` must produce this shape; every replayer and
 * `verdict.ts` consume only this shape, never a dialect-specific one.
 */

/** A single grouping unit to conformance-check: an XES trace, or an OCEL episode/case object. */
export interface Episode {
  readonly id: string;
  /** Activity/event-type sequence, ordered by time where known. */
  readonly activities: readonly string[];
  /** Raw event count backing this episode (for diagnostics). */
  readonly eventCount: number;
}

/** Normalized log content, dialect-erased. */
export interface EpisodeSet {
  readonly sourceFormat: string;
  readonly episodes: readonly Episode[];
  /** Total raw events seen, including ones that could not be grouped into any episode. */
  readonly totalEvents: number;
  /** Events that carried no resolvable episode/case membership (diagnostic only). */
  readonly ungroupedEventCount: number;
}

/** Per-episode conformance outcome from a replayer. */
export interface EpisodeVerdict {
  readonly episodeId: string;
  readonly conforms: boolean;
  readonly reason?: string;
  readonly details?: unknown;
}
