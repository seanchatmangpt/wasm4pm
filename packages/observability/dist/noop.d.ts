/**
 * No-op tracer implementation used when OTEL is disabled.
 * Every method is an empty function so there is zero runtime overhead:
 * no allocations, no branching, no async work.
 */
import type { Span, Tracer } from './spans.js';
/**
 * No-op Tracer. All methods return immediately with no side-effects.
 * Cost when disabled: one property lookup + one function call returning
 * a frozen singleton — no allocations per span.
 */
export declare class NoopTracer implements Tracer {
    startSpan(): Span;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=noop.d.ts.map