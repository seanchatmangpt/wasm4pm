# TICKET-056 — wpm validation boundary

The executable acceptance boundary for the continuous InterviewAssist receipt chain is the built CLI binary itself:

```bash
node apps/wasm4pm/dist/bin/wpm.js \
  lab interview-assist \
  --workspace "$PWD" \
  --output "$PWD/.wasm4pm/interview-assist/latest.json" \
  --timeout-ms 150000
```

The command starts the real InterviewAssist Next server and crosses these HTTP routes in order:

1. `POST /api/admission`
2. `POST /api/cognition`
3. `POST /api/run`
4. `POST /api/test`
5. `POST /api/accessibility`

It requires a BLAKE3 receipt at every stage, checks each `derivedFrom` and `relation` value against the immediately preceding checksum, requires real Python execution and real pytest to exit zero, and writes the observed session evidence to `.wasm4pm/interview-assist/latest.json`.

The normal `wpm` middleware separately emits `.wasm4pm/receipts/latest.json` and the `wpm.lab.interview-assist` OTEL span. CI runs the binary directly and then reopens those durable artifacts. It does not invoke `runCli`, Vitest, a route handler, a reducer, or an adapter as the primary execution boundary.

The owning CI lane installs the real runtime prerequisites, materializes the Node-target cognition WASM package, builds the CLI dependency closure, runs the command above, and independently checks:

- machine-readable CLI stdout;
- the five-stage session evidence and immediate predecessor chain;
- real Python and pytest exit codes;
- the CLI command receipt;
- the persisted OTEL span.

A declared command is not a pass result. Standing changes only when GitHub Actions executes the direct binary command against the exact PR head and the job conclusion is observed.
