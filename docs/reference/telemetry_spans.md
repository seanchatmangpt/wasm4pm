# Reference: Telemetry Spans

`wasm4pm` emits structured OpenTelemetry spans to trace performance and correctness.

## Key Span Names

*   `engine.initialize`: Tracks WASM module instantiation and memory allocation.
*   `algo.discover`: The main discovery algorithm execution loop.
    *   **Attributes:** `algorithm.name`, `log.traces_count`, `log.events_count`.
*   `algo.conformance`: Alignment or token replay execution.
*   `adversarial.gate_check`: Execution of a V-series or P-series probe.
    *   **Attributes:** `gate.id`, `gate.passed`.
*   `crypto.sign_receipt`: The BLAKE3 hashing and ledger write.

## Metric Instruments
*   `latency_ns`: High-resolution nanosecond timers for kernel routines.
*   `memory_bytes`: Peak WASM heap usage.
