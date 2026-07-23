# Adversarial Review Ledger: Cognition Session Interview Assistant

Date: 2026-07-23

Scope: every file changed by PR #501, reviewed without assuming implementation correctness.

## Verdict

**Not signed off as merge-ready.**

The core Rust architecture is strong: bounded explicit state, canonical turn-ledger replay, deterministic inference, target-conditioned evidence, commitment reopening, domain-separated hashing, and receipted refusals are coherent and materially defensible.

The complete system cannot yet receive a positive sign-off because reproducible build and visual acceptance evidence are incomplete:

1. `pnpm-lock.yaml` does not contain the newly introduced Next.js, React, Monaco, and Playwright dependency graph.
2. The nine Playwright PNG baselines are not committed while CI is configured with `updateSnapshots: "none"`.
3. Rust, TypeScript, Next.js, generated WASM, Python artifacts, and Playwright were not executed together in a clean checkout during this review environment.
4. The current client source still requires compile confirmation after the transactional state refactor.

Until those four conditions are closed, the correct status is **implementation promising, evidence incomplete**.

## Audit inventory

### 1. Domain model and schemas

Checked:

- Rust `DomainPack`, concepts, tracks, patterns, rules, phases, thresholds, bounds.
- Observation, confirmation, canonical turn record, evidence, hypotheses, state, projection, receipt, refusal types.
- `serde(deny_unknown_fields)` coverage.
- TypeScript Zod parity for all public boundary values.
- Version alignment (`version = 2`, `schema_version = 2`).
- Track, pattern, rule, phase, concept, alias, threshold, and bound admission.

Result:

- Strong structural admission.
- Rust remains the semantic authority; Zod is transport admission only.

### 2. Matcher and normalization

Checked:

- Unicode lowercase normalization.
- punctuation and apostrophe handling.
- phrase-boundary matching.
- longest-first aliases.
- contraction negation.
- deterministic all-match behavior.
- evidence identity material.
- evidence polarity and active/retracted state.

Result:

- Deterministic and bounded.
- Negation remains intentionally local and phrase-based rather than full linguistic scope analysis.

### 3. Evidence fusion and rule inference

Checked:

- signed per-track evidence.
- noisy-OR support and contradiction.
- target-conditioned premise certainty.
- weakest-premise rule bound.
- declared certainty multiplication.
- concept support scoped per track.
- deterministic hypothesis ordering.
- margin, confidence, coverage, and contradiction gates.

Result:

- Sound for the declared finite rule language.
- No global proposition leak remains in the reviewed source.

### 4. Phase and commitment state machine

Checked:

- explicit confirmation.
- explicit rejection.
- rejection only for pending or committed tracks.
- auto-commit when confirmation is disabled.
- commitment reopening after evidence or coverage loss.
- track-specific phase applicability.
- completion semantics for tracks without transition concepts.

Result:

- State-machine semantics are coherent and replayable.

### 5. Canonical ledger and replay verification

Checked:

- observations and confirmations retained in order.
- turn count equals ledger length.
- observation IDs are single assignment.
- resource caps cover turns, observations, evidence, and observation bytes.
- state hash excludes only its own field.
- previous-state hash rules.
- full deterministic replay and structural equality.
- rehashed derived-state forgery refusal.
- confirmation-history forgery refusal.

Result:

- This is the strongest part of the design.
- State standing comes from replay, not possession of a recomputable public hash.

### 6. Hashing, receipts, OCEL, and attestations

Checked:

- domain separation for pack, state, input, output, receipt, evidence, raw boundary input, refusal, run IDs, code source, and code boundary.
- genesis previous-state marker.
- output payload composition.
- replay pointer formatting.
- bounded receipt registry.
- distinction between BLAKE3 computation commitment and deterministic local Ed25519 self-signature.

Result:

- Cryptographic claims are appropriately limited.
- Local self-signing is not represented as remote identity authentication.

### 7. Canonical Python projection

Checked:

- Rust, not React, selects code.
- state is replay-verified before projection.
- leading versus committed status.
- exact first-class source inclusion.
- source hashing.
- coordinate traversal behavior.
- rectangular and binary grid validation.
- deterministic graph DFS.
- hashable graph and lookup key constraints.
- duplicate-key semantics.

Defect found and fixed:

- A valid alternate domain could reuse canonical track IDs and select embedded Python artifacts. Projection is now bound to the exact canonical interview-domain hash.

