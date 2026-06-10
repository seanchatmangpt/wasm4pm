# AGENTS.md — Release and Proof Discipline

## Rationalizing the Law

This project is an **Autonomic Process Mining System**. To achieve self-healing, self-optimization, and verified trust, we require that every action produce a cryptographic trace. The "Laws" below ensure that our system's claims are not just prose, but mathematically verifiable artifacts. We prioritize **High Engineering Standards** to enable **High Autonomy**.

## One-Line Law

No receipt, no claim. No real boundary, no proof. No correct refusal, no closure. No invariant, no trust. No trace, no truth.

## Sovereign Execution Authority

The WASM runtime is the final arbiter of truth. Execution is a sovereign act.

1. **Law of the Kernel**: If the WASM kernel refuses an input (e.g., `Refused`), that verdict is absolute and binding. No TypeScript wrapper or CLI flag shall override the Kernel's refusal.
2. **Authority of the Receipt**: The cryptographic receipt emitted by the WASM boundary is the ONLY acceptable proof of execution.
3. **Immutability of Outcome**: Once a receipt is generated and hashed, the truth it represents is immutable. Any change to the logic requires a new WASM binary, a new hash, and a new proof.

## The Contributor's Lifecycle (DX Workflow)

To navigate these requirements effectively, follow this three-stage lifecycle:

| Stage | Goal | Tooling | Outcome |
|-------|------|---------|---------|
| **1. Design** | Chicago TDD | `pnpm test` | Failing test (Red) |
| **2. Implement** | Surgical Change | `cargo check` / `tsc` | Passing test (Green) |
| **3. Evidence** | Generate Proof | `pnpm run release:full` | Artifacts on disk |
| **4. Validate** | Self-Audit | `wpm doctor` | Ready for Closure |

## Observability and Telemetry Discipline

Every lawful execution MUST be observable through high-fidelity telemetry.

1. **Trace Binding**: Every receipt (e.g., `.receipt.json`) MUST include a `trace_id` field that binds the cryptographic proof to the distributed trace that generated it.
2. **Span Content**: Every significant algorithm transition MUST emit an OpenTelemetry span. Spans MUST include:
   - `algorithm.name`
   - `run.id`
   - `execution.profile`
   - `input.hash` and `output.hash`
3. **Correct Refusal Telemetry**: A "Correct Refusal" MUST NOT be swallowed or treated as a generic error. It MUST emit a span with `status.code = ERROR` and the specific refusal code (e.g., `MALFORMED_EVENT_LOG`) in the `error.code` attribute.
4. **No Silent Drops**: If the OTel exporter drops spans (backpressure), the task state is `EvidenceIncomplete`. Closure requires 100% span delivery for the critical path.

## Prime Directive

Do not optimize for the smallest passing change.

This repository uses Combinatorial Maximalism: every meaningful feature, release, algorithm, route, and test must prove both successful behavior and correct refusal behavior through real boundaries and receipts.

## Deterministic Calculus & Linear Memory Sanctuary

Truth is manufactured within the sanctuary of isolated linear memory.

1. **The Sanctuary Rule**: WASM linear memory is an isolated domain. All state transitions within this domain MUST be provably free from side effects of the host environment (no direct syscalls, no unmanaged entropy, no global clocks).
2. **The Execution Calculus**: Every execution must be a pure function: `f(Binary_Hash, Input_Hash, Seed, Params) -> (Output, Receipt_Hash)`.
3. **Rank-1 Determinism**: All algorithms (except those explicitly marked as stochastic) MUST satisfy bit-exact identity across runs. Stochastic algorithms MUST satisfy bit-exact identity given the same seed.
4. **No Hidden State**: No execution shall rely on hidden or unreceipted state. If a transition depends on previous outcomes, those outcomes MUST be provided as cryptographically bound inputs.

A task is not complete because code was changed.
A task is complete only when the relevant evidence artifacts exist, verify, and bind to the current commit.

## State Classification Table

Before claiming completion, classify your work:

| State | Meaning | Action |
|-------|---------|--------|
| **Closed** | All boundaries pass, receipts verify, artifacts committed. | Submit PR. |
| **PrePublishOnly** | Local work complete, blocked by publish step. | Prepare for release. |
| **EvidenceIncomplete** | Code works but artifacts/proofs are missing. | Run evidence commands. |
| **InfrastructureBlocked**| Blocked by external services (Supabase, npm). | Document blocker. |
| **ReceiptTheaterDetected**| Artifacts exist but fail verification or are fake. | Fix verification logic. |

## Forbidden Completion Patterns

Never claim completion from:

