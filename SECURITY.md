<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: SECURITY.md; source-sha256: 8d6f49d875d6b4e3334adfac10fa0ed5860c98c14ef4aae76cb3d049fd41caac; reason: canonical security policy -->

# Security policy

## Reporting a vulnerability

Do not disclose an unpatched vulnerability in a public issue, discussion, pull request, receipt, or telemetry stream.

Send a private report to `xpointsh@gmail.com` with subject `[SECURITY] wasm4pm`. Include:

- affected repository path, package, version, and commit when known;
- reproduction steps or a minimal proof of concept;
- required configuration and runtime;
- security impact and trust boundary crossed;
- whether credentials, personal data, signatures, receipts, or release artifacts are involved;
- suggested mitigation if available.

Do not include live credentials, private signing keys, regulated data, or third-party personal data. Use redacted fixtures and coordinate a secure transfer method when sensitive artifacts are necessary.

Receipt of a report does not imply a fixed response or remediation deadline. Maintainers will acknowledge and triage reports as capacity and severity permit.

## Supported software

Security support applies to the current repository and explicitly maintained published artifacts. A historical tag, archived document, generated example, development CLI, or unverified package mirror is not automatically supported.

Before reporting version impact, capture the exact package identity, artifact hash, target, and commit where possible.

## Trust boundaries

Security review should consider:

- untrusted XES, OCEL, POWL, configuration, and evidence inputs;
- host-to-WASM serialization and memory limits;
- filesystem paths and archive extraction;
- subprocess arguments and shell authority;
- telemetry endpoints and sensitive attributes;
- Supabase or other external credentials and row-level permissions;
- Ed25519 authority keys and signature envelopes;
- npm tarballs, generated WASM, release certificates, and supply-chain identity;
- receipt integrity, replay, and cross-subject substitution.

WASM linear memory is a useful isolation boundary, not a complete security proof. Host imports, resource exhaustion, parser behavior, generated glue, runtime implementation, and application authorization remain in scope.

## Input and actuation requirements

- Validate size, recursion, schema, object identity, and bounded costs before execution.
- Use typed refusals rather than panic, silent truncation, or false success.
- Treat model/planner output and hooks as untrusted intents without ambient authority.
- Use structured argument vectors with `shell: false` for subprocesses.
- Normalize and constrain filesystem paths to the admitted workspace.
- Persist a pending receipt before authorized external effects and an outcome receipt afterward.
- Never place secrets, private keys, raw credentials, PII, or sensitive local paths in receipts.

## Cryptographic evidence

A signature proves only that the corresponding key signed the exact bytes. Security-sensitive admission must also verify:

- canonical serialization and domain separation;
- public-key authority and lifecycle;
- subject, route, artifact, manifest, and commit identity;
- replay resistance or explicit replay semantics;
- certificate and evidence self-hashes;
- independent recomputation from current artifacts.

A valid report or certificate for one subject must not authorize another subject.

## Telemetry and external services

Telemetry and integrations must be explicitly configured. Review current source and deployment configuration to determine actual network calls, data fields, retention, and credentials. Do not rely on archived statements that the system makes no outbound calls.

## Dependency and release security

Security-sensitive release work should execute, as applicable:

```bash
cargo audit
cargo deny check
pnpm audit
pnpm run prepublish:pack-smoke
pnpm run release:certificate
pnpm run release:cert-auth
```

Inspect the actual npm tarball, generated WASM, package manifest, evidence files, and exact Git identity. A queued or declared workflow is not proof that these checks passed.

## Disclosure process

Maintainers may request clarification, reproduce on a private branch, coordinate a fix and release, and publish an advisory after affected users have a reasonable mitigation path. Public attribution and disclosure timing should be agreed with the reporter.
