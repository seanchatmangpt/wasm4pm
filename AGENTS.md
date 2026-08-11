# AGENTS.md — Authoritative Agent Contract for wasm4pm

This file is the repository-wide operating contract for every coding agent,
regardless of model, vendor, editor, shell, or orchestration system.

`AGENTS.md` is the sole normative agent document for this repository.
`CLAUDE.md` and `GEMINI.md` are compatibility pointers only.

A more specific `AGENTS.md` in a subdirectory overrides this file for work
under that directory.

Hosted ChatGPT agents working through the GitHub connector or an ephemeral
cloud shell must also read `CHATGPT-CLOUD-AGENTS.md`. Local agents, including
Claude Code, may skip that file unless their runtime has the same constraints.

## 1. First principles

### 1.1 Claims may not exceed evidence

Keep these states distinct:

- **Observed**: source, metadata, logs, or artifacts were read.
- **Executed**: a command actually ran against the claimed checkout or artifact.
- **Changed**: a file, branch, issue, pull request, or artifact was modified.
- **Verified**: an independent check recomputed or exercised the claimed fact.
- **Inferred**: a conclusion was derived from observed evidence.
- **Blocked**: the required boundary could not be reached.

Examples:

- Reading a test file proves that tests are declared, not that they pass.
- Reading a script proves what it invokes, not that it succeeds.
- A green workflow proves only the commands and commit covered by that run.
- A receipt file proves that bytes exist, not that its hash recomputes.
- A diagram can be coherent and still describe behavior that is not wired.

The compact law is:

> No execution claim without execution. No closure claim without verified
> evidence. No architecture claim without an implemented path.

### 1.2 Real boundaries outrank wrappers

The real runtime boundary is authoritative.

- A WASM refusal may not be converted into success by TypeScript, a CLI, or UI.
- A generic exception is not a typed domain refusal.
- A mocked boundary cannot prove the production boundary.
- A local source pass cannot prove a packed, installed, or published artifact.
- A representative receipt cannot prove global behavior closure.

### 1.3 Correct refusal is successful behavior

A lawful refusal is a valid outcome when it:

- is produced by the real boundary;
- uses a stable typed refusal code;
- avoids panic, silent fallback, and false success;
- emits the required receipt or evidence artifact;
- can be recomputed or replayed where the claim requires it.

### 1.4 Determinism is a repository property

Deterministic paths must not depend on unordered iteration, host entropy,
hidden clocks, or unreceipted state.

Use:

- `BTreeMap` and `BTreeSet`;
- explicitly sorted vectors;
- repository-provided seeded RNG helpers;
- explicit inputs for state that affects output;
- stable serialization before hashing.

## 2. Instruction precedence

Use this order when instructions conflict:

1. Platform and safety constraints.
2. The user's current request and explicit scope.
3. The nearest path-specific `AGENTS.md`.
4. This root `AGENTS.md`.
5. Current source, manifests, build recipes, and tests.
6. Other documentation and historical notes.

Documentation is subordinate to current executable source when they disagree.
Record the drift instead of silently choosing whichever source is convenient.

## 3. Repository orientation

`wasm4pm` is a process-mining platform with two primary implementation layers:

1. Rust and WASM core algorithms.
2. A TypeScript monorepo containing packages, applications, examples, and the
   published `wpm` CLI.

Important paths:

- `wasm4pm/`: Rust/WASM process-mining core.
- `crates/wasm4pm-cognition/`: cognition breeds and WASM cognition layer.
- `crates/prolog8/`: Prolog-related runtime.
- `apps/wasm4pm/`: published TypeScript `wpm` CLI.
- `crates/wasm4pm-cli/`: Rust development CLI, not the published CLI.
- `packages/`: TypeScript workspace packages.
- `apps/`: applications.
- `examples/`: runnable examples, including InterviewAssist.
- `ocel/models/l1/`: OCPN models.
- `ocel/reports/`: measured fitness and admission evidence.
- `artifacts/release/`: release evidence and certificates when generated.

Primary references:

- `docs/explanation/architecture_overview.md`
- `WASM_API.md`
- `TESTING.md`
- `Justfile`
- `Makefile`
- root and package-level `package.json` files

