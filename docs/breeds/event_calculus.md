# event_calculus — Discrete Event Calculus

## 1. Identity & Lineage
Logic-based calculus of events (Kowalski & Sergot, New Generation Computing 1986), discrete simplified form. BreedId `event_calculus`, module `src/breeds/event_calculus.rs`.

## 2. Algorithm
HoldsAt(f,t) via Initially/Initiates/Terminates with Clipped(t1,f,t2) over a sorted integer timeline; inertia by default. O(events²·queries), ≤64 events.

## 3. Input Contract
Facts `ec:happens:<t>`=action, `ec:initiates:<action>`=fluent, `ec:terminates:<action>`=fluent, `ec:initially`=fluent. Queries: goals `{predicate:"ec:holdsat", value:"fluent@t"}`.

## 4. Output Contract
Facts `ec:verdict:<fluent>@<t>` = "true"/"false"; `selected` = first verdict.

## 5. Trace & OCEL Lifecycle
`load-narrative`(1,1) → {`evaluate-happens`,`clipped-check`,`holdsat-verdict`}(1,*) → `answer`(1,1). Report fitness 1.0.

## 6. Oracles
Refusal: empty narrative / malformed query. Hidden: glow on@2/off@5/on@7 → HoldsAt@4=T (inertia), @6=F (clipped), @9=T (re-initiated). Paper: hired/promoted periods (lecturer clipped by promotion).

## 7. Determinism & Bounds
Sorted happens/initially vectors; pure evaluation.

## 8. Provenance
Fixture `tests/fixtures/papers/event_calculus.json` (adapted KS86 narrative to integer time; deviation documented).
