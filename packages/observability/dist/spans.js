/**
 * Span definitions for every lifecycle phase.
 * Provides the Tracer/Span interfaces and factory functions
 * for bootstrap, planning, running, and watching spans.
 */
// ---- Live span implementation ----
export class LiveSpan {
    constructor(ctx, name, kind, requiredFields, customAttrs, onEnd) {
        this.events = [];
        this.traceId = ctx.traceId;
        this.spanId = ctx.spanId;
        this.parentSpanId = ctx.parentSpanId;
        this.name = name;
        this.kind = kind;
        this.startTimeNs = Date.now() * 1000000;
        this.attributes = { ...requiredFields, ...customAttrs };
        this.onEnd = onEnd;
    }
    end() {
        if (this.endTimeNs !== undefined)
            return; // idempotent
        this.endTimeNs = Date.now() * 1000000;
        if (!this.status)
            this.status = { code: 'OK' };
        this.onEnd(this);
    }
    addEvent(name, attrs) {
        this.events.push({
            name,
            timestampNs: Date.now() * 1000000,
            attributes: attrs,
        });
    }
    setStatus(code, message) {
        this.status = { code, message };
    }
    setAttribute(key, value) {
        this.attributes[key] = value;
    }
}
// ---- Convenience span factories for each lifecycle phase ----
/** Create span name following `phase.operation` convention. */
function spanName(phase, operation) {
    return `${phase}.${operation}`;
}
// Bootstrap phase spans
export const BootstrapSpans = {
    configLoad: () => spanName('bootstrap', 'config_load'),
    configValidation: () => spanName('bootstrap', 'config_validation'),
};
// Planning phase spans
export const PlanningSpans = {
    configResolution: () => spanName('planning', 'config_resolution'),
    planGeneration: () => spanName('planning', 'plan_generation'),
};
// Running phase spans
export const RunningSpans = {
    runStart: () => spanName('running', 'run_start'),
    sourceRead: () => spanName('running', 'source_read'),
    algorithmExec: (alg) => spanName('running', `algorithm.${alg}`),
    sinkWrite: () => spanName('running', 'sink_write'),
    runEnd: () => spanName('running', 'run_end'),
};
// Watching phase spans
export const WatchingSpans = {
    heartbeat: () => spanName('watching', 'heartbeat'),
    reconnect: () => spanName('watching', 'reconnect'),
    checkpointSave: () => spanName('watching', 'checkpoint_save'),
    checkpointLoad: () => spanName('watching', 'checkpoint_load'),
};
