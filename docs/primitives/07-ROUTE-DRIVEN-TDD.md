# Agent 8 — Route-driven TDD primitive agent

## Mission
Build or refine the testing substrate using `PowlTestHarness`, `ExpectedConformance`,
`AndonPull`. A test can declare an expected POWL route, observed OCEL evidence,
and required conformance = 1.0.

## Status
Implemented. `wasm4pm::testing` module is live; 15 route models are in `routes/`;
integration tests pass.

---

## What exists

### Core substrate (`wasm4pm/src/testing/`)

| Type | Purpose |
|------|---------|
| `PowlTestHarness` | Stateful harness — records activity evidence, verifies against a POWL v2 model |
| `ActivityEvidence` | Per-activity evidence bundle: input `ObjectEvidence[]` + output `ObjectEvidence[]` |
| `ObjectEvidence` | `{ id, hash }` — BLAKE3-bound object identity |
| `ConformanceVerdict` | `Passed` or `Andon(AndonPull)` — no partial pass |
| `AndonPull` | Typed refusal enum: `RouteConformanceGap`, `MissingRequiredStages`, `TestRouteIncomplete`, … |
| `ExpectedConformance` | Declares the exact conformance target (always `1.0` for admission) |
| `ProofPackWriter` | Seals evidence into a proof pack for audit |

### Route models (`routes/*.powl.json`, 15 total)

| Route | Type |
|-------|------|
| `agent-proof-lifecycle` | choice\_graph: collect → verify → emit\_receipt |
| `ai-test-writing` | partial\_order: red → green → refactor → emit\_receipt |
| `ai-code-review` | choice\_graph: lint → type\_check → run\_tests → summarize |
| `ai-bug-fix-with-receipt` | sequence: reproduce → diagnose → patch → verify → commit |
| `ai-refactor-with-tests` | choice\_graph (rework loop) |
| `ai-doc-update`, `ai-config-change`, `ai-dependency-bump`, `ai-migration`, `ai-perf-investigation`, `ai-security-audit` | various |
| `adversarial-admissibility`, `claude-stop-proof-gate`, `proof-pack-promotion` | adversary / proof gates |
| `otp-supervisor-lifecycle` | OTP supervisor lifecycle |

### Integration tests

`wasm4pm/tests/route_driven_tdd_tests.rs` — covers:
- Conforming sequential trace → `Passed`
- Empty trace → `AndonPull`
- Partial trace (missing second activity) → `AndonPull`
- Reversed activities → `AndonPull`

---

## Usage pattern

```rust
use wasm4pm::testing::{ActivityEvidence, AndonPull, ConformanceVerdict, ObjectEvidence, PowlTestHarness};

let mut h = PowlTestHarness::new("my-route")
    .model("routes/ai-test-writing.powl.json");

h.complete_activity(
    ActivityEvidence::new("red")
        .with_outputs(vec![ObjectEvidence::new("test-file", blake3_of(code))]),
).unwrap();
// ...
assert_eq!(h.finish(), ConformanceVerdict::Passed);
```

---

## Doctrine

A test may not pass on output alone. `fitness == 1.0` is the only admitted
conformance. `0.999 < 1.0` is `AndonPull::RouteConformanceGap`. The
harness is usable without macros; proc-macros are planned for Phase 9.

---

## Paper grounding

Van der Aalst conformance checking: model-to-log comparison with fitness = 1.0
as the admission criterion. MCPP doctrine (`docs/primitives/mcpp-conformance.md`):
"0.8 conformance is a diagnostic signal, not an acceptance threshold."

---

## Acceptance sequence

1. `cargo test --test route_driven_tdd_tests --features browser` — all harness tests pass
2. `pnpm test -- trace-cli` — CLI `wpm trace conform` exits 0 (Accepted) on valid routes
3. `pnpm test -- trace-cli` — CLI exits 3 (AndonPull) on empty OCEL against `agent-proof-lifecycle`
