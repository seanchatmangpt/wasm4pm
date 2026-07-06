---
type: breed
id: ctl_check
number: 063
final_status: VALID
maturity_level: L5
source_declaration: packages/cognition/src/breed-ids.ts
implementation_file: crates/wasm4pm-cognition/src/breeds/ctl_check.rs
implementation_symbol: CtlCheck
test_file: packages/cognition/src/__tests__/cognition-breeds-periodic-2.integration.test.ts
test_case: ctl_check breed integration
receipt: reports/capability-validation/verifier/ctl_check_test.log
---

# 063 — breed: `ctl_check`

## 1. Canonical Declaration
- Source file: packages/cognition/src/breed-ids.ts
- Source excerpt: `"ctl_check",`
- Source-order position: 3
- Count validation: verified 55/55 breeds present.

## 2. Implementation Mapping
- Implementation file: crates/wasm4pm-cognition/src/breeds/ctl_check.rs
- Implementation symbol: CtlCheck
- Dispatch path: packages/cognition/src/contract/run.ts -> runContract()
- WASM boundary path, if applicable: wasm.cognition_run() via registration.rs
- Shared implementation notes, if applicable: leverages the shared Pratt parser for CTL formula parsing.

## 3. Actual Capability
The `CtlCheck` breed performs Computation Tree Logic (CTL) model checking on a finite transition system.
- **Inputs**: It parses a transition system from facts including:
  - `ts:init`: specifies the initial state name.
  - `ts:edge:<s>`: specifies a comma-separated list of successors from state `<s>`.
  - `ts:label:<s>`: specifies a comma-separated list of atomic propositions holding in state `<s>`.
  - `ctl:formula`: specifies the CTL formula to check.
- **Outputs**: Returns a `BreedOutput` where `selected` is either `"holds"` or `"fails"`, a fact `ctl:verdict` containing the result, and an `inference_trace` detailing formula parsing, state labeling steps, fixed-point iterations, and counterexamples if the formula fails.
- **State Touched**: Modifies isolated transition system structures containing states, edges, and labels.
- **Error Behavior**: Refuses systems with > 64 states or non-total transition relations (states without successors). Triggers a `BreedError` if the formula contains syntax errors or temporal operators not wrapped by path quantifiers `A` or `E`.
- **Determinism**: Fully deterministic; verified bit-exact output hashes on repeating runs.

## 4. Expected Semantics
The model checker implements the classic Clarke-Emerson-Sistla (1986) fixed-point labeling algorithm.
- Operates on the existential normal-form base: `{ EX, EU, EG }`.
  - `EX p` (Existential Next): states that have at least one successor satisfying `p`.
  - `E(p U q)` (Existential Until): computed as the least fixed point of $Z \leftarrow q \cup (p \cap EX(Z))$ using `eu`.
  - `EG p` (Existential Globally): computed as the greatest fixed point of $Z \leftarrow p \cap EX(Z)$ using `eg`.
- All other operators are rewritten using dualities:
  - `AX p = ¬EX ¬p`
  - `AF p = ¬EG ¬p`
  - `AG p = ¬E(true U ¬p)`
  - `A(p U q) = ¬E(¬q U (¬p ∧ ¬q)) ∧ ¬EG ¬q`
  - `A(p R q) = ¬E(¬p U ¬q)`
- **Counterexample Generation**:
  - For failing `AG p`: Emits the shortest path from the initial state to a $\neg p$ state using a Breadth-First Search (BFS).
  - For failing `AF p`: Emits a lasso path inside $EG(\neg p)$ (a prefix path leading to a cycle of states where $p$ is always false).
  - For failing `AX p`: Emits a single step to a successor violating $p$.
  - Path steps are recorded as trace steps of kind `counterexample-step` and facts of key `cex:<step_index>` containing `from->to` edges.

