# TICKET-056 — wpm validation boundary

The executable acceptance boundary for the continuous InterviewAssist receipt chain is:

```text
wpm lab interview-assist --workspace <repository-root>
```

The command starts the real InterviewAssist Next server and crosses these HTTP routes in order:

1. `POST /api/admission`
2. `POST /api/cognition`
3. `POST /api/run`
4. `POST /api/test`
5. `POST /api/accessibility`

It requires a BLAKE3 receipt at every stage, checks each `derivedFrom` and `relation` value against the immediately preceding checksum, requires real Python execution and real pytest to exit zero, and writes the observed session evidence to `.wasm4pm/interview-assist/latest.json` by default.

The `wpm` middleware separately emits the command receipt and OTEL span. The process-level test invokes the built `wpm` binary with `@wasm4pm/testing`'s `runCli`, then reopens all three durable evidence surfaces from an isolated working directory.

No route handler, reducer, WASM adapter, subprocess executor, network response, or filesystem result is replaced in this test path.
