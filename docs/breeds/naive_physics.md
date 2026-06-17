# Naive Physics

## Origin
- **Paper:** "The Naive Physics Manifesto" (1979); "Naive physics I: ontology for liquids" (1985)
- **Authors:** Patrick J. Hayes
- **Tradition:** Commonsense physical reasoning as a fixed axiomatic theory

## Algorithm
Unlike rule-driven breeds, the axioms are built in (Hayes's point: commonsense physical law is a fixed theory, not user input). The declared scene (support, containment, liquids, ground, removal events) is saturated to a fixpoint over four named axioms: `ax-support` (stability iff the support chain bottoms out at ground), `ax-unsupported-falls`, `ax-containment-transport` (contents fall with their container), and `ax-liquid-spill`. Every derived atom names its responsible axiom in the trace.

## Pseudocode
```
function run(input):
    scene from np:on/np:in/np:liquid/np:ground/np:remove   # load-scene
    for o in objects: stability via support-chain walk      # apply-axiom ax-support
    fixpoint: falls(o) if its direct support is removed or falls
        (on → ax-unsupported-falls, in → ax-containment-transport)
    spills(l) if container(l) falls or is removed            # ax-liquid-spill
    emit falls:/spills: predictions                          # predict
    trace decision
```

## Input contract
- `facts`: `np:on:<a>` = b, `np:in:<a>` = c, `np:liquid:<l>` = container, `np:ground:<x>`, `np:remove:<x>`
- refusals: empty scene; >64 objects; cyclic support chains (physically impossible)

## Output contract
- `facts`: `falls:<obj>` and `spills:<liquid>` predictions (exact closure — over-derivation is a defect)
- `selected`: `predictions:<count>`
- `inference_trace`: `load-scene` → `apply-axiom`+ → `predict`* → `decision`

## Complexity
O(objects × chain depth) for stability plus an O(objects²) worst-case falls fixpoint; ≤64 objects.

## Generalization examples
The cup-of-water scene (paper case), dependency cascade prediction (removing a base service "drops" everything transitively supported by it), container/contents transport.

## Adversarial coverage
- Refusal: cyclic support; empty scene; >64 objects
- Hidden oracle: 4-deep support/containment tower — removing the base yields exactly the transitive falls-closure (no more, no less), with the responsible axiom named for each derived atom and the liquid spilling via ax-liquid-spill
- Paper fixture: Hayes cup of water — cup falls, water spills, floor does not

## See also
- `crates/wasm4pm-cognition/src/breeds/naive_physics.rs`
- OCPN: `ocel/models/l1/naive_physics.ocpn.json`; report: `ocel/reports/naive_physics.json`