Do not reconstruct package counts, breed counts, routes, or release standing
from memory. Re-read the target ref.

## 4. Versioning and package identity

The project uses CalVer `vYY.M.D`.

- The patch component is the day of the month.
- It never increments beyond 31.
- Same-day variants append `a`, `b`, `c`, and so on.

Never hardcode a release version in reusable scripts when a manifest is the
source of truth.

For npm release evidence, verify the exact artifact identity being published.
The repository root package is private and is not automatically the published
artifact.

For Cargo release work, verify workspace version consistency from current
manifests before making a release claim.

`wasm4pm-compat` is crates.io-only in this repository. Never add it as a path
dependency.

`prolog8` is both a workspace-internal path dependency and published to
crates.io — reference it via `prolog8 = { workspace = true }`, not a
hand-written `path`-only line (a path-only dependency fails
`cargo publish --dry-run` manifest verification for any crate that depends
on it). Because `prolog8` is published separately, a version bump to it must
land on crates.io before (or in the same release step as) publishing any
crate that depends on the new version — `cargo publish` resolves against
crates.io, not the local path, so a bumped-but-unpublished `prolog8` blocks
downstream crates' real publish even though `--dry-run`'s local manifest
check passes.

## 5. Understand commands before relying on them

Command names do not prove their scope. Inspect `Justfile`, `Makefile`, and the
relevant package manifest before using a shortcut as evidence.

Current important semantics include:

- `just test` delegates to `make test`, which runs tests in `wasm4pm/`.
- `just test-full` delegates to `make verify-ts`.
- `make verify-ts` intentionally excludes packages with known WASM-build or V8
  worker constraints.
- `just ci` expands to `polish`, `test-full`, and `anticheat`, so it inherits the
  `test-full` exclusions.
- root `pnpm test` runs recursive integration tests for workspaces with tests.
- root `pnpm build` recursively invokes package build scripts where present.
- `just ggen-gate` validates generated cognition surfaces and receipt bridging.
- `pnpm run docs:check` runs Markdown lint and link checking.
- `pnpm run release:full` is a release-evidence workflow, not an ordinary unit
  test command.

Baseline language gates are:

```bash
pnpm build && pnpm test
cargo check && cargo test
wasm-pack build --target nodejs --out-dir pkg -- --features wasm
cargo check --target wasm32-unknown-unknown --features wasm
```

These are starting points, not universal proof commands. Validate the package,
boundary, target, and artifact changed by the task.

## 6. Test discipline

### 6.1 Run the owning test boundary

Run Vitest from the owning package directory unless the package scripts prove a
different invocation is canonical.

For requested file-level results, execute the exact files and preserve:

- passed tests;
- failed tests;
- skipped or conditional tests;
- process exit status;
- relevant runtime prerequisites.

Do not derive executed counts using source grep patterns. Forms such as
`it.runIf`, `it.skip`, parameterized tests, and helper wrappers make static
counting unreliable.

### 6.2 A printed pass count is not always a clean pass

A process that prints passing tests and then exits non-zero from `SIGABRT`, a
worker crash, or teardown failure is not a clean pass. Report both facts.

Several TypeScript packages can pass in isolation but crash when loaded in
parallel with WASM consumers. Follow the independent package commands recorded
in `Makefile` when those packages are in scope.

Some tests require a Node-target WASM bundle. Build the declared target before
classifying loader failures as product failures.

Conditional tests may skip when Ollama, browsers, datasets, credentials, or
other live dependencies are unavailable. Skipped is neither passed nor failed.

### 6.3 Tests must have teeth

A proof-oriented test must fail when the claimed property is intentionally
broken.

For paper-grounded cognition tests:

- assert the published value with an appropriate tolerance;
- assert provenance, not merely output shape or matching strings;
- fail loudly when a required fixture is missing;
- do not silently skip absent fixtures;
- tamper with the implementation or fixture, confirm failure, then restore it.

A breed test passing does not automatically prove the algorithm is correct.

### 6.4 Known implementation gotchas

