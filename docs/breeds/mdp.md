# mdp — MDP Value Iteration

## 1. Identity & Lineage
Bellman functional equation and successive approximation (Bellman, Dynamic Programming, 1957). BreedId `mdp`, module `src/breeds/mdp.rs`, wrapping `support::mdp::value_iteration`.

## 2. Algorithm
Deterministic value iteration to ε(1−γ)/γ threshold (ε=1e-6), greedy policy with lex-least tie-break; model validation (probs sum to 1±1e-6, γ∈[0,1)).

## 3. Input Contract
Facts `mdp:gamma`, `mdp:trans:<s>:<a>`="s':p;s'':p", `mdp:reward:<s>:<a>`=f64. ≤16 states.

## 4. Output Contract
Facts `mdp:value:<s>` ("%.6f"), `mdp:policy:<s>`; `selected` = "s:a,..." policy string.

## 5. Trace & OCEL Lifecycle
`validate-model`(1,1) → `sweep`(1,*) → `converged`(1,1) → `extract-policy`(1,*). Sweep markers stride-bounded to ≤64 steps. Report fitness 1.0.

## 6. Oracles
Refusal: bad probabilities, γ=1, missing gamma. Hidden: closed form V = R/(1−γ) = 2 exact (R=1, γ=0.5); Bellman residual <1e-4 at every state of a two-action model; optimal action beats myopic. Paper: Bellman-1957 functional-equation chain (R&N grid skipped: γ=1 outside contract, documented).

## 7. Determinism & Bounds
`support::mdp` BTreeMap model; pure f64 arithmetic, fixed formatting.

## 8. Provenance
Fixture `tests/fixtures/papers/mdp.json` (closed-form instance of the Bellman equation).
