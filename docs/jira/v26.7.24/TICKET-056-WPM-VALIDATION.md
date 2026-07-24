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

The owning CI lane executes these narrow commands after installing the real runtime prerequisites and materializing the Node-target cognition WASM package:

```bash
pnpm --filter @wasm4pm/cli... build
pnpm --filter @wasm4pm/testing... build
pnpm --filter @wasm4pm/cli typecheck:tests
pnpm --filter @wasm4pm/cli exec vitest run src/__tests__/interview-assist-cli.test.ts --reporter=verbose
```

A declared command is not a pass result. Standing changes only when GitHub Actions executes these commands against the exact PR head and the job conclusion is observed.
