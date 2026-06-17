# CTL Model Checking

## Origin
- **Paper:** "Automatic verification of finite-state concurrent systems using temporal logic specifications" (1986, ACM TOPLAS 8(2))
- **Authors:** Edmund M. Clarke, E. Allen Emerson, A. Prakash Sistla
- **Tradition:** Temporal-logic model checking by fixed-point labeling

## Algorithm
Fixed-point labeling over the existential base {EX, EU, EG}: EX is the pre-image, E(p U q) a least fixed point, EG p a greatest fixed point; universal operators reduce by duality (AX = ¬EX¬, AF = ¬EG¬, AG = ¬EF¬, A(p U q) = ¬E(¬q U ¬p∧¬q) ∧ ¬EG¬q). Formulas use the shared Pratt parser (`support::formula`); A/E must wrap a temporal operator (state-formula discipline). Failing top-level A-formulas emit edge-by-edge counterexamples: shortest path to a violation (AG), a ¬p lasso (AF), or a single bad successor (AX).

## Pseudocode
```
function run(input):
    ts from ts:init / ts:edge:<s> / ts:label:<s> (total relation required, ≤64 states)
    φ = parse(ctl:formula)                 # trace parse-formula
    sat(φ) by recursive labeling           # trace label-states, fixpoint-iterate
    verdict = init ∈ sat(φ)
    if fails and φ = A…: emit counterexample path   # trace counterexample-step
    trace decision
```

## Input contract
- `facts`: `ts:init`, `ts:edge:<s>` = "t1,t2", `ts:label:<s>` = "p,q", `ctl:formula` (required)
- refusals: missing formula; >64 states; non-total transition relation; bare path formulas; parse errors

## Output contract
- `facts`: `ctl:verdict` = "holds"/"fails"; `cex:<i>` = "s->t" counterexample edges
- `selected`: "holds" or "fails"
- `inference_trace`: `parse-formula` → `label-states`/`fixpoint-iterate`+ → `counterexample-step`* → `decision`

## Complexity
O(|φ| × |S| × |R|) — the paper's polynomial labeling bound, with |S| ≤ 64.

## Generalization examples
Mutual-exclusion safety, deadlock-freedom of small protocol state machines, lifecycle invariants of manufacturing-stage DFAs.

## Adversarial coverage
- Refusal: deadlock (non-total) state; unquantified temporal operator
- Hidden oracle: EF p holds while AF p fails on the same novel structure; the AF lasso counterexample is re-validated edge-by-edge against the declared transitions, with ¬p checked at every state on the path
- Paper fixture: two-process mutual exclusion, AG !(c1 & c2) holds with zero counterexample steps

## See also
- `crates/wasm4pm-cognition/src/breeds/ctl_check.rs`; parser: `src/breeds/support/formula.rs`
- OCPN: `ocel/models/l1/ctl_check.ocpn.json`; report: `ocel/reports/ctl_check.json`
