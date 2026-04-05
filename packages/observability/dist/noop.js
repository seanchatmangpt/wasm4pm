/**
 * No-op tracer implementation used when OTEL is disabled.
 * Every method is an empty function so there is zero runtime overhead:
 * no allocations, no branching, no async work.
 */
/** Singleton no-op span returned by the no-op tracer. */
const NOOP_SPAN = Object.freeze({
    traceId: '',
    spanId: '',
    name: '',
    kind: 'INTERNAL',
    startTimeNs: 0,
    attributes: {},
    end() { },
    addEvent() { },
    setStatus() { },
    setAttribute() { },
});
/**
 * No-op Tracer. All methods return immediately with no side-effects.
 * Cost when disabled: one property lookup + one function call returning
 * a frozen singleton — no allocations per span.
 */
export class NoopTracer {
    startSpan() {
        return NOOP_SPAN;
    }
    async flush() { }
    async shutdown() { }
}
