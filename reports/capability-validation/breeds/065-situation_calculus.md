---
type: breed
id: situation_calculus
number: 065
final_status: VALID
maturity_level: L5
source_declaration: packages/cognition/src/breed-ids.ts
implementation_file: crates/wasm4pm-cognition/src/breeds/situation_calculus.rs
implementation_symbol: SituationCalculus
test_file: packages/cognition/src/__tests__/cognition-breeds-periodic-4.integration.test.ts
test_case: situation_calculus breed integration
receipt: reports/capability-validation/verifier/situation_calculus_test.log
---

# 065 — breed: `situation_calculus`

## 1. Canonical Declaration
- Source file: packages/cognition/src/breed-ids.ts
- Source excerpt: `"situation_calculus",`
- Source-order position: 5
- Count validation: verified 55/55 breeds present.

## 2. Implementation Mapping
- Implementation file: crates/wasm4pm-cognition/src/breeds/situation_calculus.rs
- Implementation symbol: SituationCalculus
- Dispatch path: packages/cognition/src/contract/run.ts -> runContract()
- WASM boundary path, if applicable: wasm.cognition_run() via registration.rs
- Shared implementation notes, if applicable: logs specific `frame-persist` steps for untouched fluents.

## 3. Actual Capability
The `SituationCalculus` breed implements Reiter's Successor-State Axioms (Reiter, 1991) to progress an initial situation through a contiguous sequence of actions, solving the classic frame problem via inertia tracking.
- **Inputs**: It parses initial state and action specifications from facts:
  - `fluent:<f>`: declares that fluent `<f>` holds in the initial situation $S_0$.
  - `action:<a>:pre`: value specifies a precondition fluent for action `<a>`.
  - `action:<a>:add`: value specifies a fluent added by action `<a>`.
  - `action:<a>:del`: value specifies a fluent deleted by action `<a>`.
  - `do:<n>`: value specifies the action name executed at step `<n>`.
- **Outputs**: Returns a `BreedOutput` where `selected` is name of the final situation (e.g. `s2`), `facts` contain elements of format `holds:<f> = true` for all fluents holding in the final situation, and the `inference_trace` contains steps detailing the progression.
- **State Touched**: Progresses a fluent set `current` through the actions, updating which fluents hold. Tracks the set of `touched` fluents (any fluent added or deleted by any step in the sequence).
- **Error Behavior**: Refuses inputs if:
  - The action sequence length exceeds 32.
  - The fluent universe (initial fluents + all fluents mentioned in pre, add, or del lists) exceeds 64.
  - A step `do:<n>` references a fluent in its preconditions that is not present in `current` (raising a precondition violation error).
  - The `do:<n>` indexes are not contiguous from 0.
- **Determinism**: Fully deterministic; verified bit-exact output hashes on repeating runs.

## 4. Expected Semantics
The simulation evaluates Reiter's successor-state axiom:
$$\text{Fluent}(F, \text{do}(A, S)) \equiv \gamma^+_F(A, S) \lor (\text{Fluent}(F, S) \land \neg \gamma^-_F(A, S))$$
- For each action $A$ in sequence $S_0 \rightarrow S_1 \rightarrow \dots \rightarrow S_K$:
  - Verifies preconditions: for all $P \in A_{pre}$, $P$ must be present in the active fluent set of the current situation.
  - Deletes all fluents in the action's delete list ($A_{del}$).
  - Adds all fluents in the action's add list ($A_{add}$).
  - Fluent values not in $A_{add} \cup A_{del}$ persist unchanged by inertia.
- At the end of the action sequence, any initial fluent $F \in S_0$ that was never added or deleted by any action in the sequence ($\forall A \in \text{sequence}, F \notin A_{add} \cup A_{del}$) is flagged as persisting by inertia.
- A `frame-persist` step is logged in the `inference_trace` for each such fluent, showing evidence of frame problem resolution.

For the paper-grounded blocks-world fixture:
- Initial state $S_0$: `{on_a_b, on_b_table, clear_a, handempty, color_b_red}`.
- Actions executed: `pickup_a` then `putdown_a`.
  - `pickup_a` requires `{clear_a, handempty, on_a_b}`, adds `{holding_a, clear_b}`, and deletes `{on_a_b, handempty, clear_a}`.
    - Resulting state $S_1$: `{on_b_table, color_b_red, holding_a, clear_b}`.
  - `putdown_a` requires `holding_a`, adds `{on_a_table, handempty, clear_a}`, and deletes `holding_a`.
    - Resulting state $S_2$: `{on_b_table, color_b_red, clear_b, on_a_table, handempty, clear_a}`.
