# Tutorial: State-Carrying Cognition Sessions

`wasm4pm-cognition` normally executes one old-AI breed per contract. Cognition sessions add a compound boundary for bounded domains that need evidence to accumulate across multiple observations without hidden mutable state.

## Core law

```text
SessionTurn(domain_pack, previous_state, observation, confirmation)
  -> next_state + projection + inference_trace + OCEL + receipt
```

The host persists `next_state` and supplies it on the next turn. The WASM kernel recomputes `state_hash` before accepting the state. A modified turn counter, hypothesis, evidence record, or domain-pack hash is refused.

## Browser API

```ts
import { runSessionTurn, type DomainPack, type SessionState } from '@wasm4pm/cognition';

let state: SessionState | undefined;
const result = await runSessionTurn({
  domain_pack: domainPack as DomainPack,
  previous_state: state,
  observation: {
    id: 'transcript-1',
    source: 'candidate',
    text: 'I would use x and y and a dictionary of moves',
    retract_evidence_ids: [],
  },
});
state = result.output.state;
```

The TypeScript boundary performs schema admission and rendering only. All matching, evidence fusion, rule firing, commitment gates, phase transitions, hashing, and OCEL derivation execute in Rust/WASM.

## Domain packs

A domain pack declares candidate tracks, expected concepts, all-match phrases and signed weights, forward-chaining rules, workflow phases, confidence gates, and hard resource caps. The coding-interview reference pack is located at:

```text
crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json
```

It contains coordinate traversal, grid DFS, graph DFS, and hash lookup. The domain pack is data, not kernel code.

## Confirmation

When the top hypothesis passes all machine gates, the projection exposes `pending_confirmation`. Submit a confirmation-only turn:

```ts
const confirmed = await runSessionTurn({
  domain_pack: domainPack,
  previous_state: state,
  confirmation: { track_id: 'coordinate_traversal', accepted: true },
});
```

A rejection eliminates the track and deterministically recomputes the ranking.

## Correct refusals

The WASM boundary returns `status: "refused"` with a signed refusal hash for malformed input, domain violations, tampered state, domain mismatches, resource exhaustion, unknown retractions, and invalid confirmations. `runSessionTurn` converts this into a `CognitionError` with code `SESSION_REFUSED`; the exact kernel refusal remains in `error.details.refusal_code`.

## Reference UI

`examples/interview-assistant` is a laptop-oriented browser UI. It uses the Web Speech API when available, allows manual transcript fragments, persists state in `localStorage`, and renders ranked hypotheses, covered concepts, missing concepts, confirmation controls, trace evidence, and replay pointers.
