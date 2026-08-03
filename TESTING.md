<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: TESTING.md; source-sha256: 03a668d5f62d8c018ff78025862c779bdef9f4e989e6fd86d1888ca48214e9d6; reason: canonical validation and evidence discipline -->

# Testing and evidence

Tests establish standing only for the exact subject, runtime, configuration, and command they execute. Source inspection, declared tests, printed pass lines, or queued CI are not successful execution.

## Evidence vocabulary

Keep these facts separate:

- **Observed** — source, metadata, logs, or artifacts were read.
- **Admitted** — the subject and route passed input, identity, authority, and boundary checks.
- **Executed** — a command ran against the claimed subject.
- **Changed** — state was modified.
- **Verified** — an independent check recomputed or replayed the result.
- **Inferred** — a bounded conclusion was derived from evidence.
- **Refused** — admission rejected the subject with a typed reason.
- **Blocked** — a required edge could not be reached.

A lawful typed refusal can be a passing behavioral result. A process that prints passing tests but exits non-zero is not a clean pass.

## Validation ladder

Run the cheapest high-information boundary first, then expand only after it succeeds:

1. Static/type validation for the owning package.
2. Focused unit or property test.
3. Package integration test.
4. Real Node-target WASM execution.
5. Public CLI behavior and exit-code verification.
6. Receipt recomputation and replay.
7. Clean tarball install or deployment target.
8. Cross-platform and hosted CI.
9. Release-certificate closure.
10. Signed AAT-Live bundle replay when that capability is claimed.

Do not substitute a lower rung for a requested higher boundary.

## Baseline commands

Inspect the current scripts before relying on these starting points:

```bash
pnpm build
pnpm test
pnpm run lint

cargo check
cargo test --workspace

wasm-pack build wasm4pm --target nodejs --out-dir pkg -- --features wasm
cargo check --target wasm32-unknown-unknown --features wasm
```

Run Vitest from the owning package when a package script or configuration requires it. Build the target-specific WASM package before classifying loader failures as product defects.

## Doctor and BRCE tests

Doctor tests must prove:

- evidence ceilings prevent declared routes from being crowned;
- unknown capability and repair identifiers are refused;
- diagnosis performs no hidden mutation;
- actuation requires explicit authority;
- a pending receipt exists before DO;
- every attempted DO produces an outcome receipt or explicit receipt failure;
- dry-run cannot claim completed actuation;
- existing user configuration is not overwritten;
- structured process actions never invoke a shell string.

## OCEL-v2 session tests

The session boundary requires both positive and adversarial coverage:

- exact `load_ocel_v2` and `flatten_ocel_v2` exports execute;
- WASM flattening agrees with the independent TypeScript reader;
- POWL discovery, parsing, partial-order validation, and execution complete;
- identical subjects replay with identical hashes;
- output drift is detected;
- missing exports are typed unsupported;
- OCEL-v1/NDJSON are refused rather than silently routed through an adjacent implementation;
- empty, objectless, ungrouped, or divergent inputs fail at admission.

A mocked WASM object validates the composition calculus but cannot prove the compiled Rust/WASM artifact. Real-WASM execution remains a separate required rung.

## AAT-Live tests

Acceptance tests must use signed envelopes and exact identity bindings. Negative tests must include:

- forged Weaver signature;
- non-zero or violation-bearing Weaver report;
- forged MCP+ signature or non-Accepted proof;
- trace stage reordering or omission;
- session, route, WASM, manifest, or release identity drift;
- certificate verification for a different commit;
- replay drift;
- receipt persistence failure.

No passport may be created for a refused verdict.

## Release tests

Release verification must operate on real files from disk. It must reject:

- placeholder or fabricated values;
- missing package, tarball, WASM, example, reachability, or behavior evidence;
- package or version mismatch inside the tarball;
- stale Git identity;
- count and summary drift;
- per-algorithm receipt mismatch;
- certificate self-hash mismatch;
- any current-artifact binding mismatch.

Prove verifier sensitivity by tampering with a disposable copy, observing refusal, and restoring the valid artifact.

## Determinism

Deterministic tests use explicit seeds, sorted collections, stable serialization, bounded clocks, and exact input identities. Statistical tests must report seeds, trials, confidence rule, and failure threshold; they do not replace algebraic or domain invariants where those exist.

## Mocks and substitutes

Mocks are appropriate for narrow unit tests of adapters. They cannot establish:

- real WASM export behavior;
- filesystem or network integration;
- package installation;
- signature authority;
- release artifact integrity;
- browser/runtime portability;
- end-to-end receipt and replay closure.

Label fixtures, stubs, and test substitutes explicitly in both test names and final receipts.

## Test receipt

A defensible test report records:

```text
repository / ref / commit
subject and configuration
command
exit status
passed / failed / skipped / conditional counts
runtime and toolchain identity
artifacts or receipts produced
independent replay or verification
known exclusions and falsifiers
```

Never reconstruct counts from source grep when the test runner can provide them.