- walkthrough.md
- prose summaries
- sample JSON
- placeholder hashes
- hidden command output
- one happy-path test
- skipped runtime boundary
- local-only success
- a passing unit test that bypasses the real product path
- future-tense statements such as “will be produced after publish”
- narrative phrases such as “fully closed,” “ready,” or “verified” without artifact proof

If the proof is not visible from disk, command output, or app UI, the task is not closed.

## Required State Classification

Every final response must include a state classification.

Use one of:

- Closed
- PrePublishOnly
- InfrastructureBlocked
- RegistryAdmissionBlocked
- ReceiptTheaterDetected
- BehaviorEvidenceMissing
- RuntimeBoundaryFailed
- NeedsHumanCredential
- BlockedFromClosure

Never say Closed unless all required real-boundary checks pass and receipts verify.

## Receipt Rules

A receipt must contain real, recomputable values.

Invalid receipt values include:

- ...
- placeholder
- sample
- fake
- stub
- verified_via_gate
- calculated_at_runtime
- tarball_not_found
- TODO
- assume success

Every release receipt must bind to:

- package name
- package version from package.json
- current git commit
- tarball name
- tarball integrity or hash
- WASM bundle hash where applicable
- examples manifest hash
- behavior evidence hash
- reachability evidence hash

Every receipt hash must be recomputable by a verifier.

## Algorithm Evidence Rules

Do not count an algorithm as verified unless all of the following are true:

- registry entry exists
- TypeScript dispatch exists
- CLI surface exists where claimed
- WASM export exists where required, or absence has a structured reason
- **Totality:** The algorithm handles the entire valid input space; all edge cases result in either a valid output or a typed refusal.
- **Positive Evidence:** At least one positive case passes with a recomputable receipt.
- **Negative Evidence:** At least one negative case fails correctly with a typed refusal code.
- **Algebraic Invariant:** At least one mathematical property (e.g., Symmetry, Identity, Monotonicity, or Idempotency) is verified via property-based sampling.
- **Witness Generation:** For claims of formal properties (e.g., Soundness, Deadlock-freedom), the receipt includes a recomputable witness (e.g., a reachability graph hash or firing sequence).
- failure uses a typed failure code
- no panic, unhandled exception, silent fallback, or false success occurs
- behavior evidence receipt exists
- behavior evidence hash recomputes

The release must include:

- ALGORITHM_REACHABILITY_EVIDENCE.v${VERSION}.json
- ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json
- ALGORITHM_BEHAVIOR_MATRIX.v${VERSION}.md
- algorithm behavior receipts
- updated RELEASE_CERTIFICATE.v${VERSION}.json

## Correct Failure Is Success

A correct refusal is a successful boundary operation.

Examples:

- malformed log refuses with MALFORMED_EVENT_LOG
- empty event log refuses with EMPTY_EVENT_LOG
- missing activity key refuses with MISSING_ACTIVITY_FIELD
- missing timestamp refuses with MISSING_TIMESTAMP_FIELD
- invalid model handle refuses with INVALID_MODEL_HANDLE
- unsupported profile refuses with UNSUPPORTED_PROFILE
- receipt mismatch refuses with RECEIPT_HASH_MISMATCH

**The Refusal Coverage Rule:** A refusal path is not considered "proven" until a receipt exists for that specific typed failure code. Do not treat a generic 400/500 as a correct refusal.

Do not convert refusals into generic errors.
Do not treat thrown panics as correct failure.

## Real Boundary Rule

Tests must exercise the real boundary for the claim being made.

For release work, prove:

- registry to dispatcher
- dispatcher to CLI
- CLI to WASM where applicable
- example to receipt
- behavior case to evidence file
- evidence file to certificate
- package source to npm tarball
- tarball to clean install

For app work, prove:

- service or hook path
- local persistence
- sync queue
- Supabase boundary
- Edge Function where applicable
- receipt row
- receipt verification
- app-visible receipt surface

Do not replace real boundaries with mocks, fake clients, manual props, or sample results.

## Version Rule

Never hardcode release versions in reusable scripts.

Version source of truth:

- package.json

Scripts must compute:

- VERSION
- TAG=v${VERSION}
- RELEASE_CERTIFICATE.v${VERSION}.json
- POST_PUBLISH_RECEIPT.v${VERSION}.json

A CLI version argument is allowed only if it matches package.json.

## Publish Rule

Do not publish from the monorepo root unless that is the intended npm artifact.

Before publish, prove:

- git status is clean
- package name is correct
- npm pack target is correct
- package size and file count are expected
- tarball contents inspected
- no secrets, env files, private files, or unintended artifacts are included
- pack smoke installs from tarball in a clean temp project
- release certificate binds to the tarball

