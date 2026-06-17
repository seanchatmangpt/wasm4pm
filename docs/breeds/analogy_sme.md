# Analogy (Structure-Mapping Engine)

## Origin
- **Paper:** "The Structure-Mapping Engine: algorithm and examples" (1989)
- **Authors:** Brian Falkenhainer, Kenneth D. Forbus, Dedre Gentner
- **Tradition:** Gentner's structure-mapping theory of analogy

## Algorithm
Base and target domains are s-expressions. A local match between two expressions exists when functors and arities agree recursively; entities (atoms) align freely. Systematicity score = `1 + 2·Σ(child relation scores)` so deep causal chains dominate counts of shallow matches. Root matches are merged greedily in descending score order subject to a 1:1 entity mapping (parallel connectivity); unmatched base expressions whose entities are all mapped become candidate inferences (substituted into the target vocabulary).

## Pseudocode
```
function run(input):
    parse base:<i>/target:<i> s-exprs        # trace parse-expr
    for each (b, t) root pair: align(b, t)   # trace local-match (score)
    sort by score desc; greedily merge into one gmap if 1:1 consistent  # merge-gmap
    for unmatched base b with all entities mapped:
        emit substituted expression          # candidate-inference
    trace decision (gmap score, correspondences, inferences)
```

## Input contract
- `facts`: `base:<i>` and `target:<i>` with s-expression values (≥1 each)
- caps (refusals): ≤32 expressions per side, nesting depth ≤8, parse errors refused

## Output contract
- `facts`: `map:<base-entity>` = target entity; `inference:<i>` = carried-over expression; `sme:score`
- `selected`: `gmap:<score>`
- `inference_trace`: `parse-expr`+ → `local-match`/`merge-gmap`+ → `candidate-inference`* → `decision`

## Complexity
O(|base| × |target| × expression size) alignment; greedy merge O(matches²).

## Generalization examples
Solar-system→atom (the paper's case), water-flow→heat-flow, mapping a known incident postmortem onto a new outage to project the missing causal step.

## Adversarial coverage
- Refusal: missing target side; depth/count caps; malformed s-expressions
- Hidden oracle: three shallow attribute matches pull `gor→rix`; the deep causal chain pulls `gor→lum` — the chain must win (systematicity beats count)
- Paper fixture: FFG 1989 solar-system/atom with the causal candidate inference

## See also
- `crates/wasm4pm-cognition/src/breeds/analogy_sme.rs`; parser: `src/breeds/support/sexpr.rs`
- OCPN: `ocel/models/l1/analogy_sme.ocpn.json`; report: `ocel/reports/analogy_sme.json`