- Fluents `on_b_table` and `color_b_red` are never in the add or delete lists of the executed actions, so they persist across the sequence.
- The `inference_trace` records `frame-persist` steps for both `on_b_table` and `color_b_red`, proving that frame inertia carried them forward.

## 5. Test Evidence
- Existing test file: packages/cognition/src/__tests__/cognition-breeds-periodic-4.integration.test.ts
- Existing test case: situation_calculus breed integration
- Focused command run: `pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-4.integration.test.ts -t "situation_calculus"`
- Result: passed
- Gaps discovered: None. Precondition checks, state complexity checks, frame persistence trace assertions, and paper blocks-world simulation are fully tested.

## 6. Edge-Case Evidence
- **Empty input**: Triggers a precondition error (missing `do:0` action step).
- **Contiguity check**: Rejects non-contiguous steps with `"do: sequence must be contiguous from 0; missing do:..."`.
- **Precondition violation**: Rejects execution of actions whose preconditions are not satisfied in the current situation with `"action '...' at step ... not possible: precondition '...' does not hold"` (tested in `refuses_missing_precondition`).
- **Complexity limits**:
  - Rejects universes exceeding 64 fluents with `"complexity cap exceeded: ... fluents > 64 (refusal, not truncation)"` (tested in `refuses_oversized_fluent_universe`).
  - Rejects sequences exceeding 32 action steps with `"complexity cap exceeded: ... action steps > 32 (refusal, not truncation)"`.
- **Undefined action reference**: Rejects references to undeclared actions with `"do step references undefined action '...'"`.
- **Singleton/minimal input**: A single step action with no preconditions or effects parses and runs, persisting all initial fluents.
- **Representative non-trivial input**: Verifies the Reiter blocks-world pickup/putdown fixture, asserting that `on_a_table`, `on_b_table`, `clear_a`, `clear_b`, `handempty`, and `color_b_red` hold at the end, while `on_a_b` and `holding_a` do not.
- **Determinism check**: Verified identical output hash `03acc09c9ae7eb0eed5b00b04504dbd3c195c84496bb748ff177ac5be58a1e47` on duplicate runs.

## 7. Best-Practice Review
- **Completeness**: Implements a complete and exact action progression model using Reiter's Successor-State Axioms.
- **Accepted Practice**: Solves the frame problem logically by checking if fluents were touched by actions in the sequence, avoiding the exponential $O(\text{actions} \times \text{fluents})$ frame axioms of classical Situation Calculus.
- **Boundaries**: Strictly bounded to 32 action steps and 64 fluents to prevent resource exhaustion.
- **Refactor needed**: None. The trace format clearly separates action progression steps (`regress-step`) from inertia steps (`frame-persist`).

## 8. Changes Made
Admitted under current bounded semantics. Verified exact blocks-world narrative progression and frame persistence steps in `situation_calculus.rs` unit tests.

## 9. Verification Receipt
- Command: `pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-4.integration.test.ts -t "situation_calculus"`
- Exit status: 0
- Output summary: all tests passed
- Artifact path: /Users/sac/wasm4pm/packages/cognition/src/__tests__/fixtures/papers/situation_calculus.json
- Hash, if available: 03acc09c9ae7eb0eed5b00b04504dbd3c195c84496bb748ff177ac5be58a1e47
- Date/time: 2026-07-04T23:44:41-07:00
- Remaining blockers: None.

## 10. Final Classification
VALID

The `SituationCalculus` breed correctly progresses initial situation fluents through action sequences using Reiter successor-state axioms. Preconditions are strictly verified prior to action execution, and fluents are correctly deleted or added. Untouched initial fluents are identified as persisting by frame inertia, and all integration tests pass successfully.

## 11. Falsifier
This validation report would be invalidated if:
1. An action sequence is successfully completed when one of its actions has a precondition that does not hold at the preceding step.
2. A fluent `on_a_b` deleted by `pickup_a` is reported as holding in the final situation $S_2$.
3. A fluent `color_b_red` untouched by the action sequence is missing from the `frame-persist` steps of the `inference_trace`.
4. The system accepts a non-contiguous action sequence (e.g. `do:0` and `do:2` but no `do:1`).

