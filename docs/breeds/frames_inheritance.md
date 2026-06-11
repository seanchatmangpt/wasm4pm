# frames_inheritance — Frame-based Inheritance

## 1. Identity & Lineage
Frame-based inheritance — Minsky 1974. BreedId `frames_inheritance`, module `src/breeds/frames_inheritance.rs`.

## 2. Algorithm
Slot resolution walks the isa-chain upward from the target frame. An own slot value is preferred over a default slot value. The nearest frame on the chain wins (inferential distance). Cycles in the isa-chain are detected and trigger refusal.

## 3. Input Contract
Intent = `"resolve <frame> <slot>"`. Facts encode the network: `frame:<F>:isa` = parent, `frame:<F>:slot:<s>` = own value, `frame:<F>:slot:<s>:default` = default value.

## 4. Output Contract
Fact `frame:resolved:<frame>:<slot>` with resolved value. `selected` = value string.

## 5. Trace & OCEL Lifecycle
`frame-load`(1,1) → `frame-walk`(1,*) → `frame-resolve`(1,1). Trace emitted even when unresolved. Report fitness 1.0.

## 6. Oracles
Refusal: malformed intent / no frame facts / isa cycle. Hidden: own overrides default; nearest ancestor wins. Paper: my_chair isa chair isa furniture; default legs=4 inherited.

## 7. Determinism & Bounds
BTreeMap and BTreeSet working sets only. Cycle detection set prevents infinite walks. Fixed string comparisons for resolution. 

## 8. Provenance
Fixture `tests/fixtures/papers/frames_inheritance.json` (Minsky 1974 frame systems and default assignments).
