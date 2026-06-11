# FRAMES_INHERITANCE

## Origin
- **Paper:** "A Framework for Representing Knowledge" (MIT AI Memo 306, 1974)
- **Authors:** Marvin Minsky
- **Tradition:** Frame systems, semantic networks

## Algorithm
Slot resolution walks the isa-chain upward from the queried frame. At each frame an OWN slot value beats a DEFAULT slot value, and the nearest frame on the chain wins (inferential distance): a child's value overrides any ancestor default. Cycles in the isa-chain are detected and refused. The resolve step is emitted even when the slot is unresolved so the lifecycle is always complete.

## Pseudocode
```
function run(input):
    parse "resolve <frame> <slot>"; load frame:* facts; emit frame-load
    f = frame; visited = {}
    loop:
        if f in visited: error cycle
        emit frame-walk
        if own[f][slot]:     resolve (own)
        if default[f][slot]: resolve (default)
        f = isa[f] or break
    emit frame-resolve (value or "unresolved")
```

## Input contract
- intent `"resolve <frame> <slot>"`
- facts `frame:<F>:isa`, `frame:<F>:slot:<s>`, `frame:<F>:slot:<s>:default`

## Output contract
- `selected` = value; fact `frame:resolved:<frame>:<slot>`
- trace: `frame-load`(1,1) → `frame-walk`(1,*) → `frame-resolve`(1,1)

## Complexity
O(chain length) per query.

## Generalization examples
Type hierarchies with defaults, prototype objects, ontology slot lookup.

## Adversarial coverage
- Refusal: malformed intent, no frame facts, malformed frame keys
- Hidden: zilk→welp→snorf — welp own slot overrides snorf root default; frame-walk count == path length (defeats flat lookup); isa-cycle run error
- Paper: Minsky 1974 — my_chair inherits legs=4 default from chair at distance 1

## See also
- `default_logic.md`
