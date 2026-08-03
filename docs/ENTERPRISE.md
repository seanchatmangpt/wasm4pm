<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/ENTERPRISE.md; source-sha256: 5108ec9b1568196bad8b206779054e6450064cc51cea4baa7fe81a145e9de369; reason: canonical enterprise deployment guidance -->

# Enterprise deployment

Enterprise deployment is an evidence and identity problem, not only an installation problem. Pin the exact source or package artifact, build target, configuration, release certificate, and operating authority used in production.

## Supported deployment subject

A deployment receipt should bind:

- repository commit or published package identity;
- npm tarball integrity when installing from a package;
- Node-target or browser-target WASM hash;
- configuration hash and environment-variable policy;
- deployment image or host identity;
- telemetry and external-service configuration;
- release-certificate hash;
- operator or automation authority;
- rollback subject and procedure.

Do not reuse benchmark, memory, bundle-size, or compatibility claims from another build target or historical report.

## Source deployment

```bash
git checkout <exact-commit>
corepack enable
pnpm install --frozen-lockfile
pnpm run build:wasm
pnpm run build:cli
pnpm --filter @wasm4pm/cli exec wpm \
  system doctor capabilities --format json
```

For production packaging, execute the release evidence ladder and retain the actual npm tarball:

```bash
pnpm run release:algorithm-reachability
pnpm run release:algorithm-behavior
pnpm run release:verify-algorithm-behavior
pnpm run examples:gate
pnpm run prepublish:pack-smoke
pnpm run release:certificate
pnpm run release:cert-auth
```

A certificate is accepted only when it recomputes against the same commit, package, tarball, WASM bytes, examples, and algorithm evidence that will be deployed.

## Configuration

Use the current configuration reference and schemas. Environment variables use the `WASM4PM_*` prefix where implemented. Treat configuration as admitted input:

- reject unknown or invalid values;
- record precedence between defaults, files, environment, and CLI flags;
- avoid secrets in configuration files committed to source;
- hash non-secret effective configuration when it affects behavior;
- record secret references, not secret values, in receipts.

## Filesystem and process authority

The doctor repair broker demonstrates the required pattern for machine changes:

1. Construct a registered intent.
2. Constrain paths to the admitted workspace.
3. Require explicit authority.
4. Persist a pending receipt.
5. Execute a structured action without shell strings.
6. Persist an outcome receipt.

Apply the same pattern to deployment, migration, package publication, and operational repair automation.

## Telemetry

Telemetry is disabled unless configured by the deployment. Before enabling it:

- inventory emitted span names and attributes;
- remove credentials, PII, and sensitive local paths;
- validate the collector endpoint and transport security;
- establish retention, access, and deletion policy;
- test collector failure behavior;
- record whether telemetry is required for a capability claim.

A configured OTLP endpoint is an external network boundary and must be included in threat modeling.

## Object-centric and live evidence

For object-centric production routes, execute and replay `wpm evidence session` against a representative admitted OCEL-v2 subject and the exact deployed WASM artifact.

For signed live admission, `wpm evidence live` requires:

- ordered AAT observations;
- signed zero-violation Weaver evidence;
- exact POWL route identity;
- exact WASM and release-certificate identity;
- signed MCP+ proof;
- Accepted passport and replayable bundle.

Authority public keys require a separate lifecycle: issuance, distribution, rotation, revocation, audit, and incident response.

## Air-gapped operation

Prepare an air-gapped bundle outside the restricted environment and verify it inside:

- source archive or package tarball;
- lockfiles and required dependency cache;
- Rust and Node toolchain identities if builds occur inside;
- generated WASM and declaration files;
- release evidence and certificate;
- independent verification commands;
- public authority keys and revocation material;
- SBOM or dependency inventory required by policy.

Do not describe an installation as air-gapped if dependency resolution or telemetry still reaches external services.

## Scaling and resource limits

Measure the exact workload and artifact. Record at least:

- event and object counts;
- trace/episode distribution;
- parser and algorithm configuration;
- concurrency;
- elapsed time;
- peak resident memory;
- WASM size and target;
- host runtime and architecture;
- refusal or timeout thresholds.

Use bounded inputs and typed resource refusals. A larger process limit without evidence is not an enterprise capability.

## Security and operations

Follow [`../SECURITY.md`](../SECURITY.md). Protect signing keys, service credentials, event data, receipts, and release artifacts. Validate backup and restore, disaster recovery, key rotation, rollback, and evidence retention through executed drills rather than policy text alone.

## Readiness

A deployment is `ALIVE` only for the exact admitted environment after its required health checks, real workload probes, receipt verification, replay, and rollback test pass. Repository or package readiness does not automatically establish deployment readiness.
