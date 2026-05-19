# Reference: Configuration Schema

The `wasm4pm.toml` file controls the global behavior of the engine.

## Core Blocks

### `[observability]`
*   `enabled` (bool): Master switch for OpenTelemetry.
*   `level` (string): `error`, `warn`, `info`, `debug`, `trace`.
*   `endpoint` (string): OTLP collector URL.

### `[execution]`
*   `profile` (string): Constraints profile (`mobile`, `iot`, `edge`, `fog`, `browser`).
*   `simd` (bool): Enable AVX/WASM-SIMD128 intrinsics.
*   `threads` (int): Number of web workers / threads to spawn.

### `[adversarial]`
*   `strict_mode` (bool): If true, any gate failure panics the engine.
*   `ignored_probes` (list): Array of probe IDs (e.g. `["V1", "V4"]`) to bypass.
