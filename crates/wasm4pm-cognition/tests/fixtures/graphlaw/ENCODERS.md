# Encoders — naive_physics breed -> GraphLaw Datalog

Namespace: `https://np.graphlaw.dev/`.

## Fact encoders (np:* contract -> EDB triples [s p o])

| breed fact | Datalog triple |
|---|---|
| `np:on:a = b` | `a np:on b` |
| `np:in:a = c` | `a np:in c` |
| `np:liquid:l = c` | `l np:liquid c` |
| `np:ground:x = true` | `x np:ground np:true` |
| `np:remove:x = true` | `x np:remove np:true` |

## Rules (the four axioms, positive Horn)

1. `sup(x,y) :- on(x,y)` and `sup(x,y) :- in(x,y)` — ax-support base.
2. `sup(x,z) :- sup(x,y), sup(y,z)` — ax-support transitivity.
3. `falls(x) :- sup(x,y), removed(y)` — ax-unsupported-falls seed.
4. `falls(x) :- sup(x,y), falls(y)` — falls fixpoint cascade; doubles as
   ax-containment-transport because `in` feeds `sup`.
5. `spills(l) :- liquid(l,c), falls(c)` and
   `spills(l) :- liquid(l,c), removed(c)` — ax-liquid-spill.

## Removal-as-event

`np:remove:x` is a positive fact. Removed objects never enter `falls` (no rule
derives falls from `removed(x)` with x in the head), matching the breed, which
skips removed objects in its fixpoint. Cascades arise purely through rules 3+4.

## Determinism

Sorted EDB facts, order-independent rules; re-running the generator is
byte-idempotent.
