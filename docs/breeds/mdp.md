<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/breeds/mdp.md; source-sha256: dcb0a1650b6004a42ab3e04f0615e746f7dd7f802d1d372f38e4038c6d2f450b; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, mdp-init/mdp-iterate/mdp-policy trace (ε=1e-4, ≤1000
sweeps); exact "state -> action" policy; mdp:trans:/reward:/gamma fact grammar.

# mdp — MDP Value Iteration

## 1. Identity & Lineage
Bellman functional equation and successive approximation (Bellman, Dynamic
Programming, 1957). BreedId `mdp`, module `src/breeds/mdp.rs`, modelled by
`support::mdp::MdpModel` (shared with `rl_symbolic` and `pomdp`). The traced
iteration loop lives in the breed itself so every sweep is visible in the trace.

## 2. Algorithm
Deterministic value iteration, ε=1e-4, to the ε(1−γ)/γ threshold (ε when γ=0),
guaranteeing ‖V−V*‖∞ < ε; greedy policy extraction with lex-least tie-break on
equal Q-values (strict `>` with 1e-12 margin). Hard cap 1000 sweeps. Model
validation before iterating: γ ∈ [0,1), per-(s,a) probabilities sum to 1±1e-6,
indices in range, non-empty state set, every state has at least one action.

## 3. Input Contract
Two accepted encodings:
- Prefixed (Bellman 1957 chain fixtures): `mdp:gamma`="0.9",
  `mdp:trans:<s>:<a>`="<s'>:<p>[;<s'':<p>...]", `mdp:reward:<s>:<a>`=f64.
  States/actions derived in first-seen order.
- Explicit: `state`/`action` facts plus comma-form `transition`
  ("s,a,s',p") and `reward` ("s,a,r") facts; bare `gamma` also accepted.
Precondition refuses input with neither `state`+`action` facts nor
`mdp:trans:` transitions.

## 4. Output Contract
Input facts are mirrored; no `mdp:value:*`/`mdp:policy:*` facts are emitted.
`selected` = the full policy as comma-joined `"state -> action"` pairs;
`explanation` = "MDP value iteration converged in N sweeps. Optimal policy:
s1 -> a1, s2 -> a2, ...".

## 5. Trace & OCEL Lifecycle
`mdp-init` (1,1) with detail `"N states, gamma=0.500000"` → `mdp-iterate`
(1,*) one per sweep with `Sweep k: delta=..., values=[...]` → `mdp-policy`
(1,1) with the exact `"state -> action"` detail. Postcondition refuses a trace
missing any of the three kinds.

## 6. Oracles
Refusal: missing states/actions/transitions; validation failures (γ out of
[0,1), probabilities not summing to 1±1e-6, a state with no action). Hidden:
closed form V = R/(1−γ) = 2 exact (R=1, γ=0.5); Bellman residual <1e-4 at
every state of a two-action model; optimal action beats myopic. Paper:
Bellman-1957 functional-equation chain.

## 7. Determinism & Bounds
`support::mdp::MdpModel` over BTreeMaps; ascending state index sweeps; pure
f64 arithmetic, `{:.6}` formatting; 1000-sweep cap.

## 8. Provenance
Fixture `tests/fixtures/papers/mdp.json` (closed-form instance of the Bellman
equation).
