<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: README.md; source-sha256: 1a81394bdf1c4e82b8cf7e6b5cc9850ccbb506cb03541f1769dba2d0be48c34d; reason: canonical product entrypoint -->

# wasm4pm

wasm4pm is an evidence-oriented process-mining platform implemented in Rust, WebAssembly, and TypeScript. The public `wpm` CLI discovers and validates process models, operates on XES and object-centric event data, executes POWL routes, and manufactures replayable evidence.

The platform law is simple:

> Claims may not exceed the exact subject, runtime, authority, receipt, and replay evidence that supports them.

## Current standing

The Vision 2030 implementation graph is present, but global standing is `PARTIAL_ALIVE` until the complete workspace, real Node-target WASM session, exact release certificate, signed AAT-Live bundle, and required exact-head CI all execute and replay against one immutable commit.

Use the executable capability report instead of a prose status claim:

```bash
wpm system doctor capabilities --format json
```

## Repository setup

The public TypeScript CLI lives in `apps/wasm4pm`. The Rust CLI under `crates/wasm4pm-cli` is a smaller development surface and may install another binary named `wpm`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build:wasm
pnpm run build:cli
pnpm --filter @wasm4pm/cli exec wpm --help
```

Build commands and package names can change. Treat the current manifests, `Justfile`, and `Makefile` as command authority.

## Core workflows

### Diagnose and repair

```bash
wpm system doctor capabilities --format json
wpm system doctor fix --dry-run
wpm system doctor fix --only ensure-results-directory --yes
```

Doctor diagnosis is inspection-only. Repairs are selected from a structured registry, require explicit authority, write a pending receipt before DO, and write an outcome receipt afterward.

### Discover from an event log

```bash
wpm run data/small-example.xes -a dfg
wpm algorithms
```

Do not infer the number or standing of algorithms from this README. Query the current CLI and inspect the versioned reachability and behavior evidence for release claims.

### Execute and replay an object-centric session

```bash
wpm evidence session data/example-ocel-v2.json --object-type Order

wpm evidence session data/example-ocel-v2.json \
  --object-type Order \
  --mode replay \
  --session .wasm4pm/sessions/<run-id>.json
```

This route requires the exact OCEL-v2 WASM normalization and flattening exports, compares them with the independent TypeScript reader, discovers and validates a POWL model, executes it in WASM, and hashes every transition. OCEL-v1 and OCEL NDJSON remain typed unsupported on this composition root until equivalent WASM routes exist.

### Manufacture signed AAT-Live standing

```bash
wpm evidence live \
  --trace trace.ndjson \
  --session session.json \
  --weaver weaver-admission.json \
  --proof mcp-plus-proof.json
```

An `Accepted` passport requires ordered observations, a signed zero-violation Weaver report, a signed MCP+ proof, exact session/route/WASM/manifest identities, release-certificate identity, and replay. A refusal produces no passport.

### Manufacture release evidence

```bash
pnpm run release:algorithm-reachability
pnpm run release:algorithm-behavior
pnpm run release:verify-algorithm-behavior
pnpm run examples:gate
pnpm run prepublish:pack-smoke
pnpm run release:certificate
pnpm run release:cert-auth
```

The release certificate binds package identity, exact Git commit, algorithm evidence, executed examples, npm tarball contents and integrity, WASM bytes, and its own canonical hash. The certificate is not closure unless the independent verifier recomputes all of those edges.

## Architecture

```text
observations
  → parser and router
  → admission or typed refusal
  → construction
  → BRCE actuation
  → receipt
  → replay
  → bounded standing
```

See [`docs/explanation/architecture_overview.md`](docs/explanation/architecture_overview.md) and [`docs/VISION_2030.md`](docs/VISION_2030.md).

## Programmatic boundary

The generated WASM package and TypeScript declarations are the exact export inventory for a build. Begin with [`WASM_API.md`](WASM_API.md); verify required exports in `wasm4pm/pkg/wasm4pm.d.ts` and the owning Rust source before depending on them.

## Testing

```bash
pnpm build
pnpm test
cargo check
cargo test --workspace
pnpm run docs:check
```

These are baseline gates, not universal proof. Run the owning package, real WASM target, clean package install, or signed evidence boundary required by the claim. See [`TESTING.md`](TESTING.md).

## Documentation

The active documentation map is [`docs/README.md`](docs/README.md). Documentation classification and archival rules are defined in [`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md).

```bash
pnpm run docs:inventory
pnpm run docs:migrate
pnpm run docs:governance
pnpm run docs:check
```

Historical audits, status reports, completion summaries, and superseded narratives are retained under `docs/archive/` or `docs_quarantine/`; they are lineage evidence, not current product truth.

## Telemetry and data

Telemetry is disabled unless explicitly configured. Review the current observability implementation and deployment configuration before making network or retention claims. Do not place credentials, private keys, PII, or sensitive local paths in receipts or traces.

## Security and contribution

- Security reporting: [`SECURITY.md`](SECURITY.md)
- Contribution workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Agent contract: [`AGENTS.md`](AGENTS.md)
- Commercial terms: [`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md)

## License

The repository license and change-date terms are defined by [`LICENSE`](LICENSE). Do not infer use rights from this README.
