<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: CONTRIBUTING.md; source-sha256: 945ba13e9b79cad6687cd3d497e25c68a0af5b1be36dc757ec66a233ba0a2cf7; reason: canonical contribution workflow -->

# Contributing to wasm4pm

Contributions are accepted when the smallest coherent change executes at its owning boundary and the resulting claim is bounded by evidence.

Read [`AGENTS.md`](AGENTS.md) and any nearer path-specific `AGENTS.md` before editing.

## Workflow

1. Resolve the target repository, base ref, and exact base SHA.
2. Inspect the current source, manifests, task runners, tests, generation policy, and CI commands.
3. Create or use a purpose branch; do not silently move the base.
4. Make the smallest coherent diff. Preserve unrelated changes.
5. Run the narrowest owning verifier, then expand the validation ladder.
6. Update active documentation or archive superseded narratives.
7. Inspect the final diff and generated status.
8. Commit intentionally, push without rewriting shared history, and open a draft PR.
9. Report exact commands, exits, artifacts, receipts, exclusions, and falsifiers.

Do not merge unless the repository owner explicitly requests it.

## Commit messages

Use conventional commits:

```text
feat(session): execute OCEL-v2 POWL replay
fix(release): reject stale certificate identity
docs(vision): align architecture with BRCE
```

Common types are `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, and `perf`.

## Change law

- No silent fallback from a real boundary to a substitute implementation.
- No arbitrary shell-string actuation.
- No unreceipted DO path.
- No hardcoded generated output when an ontology or generator owns it.
- No fixed counts or readiness claims unless generated and verified at the current ref.
- No weakened tests, fabricated evidence, or acceptance mocks.
- No new dependency unless the existing graph cannot lawfully express the requirement.
- No force push to shared branches.

Correct typed refusal is valid behavior when the real boundary produced it and the receipt/replay contract is satisfied.

## Generated cognition surfaces

Do not hand-edit generated breed registration, registry, TypeScript IDs, paper pointers, or anti-cheat projections identified by `AGENTS.md` and path-local doctrine.

The lawful route is:

```text
ontology
  → generator
  → generated projections
  → formal/runtime admission
  → receipt
  → replay
```

Run the repository generation command and `just ggen-gate` when those surfaces are in scope.

## Process-mining and WASM changes

A new or changed runtime capability should include:

- an implemented Rust/WASM path or an explicit unsupported boundary;
- a stable TypeScript/API/CLI route where the feature is public;
- valid input and typed invalid-input tests;
- determinism or explicitly bounded stochastic behavior;
- no panic or false success across WASM;
- exact target build and generated declaration inspection;
- receipt and replay evidence when the claim requires them.

Measure fitness, precision, generalization, simplicity, latency, or memory only where the contribution claims those properties. Record the fixture, configuration, toolchain, and command.

## BRCE and external effects

Features that modify files, launch processes, publish artifacts, call networks, or otherwise actuate must:

1. Construct a structured intent.
2. Validate subject, authority, path, and cost bounds.
3. Persist a pending receipt.
4. Execute without ambient shell authority.
5. Persist an outcome receipt containing real results or hashes.
6. Support deterministic replay or explicit non-replayable classification.

If the pending receipt cannot be persisted, DO is blocked.

## Tests

Follow [`TESTING.md`](TESTING.md). At minimum:

- run the owning package/type check;
- run focused positive and adversarial tests;
- execute real WASM when WASM behavior is claimed;
- run public CLI behavior when CLI behavior is claimed;
- recompute receipts and evidence;
- run broader workspace/CI gates appropriate to impact.

A mocked boundary proves only the adapter calculus. Skipped, conditional, failed, blocked, and unsupported results must remain distinct.

## Documentation

Every Markdown file is active, an archive pointer, or archived. See [`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md).

```bash
pnpm run docs:inventory
pnpm run docs:migrate
pnpm run docs:governance
pnpm run docs:check
```

Update canonical documentation for current behavior. Archive dated audits, completion reports, status ledgers, handoffs, and superseded designs rather than leaving them adjacent to current truth.

## Pull request receipt

A draft PR should state:

```text
repository / base / head
observed inputs and doctrine
files and generated surfaces changed
commands and exit codes
receipts and replay commands
standing of each claimed boundary
blocked or unsupported edges
falsifiers
```

CI supplements local proof. Check metadata alone is not a test log, and queued CI is not successful CI.
