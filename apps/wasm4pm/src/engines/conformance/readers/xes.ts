/**
 * XES reader — thin wrapper over the existing WASM XES parser
 * (`load_eventlog_from_xes` + `get_traces`), producing one `Episode` per
 * trace (case). Reuses WASM bindings; does not reimplement XES parsing.
 */
import type { Episode, EpisodeSet } from '../types.js';

export interface XesWasmModule {
  load_eventlog_from_xes(content: string): string;
  get_traces(handle: string, activityKey: string): unknown;
  delete_object?(handle: string): void;
}

export function xesToEpisodeSet(
  wasm: XesWasmModule,
  content: string,
  activityKey = 'concept:name'
): EpisodeSet {
  const handle = wasm.load_eventlog_from_xes(content);
  try {
    const raw = wasm.get_traces(handle, activityKey);
    const traces: string[][] = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[][]);
    const episodes: Episode[] = traces.map((activities, i) => ({
      id: `trace-${i}`,
      activities,
      eventCount: activities.length,
    }));
    const totalEvents = episodes.reduce((sum, e) => sum + e.eventCount, 0);
    return {
      sourceFormat: 'xes',
      episodes,
      totalEvents,
      ungroupedEventCount: 0,
    };
  } finally {
    try {
      wasm.delete_object?.(handle);
    } catch {
      /* best-effort cleanup */
    }
  }
}
