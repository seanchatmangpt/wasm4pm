# Deterministic command projection

## Decision

`wasm4pm-cognition` treats human readability as a **projection boundary**, not as a control loop.

The production objective is boring infrastructure: predictable, inspectable, replaceable parts with explicit contracts. The human-facing persona may be Napoleon, Sun Tzu, Clausewitz, Boyd, or a DISC-shaped presentation, but none of those presentations owns planning, authority, or actuation.

> Nobody wants an exciting elevator. Consequential enterprise infrastructure should earn the same expectation of boring, repeatable behavior.

The implementation is `crates/wasm4pm-cognition/src/command_projection.rs`.

## Canonical state progression

The medallion architecture is interpreted as epistemic standing:

```text
Bronze        Silver       Gold          BRCE          Reality        Evidence
Observed  ->  Admitted  -> Qualified  -> Authorized -> Executed   -> Verified
```

`Observed` is raw reality and may contain probabilistic or generative interpretation. `Admitted` is canonical state. `Qualified` is executable knowledge that has passed its verification contract. Authority remains a separate membrane: Gold is not DO.

The projection layer refuses Bronze facts. Human-readable command text can be rendered only from `Admitted` or stronger standing.

## AI at boundaries, not in the consequential core

Potentially probabilistic/generative machinery is quarantined to boundaries where ambiguity genuinely exists:

1. **Bronze -> Silver: interpretation.** Models may propose structured candidates from unstructured observations. They cannot admit their own output.
2. **Silver -> Gold: research/manufacture.** Planners, solvers, simulation, or models may discover candidate policies. A candidate must be independently qualified before it becomes Gold.
3. **Silver/Gold -> human: projection.** A presentation system may explain already-grounded state. It is read-only and downstream of control.

The mature consequence path is intentionally boring:

```text
Silver -> qualified policy -> Gold -> BRCE -> DO -> receipt
```

No presentation component is on that path.

The hard invariant is:

```text
AI may propose promotion; AI may not promote itself.
```

## Hearsay-II and ELIZA composition

This surface reuses the repository's existing historical cognition implementations rather than introducing an LLM dependency.

### Hearsay-II: deterministic salience blackboard

Every eligible fact is posted to the Hearsay blackboard. Knowledge-source certainty is fixed at `1.0`; there is no probabilistic confidence estimate in this projection boundary. Symbolic rank is encoded into the posted `headline:<rank>:<fact-id>` hypothesis. Hearsay therefore provides blackboard/agenda semantics and deterministic selection.

### ELIZA: deterministic template selection

ELIZA receives only a presentation-profile token and selects a fixed template identifier using its existing pattern/reassembly implementation. Typed machine facts are inserted by the projection renderer after the template is selected; ELIZA does not invent or mutate control facts.

The result is replayable:

```text
same machine subject + same profile -> bit-exact projection
```

## Human personality is presentation policy

The system distinguishes:

```text
HumanPersonality -> PresentationPolicy
```

from the forbidden coupling:

```text
HumanPersonality -/-> ControlPolicy
```

A DISC vector is therefore just a rendering parameter. The arithmetic complement is supported explicitly. On the declared 0-10 scale:

```text
10 / 8 / 4 / 4 -> 0 / 2 / 6 / 6
```

The latter can produce a more evidence/continuity-forward rendering, but both renderings bind to the same `control_subject_hash`.

Strategist profiles similarly change vocabulary and salience only. A Napoleon projection may lead with a decisive point while a Sun Tzu projection leads with uncertainty or constraints. The machine decision remains identical.

## Two hashes, two authorities

Every projection contains two identities:

- `control_subject_hash`: BLAKE3 over campaign id, machine decision, standing, and the sorted typed facts/provenance. It deliberately excludes strategist and DISC preferences.
- `projection_hash`: BLAKE3 over the control subject plus presentation profile, Hearsay selection, ELIZA template, and final text.

Therefore two executives can see different explanations of the same machine state while cryptographically proving they are looking at the same control subject.

## Project 2 blackboard relationship

GitHub Project 2 is an observation/coordination blackboard, not an authority source. Repository agents may read shared state, ownership, standing, evidence, and dispatch information from the blackboard, but a Project 2 item does not itself authorize DO.

The same rule applies locally here:

```text
blackboard state != authority
projection       != authority
qualified Gold   != authority
```

Only the explicit authority boundary may cross into consequence.

## Interchangeable parts

The semantic contract is independent of the runtime body:

```text
SemanticContract != RuntimeBody
```

Qualified policy can be manufactured into the runtime appropriate to its physical constraints:

- Rust for ultra-hot deterministic paths;
- AtomVM for supervised embedded/edge custody;
- BEAM/OTP for richer distributed supervision;
- WASM for portable execution boundaries.

The same rule spine travels. `ggen` can manufacture these qualified interchangeable parts while `wasm4pm-cognition` remains a bounded cognition/projection component.

## Western Electric, not Skynet

The target is not a central superintelligence continuously improvising over enterprise chaos. The target is an industrial system of bounded, testable, interchangeable parts. Intelligence is used to discover and formalize recurring knowledge; mature knowledge is compiled into stable infrastructure.

```text
UNKNOWN
  -> research
  -> formalization
  -> falsification
  -> qualification
  -> manufacture
  -> boring infrastructure
```

The desired asymptote is less runtime intelligence, not more:

```text
verified knowledge increases -> recurring general reasoning decreases
```

This is the practical meaning of making the world more stable instead of building ever-larger machinery to cope with permanent chaos.

## Acceptance/falsification criteria

The command projection is not qualified merely because it renders readable prose. The following must hold:

1. `Observed`/Bronze facts fail closed.
2. Same subject + same profile produces an identical result.
3. Reordering facts does not change the control-subject identity.
4. Changing strategist or DISC may change projection identity/text but cannot change control-subject identity.
5. Projection effect is always `ReadOnly`.
6. Every displayed headline binds to a typed fact id and source receipt.
7. Hearsay certainty is fixed at `1.0` in this boundary; presentation salience is symbolic.
8. Removing all LLMs leaves planning, execution, verification, and human-readable projection operational.

The implementation tests in `crates/wasm4pm-cognition/tests/command_projection.rs` cover the first five directly and bind the remaining properties to explicit output fields for downstream verification.
