# OTEL & Receipt Coverage Matrix

**Plan E (Phase A):** OTEL spans + BLAKE3 receipts wired for the 5 core
discovery/quality commands. All other commands are deferred to Phase B or
explicitly exempt.

Span naming convention: `wasm4pm.command.<name>` (set by `withSpan` in
`apps/wasm4pm/src/commands/_otel.ts`).

Receipt location: `.wasm4pm/receipts/<run_id>.json` plus
`.wasm4pm/receipts/latest.json` (BLAKE3 input/output hashes via
`@wasm4pm/contracts.hashJsonString`).

| Command       | Span | Receipt | Phase | Notes |
|---------------|:----:|:-------:|:-----:|-------|
| run           |  A   |    A    |   A   | wired |
| compare       |  A   |    A    |   A   | wired |
| diff          |  A   |    A    |   A   | wired |
| conformance   |  A   |    A    |   A   | wired |
| quality       |  A   |    A    |   A   | wired |
| predict       |  A   |    A    |   A   | wired (Surface L) |
| ml            |  A   |    A    |   A   | wired (Surface L) |
| simulate      |  A   |    A    |   A   | wired (Surface L; new `--no-save` flag) |
| temporal      |  A   |    A    |   A   | wired (Surface L; new `--no-save` flag) |
| social        |  A   |    A    |   A   | wired (Surface L; new `--no-save` flag) |
| drift-watch   |  R   |    R    |   R   | wired (Surface R; streaming model — parent `wasm4pm.command.drift-watch` + per-window child spans `wasm4pm.drift-watch.window`; session receipt on graceful SIGINT/SIGTERM exit only, `--no-save` to skip) |
| powl          |  Q   |   Q*    |   Q   | wired (Surface Q; per-subcommand spans `wasm4pm.command.powl.<sub>`; receipts ONLY for write subs `simplify`/`convert`/`import`/`discover`; read subs span-only — prior `savePredictionResult()` forgery removed) |
| validate      |  A   |    -    |   A   | wired (Surface P; span only — read-only, no receipt) |
| autoprocess   |  A   |    A    |   A   | wired (Surface T; single-cycle invocation, state-hash chain receipt) |
| swarm         |  C   |    -    |   C   | wired (Round 5; span only — `runSwarm` is mock-LLM driven, no artifact to receipt) |
| benchmark     |  C   |    -    |   C   | wired (Round 5; per-subcommand spans `wasm4pm.command.benchmark.<sub>` for build/replay/verify/export) |
| verify        |  C   |    -    |   C   | wired (Round 5; certification gate run, span captures `fast` flag) |
| cell          |  C   |    -    |   C   | wired (Round 5; per-subcommand spans `wasm4pm.command.cell.<sub>` for build/verify/replay/export/doctor) |
| agent         |  C   |    -    |   C   | wired (Round 5; per-subcommand spans `wasm4pm.command.agent.<sub>` for audit/execute/list/register/status — files in commands/agent/*.ts) |
| membrane      |  -   |    -    | TODO  | 11 subcommands across 1500+ lines — pattern is mechanical (per Surface Q); deferred to dedicated pass |
| watch         |  A   |    -    |   A   | wired (Surface S; manual parent + per-cycle child spans, no CommandReceipt — downstream `run` certifies artifacts) |
| cognition     |  -   |    -    | exempt | has own receipt path via `apps/wasm4pm/src/commands/cognition/_shared.ts:saveReceipt` |
| status        |  -   |    -    | exempt | introspection — no input/output to hash |
| doctor        |  -   |    -    | exempt | environment diagnostic only |
| results       |  -   |    -    | exempt | reads existing receipts |
| init          |  -   |    -    | exempt | scaffolding only |
| explain       |  -   |    -    | exempt | static text output |
| completions   |  -   |    -    | exempt | shell completions only |
| config        |  -   |    -    | exempt | config introspection/edit only |

**Legend:** `A` = wired in Phase A; `B` = deferred to Phase B; `-` = not present;
`exempt` = command is read-only / introspective with no meaningful execution
artifacts to receipt.

## Bootstrap

`apps/wasm4pm/src/bin/wpm.ts` calls `initOtel()` once at process start. When
`WASM4PM_OTEL_ENABLED=true`, the global sink is wired to `OtelExporter` from
`@wasm4pm/observability` (non-blocking queue, drop-oldest, OTLP HTTP). When
disabled or unavailable, a noop sink is installed and a single warning is
written to stderr.

## Tests

- `src/__tests__/otel-integration.test.ts` — `withSpan` round-trip via global sink
- `src/__tests__/cognition-shared.test.ts` — `withSpan` invariants (replaces deleted `emitCognitionSpan` tests)
- `src/__tests__/cognition-verbs.test.ts` — global sink capture for verb scaffolding
