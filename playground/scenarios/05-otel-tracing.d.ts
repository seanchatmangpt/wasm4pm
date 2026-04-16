/**
 * Scenario: OTEL tracing — span capture and attribute validation
 *
 * Dev action simulated: "I added a new span to engine.bootstrap(). Does it
 * carry all required attributes? Does it fit correctly in the trace tree?
 * Is it fast enough to be non-blocking?"
 *
 * Strategy: call Instrumentation.create*Event() directly (same methods the
 * engine calls) and feed the result to OtelCapture. No real collector needed.
 *
 * Note: assertRequiredAttributes/assertValidTraces/assertNonBlocking return
 * string[] (violation messages), NOT void/throw.
 */
export {};
//# sourceMappingURL=05-otel-tracing.d.ts.map