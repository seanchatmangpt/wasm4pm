<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/tutorials/getting_started.md; source-sha256: f24514d34f60537457da0a53e62fa00b4b4f4deb0d723ca8f1f2970363bbcf27; reason: canonical source-checkout tutorial -->

# Getting started

This tutorial runs the public TypeScript CLI from an exact repository checkout and distinguishes declared commands from executed standing.

## Prerequisites

Use the Node and pnpm versions admitted by the current root `package.json`. Rust, the `wasm32-unknown-unknown` target, and `wasm-pack` are required when the Node-target WASM package must be rebuilt.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build:wasm
pnpm run build:cli
```

Use the workspace command during development so another `wpm` binary on `PATH` cannot silently shadow the public CLI:

```bash
pnpm --filter @wasm4pm/cli exec wpm --help
```

## Diagnose the checkout

```bash
pnpm --filter @wasm4pm/cli exec wpm \
  system doctor capabilities --format json
```

Read the per-capability standing, diagnoses, evidence hash, and exit code. A `PARTIAL_ALIVE`, `BLOCKED`, `BUILD_BROKEN`, or `UNSUPPORTED` rail must remain distinct from `ALIVE`.

Preview available structured repairs without changing state:

```bash
pnpm --filter @wasm4pm/cli exec wpm \
  system doctor fix --dry-run
```

A non-empty dry-run is a plan, not completed actuation.

## Discover a process model

The repository sample log is [`data/small-example.xes`](../../data/small-example.xes).

```bash
pnpm --filter @wasm4pm/cli exec wpm \
  run data/small-example.xes -a dfg
```

Inspect the current algorithm registry through the CLI rather than relying on a count in documentation:

```bash
pnpm --filter @wasm4pm/cli exec wpm algorithms --format json
```

If an algorithm is listed but execution fails, preserve the exact refusal or failure. Registry enumeration does not prove WASM export or dispatcher reachability.

## Execute an OCEL-v2 session

Choose an OCEL-v2 fixture and an object type that exists in that fixture:

```bash
pnpm --filter @wasm4pm/cli exec wpm \
  evidence session <ocel-v2.json> \
  --object-type <object-type>
```

A successful run produces:

- a pending receipt;
- an outcome receipt;
- a session evidence file unless `--no-save` is used;
- hashes for input, normalized OCEL, projected event log, POWL model, execution output, and complete evidence.

Replay the same subject:

```bash
pnpm --filter @wasm4pm/cli exec wpm \
  evidence session <ocel-v2.json> \
  --object-type <object-type> \
  --mode replay \
  --session .wasm4pm/sessions/<run-id>.json
```

`REPLAY_MATCH` requires all identity hashes to agree. OCEL-v1 and OCEL NDJSON are typed unsupported on this exact composition route.

## Inspect receipts

Use the receipt paths emitted by the command. Do not infer receipt validity from the filename or status field alone. Verify that the recorded hashes recompute and that the receipt refers to the same subject and run.

## Next steps

- [`../VISION_2030.md`](../VISION_2030.md) — capability contract and crown conditions.
- [`../explanation/architecture_overview.md`](../explanation/architecture_overview.md) — implemented architecture.
- [`../reference/cli_commands.md`](../reference/cli_commands.md) — command reference; confirm it against `wpm --help` at your ref.
- [`../../TESTING.md`](../../TESTING.md) — validation ladder and evidence vocabulary.
- [`../../WASM_API.md`](../../WASM_API.md) — exact WASM boundary verification.
