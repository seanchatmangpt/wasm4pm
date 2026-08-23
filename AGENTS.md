# wasm4pm Agent Operating Contract

This is the repository-wide normative agent contract. A deeper `AGENTS.md` narrows its subtree. Hosted/cloud agents must also read any runtime-specific contract such as `CHATGPT-CLOUD-AGENTS.md` when present. Live source, manifests, executable recipes, and observed boundary behavior outrank stale prose.

## Preserve → Fence → Calculus

Resolve repo/ref/base to an exact commit. Read applicable doctrine, architecture docs, `WASM_API.md`, testing docs, `Justfile`, `Makefile`, Cargo/npm/pnpm manifests, CI, generators, and release policy. Preserve Rust/WASM ↔ TypeScript boundaries, typed refusals, deterministic behavior, package identity, generated/manual ownership, receipt/replay semantics, and maximal reversible lawful options. Apply Chesterton's fence before deleting a boundary. One failed package/WASM/runtime edge is topology, not graph failure.

## Evidence / standing

Use `UNKNOWN | PARTIAL_ALIVE | ALIVE | BLOCKED | BUILD_BROKEN | UNSUPPORTED` plus typed `REFUSED_*`. Track observed/admitted/executed/changed/verified/inferred/refused/blocked/unsupported separately. `ALIVE` requires observed execution against the exact admitted subject. Reading a test/script proves declaration, not success; a green workflow proves only its exact SHA/commands; a receipt file proves bytes, not recomputation; a diagram proves no runtime wiring.

Correct typed refusal from the real boundary is valid behavior. Wrappers may not convert a WASM/domain refusal into success. A mock cannot prove a production boundary. A representative receipt cannot prove global closure.

## Manufacture / authority

`A = μ(O*)`; `R = receipt(A)`. Separate `SELECT`, `CONSTRUCT`, `DO`. Model/planner/generator/proof/hook output has no ambient execution authority. Hooks manufacture intents, never actuate. Consequential execution uses the repository's admitted runtime boundary and emits recomputable evidence.

Deterministic paths must not depend on unordered iteration, hidden clocks, host entropy, or unreceipted state. Use the repository's stable collection/order/seed/serialization mechanisms and verify the affected target, not an analogous host path.

## Repository topology

`wasm4pm` combines a Rust/WASM process-mining core with a TypeScript monorepo containing packages, apps, examples, and the published `wpm` CLI. Distinguish the published TypeScript CLI from development Rust CLI surfaces. Re-read the admitted tree for current packages, breeds, routes, APIs, versions, and release standing; never reconstruct counts from memory.

CalVer/package identity comes from live manifests. Verify the exact npm/Cargo artifact actually being built or published, including workspace dependency semantics. A private root package is not automatically the published artifact. Never hard-code a reusable release version when a manifest is authoritative.

## Generated cognition / canonical authority

Generated cognition/registry/pointer/anti-cheat surfaces are projections. Discover the current generated set and its source graph from the admitted tree; edit the owning ontology/ggen source and regenerate through the documented gate. Never hand-flip registry standing. Evidence-derived `PARTIAL_ALIVE`/admission status must come from the real generation/measurement path.

## Work / verification

Follow `parse → orient → resolve → materialize → read doctrine → inspect → admit/refuse → diagnose/repair → construct → actuate → receipt → replay → standing`. Prefer the existing lawful path and smallest coherent diff. Preserve concurrent unrelated work. No fabricated evidence, weakened tests, unit substitution for requested WASM/browser/package/integration proof, unrelated refactors, or unresolved production placeholders.

Command names do not prove scope. Inspect their recipe/manifests before using them as evidence. Acceptance precedence: exact user behavior/command → live documented repo command → narrowest equivalent. Exercise the owning package/boundary, preserve exit status as well as printed test counts, and classify skips separately. Build the declared WASM target before diagnosing loader failures. Tests with proof claims must have teeth: tamper a disposable implementation/fixture/evidence copy where practical and confirm the verifier rejects it.

Generated/release claims require the actual chain affected: registry → dispatcher → CLI/API → WASM → behavior/evidence → receipt/certificate → packed artifact → clean install/post-publish when applicable. Hashes must recompute. Formal soundness/deadlock claims require a recomputable witness, not a Boolean or prose assertion. Global closure requires global evidence.

## Security / publication

Never commit secrets, credentials, PII, private keys, sensitive local paths/logs, or accidental large outputs. Validate adversarial host→WASM inputs and preserve typed refusal rather than panic/silent fallback where required.

Never silently move base. Unless explicitly instructed otherwise: purpose branch, explicit staging/commit, non-force push, draft PR, no merge or branch deletion. CI supplements local proof; status metadata is not logs.

## Final receipt

Expose repo/base/tree, O/O*, transports/failures, changed/generated surfaces, commands/exits, affected package/runtime boundary, verification ladder, receipt/replay hashes, branch/SHA/PR, scoped standing, and falsifiers. Another operator must be able to recompute the claim without trusting prose.