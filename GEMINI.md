# AGENTS.md — Release and Proof Discipline

## One-Line Law

No receipt, no claim. No real boundary, no proof. No correct refusal, no closure.

## Prime Directive

Do not optimize for the smallest passing change.

This repository uses Combinatorial Maximalism: every meaningful feature, release, algorithm, route, and test must prove both successful behavior and correct refusal behavior through real boundaries and receipts.

A task is not complete because code was changed.
A task is complete only when the relevant evidence artifacts exist, verify, and bind to the current commit.

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
- at least one positive case passes
- at least one negative case fails correctly
- at least one invariant case passes
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

- git status --short
- git rev-parse HEAD
- node -p "require('./package.json').version"
- npm run release:full
- npm run release:algorithm-behavior
- npm run release:verify-algorithm-behavior
- npm run examples:gate
- tsx scripts/release/verify-receipt-authenticity.ts
- npm run cli:parity
- bash scripts/release/verify-pack-smoke.sh ${VERSION}
- npm run release:certificate
- npm pack --dry-run
- npm publish --dry-run
- cargo check && cargo test --lib --workspace
- cargo publish --dry-run --allow-dirty --workspace

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

node -p "require('./packages/kernel/package.json').name + '@' + require('./packages/kernel/package.json').version"

Expected:

wasm4pm@<version>

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
   - 60/60 negative cases fail correctly
   - 60/60 invariant cases pass or have structured nondeterministic invariant
   - no panic, unhandled exception, silent fallback, or false success

3. Receipts
   - every algorithm row has receipt evidence
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