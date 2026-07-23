/**
 * CSV reader — thin wrapper over the existing WASM CSV parser
 * (`load_eventlog_from_csv` + `get_traces`), producing one `Episode` per
 * case. Reuses WASM bindings; does not reimplement CSV parsing.
 */
import type { Episode, EpisodeSet } from '../types.js';

export interface CsvWasmModule {
  load_eventlog_from_csv(content: string, activityKey: string, caseIdKey: string, timestampKey: string): string;
  get_traces(handle: string, activityKey: string): unknown;
  delete_object?(handle: string): void;
}

export interface CsvColumnKeys {
  activityKey?: string;
  caseIdKey?: string;
  timestampKey?: string;
}

export function csvToEpisodeSet(wasm: CsvWasmModule, content: string, keys: CsvColumnKeys = {}): EpisodeSet {
  const activityKey = keys.activityKey ?? 'concept:name';
  const caseIdKey = keys.caseIdKey ?? 'case:concept:name';
  const timestampKey = keys.timestampKey ?? 'time:timestamp';

  const handle = wasm.load_eventlog_from_csv(content, activityKey, caseIdKey, timestampKey);
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
      sourceFormat: 'csv',
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