### 8. WASM boundaries

Checked:

- hard raw-input cap.
- malformed JSON refusal.
- typed lawful refusals.
- verification boundary.
- code-projection boundary.
- successful turn boundary.
- serialization failures.
- receipt registration.
- output and attestation shapes.

Result:

- Boundaries are explicit and refusal-oriented.

### 9. TypeScript wrappers and loader

Checked:

- host input admission.
- WASM initialization.
- malformed output classification.
- invalid-shape classification.
- lawful refusal conversion.
- observability isolation.
- required export admission.
- browser literal module loader.
- singleton reset behavior in tests.

Defect found and fixed:

- `projectSessionCode` discarded receipt and attestation fields on refusal. It now preserves the complete refusal boundary, matching turn and verification wrappers.

Residual risk:

- Singleton configuration remains order-sensitive by design; browser initialization must remain the first wrapper use.

### 10. Next.js and Monaco application

Checked:

- client-only Monaco loading.
- WASM boot.
- persisted-state shape admission.
- replay verification before restore.
- code projection after turns.
- local persistence.
- confirmation controls.
- reset behavior.
- read-only source rendering.
- visible receipts and source hash.
- accessibility labels used by Playwright.

Defects found and fixed:

- Controls were enabled before persisted-state replay completed.
- React `busy` state was incorrectly used as the sole concurrency lock.
- state and persistence advanced before code projection completed.
- transcript history was not visibly rendered.
- the simulated browser time was not visible.

The app now uses a synchronous ref lock, a canonical state ref, atomic turn-plus-code projection commit, explicit boot status, visible interview clock, and visible admitted transcript.

Required closure:

- Compile and hydrate the refactored client in the actual Next.js toolchain.

### 11. Full-hour Rust fixtures and text screens

Checked:

- 26 ordered events.
- 9:00 AM to 10:00 AM span.
- realistic clarification, approach, implementation, complexity, edge-case, follow-up, and wrap-up cadence.
- explicit confirmation.
- deterministic replay.
- complete phase.
- committed coordinate track.
- final Python projection.
- nine text checkpoints.

Result:

- Good deterministic integration fixture.

### 12. Playwright visual acceptance suite

Checked:

- production `next start` server.
- one Chromium project.
- fixed viewport, locale, timezone, color scheme, reduced motion.
- real WASM and Monaco.
- no network interception.
- no state injection.
- no collaborator mocks.
- visible textarea and confirmation interactions.
- browser clock progression.
- screenshot-only behavioral oracle.
- nonce-sensitive receipt masking.
- CI snapshot immutability.
- trace, screenshot, and video retention.

Defect found and fixed:

- Playwright UI mode attempted to start the production server without first building Next.js.

Blocking evidence gap:

- No reviewed PNG baselines are committed, so the visual contract is specified but not yet witnessed.

### 13. Workspace and package integration

Checked:

- npm and pnpm workspace membership.
- generated Node and web WASM package order.
- Next.js package dependencies.
- Monaco and Playwright dependencies.
- root scripts.
- app scripts.
- Next.js transpilation list.
- TypeScript strict mode.
- generated and runtime artifact ignores.

Blocking defect:

- The lockfile has not been regenerated. A frozen install cannot reproduce the declared package graph.

### 14. Documentation truthfulness

Checked:

- tutorial architecture.
- README authority boundary.
- refusal and receipt claims.
- replay claims.
- code-projection claims.
- Chicago TDD claims.
- full-hour fixture claims.
- commands and limitations.

Result:

- Documentation largely matches the architecture.
- It must not claim completed visual evidence until baselines are generated and reviewed.

## Required sign-off gates

A positive system sign-off requires all of the following from a clean checkout:

1. Regenerate and commit `pnpm-lock.yaml`.
2. Manufacture both WASM projections.
3. Run Rust formatting, compilation, Clippy, and all cognition tests.
4. Run Python syntax and behavioral tests for all four projected artifacts.
5. Build and type-check `@wasm4pm/cognition`.
6. Build and type-check the Next.js application.
7. Install Chromium.
8. Generate and review all nine visual baselines.
9. Run Playwright again with snapshot updates disabled.
10. Reload a persisted completed session and verify replay restoration plus Monaco projection.
11. Exercise rapid double-submit and reset-during-turn behavior in a real browser.
12. Confirm no hydration warning or browser console error occurs.

Only after those gates pass should PR #501 be marked ready for review or described as a good completed system.
