# DEMPSTER_SHAFER

## Origin
- **Paper:** "A Mathematical Theory of Evidence" (1976)
- **Authors:** Glenn Shafer (rule of combination: Dempster 1967)
- **Tradition:** Evidence theory, belief functions

## Algorithm
Frame of discernment ≤8 hypotheses as u8 subset bitmasks. Rules sharing an id form one source's basic probability assignment (conclusion = subset, certainty = mass); unassigned mass goes to the full frame (ignorance). Sources fold pairwise under Dempster's rule: products of masses on intersecting subsets, conflict mass K discarded and renormalized by 1−K; K=1 (total conflict) is a run error. Bel(Q) sums masses of subsets ⊆ Q; Pl(Q) sums masses intersecting Q.

## Pseudocode
```
function run(input):
    frame = hypotheses from conclusions + query (≤8); emit ds-load-bpa
    group rules by id into BPAs; top up ignorance to the frame
    fold sources: combined = dempster(current, next); emit ds-combine (K logged)
    Bel/Pl over query subset; emit ds-belief
    output facts belief:<q>, plausibility:<q> at 9 dp
```

## Input contract
- rules: id = source, conclusion = comma-separated subset, certainty = mass ∈ [0,1]
- goal `query` — comma-separated query subset

## Output contract
- facts `belief:<q>` / `plausibility:<q>`; `selected` = "Bel=…, Pl=…"
- trace: `ds-load-bpa`(1,1) → `ds-combine`(0,*) → `ds-belief`(1,1)

## Complexity
O(s · 2^|frame| squared per fold) — bounded by 8 hypotheses (256 subsets).

## Generalization examples
Witness/sensor fusion, fault diagnosis with explicit ignorance.

## Adversarial coverage
- Refusal: empty rules, missing query, masses outside [0,1], mass on the empty set
- Hidden: Bel(flim)+Bel(flam)=0.5<1 (signature subadditivity); two-source combination 0.125/0.625=0.2 to 1e-9; K=1 run error
- Paper: Shafer 1976 two witnesses at 0.9 → Bel(life)=0.99

## See also
- `bayesian_network.md`
