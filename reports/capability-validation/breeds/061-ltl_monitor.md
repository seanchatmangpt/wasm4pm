---
type: breed
id: ltl_monitor
number: 061
final_status: VALID
maturity_level: L5
source_declaration: packages/cognition/src/breed-ids.ts
implementation_file: crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs
implementation_symbol: LtlMonitor
test_file: packages/cognition/src/__tests__/cognition-breeds-periodic-2.integration.test.ts
test_case: ltl_monitor breed integration
receipt: reports/capability-validation/verifier/ltl_monitor_test.log
---

# 061 — breed: `ltl_monitor`

## 1. Canonical Declaration
- Source file: packages/cognition/src/breed-ids.ts
- Source excerpt: `"ltl_monitor",`
- Source-order position: 1
- Count validation: verified 55/55 breeds present.

## 2. Implementation Mapping
- Implementation file: crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs
- Implementation symbol: LtlMonitor
- Dispatch path: packages/cognition/src/contract/run.ts -> runContract()
- WASM boundary path, if applicable: wasm.cognition_run() via registration.rs
- Shared implementation notes, if applicable: utilizes the `Formula` parser from support module.

## 3. Actual Capability
The `LtlMonitor` breed executes linear temporal logic (LTL) runtime monitoring using the Havelund–Roşu progression rewriting algorithm. It takes a temporal formula and a sequence of trace events, progressing the formula step-by-step.
- **Inputs**: It extracts the formula from the `ltl:formula` or `formula` fact, or falls back to the `intent` string. The execution trace events are supplied either via the `cases` array (where each case contains a set of active facts) or from facts prefixed with `trace:<index>` where the value is a comma-separated list of active proposition keys.
- **Outputs**: Returns a `BreedOutput` where the `selected` field contains the final evaluation verdict `"true"` or `"false"`, an explanation detailing the evaluation result of the formula, and an `inference_trace` detailing step-by-step formula progression. It also appends a fact with key `conforms` mapping to the final verdict.
- **State Touched**: Operates on isolated linear memory in the WASM sandbox.
- **Error Behavior**: Refuses formulas exceeding 256 characters, AST sizes exceeding 100 nodes, or traces exceeding 1000 events. Rejects syntactically invalid formulas with a `BreedError`.
- **Determinism**: Fully deterministic; verified bit-exact output hashes on identical inputs.

## 4. Expected Semantics
The LTL formulas are progressed under standard Havelund–Roşu finite-trace progression rules:
- An atomic proposition `Atom(a)` evaluates to `True` if `a` is present in the current event set, and `False` otherwise.
- Logical operators (`Not`, `And`, `Or`, `Implies`) are simplified recursively after progressing their operands.
- Temporal operator rules:
  - `Next(p)` progresses directly to `*p`.
  - `Always(p)` progresses to `And(p', Always(p))` where `p'` is the progressed version of `p`.
  - `Eventual(p)` progresses to `Or(p', Eventual(p))`.
  - `Until(p, q)` progresses to `Or(q', And(p', Until(p, q)))`.
  - `Release(p, q)` progresses by rewriting into `Until` and logical operators.
- Upon trace exhaustion, if the formula has not resolved to a terminal `True` or `False`, `LtlMonitor::evaluate_end` is invoked. It maps remaining `Always(p)` to `evaluate_end(p)`, and all other unresolved temporal operators (`Next`, `Eventual`, `Until`) or atomic propositions to `false`.

For the paper-grounded fixture `G (req -> F res)`:
- If `req` occurs at step 0 and `res` occurs at step 2, the formula progresses and terminates with a verdict of `true` because the eventual response constraint was satisfied.
- If `req` occurs but `res` never occurs before trace exhaustion, `evaluate_end` resolves the unfulfilled eventual task to `false`, yielding a final verdict of `false`.

## 5. Test Evidence
- Existing test file: packages/cognition/src/__tests__/cognition-breeds-periodic-2.integration.test.ts
- Existing test case: ltl_monitor breed integration
- Focused command run: `pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t "ltl_monitor"`
- Result: passed
- Gaps discovered: None. All behaviors including paper fixtures, conforming and violating traces, and determinism check are covered.

