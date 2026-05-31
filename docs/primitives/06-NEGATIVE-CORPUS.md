# Agent 7 — Negative fixture / sabotage corpus agent

## Mission
Manufacture invalid traces and invalid models. Negative cases must include
missing required event, event out of order, dead transition, unsafe net, OCEL
relation violation.

## Status
Partially implemented. `negative_quality.rs` tests exist for rejection of bad
models; a systematic, reusable negative-corpus fixture library is not yet
published.

---

## What already exists

| Module / test | File | What it catches |
|---------------|------|-----------------|
| Negative quality tests | `wasm4pm/tests/negative_quality.rs` | ILP-discovered models reject impossible traces; zero-event log; empty-activity log |
| Quality benchmarks | `wasm4pm/tests/quality_benchmarks.rs` | Fitness / precision thresholds on BPI 2020; intentionally bad models fail |
| Adversarial POWL | `wasm4pm/tests/adversarial_powl_tests.rs` | Invalid POWL structure; dead branches |
| Adversarial ingestion | `wasm4pm/tests/adversarial_ingestion.rs` | Malformed XES; truncated JSON; wrong encoding |
| Anti-fake tests | `wasm4pm/tests/anti_fake_tests.rs` | Guards that prevent receipt theater |
| Automembrane benchmarks | `wasm4pm/src/benchmark_runner.rs` | 8 named attack patterns (AP payment bypass, factory rework skip, hospital discharge warp, emergency access abuse, RPA false completion, Sense/Net bulk export, Panther Moderns supply chain, temporal replay attack) |
| Conformance guards | `wasm4pm/src/conformance_guards.rs` | Fitness clamping; guard2 negative-input clamped |

## Negative cases required by Van der Aalst doctrine

| Case class | Criterion | Coverage status |
|------------|-----------|-----------------|
| Missing required event | Required activity absent from trace | Covered — trace conformance rejects via `AndonPull` |
| Event out of order | Sequence constraint violated | Covered — `route_driven_tdd_tests.rs` reversed-activities test |
| Dead transition | Transition unreachable from initial marking | **Planned** — no dedicated dead-transition fixture yet |
| Unsafe net | Marking allows > 1 token in a place | **Planned** — no unsafe-net generator yet |
| OCEL relation violation | Event references non-existent object | **Planned** — `check_ocel_data_quality` exists but no fixture exercises it |

---

## Fixture locations

```
fixtures/models/               # PNML and OCEL model fixtures (5 models)
fixtures/real/                 # Real-data acceptance fixtures (trace-conform-*)
bench_data/                    # Real XES logs: bpi2020_travel.xes, sepsis.xes (stub),
                               # roadtraffic100traces.xes, ocel20_example.jsonocel
```

## Planned: negative corpus library

A structured JSONL file at `fixtures/negative-corpus.jsonl` where each line is:

```json
{ "id": "nc-001", "class": "missing_required_event", "model": "...", "trace": [...], "expected_rejection": "AndonPull(MissingRequiredStages)" }
```

---

## Paper grounding

Van der Aalst §4.2: soundness requires absence of dead transitions and safe
markings. Chicago TDD doctrine: negative testing is first-class; rejection of
impossible logs is a correctness property, not an edge case.

---

## Acceptance sequence

1. `cargo test --test negative_quality` — models reject impossible logs
2. `cargo test --test adversarial_powl_tests` — invalid POWL structures rejected
3. **Planned**: `cargo test --test negative_corpus` — full systematic corpus