Do not use recursive publish unless every workspace package is intended to publish and every package has its own release certificate.

## Required Evidence Commands

When claiming release readiness, show actual output for:

- `git status --short`
- `git rev-parse HEAD`
- `node -p "require('./package.json').version"`
- `pnpm run release:full`
- `pnpm run release:algorithm-behavior`
- `pnpm run release:verify-algorithm-behavior`
- `pnpm run examples:gate`
- `pnpm run examples:verify-receipts`
- `pnpm run cli:parity`
- `pnpm run prepublish:pack-smoke`
- `pnpm run release:pack-contents`
- `pnpm run release:certificate`
- `npm pack --dry-run`
- `npm publish --dry-run`
- `cargo check && cargo test --lib --workspace`
- `cargo publish --dry-run --allow-dirty --workspace`

Also show actual files from disk:

- RELEASE_CERTIFICATE.v${VERSION}.json
- ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json
- ALGORITHM_REACHABILITY_EVIDENCE.v${VERSION}.json
- examples manifest
- representative positive behavior receipt
- representative structured-failure receipt
- representative invariant receipt

## Boundary Proof Verification (Ostar Doctor & Auditor)

Before claiming release readiness, you MUST prove that the verifiers actually work by intentionally corrupting an artifact (e.g. modifying a receipt hash) and verifying that the `release:verify-algorithm-behavior` and/or `verify-receipt-authenticity.ts` scripts correctly reject the corrupted state. This prevents "Receipt Theater".

## Blocker Handling

If infrastructure fails, do not proceed to the next layer.

Examples:

- Supabase unavailable means InfrastructureBlocked
- Kong unreachable means InfrastructureBlocked
- npm auth failure means RegistryAdmissionBlocked
- npm package name mismatch means PackageIdentityBlocked
- invalid hash in receipt means ReceiptTheaterDetected
- hidden command output means EvidenceIncomplete

A blocker is not an excuse to continue. It is the current lawful outcome.

## Sovereign Execution & Security Discipline

### One-Line Law of Sovereignty
Execution is only sovereign if it is isolated, immutable, and verified.

### Credential & PII Protection
- **Zero-Credential Commits:** Never stage or commit `.env`, `*.key`, or private configuration.
- **Sanitized Artifacts:** Receipts and observability logs MUST NOT contain credentials, PII, or sensitive host-specific metadata.
- **Redaction-by-Default:** Algorithms processing sensitive fields must redact data in output artifacts unless explicitly configured for "High-Fidelity Debugging" (which blocks release).

### Zero-Trust Boundary Rules
- **Untrusted Host:** The host environment (Node.js/OS) is untrusted. All data crossing the host-to-WASM boundary MUST be validated by the "Court of Admissibility" (Schema + Typestate) before reaching the Execution Authority.
- **Adversarial Input Refusal:** Malformed inputs (e.g., recursive XES, payload bombs) MUST be refused with specific failure codes (e.g., `RESOURCE_EXHAUSTED`, `MALFORMED_INPUT`).
- **Sovereign Bypass:** Any attempt to execute an algorithm outside of the `VALID_TRANSITIONS` or with an unvalidated handle MUST trigger a `SECURITY_HALT`.

## Package Identity Gate

The package identity in all release evidence must match the exact npm artifact being published.

For wasm4pm, the npm package is unscoped:

wasm4pm

Invalid package identities include:

