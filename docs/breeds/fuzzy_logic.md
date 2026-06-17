# FUZZY_LOGIC

## Origin
- **Paper:** "An Experiment in Linguistic Synthesis with a Fuzzy Logic Controller" (IJMMS 7(1), 1975)
- **Authors:** E. H. Mamdani, S. Assilian (sets: Zadeh 1965)
- **Tradition:** Fuzzy control, approximate reasoning

## Algorithm
Mamdani inference: crisp inputs are fuzzified through triangular/trapezoidal membership functions; rules fire with the min t-norm over premise memberships; consequent strengths aggregate with max; each output variable is defuzzified by a 101-point discrete centroid over the union of its clipped terms. All working sets are BTreeMap (audit defect FZ-1 fixed: no HashMap iteration anywhere); memberships round to 1e-5 for bit-stable receipts.

## Pseudocode
```
function run(input):
    terms  = parse fuzzy:<var>:<term> membership functions
    for each input term: mu = mf(x); emit fuzzy-fuzzify
    for each rule: strength = min(mu of premises); emit fuzzy-fire
                   aggregated[conclusion] = max(aggregated, strength)
    emit fuzzy-aggregate per consequent
    for each output var: centroid = sum(x·mu)/sum(mu) over 101 points
    emit fuzzy-defuzz; output fact fuzzy:output:<var>
```

## Input contract
- facts `fuzzy:<var>:<term>` = `tri:a,b,c` | `trap:a,b,c,d`
- facts `fuzzy:input:<var>` = crisp value; rules over term keys

## Output contract
- facts `fuzzy:output:<var>` — centroid value
- trace: `fuzzy-fuzzify`(1,*) → `fuzzy-fire`(1,*) → `fuzzy-aggregate`(1,*) → `fuzzy-defuzz`(1,1)

## Complexity
O(|terms| + |rules| + 101·|output terms|).

## Generalization examples
Controller synthesis (steam engine, fan speed), linguistic decision rules.

## Adversarial coverage
- Refusal: missing inputs/rules/terms; malformed membership functions
- Hidden: Tri(2,5,8) at 3.7 → 0.56667 to 1e-5; t-norm boundary axioms min(1,μ)=μ, min(0,μ)=0
- Paper: Mamdani 1975 — hand-derived asymmetric discrete centroid 41.66667 (defeats midpoint fakes flagged in audit SF-3)

## See also
- `dempster_shafer.md` — the other graded-uncertainty P1 breed