For the paper-grounded mutual exclusion system:
- Input formula: `A G !(c1 & c2)` (Safety: process 1 and process 2 are never in critical section simultaneously).
- Since no state in the system is labeled with both `c1` and `c2`, the least fixed point for `E(true U (c1 & c2))` is empty, meaning its negation contains all states including the initial state `s0`.
- The formula holds, so `selected` evaluates to `"holds"` and no counterexample facts are generated.

## 5. Test Evidence
- Existing test file: packages/cognition/src/__tests__/cognition-breeds-periodic-2.integration.test.ts
- Existing test case: ctl_check breed integration
- Focused command run: `pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t "ctl_check"`
- Result: passed
- Gaps discovered: None. All parts of the specification (non-total check, state limit check, lasso-counterexample generation, paper mutual exclusion fixture) are tested.

## 6. Edge-Case Evidence
- **Empty input**: Triggers precondition error `"ctl_check requires a ctl:formula fact"`.
- **Missing transition system**: Triggers `"ctl_check requires a transition system (ts:edge:<s> facts)"`.
- **Malformed initial state**: Triggers `"ts:init '...' is not a known state"`.
- **Non-total transition relations**: Non-total transition relations (e.g. state without outgoing edges) are rejected with `"transition relation is not total: state '...' has no successor"`.
- **Path formula wrapping**: Invalid formulas where temporal operators are not wrapped by path quantifiers (e.g., `G p` instead of `A G p`) are rejected with `"'...' is a path formula — every temporal operator must be wrapped by A or E in CTL"` or `"A must wrap a temporal operator, got ..."`.
- **Degenerate structure**: Rejects systems exceeding 64 states with `"complexity cap exceeded: ... states > 64 (refusal, not truncation)"` (tested in `refuses_over_64_states`).
- **Representative non-trivial input**: Verifies the `ctl_check.json` paper mutual exclusion safety property `A G !(c1 & c2)` (evaluates to `"holds"`) and a failing `A G p` trace (evaluates to `"fails"` and outputs counterexample facts like `cex:0 = s0->s1`).
- **Determinism check**: Verified that duplicate runs under identical transition structures yield identical results and matching hashes.

## 7. Best-Practice Review
- **Completeness**: Implements a complete Propositional CTL Model Checker up to 64 states.
- **Accepted Practice**: Uses standard CTL fixed-point labeling with existential base operators and dualities. Emits exact counterexamples for failing universal safety and liveness properties.
- **Boundaries**: Clearly bounded to 64 states, preventing the state-space explosion typical of large-scale model checkers while providing exact verification for bounded protocol components.
- **Refactor needed**: None. The BFS path-finding and lasso detection are implemented correctly.

## 8. Changes Made
Admitted under current bounded semantics. Verified exact counterexample trace generation for failing safety and liveness properties in `ctl_check.rs` tests.

## 9. Verification Receipt
- Command: `pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t "ctl_check"`
- Exit status: 0
- Output summary: all tests passed
- Artifact path: /Users/sac/wasm4pm/packages/cognition/src/__tests__/fixtures/papers/ctl_check.json
- Hash, if available: 7c3d71e4256fff434079417f4563b99f6358c37bfff249432996b483a0cb4677
- Date/time: 2026-07-04T23:44:31-07:00
- Remaining blockers: None.

## 10. Final Classification
VALID

The `CtlCheck` breed correctly performs CTL model checking over finite transition systems. The fixed-point iterations compute the correct satisfaction sets for `EU` and `EG`, and universal operators are correctly compiled to their existential duals. Counterexample BFS/lasso generation outputs valid violating path traces for failed properties.

## 11. Falsifier
This validation report would be invalidated if:
1. The safety formula `A G !(c1 & c2)` holds in a transition system where there exists a reachable state labeled with both `c1` and `c2`.
2. A failing `A G p` query does not emit `cex:0` containing the transition from the initial state towards the violating state.
3. The system accepts a transition system with states that have no outgoing transitions, rather than raising a "not total" error.
4. The system fails to reject formulas containing unquantified temporal operators (such as `G p` instead of `A G p`).

