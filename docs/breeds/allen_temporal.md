# ALLEN_TEMPORAL

## Origin
- **Paper:** "Maintaining Knowledge about Temporal Intervals" (CACM 26(11), 1983)
- **Authors:** James F. Allen
- **Tradition:** Qualitative temporal reasoning, constraint propagation

## Algorithm
The 13 basic relations are u16 bitmask positions; the 169-entry composition table is derived once by exhaustive endpoint enumeration over integer endpoints 1..=6 (sound and complete for basic relations). Symbolic `relation` facts and concrete `interval` endpoints seed an n×n constraint matrix; path consistency (`M[k][j] &= M[k][i] ∘ M[i][j]`) runs to fixpoint with a work queue; an empty relation set is an inconsistency error. Algebraic property tests (r∘eq=r, inverse involution, composition-inverse duality) guard the table.

## Pseudocode
```
function run(input):
    load intervals (concrete endpoints → exact basic relation per pair)
    load relation facts (mask intersection; emit allen-load)
    queue all ordered pairs
    while (i,j) in queue:
        for k != i,j:
            t = M[k][j] & compose(M[k][i], M[i][j])
            if t == 0: error inconsistent
            if t != M[k][j]: update + inverse, enqueue, emit allen-compose
    emit allen-verdict; output derived:A,B facts for every ordered pair
```

## Input contract
- facts `relation` = `"A,B,r1|r2"` with symbols p pi m mi o oi d di s si f fi eq
- state `interval` = `"name,start,end"` (start < end); ≤32 intervals total

## Output contract
- facts `derived:A,B` — post-fixpoint relation mask, symbols in index order
- trace: `allen-load`(1,*) → `allen-compose`(0,*) → `allen-verdict`(1,1)

## Complexity
O(n³) per queue pass; fixpoint bounded by total bit count (13n²).

## Generalization examples
Scheduling consistency, narrative ordering, medical-event timelines.

## Adversarial coverage
- Refusal: empty input (audit defect AT-3 fixed), malformed relation, >32 intervals
- Hidden: before∘meets=before on fresh gamma/delta/eps with inverse eps,gamma=after — IN THE TEST ONLY (audit defect AT-1: all oracle injection excised from run()); concrete-endpoint meets; cyclic-before inconsistency
- Paper: Allen 1983 Table 1 entry m∘d = (o s d) asserted exactly

## See also
- `ltl_monitor.md`
