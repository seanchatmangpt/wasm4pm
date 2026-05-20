# wasm4pm — AI Agent Developer Guide
**Format:** Follows `CLAUDE.md` structure | **Policy:** Toyota Production System (TPS) — Hard Crashes, No Silent Fallbacks.

---

## 1. What this project is

**wasm4pm** is an agentic process mining platform. It consists of:
1. **Rust/WASM Core** (`wasm4pm/`): High-performance algorithm kernel (38+ algorithms), compiled to WASM.
2. **TypeScript Monorepo** (`packages/` + `apps/`): CLI orchestration, contracts, and observability.
3. **Agentic Layer**: Integrated RL (LinUCB), SPC (Western Electric), and Self-Healing (Circuit Breakers) in the Rust core.

---

## 2. Versioning: CalVer (Calendar Versioning)

**Format:** `vYEAR.MONTH.DAY[suffix]`
- `v26.5.19`: Release on May 19, 2026.
- `v26.5.19a`: Second release on the same day.
- **PATCH value is the DAY of month** (Max 31). Never increment PATCH beyond the current date.

---

## 3. Core Developer Commands

### Rust / WASM (Core Algorithms)
```bash
cd wasm4pm
cargo check                    # Fast type check
cargo build --release          # Build library
cargo test                     # Run all 695+ native tests
npm run build                  # wasm-pack to pkg/
npm run build:nodejs           # Build for Node.js target
```

### TypeScript (CLI & Monorepo)
```bash
pnpm build                     # Build all packages (monorepo root)
pnpm test                      # Test all packages
cd apps/wasm4pm && npm start   # Run CLI from source
```

### Verification & Validation
```bash
# Verify 100% native test pass (No #[ignore] on critical tests)
cargo test -p wasm4pm --lib 2>&1 | grep -c "ok$"

# Algorithm Ground-Truth (pm4py cross-validation)
python3 scripts/cross_validate.py
```

---

## 4. Operational Policies (TPS / Andon Cord)

**NO SILENT FALLBACKS.**
- If a real dataset (XES) is missing, the system MUST **panic** (Hard Crash).
- If metrics cannot be parsed, the system MUST **panic**.
- **Prohibited:** `unwrap_or(default)`, `eprintln!("WARN...fallback")`, synthetic data generation in production benchmarks.
- **Verification:** Check `wasm4pm/benches/helpers.rs` for `panic!` in `generate_event_log`.

---

# Release and Proof Discipline (AGENTS.md)

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
- pnpm run release:full
- pnpm run release:algorithm-behavior
- pnpm run release:verify-algorithm-behavior
- pnpm run examples:gate
- pnpm run examples:verify-receipts
- pnpm run cli:parity
- pnpm run prepublish:pack-smoke
- pnpm run release:pack-contents
- pnpm run release:certificate
- npm pack --dry-run
- npm publish --dry-run

Also show actual files from disk:

- RELEASE_CERTIFICATE.v${VERSION}.json
- ALGORITHM_BEHAVIOR_EVIDENCE.v${VERSION}.json
- ALGORITHM_REACHABILITY_EVIDENCE.v${VERSION}.json
- examples manifest
- representative positive behavior receipt
- representative structured-failure receipt
- representative invariant receipt

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
