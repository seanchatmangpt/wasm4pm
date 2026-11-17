<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/event_calculus.md; source-sha256: fc320593f364120852204cd022f8dd2e128dbe367ec362d22c93e3b4a4bc9f53; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, per-query Clipped/HoldsAt enrichment on ec-infer,
typed refusal for non-numeric `ec:happens:` times, verdicts surfaced via
`selected`.

# event_calculus — Discrete Event Calculus

## 1. Identity & Lineage
Logic-based calculus of events (Kowalski & Sergot, New Generation Computing
1986), discrete simplified form. BreedId `event_calculus`, module
`src/breeds/event_calculus.rs`.

## 2. Algorithm
Inertia timeline: `holds[0] = initially`; each step applies
initiates/terminates transitions (facts and rules), then carries each fluent
forward unless terminated. Timeline covers the last event time and every
queried time point. No event-count cap in code.

## 3. Input Contract
Canonical keys: `ec:happens:<t>`=event (`<t>` must parse as `usize`,
otherwise a typed `BreedError` refusal), `ec:initiates:<event>`=fluent,
`ec:terminates:<event>`=fluent, `ec:initially`=fluent. Historical
comma-separated convention also accepted (`initially`, `happens`="event,t",
`initiates`/`terminates`="event,fluent"). Rule premises `happens=`/`holds=`;
rule conclusions `initiates=`/`terminates=`. Queries: goals
`{predicate:"ec:holdsat", value:"fluent@t"}`. Preconditions refuse input with
neither initially facts nor happens events.

## 4. Output Contract
`selected` = per-query verdicts joined as
`ec:verdict:<fluent>@<t>=true|false,...` when queries exist, else the final
holds set joined by `,`. No query-derived facts are added to `facts`.

## 5. Trace & OCEL Lifecycle
`ec-load`(1,1) → `ec-infer`(1,*) → `ec-verdict`(0,*) → `ec-model`(1,1).
Each initiating `ec-infer` step is enriched per query with
`, Clipped(t,f,qt) = b, HoldsAt(f,qt) = b` where Clipped = some terminates
event fires in `(t, qt]` (KS86 Sections 2-5). Postconditions require
`ec-load` and `ec-model` kinds and a non-empty trace.

## 6. Oracles
Refusal: no initially/happens facts; non-numeric `ec:happens:<t>` key
(typed error, not a silent skip). Hidden: glow on@2/off@5/on@7 →
HoldsAt@4=T (inertia), @6=F (clipped), @9=T (re-initiated). Paper: hired/
promoted periods (lecturer clipped by promotion).

## 7. Determinism & Bounds
BTreeSet/BTreeMap throughout; pure evaluation; timeline length
`max(last event, max query time) + 1`.

## 8. Provenance
Fixture `tests/fixtures/papers/event_calculus.json` (adapted KS86 narrative
to integer time; deviation documented).