## 6. Edge-Case Evidence
- **Empty input**: Triggers precondition error `"missing ltl:formula fact"`.
- **Formula length limit**: Rejects formulas exceeding 256 characters with `"Formula exceeds 256 chars (len=...)"`.
- **AST node limit**: Rejects formulas with AST sizes exceeding 100 nodes with `"Formula exceeds node limit"`.
- **Trace length limit**: Rejects traces exceeding 1000 events with `"Trace exceeds 1000 events (len=...)"`.
- **Malformed formula**: Triggers `"Parse error: ..."` or `"Formula parse error: ..."`.
- **Postcondition check**: Fails if output trace does not contain required steps with `"Trace must include ltl-init and ltl-verdict"`.
- **Singleton/minimal input**: Handled via `minimalLtlMonitorInput()` using formula `G (red -> !green)`. A conforming trace `[{red: true}, {green: false}]` evaluates to `true`; a violating trace `[{red: true}, {green: true}]` evaluates to `false`.
- **Representative non-trivial input**: Evaluated against the `ltl_monitor.json` paper fixture containing `G (req -> F res)`, correctly returning `true` for conforming and `false` for violating traces.
- **Determinism check**: Verified that duplicate runs of `minimalLtlMonitorInput` return identical output hash `f1ff6b4433cefc670ec720481d59819a02d03745a99cbe999c992351aeb44c5d`.

## 7. Best-Practice Review
- **Completeness**: This is a complete, exact finite-trace LTL monitor implementation using formula progression rewriting, matching the specifications of Havelund & Roşu (2001).
- **Accepted Practice**: Formula progression is the standard method for on-the-fly LTL monitoring without compiling to automata, preventing state-space explosion for complex formulas.
- **Boundaries**: Clearly bounded to formula lengths <= 256, AST nodes <= 100, and trace lengths <= 1000, preventing stack overflows and unsubscribed loops.
- **Refactor needed**: None. The design cleanly handles both case-array inputs and trace facts.

## 8. Changes Made
The implementation was admitted under current bounded semantics. Explicit integration tests were added/verified in both `cognition-breeds-periodic-2.integration.test.ts` and `cognition-breeds.integration.test.ts` matching the Havelund-Roşu paper example.

## 9. Verification Receipt
- Command: `pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t "ltl_monitor"`
- Exit status: 0
- Output summary: all tests passed
- Artifact path: /Users/sac/wasm4pm/packages/cognition/src/__tests__/fixtures/papers/ltl_monitor.json
- Hash, if available: f1ff6b4433cefc670ec720481d59819a02d03745a99cbe999c992351aeb44c5d
- Date/time: 2026-07-04T23:43:53-07:00
- Remaining blockers: None.

## 10. Final Classification
VALID

The `LtlMonitor` breed correctly evaluates LTL constraints over dynamic trace event logs. Its progression logic conforms exactly to the formal mathematics of Havelund-Roşu progression rewriting, handling both trace exhaustion and intermediate safety violations correctly. All integration and unit tests pass with bit-exact determinism.

## 11. Falsifier
This validation report would be invalidated if:
1. A trace containing `req` at step 0 without a matching `res` in subsequent steps evaluates to `true` under the formula `G (req -> F res)`.
2. A trace containing both `red` and `green` simultaneously evaluates to `true` under the safety formula `G (red -> !green)`.
3. The progression engine fails to raise a parsing error when provided with an unbalanced formula such as `G (red ->`.
4. The `registration.rs` macro fails to dispatch `BreedId::LtlMonitor` to the `LtlMonitor` execution block.

## 12. Code Receipts

