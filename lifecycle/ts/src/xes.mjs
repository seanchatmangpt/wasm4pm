/**
 * XES event utilities — standalone, zero deps.
 *
 * Converts lifecycle transition events into XES-standard event objects that
 * can be fed directly to wasm4pm process mining algorithms.
 *
 * XES standard: http://www.xes-standard.org/
 */

/**
 * Normalise a raw transition event into a canonical XES event object.
 */
export function toXesEvent(event) {
  return {
    caseId:    event.caseId,
    activity:  event.activity,   // XES concept:name
    timestamp: event.timestamp,  // XES time:timestamp
    index:     event.index,
    from:      event.from,
    to:        event.to,
    meta:      event.meta ?? {},
  };
}

/**
 * Convert Jaeger/OTel spans (from the Jaeger REST API) into XES events.
 *
 * Only spans whose operationName starts with `lifecycle.` are included.
 * Expects Jaeger v1 response: { data: [{ traceID, spans: [...] }] }
 *
 * @param {object} jaegerResponse - Raw Jaeger API JSON response
 * @param {string} caseId         - Case ID to assign to these events
 * @returns {object[]} Canonical XES events
 */
export function fromJaegerSpans(jaegerResponse, caseId) {
  const events = [];
  let index = 0;

  for (const trace of (jaegerResponse.data ?? [])) {
    const sorted = [...(trace.spans ?? [])]
      .filter(s => s.operationName?.startsWith('lifecycle.'))
      .sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sorted.length; i++) {
      const span = sorted[i];
      const stageName = span.operationName.replace('lifecycle.', '');
      const capitalized = stageName.charAt(0).toUpperCase() + stageName.slice(1);

      events.push(toXesEvent({
        caseId,
        activity:  capitalized,
        timestamp: new Date(span.startTime / 1000).toISOString(),
        index:     ++index,
        from:      i > 0 ? sorted[i - 1].operationName.replace('lifecycle.', '') : 'start',
        to:        capitalized,
        meta:      { traceId: trace.traceID, spanId: span.spanID },
      }));
    }
  }

  return events;
}

/**
 * XesEventLog — wraps a collection of events; direct input for LifecycleMiner.
 */
export class XesEventLog {
  #events;

  constructor(events = []) {
    this.#events = events.map(toXesEvent);
  }

  add(event) { this.#events.push(toXesEvent(event)); }

  get traces() {
    const byCase = new Map();
    for (const ev of this.#events) {
      if (!byCase.has(ev.caseId)) byCase.set(ev.caseId, []);
      byCase.get(ev.caseId).push(ev);
    }
    return Object.fromEntries(byCase);
  }

  get events() {
    return [...this.#events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Activity sequences — one array per case, direct input for DFG. */
  get activitySequences() {
    return Object.values(this.traces).map(evs =>
      evs.sort((a, b) => a.index - b.index).map(e => e.activity)
    );
  }

  toJSON() { return { traces: this.traces }; }
}
