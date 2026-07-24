# ADR-001: Rank in TypeScript, eliminate in Dendral, question with Eliza

- **Status:** Accepted for implementation; not implemented by this documentation branch
- **Date:** 2026-07-24
- **Decision owner:** InterviewAssist / wasm4pm planning

## Context

The currently wired adapter makes one real `cognition_run` call with `breed: "eliza"`. It passes the observed utterance as `intent`, passes `COGNITION_RULES`, and passes an empty `candidates` array. A successful response contains one `selected` value and one `explanation`; it does not contain a ranked candidate list.

The shared WASM ABI already defines `Candidate { id, score, eliminated, elimination_reason }`. Dendral consumes pre-scored candidates plus `constraint` facts, preserves the supplied scores, records monotonic elimination steps, and selects the highest-scoring survivor. Dendral does not derive scores from free text. Version Space learns a positive/negative classifier from declared attributes and labeled examples and returns a classification verdict; it is not a free-text ranker. Bayesian Network requires an explicit query plus CPT/rule structure; it likewise does not infer this ranking directly from an utterance.

The UI specification needs both of these outcomes:

1. a deterministic ranked track list; and
2. one scoped Eliza-style clarification question.

### Evidence commands executed

The following repository reads were executed against `docs/v26.7.24-planning-diagramming` on 2026-07-24:

```text
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/cognition-adapter.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/domain/cognition-rules.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=crates/wasm4pm-cognition/src/breeds/mod.rs ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=crates/wasm4pm-cognition/src/breeds/dendral.rs ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=crates/wasm4pm-cognition/src/breeds/version_space.rs ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=crates/wasm4pm-cognition/src/breeds/bayesian_network.rs ref=docs/v26.7.24-planning-diagramming
```

## Options considered

### Option A — TypeScript scoring plus Eliza question generation

Score keyword hits in TypeScript, group them by the rules' generated target-track metadata, sort the tracks deterministically, and continue calling Eliza for the selected track's question text.

**Advantages**

- Smallest change to the currently wired route and UI contract.
- Numeric ranking remains transparent and straightforward to unit-test.
- Eliza continues doing the work it already performs correctly: producing a scoped question from a matched rule.

**Disadvantages**

- The candidate ranking itself has no cognition-breed inference trace.
- A receipt can prove that TypeScript code ran only if a new application-level scoring receipt is designed; it cannot honestly claim that a breed ranked or eliminated the candidates.
- The UI's ranked list and the WASM cognition result remain two adjacent products rather than one admitted cognition result.

### Option B — TypeScript scoring, then Dendral elimination, then Eliza question generation

Score keyword hits in TypeScript, construct real ABI `Candidate` values, pass those scores and admitted constraint facts into a real Dendral call, use Dendral's surviving candidates and selected highest-scoring survivor as the ranked result, then call Eliza for the scoped question text.

**Advantages**

- Uses each mechanism for the operation it actually implements: TypeScript derives free-text hit scores; Dendral performs traceable candidate elimination and deterministic survivor selection; Eliza produces the conversational question.
- The ranking path gains real breed provenance: Dendral returns the candidate vector, elimination flags/reasons, selected survivor, explanation, and inference trace through the signed WASM result.
- Reuses the existing `Candidate` ABI instead of inventing a parallel UI-only candidate type.
- Leaves room for admitted constraints to remove a high-scoring but inapplicable track without mutating the original score.

**Disadvantages**

- More integration work and a wider route response than Option A.
- Dendral still does not manufacture the numeric scores; the TypeScript scoring function remains a distinct admitted input and must not be described as breed-derived.
- Two real WASM calls are required if Dendral and Eliza both remain separate breeds, so receipt ordering and failure semantics must be explicit.

## Decision

**Choose Option B.**

Implement a deterministic TypeScript scorer as the admission boundary between free text and `Candidate.score`, then pass the scored candidates through real Dendral elimination before asking Eliza to generate the clarification question for the selected survivor.

This is the stronger design because it preserves the only practical scoring source currently available while making the candidate decision itself a real cognition-breed result. Option A would produce a useful interface, but its ranked list would remain an application-side calculation adjacent to the receipted Eliza call. Option B gives the ranking a signed Dendral inference trace without pretending Dendral computed the free-text scores.

The lawful sequence is:

```text
observed utterance
  -> admitted normalized tokens
  -> deterministic TypeScript score evidence
  -> ABI Candidate[]
  -> real Dendral elimination/selection
  -> selected surviving track
  -> real Eliza question generation
  -> UI candidate list + scoped question
```

## Consequences

### Required implementation decisions

1. **Generate track metadata; do not infer it from string prefixes.** The current generated `CognitionRule` shape contains `id`, `premise`, `conclusion`, and `certainty`, but not `targetTrackId`. The ontology/query projection must expose a generated rule-to-track relation before the scorer is implemented. Hand-parsing `two-sum-*` or `valid-parentheses-*` rule IDs is rejected.
2. **Define the score law.** The scorer must specify token normalization, duplicate-hit handling, certainty weighting, normalization to `[0,1]`, and deterministic tie-breaking. The same input and rule catalog must produce byte-identical candidates.
3. **Treat scores as admitted evidence.** The Dendral receipt proves elimination and survivor selection over supplied scores. It does not prove that those scores were correctly derived. The route must retain the scorer's input/output evidence so the score calculation is independently replayable.
4. **Chain the two cognition calls.** The Dendral result must precede the Eliza result in the receipt chain. A Dendral refusal must not be collapsed into an Eliza no-match, and an Eliza infrastructure failure must not erase the already-produced Dendral result.
5. **Return one coherent contract.** The route response should expose ranked candidates, `selectedTrackId`, Dendral elimination reasons/provenance, Eliza question text, and the ordered cognition receipts. The current single `selected`/`explanation` response remains the compatibility boundary until that contract lands.

### Verification required before implementation can be called ALIVE

```text
unit: deterministic scorer, normalization, ties, zero-hit refusal
integration: real Dendral WASM call receives scored candidates and returns the expected survivor/eliminations
e2e: real route renders ranked candidates and the Eliza question for the Dendral-selected survivor
negative: malformed score, all candidates eliminated, Dendral unavailable/refused, Eliza unavailable after Dendral success
receipt/replay: scorer evidence -> Dendral result -> Eliza result reproduces the same ordered output
```

No application or cognition-crate code is changed by this ADR.

## Links

- [Priority matrix and release backlog](README.md)
- [UI/UX redesign §5](../../../diagrams/ui-ux-redesign.md#5-eliza-style-cognition-panel)
