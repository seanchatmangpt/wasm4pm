# Canonical objective and telos

## Decision

`wasm4pm-planner` has one fixed whole-system objective. A caller may supply observations, evidence, candidate continuations, and falsifiers; a caller may not supply a different objective function while retaining canonical standing.

The implementation is `crates/wasm4pm-planner/src/constitutional_objective.rs`.

This closes a design gap exposed by the Project 2 / command-projection work: a deterministic presentation layer is insufficient if humans can still choose arbitrary objectives upstream.

The architecture is therefore **teleologically closed and epistemically open**:

```text
objective: fixed
model: fallible
observations: open
falsification: open
selection: deterministic
actuation: separately authorized
```

## Fuller canon

The engineering canon is the Buckminster Fuller / Spaceship Earth direction: optimize the whole system for durable human flourishing within the physical and regenerative limits of Earth, rather than optimizing a local subsystem at the expense of the whole.

The canonical objective is not implemented as a configurable weighted sum. It is lexicographic:

```text
viability
  > regeneration
  > humanity
  > optionality
  > ephemeralization
  > stability
```

These dimensions mean:

- **Viability** — compatibility with physical reality and long-horizon survival.
- **Regeneration** — preservation or increase of the substrate's regenerative capacity.
- **Humanity** — whole-human benefit rather than narrow subsystem advantage.
- **Optionality** — future lawful maneuver preserved after commitment.
- **Ephemeralization** — useful consequence with less matter, energy, time, complexity, and runtime cognition.
- **Stability** — recurring complexity converted into predictable, inspectable infrastructure.

A lower dimension cannot compensate for failure at a higher dimension. This prevents a caller from assigning enough local utility, popularity, profit, or convenience to overwhelm viability.

## Design for Combinatorial Maximalism

DfCM does not mean preserving every imaginable option forever. It means preserving the maximal feasible set **inside the governing objective** until admitted evidence justifies commitment.

```text
A0 = all proposed continuations
AΩ = continuations conformant with reality + canon
DfCM = preserve AΩ until evidence supports selection
SELECT = exactly one canonical continuation
```

If any candidate still relies on evidence below `Admitted`, final selection refuses rather than silently deleting an unresolved possibility. Once the candidate set is admitted, the objective selects exactly one continuation. Exact-score ties are resolved by canonical identifier ordering, not human preference.

This is maximal maneuver before commitment, not maximal indecision.

## Physics precedes preference

The architecture treats physical constants and observed constraints as upstream of human preference. Gravity, thermodynamics, finite resources, elapsed time, biological requirements, and measured consequences are not stakeholder votes.

The planner therefore distinguishes:

```text
preference != evidence
popularity != truth
claimed authority != authority
objection != falsifier
```

An outside group may dislike a continuation. That is an observation. It affects selection only if it contributes admitted evidence of a violated invariant, missed consequence, bad model, or other decision-relevant fact.

The objective is closed to arbitrary replacement but the model remains open to correction from anyone.

## External signals

`ExternalSignal` has three forms:

1. `Preference` — approval, disapproval, popularity, stakeholder desire.
2. `ClaimedAuthority` — a speaker invokes institutional, personal, sacred, or other authority.
3. `Falsifier` — a factual claim that a candidate or model is wrong.

Only an admitted falsifier can remove a candidate from the current feasible set.

Preferences and claimed authority may be recorded, displayed, or investigated, but they have no control authority and are excluded from the selection subject hash.

This yields the governing rule:

```text
Your preference has no authority over Ω.
Your evidence can overturn our model.
```

## Alpha and Omega: theological interpretation, not runtime oracle

The conversation motivating this design used `Alpha and Omega` as a theological systems metaphor: origin and terminal purpose unified in one referent. In that framing, an ultimate objective is discovered rather than manufactured by each local actor.

The implementation deliberately does **not** encode God as a software object, oracle, persona, or executable authority source. A theological claim may motivate the constitution, but runtime software cannot prove divine endorsement of a human action.

That distinction is essential:

```text
Ω* may be treated as absolute by the governing worldview.
O* remains epistemically bounded.
```

Therefore:

```text
"God told me X" != authority(X)
```

Invoking the highest possible noun cannot bypass admission, falsification, authority, consequence, or receipts. The higher the claimed authority, the less acceptable self-authentication becomes.

This also prevents sacred language from becoming a mechanism for human authority capture.

## Bible as recurring system-pattern prior art