- `WasmLoader` is a singleton; reset it between tests.
- Use `to_js_str()` where host-style JSON conversion fails on wasm32.
- Verify current wasm32 field names rather than copying host-only examples.
- Cognition randomness must use the repository seeded RNG path.
- `CognitionBreed::postconditions` currently takes `(&self, input, output)`.
- Deterministic collections must not rely on `HashMap` iteration order.
- Environment variables use the `WASM4PM_*` prefix.
- Exit codes are currently: 0 success, 1 configuration, 2 source, 3 execution,
  4 partial, and 5 system.

## 7. Generated cognition surfaces

The following files are generated and must not be hand-edited:

- `crates/wasm4pm-cognition/src/breeds/registration.rs`
- `crates/wasm4pm-cognition/breeds/registry.json`
- `packages/cognition/src/breed-ids.ts`
- `crates/wasm4pm-cognition/tests/paper_pointers_generated.rs`
- `crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs`

Change the admitted source in `ggen/ontology/breeds.ttl`, run `ggen sync`, and
validate with:

```bash
just ggen-gate
```

Breed admission is evidence-derived.

A breed may become `PARTIAL_ALIVE` only when the required measured evidence is
present and the generation gates project that standing. Do not hand-flip
`registry.json`.

Paper-pointer assertions and decoys must remain separated from production
source as required by the anti-cheat gates.

## 8. Source and architecture truth

Documentation must distinguish:

- implemented behavior;
- intended architecture;
- generated surfaces;
- fixtures and test substitutes;
- proposed work;
- unsupported behavior;
- broken composition paths.

For source-grounded documentation:

1. Read current source at the target ref.
2. Cite exact paths and symbols.
3. Verify every claimed route, script, adapter, and generated file exists.
4. Trace runtime edges through actual calls, not file-name proximity.
5. Re-run searches after editing to catch renamed or removed paths.
6. Re-read the committed document after the write.

Specific distinctions that must remain explicit:

- Node filesystem persistence is not browser persistence.
- A static capability catalog is not an execution route.
- Semantic event replay is not receipt-chain verification.
- A receipt emitter existing in source does not prove end-to-end composition.
- Two architectural rails are not one runtime until a composition root wires
  them together.

## 9. Multi-agent and git discipline

Multiple agent fleets may edit this repository simultaneously.

Before changing files in a local checkout:

```bash
git status -sb
git diff --stat
git diff -- <intended-paths>
```

Rules:

- Preserve unrelated user and agent changes.
- Use a dedicated worktree when concurrent edits may collide.
- Treat other agents' output as untrusted until reviewed.
- Do not rebase shared fleet branches.
- Integrators union branches explicitly with merge commits where required.
- Never use `git add .` for mixed or evidence-sensitive work.
- Stage explicit intended paths.
- Inspect the staged diff before committing.
- Do not claim a clean tree without checking it.
- Never merge, publish, delete branches, or rewrite history without explicit
  authorization.

If diagnostics change between runs without corresponding edits, investigate
concurrent work or an unstable runtime before modifying unrelated code.

## 10. Security and artifact hygiene

Never commit:

- `.env` files;
- private keys;
- credentials or tokens;
- PII;
- host-specific secrets;
- accidental large generated output;
- unredacted sensitive logs.

Data crossing host-to-WASM boundaries must be validated before execution.
Malformed, recursive, oversized, or adversarial inputs must produce typed
refusals rather than panics or silent truncation where the contract requires it.

Receipts and telemetry must not expose credentials, PII, or sensitive local
paths.

## 11. Evidence and receipt rules

A receipt must contain real, recomputable values.

Invalid evidence includes placeholders such as:

- `sample`;
- `fake`;
- `stub`;
- `TODO`;
- `assume success`;
- `calculated_at_runtime` without the calculated value;
- a missing artifact described only in prose.

Where applicable, release evidence must bind to:

- package identity and version;
- current commit;
- tarball name and integrity;
- WASM bundle hash;
- examples manifest hash;
- reachability evidence hash;
- behavior evidence hash;
- release certificate hash.

Hash values must be recomputable by a verifier.

Enumeration is not execution. A representative receipt is not global evidence.
A certificate is not closure unless its embedded hashes recompute against the
current artifacts and commit.

## 12. Algorithm closure requirements

Do not count an algorithm as behavior-verified unless the claimed surface has:

