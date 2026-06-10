/**
 * Temporal and cohort trace slicing utilities.
 * Pure TypeScript — no external dependencies.
 */

export type SliceUnit = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'attribute';

export interface Slice {
  label: string;
  startMs: number;
  endMs: number;
  traceIndices: number[];
}

export interface SliceResult {
  unit: SliceUnit;
  slices: Slice[];
  totalTraces: number;
}

// ─── Label helpers ────────────────────────────────────────────────────────────

function isoWeek(d: Date): string {
  // ISO 8601 week number
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Mon=0
  const weekStart = new Date(jan4.getTime() - dayOfWeek * 86_400_000);
  const diff = d.getTime() - weekStart.getTime();
  const week = Math.floor(diff / (7 * 86_400_000)) + 1;
  const year = d.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function bucketLabel(ms: number, unit: SliceUnit): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth(); // 0-based
  const day = d.getUTCDate();

  switch (unit) {
    case 'year':    return `${y}`;
    case 'quarter': return `${y}-Q${Math.floor(mo / 3) + 1}`;
    case 'month':   return `${y}-${String(mo + 1).padStart(2, '0')}`;
    case 'week':    return isoWeek(d);
    case 'day':     return `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    default:        throw new Error(`bucketLabel: unsupported unit '${unit}'`);
  }
}

/** First millisecond of the bucket that contains `ms`. */
function bucketStartMs(ms: number, unit: SliceUnit): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();

  switch (unit) {
    case 'year':
      return Date.UTC(y, 0, 1);
    case 'quarter':
      return Date.UTC(y, Math.floor(mo / 3) * 3, 1);
    case 'month':
      return Date.UTC(y, mo, 1);
    case 'week': {
      // Monday of the ISO week
      const dayOfWeek = (d.getUTCDay() + 6) % 7; // Mon=0
      return Date.UTC(y, mo, d.getUTCDate()) - dayOfWeek * 86_400_000;
    }
    case 'day':
      return Date.UTC(y, mo, d.getUTCDate());
    default:
      throw new Error(`bucketStartMs: unsupported unit '${unit}'`);
  }
}

/** First millisecond AFTER the bucket (exclusive end). */
function bucketEndMs(startMs: number, unit: SliceUnit): number {
  const d = new Date(startMs);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();

  switch (unit) {
    case 'year':    return Date.UTC(y + 1, 0, 1);
    case 'quarter': return Date.UTC(y, Math.floor(mo / 3) * 3 + 3, 1);
    case 'month':   return Date.UTC(y, mo + 1, 1);
    case 'week':    return startMs + 7 * 86_400_000;
    case 'day':     return startMs + 86_400_000;
    default:        throw new Error(`bucketEndMs: unsupported unit '${unit}'`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Group traces into time buckets of the given unit.
 * Slices are sorted by startMs ascending; traceIndices within each slice are
 * sorted ascending. Empty buckets are excluded.
 */
export function sliceByTime(
  traces: Array<{ startMs: number }>,
  unit: SliceUnit,
): SliceResult {
  if (unit === 'attribute') {
    throw new Error("sliceByTime: unit 'attribute' is not valid for time slicing; use sliceByAttribute()");
  }

  const map = new Map<string, { startMs: number; endMs: number; indices: number[] }>();

  for (let i = 0; i < traces.length; i++) {
    const { startMs } = traces[i];
    const label = bucketLabel(startMs, unit);
    if (!map.has(label)) {
      const bStart = bucketStartMs(startMs, unit);
      map.set(label, { startMs: bStart, endMs: bucketEndMs(bStart, unit), indices: [] });
    }
    map.get(label)!.indices.push(i);
  }

  const slices: Slice[] = Array.from(map.entries())
    .map(([label, { startMs, endMs, indices }]) => ({
      label,
      startMs,
      endMs,
      traceIndices: indices.slice().sort((a, b) => a - b),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  return { unit, slices, totalTraces: traces.length };
}

/**
 * Group traces by the value of a single attribute key.
 * Slices are sorted alphabetically by label; traceIndices are sorted ascending.
 * Traces missing the key are grouped under the label "__missing__".
 */
export function sliceByAttribute(
  traces: Array<{ attributes: Record<string, string> }>,
  key: string,
): SliceResult {
  const map = new Map<string, number[]>();

  for (let i = 0; i < traces.length; i++) {
    const val = traces[i].attributes[key] ?? '__missing__';
    if (!map.has(val)) map.set(val, []);
    map.get(val)!.push(i);
  }

  const slices: Slice[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, indices]) => ({
      label,
      startMs: 0,
      endMs: 0,
      traceIndices: indices.slice().sort((a, b) => a - b),
    }));

  return { unit: 'attribute', slices, totalTraces: traces.length };
}

/**
 * Human-readable summary of a SliceResult.
 * Shows up to 3 slices inline; remaining count shown as "and N more".
 *
 * Example: "4 month slices: 2024-01 (34 traces), 2024-02 (28 traces)... and 2 more"
 */
export function formatSliceSummary(result: SliceResult): string {
  const { unit, slices } = result;
  const count = slices.length;
  if (count === 0) return `0 ${unit} slices`;

  const MAX_INLINE = 3;
  const shown = slices.slice(0, MAX_INLINE);
  const rest = count - shown.length;

  const inline = shown
    .map(s => `${s.label} (${s.traceIndices.length} traces)`)
    .join(', ');

  const suffix = rest > 0 ? `... and ${rest} more` : '';
  return `${count} ${unit} slice${count !== 1 ? 's' : ''}: ${inline}${suffix}`;
}