@wasm4pm/kernel
wasm4pm-monorepo
@wasm4pm/*
workspace package aliases

Before claiming release readiness, show:

`node -p "require('./packages/kernel/package.json').name + '@' + require('./packages/kernel/package.json').version"`

Expected:

`wasm4pm@<version>`

The release certificate, reachability evidence, behavior evidence, example receipts, npm pack output, and post-publish receipt must all use the same package identity.

For Cargo (Rust), all workspace members MUST use the exact same version string as the root `Cargo.toml` (which must match `package.json`) to ensure dependency consistency during `cargo publish`. Any mismatch in path dependency versions is a state of `PackageIdentityMismatch`.

If any artifact uses a different package identity, state is PackageIdentityMismatch.

## Evidence Completeness Gate

Do not summarize partial evidence as closure.

A transcript is incomplete if any of the following are true:

- command output is hidden, folded, truncated, or replaced by summaries
- JSON output is excerpted rather than shown from disk
- receipt files are described but not printed or verified
- a directory count is claimed but `find` / `ls` output is not shown
- a hash is shown but recomputation output is not shown
- a representative receipt is shown but the full manifest is not shown
- command output contains duplicated pasted sections
- command output contains malformed or repeated JSON fragments
- final grep/placeholder scan output is missing
- git status is not shown after artifact generation
- final package identity is not shown from the actual package being published

If evidence is incomplete, final state must be:

EvidenceIncomplete

not:

Closed
Ready
Verified
Sealed
Admitted

The agent must explicitly say which evidence is missing and provide the next command to obtain it.

## No Representative-Only Closure

Representative receipts are useful for review, but they do not prove global closure.

A representative `dfg.receipt.json` proves only that one algorithm receipt exists.

Do not claim 60/60 behavior closure unless all of the following are shown or verified:

- ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json exists
- the evidence file contains exactly 60 algorithm rows
- each row has at least one positive case
- each row has at least one negative case
- each row has at least one invariant case
- each row has an algorithm_evidence_hash
- the top-level behavior_evidence_hash recomputes
- `find artifacts/release/algorithm-behavior-receipts -name '*.receipt.json' | wc -l` matches the expected receipt count
- `release:verify-algorithm-behavior` passes from the committed state
- RELEASE_CERTIFICATE.v${VERSION}.json embeds the behavior_evidence_hash

Never infer global closure from one representative receipt.

## Required Final Proof Block

For release or evidence tasks, the final response must include this exact proof block.

State:
<Closed | PrePublishOnly | EvidenceIncomplete | RegistryAdmissionBlocked | ReceiptTheaterDetected | InfrastructureBlocked>

Commit:
<output of git rev-parse HEAD>

Tree:
<output of git status --short>

Package:
<output of node -p "require('./packages/kernel/package.json').name + '@' + require('./packages/kernel/package.json').version">

Commands:
- <exact command run>: <pass/fail>

Artifacts:
- <path>: <exists/hash/count>

Receipts:
- reachability evidence: <hash/count>
- behavior evidence: <hash/count>
- examples evidence: <hash/count>
- release certificate: <hash>

Verifier Output:
- release:verify-algorithm-behavior: <pass/fail>
- release:certificate: <pass/fail>
- placeholder scan: <pass/fail>

Remaining Blockers:
- <none or exact blocker>

Next Command:
<single exact command>

## Disk Artifact Rule

When asked to show receipts or evidence, use `cat`, `jq`, `find`, `sha256sum` / `shasum`, and verifier commands against files on disk.

Do not reconstruct JSON in prose.
Do not paste a manually assembled sample.
Do not show a representative object and call it the artifact.
Do not use “summary” as a replacement for the actual file.

Valid examples:

- `cat artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v$(node -p "require('./package.json').version").json`
- `jq '.algorithms | length' artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json`
- `jq '.summary' artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json`
- `find artifacts/release/algorithm-behavior-receipts -name '*.receipt.json' | wc -l`
- `shasum -a 256 artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json`
- `pnpm run release:verify-algorithm-behavior`

The only valid source of truth is the file system plus verifier output.

## No Blind Git Add

Never run:

git add .

for release, evidence, certificate, package, or publish work.

Use explicit paths.

Required:

git status --short
git diff --stat
git diff -- <each changed source file>
git add <specific intended files>

Before committing, confirm no unintended artifacts, temp files, secrets, hidden outputs, local env files, or bulky generated outputs are staged.

## Algorithm Behavior Evidence Closure Rule

For algorithm behavior evidence, closure requires all four domains:

1. Reachability
   - 60/60 registry entries
   - 60/60 dispatch entries
   - CLI/WASM mapping as claimed

2. Behavior
   - 60/60 positive cases pass
   - 60/60 negative cases fail correctly with specific refusal receipts
   - 60/60 algebraic invariants pass or have structured nondeterministic invariant
   - 60/60 witness objects verify against output (for formal property claims)
   - no panic, unhandled exception, silent fallback, or false success

3. Receipts
   - every algorithm row has receipt evidence for success, refusal, and invariant
   - every evidence hash recomputes
   - behavior_evidence_hash recomputes

4. Certificate Binding
   - release certificate embeds reachability hash
   - release certificate embeds behavior evidence hash
   - release certificate embeds examples manifest hash
   - release certificate embeds tarball/package artifact hash

If any domain is missing, state is BehaviorEvidenceMissing or EvidenceIncomplete.

## Final Law

Enumeration is not execution.
Representative evidence is not global evidence.
Summary is not receipt.
Receipt is not closure unless it verifies from disk and binds to the current commit.

## Final Response Format

Every task response must include:

1. State classification
2. Commands actually run
3. Artifacts actually changed
4. Receipts actually emitted
5. Verification results
6. Remaining blockers
7. Exact next command

Do not say “done” if any blocker remains.
Do not say “closed” unless all closure gates pass.
