/**
 * Fail-closed verdict aggregation — the only path to a conformance "pass" in
 * this engine, and the fix for defect #2 (`oracle conform` vacuously admits
 * a log where zero episodes could be grouped, because an empty
 * `Object.entries({})` loop never sets `hasViolations = true`).
 *
 * Rule: `checked === 0` is never a pass. It is `INDETERMINATE`, and callers
 * must treat it as a hard failure (exit 2 / source_error) — the log could
 * not be checked at all, which is categorically different from "checked and
 * conforming".
 */
import type { EpisodeVerdict } from './types.js';

export type VerdictStatus = 'ADMITTED' | 'REJECTED' | 'INDETERMINATE';

export interface ConformanceVerdict {
  readonly status: VerdictStatus;
  readonly checked: number;
  readonly admitted: number;
  readonly rejected: number;
  readonly ungroupedEventCount: number;
  readonly exitCode: 0 | 2 | 6;
  readonly message: string;
  readonly findings: readonly EpisodeVerdict[];
}

export interface AggregateOptions {
  /** Diagnostic-only: events that could not be grouped into any episode. */
  ungroupedEventCount?: number;
}

/**
 * Aggregate per-episode verdicts into one fail-closed `ConformanceVerdict`.
 * `episodeVerdicts` is exactly what a replayer produced — an EMPTY array
 * (zero episodes checked) must never resolve to ADMITTED.
 */
export function aggregateVerdict(
  episodeVerdicts: readonly EpisodeVerdict[],
  options: AggregateOptions = {}
): ConformanceVerdict {
  const checked = episodeVerdicts.length;
  const ungroupedEventCount = options.ungroupedEventCount ?? 0;

  if (checked === 0) {
    return {
      status: 'INDETERMINATE',
      checked: 0,
      admitted: 0,
      rejected: 0,
      ungroupedEventCount,
      exitCode: 2,
      message:
        'INDETERMINATE: zero episodes could be checked' +
        (ungroupedEventCount > 0
          ? ` (${ungroupedEventCount} event(s) had no resolvable episode/case membership — check the grouping object type and log dialect)`
          : ' (log contained no events, or none matched the requested grouping)'),
      findings: [],
    };
  }

  const rejected = episodeVerdicts.filter((v) => !v.conforms);
  const admitted = checked - rejected.length;

  if (rejected.length > 0) {
    return {
      status: 'REJECTED',
      checked,
      admitted,
      rejected: rejected.length,
      ungroupedEventCount,
      exitCode: 6,
      message: `REJECTED: ${rejected.length}/${checked} episode(s) failed conformance`,
      findings: rejected,
    };
  }

  return {
    status: 'ADMITTED',
    checked,
    admitted,
    rejected: 0,
    ungroupedEventCount,
    exitCode: 0,
    message: `ADMITTED: all ${checked} episode(s) conform`,
    findings: [],
  };
}