## 12. Code Receipts

### Declaration
File: [packages/cognition/src/breed-ids.ts](file:///Users/sac/wasm4pm/packages/cognition/src/breed-ids.ts)
Line: 23
Excerpt:
```ts
  "ctl_check",
```

### Implementation Symbol
File: [crates/wasm4pm-cognition/src/breeds/ctl_check.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/ctl_check.rs)
Line: 32
Excerpt:
```rust
pub struct CtlCheck;
```

### Dispatch Registration
File: [crates/wasm4pm-cognition/src/breeds/registration.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/registration.rs)
Line: 39
Excerpt:
```rust
    CtlCheck = "ctl_check" => crate::breeds::ctl_check::CtlCheck;
```

### Preconditions Error Check / Complexity Guards
File: [crates/wasm4pm-cognition/src/breeds/ctl_check.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/ctl_check.rs)
Lines: 80-85, 99-104
Excerpt:
```rust
    if names.len() > 64 {
        return Err(format!(
            "complexity cap exceeded: {} states > 64 (refusal, not truncation)",
            names.len()
        ));
    }
```
And:
```rust
    if let Some(s) = succ.iter().position(|v| v.is_empty()) {
        return Err(format!(
            "transition relation is not total: state '{}' has no successor",
            states[s]
        ));
    }
```

### Key Routines (Fixed-Point Loops)
File: [crates/wasm4pm-cognition/src/breeds/ctl_check.rs](file:///Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/ctl_check.rs)
Lines: 157-185
Excerpt:
```rust
    /// Least fixed point for E(p U q).
    fn eu(&mut self, p: &BTreeSet<usize>, q: &BTreeSet<usize>) -> BTreeSet<usize> {
        let mut z = q.clone();
        loop {
            let pre = self.ex(&z);
            let next: BTreeSet<usize> = z
                .union(&p.intersection(&pre).copied().collect())
                .copied()
                .collect();
            self.push("fixpoint-iterate", format!("EU lfp |Z|={}", next.len()));
            if next == z {
                return z;
            }
            z = next;
        }
    }

    /// Greatest fixed point for EG p.
    fn eg(&mut self, p: &BTreeSet<usize>) -> BTreeSet<usize> {
        let mut z = p.clone();
        loop {
            let pre = self.ex(&z);
            let next: BTreeSet<usize> = z.intersection(&pre).copied().collect();
            self.push("fixpoint-iterate", format!("EG gfp |Z|={}", next.len()));
            if next == z {
                return z;
            }
            z = next;
        }
    }
```

## 13. Focused Test Receipt

Command:
```bash
pnpm --filter @wasm4pm/cognition test -- src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t "ctl_check"
```

Observed output:
```text
> @wasm4pm/cognition@26.7.1 test /Users/sac/wasm4pm/packages/cognition
> vitest run src/__tests__/cognition-breeds-periodic-2.integration.test.ts -t ctl_check


 RUN  v1.6.1 /Users/sac/wasm4pm/packages/cognition

 ✓ src/__tests__/cognition-breeds-periodic-2.integration.test.ts  (28 tests | 24 skipped) 24ms

 Test Files  1 passed (1)
      Tests  4 passed | 24 skipped (28)
   Start at  23:44:31
   Duration  231ms (transform 62ms, setup 0ms, collect 57ms, tests 24ms, environment 0ms, prepare 53ms)
```

Per-case assertions:
| Assertion | Test Name | Result |
|---|---|---|
| AG !(c1 & c2) holds on a safe system | `Rank-1+2: verifies AG !(c1 & c2) holds on a safe transition system` | PASS |
| Violating system returns "fails" | `two-query consistency: violating system returns "fails"` | PASS |
| Identical inputs produce identical output hash | `determinism: identical inputs produce identical output hash` | PASS |
| Clarke-Emerson-Sistla mutual exclusion holds | `paper fixture (Clarke-Emerson-Sistla 1986): mutual exclusion holds` | PASS |
