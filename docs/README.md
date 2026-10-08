<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/README.md; source-sha256: 2baef8780c96c15e771f2da68aa8c1a5d8d09b28eaa74ed546c2805ed7a610ed; reason: path-local authority or entrypoint -->

# wasm4pm documentation

This directory is the active documentation entrypoint for wasm4pm. Documentation describes the current executable graph at a specific ref; it does not crown a capability without execution and replay evidence.

## Start here

| Goal | Document |
|---|---|
| Understand the product and run the CLI | [`../README.md`](../README.md) |
| Understand the Vision 2030 capability contract | [`VISION_2030.md`](VISION_2030.md) |
| Understand the implemented architecture | [`explanation/architecture_overview.md`](explanation/architecture_overview.md) |
| Build a first workflow | [`tutorials/getting_started.md`](tutorials/getting_started.md) |
| Operate and troubleshoot the system | [`how-to/`](how-to/) |
| Look up commands, configuration, and algorithms | [`reference/`](reference/) |
| Look up the OCEL 2.0 log model, conformance API, and admission types | [`reference/ocel-conformance.md`](reference/ocel-conformance.md) |
| Understand testing and evidence | [`../TESTING.md`](../TESTING.md) |
| Contribute changes | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Report a vulnerability | [`../SECURITY.md`](../SECURITY.md) |

## Current capability surfaces

The public TypeScript CLI is `wpm` from `apps/wasm4pm`. The Rust CLI under `crates/wasm4pm-cli` is a development surface and may expose a smaller command tree.

The current proof-oriented entrypoints are:

```bash
wpm system doctor capabilities --format json
wpm system doctor fix --dry-run
wpm evidence session <ocel-v2.json> --object-type <type>
wpm evidence live --trace <trace.ndjson> --session <session.json> --weaver <report.json> --proof <proof.json>
pnpm run release:certificate
pnpm run release:cert-auth
```

A command existing in source is not evidence that it passed on the current checkout. Use the emitted standing, receipt paths, evidence hashes, and exit code.

## Documentation standing

Each Markdown file is classified as active, an archive pointer, or archived. The rules and migration process are defined in [`DOCUMENTATION_POLICY.md`](DOCUMENTATION_POLICY.md). The generated full-tree inventory is [`DOCUMENTATION_MANIFEST.md`](DOCUMENTATION_MANIFEST.md) after `pnpm run docs:migrate` has run on an exact checkout.

Historical completion reports, audits, status ledgers, and superseded architecture narratives belong under [`archive/`](archive/). They are preserved for lineage but must not be used as current product truth.

## Validation

```bash
pnpm run docs:inventory
pnpm run docs:migrate
pnpm run docs:governance
pnpm run docs:check
```

A documentation migration is complete only when the second migration pass reports zero changes and active links/lint pass against the same commit.

## See Also

The OCEL train spans three sibling repositories; their canonical documentation:

- [beam4pm — ingest and bridge API reference](../../beam4pm/docs/diataxis/reference/ingest-and-bridge-api.md) — beam4pm consumes wasm4pm's OCEL fixtures (e.g. `fixtures/shared/receipt.xes`, `fixtures/negative/`) through its ingest/bridge layer; wasm4pm itself has no direct code dependency on beam4pm.
- [OCEL 2.0 conformance surface](reference/ocel-conformance.md) — the typed log model (`wasm4pm_compat::ocel`), token-replay/fitness API, typed `Admission`/`Refusal` boundary, OCPQ query crate, and the shared-fixture contract with beam4pm.
- [ex4pm](../../ex4pm/docs/) — evidence emitter; the binding is `crates/wasm4pm-ex4pm-bindings` (see `docs/abi/ex4pm-bindings.md`).