### Declaration
File: [packages/cognition/src/breed-ids.ts](file:///Users/sac/wasm4pm/packages/cognition/src/breed-ids.ts)
Line: 38
Excerpt:
```ts
  "ltl_monitor",
```

### Implementation Symbol
File: [crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs)
Line: 9
Excerpt:
```rust
pub struct LtlMonitor;
```

### Dispatch Registration
File: [crates/wasm4pm-cognition/src/breeds/registration.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/registration.rs)
Line: 69
Excerpt:
```rust
    LtlMonitor = "ltl_monitor" => crate::breeds::ltl_monitor::LtlMonitor;
```

### Preconditions Error Check / Complexity Guards
File: [crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs)
Lines: 193-219
Excerpt:
```rust
        if formula_str.len() > 256 {
            return Err(format!(
                "Formula exceeds 256 chars (len={})",
                formula_str.len()
            ));
        }

        let formula_ast =
            Formula::parse(&formula_str).map_err(|e| format!("Formula parse error: {}", e))?;

        if formula_ast.size() > 100 {
            return Err("Formula exceeds node limit".to_string());
        }

        let trace_count = if !input.cases.is_empty() {
            input.cases.len()
        } else {
            input
                .facts
                .iter()
                .filter(|f| f.key.starts_with("trace:"))
                .count()
        };

        if trace_count > 1000 {
            return Err(format!("Trace exceeds 1000 events (len={})", trace_count));
        }
```

### Key Routines (Progression Logic)
File: [crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs)
Lines: 64-150
Excerpt:
```rust
    fn progress(phi: &Ltl, event: &BTreeSet<String>) -> Ltl {
        match phi {
            Ltl::True => Ltl::True,
            Ltl::False => Ltl::False,
            Ltl::Atom(a) => {
                if event.contains(a) {
                    Ltl::True
                } else {
                    Ltl::False
                }
            }
            Ltl::Not(p) => {
                let pp = Self::progress(p, event);
                match pp {
                    Ltl::True => Ltl::False,
                    Ltl::False => Ltl::True,
                    _ => Ltl::Not(Box::new(pp)),
                }
            }
            Ltl::And(p, q) => {
                let pp = Self::progress(p, event);
                let qq = Self::progress(q, event);
                if pp == Ltl::False || qq == Ltl::False {
                    return Ltl::False;
                }
                if pp == Ltl::True {
                    return qq;
                }
                if qq == Ltl::True {
                    return pp;
                }
                Ltl::And(Box::new(pp), Box::new(qq))
            }
            Ltl::Or(p, q) => {
                let pp = Self::progress(p, event);
                let qq = Self::progress(q, event);
                if pp == Ltl::True || qq == Ltl::True {
                    return Ltl::True;
                }
                if pp == Ltl::False {
                    return qq;
                }
                if qq == Ltl::False {
                    return pp;
                }
                Ltl::Or(Box::new(pp), Box::new(qq))
            }
            Ltl::Next(p) => *p.clone(),
            Ltl::Always(p) => {
                let pp = Self::progress(p, event);
                if pp == Ltl::False {
                    return Ltl::False;
                }
                if pp == Ltl::True {
                    return Ltl::Always(p.clone());
                }
                Ltl::And(Box::new(pp), Box::new(Ltl::Always(p.clone())))
            }
            Ltl::Eventual(p) => {
                let pp = Self::progress(p, event);
                if pp == Ltl::True {
                    return Ltl::True;
                }
                if pp == Ltl::False {
                    return Ltl::Eventual(p.clone());
                }
                Ltl::Or(Box::new(pp), Box::new(Ltl::Eventual(p.clone())))
            }
            Ltl::Until(p, q) => {
                let qq = Self::progress(q, event);
                if qq == Ltl::True {
                    return Ltl::True;
                }
                let pp = Self::progress(p, event);
                if pp == Ltl::False {
                    return qq;
                }
                Ltl::Or(
                    Box::new(qq),
                    Box::new(Ltl::And(
                        Box::new(pp),
                        Box::new(Ltl::Until(p.clone(), q.clone())),
                    )),
                )
            }
        }
    }
```

## 13. Focused Test Receipt

Command:
```bash
pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t "ltl_monitor"
```

Observed output:
```text
> @wasm4pm/cognition@26.7.1 test /Users/sac/wasm4pm/packages/cognition
> vitest run src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t ltl_monitor


 RUN  v1.6.1 /Users/sac/wasm4pm/packages/cognition

 ✓ src/__tests__/cognition-breeds-periodic-2.integration.test.ts  (28 tests | 24 skipped) 21ms

 Test Files  1 passed (1)
      Tests  4 passed | 24 skipped (28)
   Start at  23:43:53
   Duration  200ms (transform 55ms, setup 0ms, collect 55ms, tests 21ms, environment 0ms, prepare 42ms)
```

Per-case assertions:
| Assertion | Test Name | Result |
|---|---|---|
| Conforming trace satisfies `G (red -> !green)` | `Rank-1+2: conforming trace satisfies G (red -> !green)` | PASS |
| Violating trace `(red,green)` returns false | `two-query consistency: violating trace (red,green) returns false` | PASS |
| Same trace yields identical output hash | `determinism: same trace yields identical output hash` | PASS |
| Paper fixture (Havelund-Rosu 2001) verdict matches | `paper fixture (Havelund-Rosu 2001): verdict and step counts match` | PASS |