The biblical corpus can be useful to religious and nonreligious readers as a compressed library of recurring human-system structures. The implementation does not treat a biblical story as a planner oracle. It treats historical narratives as hypotheses about recurring classes that still require present evidence.

Examples of reusable process structures include:

- **Babel** — increasing capability and coordination without corresponding wisdom can amplify systemic failure.
- **Joseph** — weak signal -> interpretation -> preparation during abundance -> stored capacity -> crisis resilience.
- **Exodus** — productive system -> concentrated power -> human subordination -> exit -> law -> new institutions.
- **Jethro** — a single human decision bottleneck does not scale; routine authority should be distributed while exceptional cases escalate.
- **Prophetic/institutional drift** — local objectives can detach institutions from their declared telos while status claims remain intact.
- **Golden-calf/proxy failure** — a visible proxy can replace the harder-to-observe governing objective.
- **Sabbath/Jubilee-like constraint** — optimization must not consume the substrate on which the optimizer depends.

The rule is not "this verse predicts AI." It is:

```text
new implementation != new problem class
```

AI changes coefficients — speed, scale, leverage, cost of replication — while many authority, scarcity, coordination, deception, succession, and institutional-drift structures recur.

Hence:

```text
future exact state: unknown
transition classes: often known
```

The appropriate response to a recognized class is prior-art recovery, formalization, falsification, and deterministic manufacture rather than re-solving the same class from scratch.

## Synoptic / sacred-authority fence

The motivating theological discussion also separated Jesus from later human claims made in Jesus' name. Whatever theological position a user takes, the engineering rule is simpler and universal:

```text
referent != human claim to own the referent
```

No religious office, political office, corporate office, founder, model, or planner can manufacture standing by asserting that the terminal objective agrees with it.

Claims enter as observations. Evidence establishes facts. Authority remains an explicit separate boundary.

## Projection is subordinate

Historical strategist profiles, DISC-like communication profiles, and other presentation grammars are not alternative objective functions.

The production relationship is:

```text
CanonicalObjective -> one selected continuation -> machine state -> projection
```

not:

```text
human chooses worldview/persona -> worldview changes objective -> different decision
```

A presentation grammar may be chosen automatically to minimize information loss for a recipient, but it must preserve the selected control subject. Human personality may affect presentation; it cannot affect control policy.

## Competitive consequence

The system may be offered only within a mission-bound community that accepts the canonical constitution. Alignment is not a runtime vote over the objective; it is conformance to the shared method and telos.

The economic advantage comes from accumulating executable knowledge:

```text
UNKNOWN
  -> experiment
  -> evidence
  -> verified knowledge
  -> generated/qualified part
  -> deterministic reuse
```

Participants inherit the accumulated machinery of the system. Recurring problem classes should require progressively less runtime general intelligence.

The competitive mechanism is therefore not repeated persuasion. It is compounding infrastructure:

```text
VerifiedKnowledge ↑  =>  RecurringReasoning ↓
```

A system that converts uncertainty into reusable deterministic capital can outcompete systems that repeatedly pay for interpretation, meetings, model inference, and human coordination.

## Physical execution hierarchy

The canonical objective is upstream of the execution hierarchy discussed elsewhere in the ecosystem:

```text
Universe / observed reality
        ↓
Canonical objective
        ↓
HDIT admitted distinctions
        ↓
HDDL / FOND / planner machinery
        ↓
DfCM single continuation
        ↓
CONSTRUCT8 bounded construction
        ↓
BRCE / authority
        ↓
Rust / AtomVM / WASM / BEAM runtime body
        ↓
DO
        ↓
Receipt / OCEL / GitVan
        ↓
updated admitted reality
```

CONSTRUCT8 remains `CONSTRUCT`, not `DO`. Nanosecond-scale deterministic construction therefore increases throughput without manufacturing authority.

Wearable, mobile, edge, fog, and cloud runtimes can resolve different physical horizons, but they remain projections of the same semantic contract and objective. Moving computation toward observations reduces network and human-latency costs; it does not relax admission or authority.

## One answer, bounded knowledge

The system is designed to produce one selected continuation when standing supports one. It does not claim omniscience.

```text
fixed objective + admitted state + canonical ordering -> one answer
```

while preserving:

```text
inspection != execution
claim != evidence
selection != authority
authority != consequence
model != reality
```

Reality retains final observational authority. A receipt that contradicts the model updates the model; it does not rewrite the objective to protect a prior decision.
