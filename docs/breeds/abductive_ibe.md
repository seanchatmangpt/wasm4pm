<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/abductive_ibe.md; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, Surface-3 `ibe:obs:`/`ibe:hyp:<H>:covers`/`:cost`
grammar; score = |covered| − 0.1·cost; collect-observations -> score-hypothesis
-> compare -> best-explanation trace pinned by postconditions.

# Inference to the Best Explanation (IBE)

## Origin
- **Paper:** "Explanatory Coherence" (Thagard, 1989)
- **Authors:** Paul Thagard
- **Tradition:** Philosophy of Science, Cognitive Science, Hypothesis Selection

## Algorithm
IBE scores candidate hypothesis SETS and picks the best-scoring one.
1. Parse `ibe:obs:<id>` facts (observations), `ibe:hyp:<H>:covers` facts
   (observations a hypothesis covers), and `ibe:hyp:<H>:cost` facts
   (assumption cost, must be >= 0).
2. Enumerate non-empty hypothesis subsets in size-then-lex order
   (singleton `H`, composite `{H1}+{H2}` sorted-joined with `+`).
3. Score each subset: `score = |covered observations| - 0.1 * cost`
   (coverage of the union of members' covers minus 0.1 per unit cost).
4. Track the running best with strict improvement (`>`); ties keep the
   earlier subset. Record a `compare` step only on improvement.
5. The last standing best is the best explanation.

## Pseudocode
```
function solve(input):
    (obs, hyps) = parse(input)
    best = None
    for each non-empty subset S of hyps (size-then-lex):
        score = |union(covers[S])| - 0.1 * sum(cost[S])
        if best is None or score > best.score:
            best = S
    return best
```

## Input contract
- `intent`: not used
- `facts`:
  - `ibe:obs:<id>` = `"true"` — observation
  - `ibe:hyp:<H>:covers` = comma-separated covered observation ids
  - `ibe:hyp:<H>:cost` = numeric cost (>= 0; parse failure or negative value is a refusal)

## Output contract
- `facts`: `ibe:best` = best subset name; `ibe:score` = score at 4 decimals.
- `selected`: best subset name.
- `explanation`: `"IBE over <k> candidate sets: best explanation '<best>' with score <s> (coverage - 0.1*cost)."`
- `inference_trace`: `collect-observations` (first) -> `score-hypothesis`* -> `compare`* (only on improvement) -> `best-explanation` (last).

## Refusals
- Empty facts (precondition).
- Zero observations or zero hypotheses.
- Negative or unparseable assumption cost.
- More than 16 hypotheses.

## Complexity
- Time: $O(2^H \cdot O)$ in hypotheses $H$ (max 16) and observations $O$.
- Space: $O(H + O)$.

## Generalization examples
- **Competing Process Explanations**: Select the best explanation for a process delay among multiple competing hypotheses based on observed telemetry.
- **Medical Diagnostics**: Select the cheapest hypothesis set that covers the most symptoms.

## Adversarial coverage
- Precondition rejects if facts are empty; run refuses zero observations/hypotheses.
- `compare` steps are emitted only on strict improvement — a greedy first-scored
  cheat (AC-GREEDY) that never compares is killed by the oracle's `require_kind("compare")`
  plus the exact beats-detail assertion.