- a registry entry;
- dispatcher reachability;
- the claimed CLI or API surface;
- the required WASM export, or a structured reason for its absence;
- at least one positive case;
- at least one typed negative case;
- at least one relevant invariant or property case;
- no panic, unhandled exception, silent fallback, or false success;
- recomputable evidence and receipt hashes.

Formal claims such as soundness or deadlock freedom require a recomputable
witness, not only a Boolean result.

Global closure requires global evidence. Do not infer complete behavior closure
from one algorithm, one receipt, one matrix row, or one happy path.

## 13. Release and publish discipline

Release work must prove the complete claimed chain, including the relevant
subset of:

- registry to dispatcher;
- dispatcher to CLI or API;
- CLI or API to WASM;
- example to receipt;
- behavior case to evidence file;
- evidence file to release certificate;
- package source to tarball;
- tarball to clean install;
- published artifact to post-publish verification.

Before publishing:

- verify the exact package target;
- inspect `npm pack` output and tarball contents;
- ensure no secrets or unintended files are included;
- install from the tarball in a clean temporary project;
- bind the release certificate to the tarball;
- prove package identity consistency across all evidence.

Do not recursively publish every workspace unless every package is intentionally
part of the release and has its own evidence.

For release-readiness claims, preserve actual output for the commands that are
in scope, including as applicable:

```bash
git status --short
git rev-parse HEAD
pnpm run release:full
pnpm run release:algorithm-reachability
pnpm run release:algorithm-behavior
pnpm run release:verify-algorithm-behavior
pnpm run examples:gate
pnpm run cli:parity
pnpm run prepublish:pack-smoke
pnpm run release:certificate
npm pack --dry-run
npm publish --dry-run
cargo check
cargo test --workspace
cargo publish --dry-run --allow-dirty --workspace
```

Inspect the actual evidence files from disk with tools such as `cat`, `jq`,
`find`, and a hash utility. Do not reconstruct artifact JSON in prose.

Prove that verification has teeth by corrupting a disposable copy of an
artifact, confirming the verifier rejects it, and restoring the valid state.

## 14. State classification

For ordinary work, use:

- **Completed**: the requested deliverable exists and required available checks
  passed.
- **Partial**: useful work was delivered, but a required check or boundary
  remains incomplete.
- **Blocked**: the requested deliverable or required boundary could not be
  reached.

For release and proof-closure work, use the most precise state:

- **Closed**
- **PrePublishOnly**
- **EvidenceIncomplete**
- **InfrastructureBlocked**
- **RegistryAdmissionBlocked**
- **PackageIdentityBlocked**
- **BehaviorEvidenceMissing**
- **RuntimeBoundaryFailed**
- **ReceiptTheaterDetected**
- **NeedsHumanCredential**
- **BlockedFromClosure**

Never say `Closed` unless every required real boundary passed, receipts verify,
and the evidence binds to the current commit.

A final report should identify, as applicable:

```text
State:
Target ref or commit:
Files changed:
Commands actually executed:
Validation observed:
Commands not executed:
Artifacts and receipts:
Remaining blockers:
Pull request:
Next command:
```

## 15. Stop conditions

Stop the current execution layer and report the exact result when any of these
occur:

- Rust diagnostics matching `error[E`;
- test output containing `FAILED`;
- `FM-5 violation`;
- panic or `SIGABRT`;
- new diagnostics introduced by the change;
- receipt verification failure;
- generated-surface drift;
- package identity mismatch;
- missing credentials required for a protected operation;
- unavailable infrastructure required by the claim;
- branch, working-tree, or blob-SHA drift that makes a write unsafe.

A blocker is a valid result. Fabricated closure is not.

## 16. Forbidden agent behavior

Never:

- invent command output, hashes, receipts, counts, or filesystem state;
- call declared tests passed tests;
- cite stale paths without re-verifying them;
- convert intended architecture into implemented behavior;
- hand-edit generated cognition surfaces;
- hide skipped tests or non-zero process exits;
- silently broaden changed-file scope;
- overwrite unrelated work;
- stage all files blindly;
- use a generic green workflow as proof of a different command;
- publish or merge without explicit authorization;
- say `verified`, `fully working`, or `closed` when the required boundary was
  unavailable.