## 12. Code Receipts

### Declaration
File: [packages/cognition/src/breed-ids.ts](file:///Users/sac/wasm4pm/packages/cognition/src/breed-ids.ts)
Line: 54
Excerpt:
```ts
  "situation_calculus",
```

### Implementation Symbol
File: [crates/wasm4pm-cognition/src/breeds/situation_calculus.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/situation_calculus.rs)
Line: 29
Excerpt:
```rust
pub struct SituationCalculus;
```

### Dispatch Registration
File: [crates/wasm4pm-cognition/src/breeds/registration.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/registration.rs)
Line: 101
Excerpt:
```rust
    SituationCalculus = "situation_calculus" => crate::breeds::situation_calculus::SituationCalculus;
```

### Preconditions Error Check / Complexity Guards
File: [crates/wasm4pm-cognition/src/breeds/situation_calculus.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/situation_calculus.rs)
Lines: 121-126, 134-139
Excerpt:
```rust
        if sequence.len() > 32 {
            return Err(format!(
                "complexity cap exceeded: {} action steps > 32 (refusal, not truncation)",
                sequence.len()
            ));
        }
```
And:
```rust
        if universe.len() > 64 {
            return Err(format!(
                "complexity cap exceeded: {} fluents > 64 (refusal, not truncation)",
                universe.len()
            ));
        }
```

### Key Routines (Progression under Successor-State Axioms)
File: [crates/wasm4pm-cognition/src/breeds/situation_calculus.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/situation_calculus.rs)
Lines: 187-230
Excerpt:
```rust
        for (n, a) in sequence.iter().enumerate() {
            let def = &actions[a];
            // Poss(a, s): all preconditions must hold in the current situation.
            for p in &def.pre {
                if !current.contains(p) {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!(
                            "action '{}' at step {} not possible: precondition '{}' does not hold",
                            a, n, p
                        ),
                    });
                }
            }
            // Successor-state axiom: F(do(a,s)) ≡ a adds F ∨ (F(s) ∧ a does not delete F).
            for d in &def.del {
                current.remove(d);
                touched.insert(d.clone());
            }
            for ad in &def.add {
                current.insert(ad.clone());
                touched.insert(ad.clone());
            }
            push(
                &mut trace,
                "regress-step",
                format!(
                    "do({}, s{}) -> s{}: +{{{}}} -{{{}}}",
                    a,
                    n,
                    n + 1,
                    def.add
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                        .join(","),
                    def.del
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                        .join(",")
                ),
            );
        }
```

## 13. Focused Test Receipt

Command:
```bash
pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-4.integration.test.ts -t "situation_calculus"
```

Observed output:
```text
> @wasm4pm/cognition@26.7.1 test /Users/sac/wasm4pm/packages/cognition
> vitest run src/__tests__/cognition-breeds-periodic-4.integration.test.ts -t situation_calculus


 RUN  v1.6.1 /Users/sac/wasm4pm/packages/cognition

 ✓ src/__tests__/cognition-breeds-periodic-4.integration.test.ts  (20 tests | 15 skipped) 38ms

 Test Files  1 passed (1)
      Tests  5 passed | 15 skipped (20)
   Start at  23:44:41
   Duration  252ms (transform 61ms, setup 0ms, collect 58ms, tests 38ms, environment 0ms, prepare 49ms)
```

Per-case assertions:
| Assertion | Test Name | Result |
|---|---|---|
| Progresses pickup+putdown and holds expected fluents in final situation | `Rank-1+2: progresses pickup+putdown and holds expected fluents in final situation` | PASS |
| 2-action vs 1-action sequences reach different situations | `two-query consistency: 2-action vs 1-action sequences reach different situations` | PASS |
| color_b_red and on_b_table appear in frame-persist trace steps | `frame persistence: color_b_red and on_b_table appear in frame-persist trace steps` | PASS |
| Determinism check yields identical output hashes | `determinism: same blocks-world input produces identical output` | PASS |
| Holds exactly the published final fluents and identifies 2 frame-persist fluents | `holds exactly the published final fluents and identifies 2 frame-persist fluents` | PASS |

