# Tutorial: State-Carrying Cognition Sessions

`wasm4pm-cognition` normally executes one old-AI breed per contract. Cognition sessions add a compound boundary for bounded domains that need evidence to accumulate across multiple observations without hidden mutable state.

## Core law

```text
SessionTurn(domain_pack, previous_state, observation, confirmation)
  -> next_state + projection + inference_trace + OCEL + receipt
```

The host persists `next_state` and supplies it on the next turn. Before admission, the Rust kernel verifies the state hash and replays the complete ordered turn ledger, including observations, explicit evidence retractions, confirmations, and rejections. Replay reconstructs evidence, hypotheses, concept coverage, commitment state, phase, and the previous-state hash chain. A caller cannot make forged derived state lawful merely by recomputing the public hash while leaving the canonical ledger unchanged.

Session state is explicit rather than server-owned. One turn is therefore a deterministic function of the domain pack, prior state, observation, and confirmation.

## Browser initialization

The browser target must expose its generated JavaScript module to the bundler. Use a literal `moduleLoader` callback and the generated WASM URL:

```ts
import { initCognitionBrowser } from '@wasm4pm/cognition/browser';

await initCognitionBrowser({
  wasmUrl: new URL('./pkg-web/wasm4pm_cognition_bg.wasm', import.meta.url),
  moduleLoader: () => import('./pkg-web/wasm4pm_cognition.js'),
});
```

The callback avoids a variable bare import that bundlers cannot discover statically. After initialization, all package wrappers consume the same `WasmLoader` singleton.

## Session API

```ts
import {
  DomainPackSchema,
  runSessionTurn,
  verifySessionState,
  type SessionState,
} from '@wasm4pm/cognition';
import domainPackJson from './domain.json';

const domainPack = DomainPackSchema.parse(domainPackJson);
let state: SessionState | undefined;

const result = await runSessionTurn({
  domain_pack: domainPack,
  previous_state: state,
  observation: {
    id: crypto.randomUUID(),
    source: 'candidate',
    text: 'I would use x and y and a dictionary of moves',
    retract_evidence_ids: [],
  },
});
state = result.output.state;

// Non-mutating replay verification for restored or transferred state.
await verifySessionState(domainPack, state);
```

Observation identifiers are single-assignment identities. Reusing an identifier, even with identical content, is refused rather than recorded as a new no-op turn.

The TypeScript boundary validates and transports structured data only. Matching, negation, certainty propagation, commitment revision, phase transitions, hashing, replay verification, and OCEL derivation execute in Rust/WASM.

## Domain packs

A version 2 domain pack declares:

- a guidance catalog for every concept;
- candidate tracks and the concepts applicable to each track;
- all-match phrases with signed per-track weights;
- forward rules whose premises must have positive producers for the target track;
- ordered workflow phases;
- confidence, margin, coverage, contradiction, and confirmation gates;
- hard resource caps.

Admission rejects dead patterns, zero-certainty rules, repeated premises, inapplicable concept assignments, impossible minimum coverage, and target-incoherent rule premises.

The coding-interview reference pack is located at:

```text
crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json
```

It contains coordinate traversal, grid DFS, graph DFS, and hash lookup. The domain pack is canonical source data, not generated output or kernel code.

## Track-conditioned certainty

Direct evidence is fused separately for each track. Negating a phrase reverses that phrase's signed effect for the affected track.

Rule certainty is not injected at full strength merely because premise strings appeared somewhere. For each rule, the kernel computes target-conditioned premise certainty from active evidence, attenuates it by target contradiction, takes the weakest premise, and multiplies that value by the rule certainty. The resulting contribution is then fused with direct support. This prevents weak or target-contradicting observations from manufacturing strong rule conclusions.

Concept coverage is also computed separately for every track. Evidence that establishes `data_structure` for graph DFS does not mark `data_structure` covered for coordinate traversal. A workflow phase is skipped only when its required concept does not apply to the committed track; for example, hash lookup does not need an artificial transition-function phase.

## Confirmation and revision

When the top hypothesis passes all machine gates, the projection exposes `pending_confirmation`. Submit a confirmation-only turn:

```ts
const confirmed = await runSessionTurn({
  domain_pack: domainPack,
  previous_state: state,
  confirmation: { track_id: 'coordinate_traversal', accepted: true },
});
```

A rejection must target the pending or currently committed track. A confirmed track remains committed only while it continues to satisfy the same confidence, margin, minimum-coverage, and contradiction gates that authorized commitment. Later evidence or retraction reopens the decision when any of those gates fails.

## Persisted browser state

Shape validation is not semantic admission. The reference UI keeps restored `localStorage` data untrusted until `verifySessionState` succeeds through WASM ledger replay. Replay-invalid state is deleted before hypotheses, commitments, or phase guidance are rendered.

The browser uses UUID observation identities, so failed turns, confirmation-only turns, reloads, and imported histories cannot cause sequence-derived identifier reuse.

## Correct refusals

The WASM boundary returns `status: "refused"` for malformed input, empty observations, domain violations, inconsistent state, domain mismatches, resource exhaustion, reused observation identities, unknown retractions, and invalid confirmations. The TypeScript wrappers convert lawful refusals into `CognitionError` with code `SESSION_REFUSED` while preserving the exact refusal, refusal hash, attested hash, replay pointer, and attestation in `error.details`.

Input validation, malformed boundary JSON, invalid boundary shapes, WASM initialization, and execution failures retain separate TypeScript error codes.

## Receipts and attestations

The canonical computation commitment is the domain-separated BLAKE3 receipt. A successful turn exposes the receipt combined hash as `attested_hash`. Verification attests the replay-admitted state hash. A refusal attests its refusal hash.

When the crate includes `actor-ed25519`, the browser boundary adds an `ed25519-self-signed` attestation over the run ID, input hash, and attested hash. The deterministic browser key is a local replay signature, not remote actor authentication. Without that feature, the response reports `blake3-only` with null signature fields.

## Reference UI

`examples/interview-assistant` is the laptop-oriented lower-screen application. It:

- serializes speech, manual observations, and confirmations through one state chain;
- processes only newly finalized Web Speech results;
- replay-verifies persisted state before rendering it;
- uses UUID observation identities;
- displays ranked tracks, exact matched phrases, concept coverage, and remaining ontology guidance;
- provides explicit yes, no, and reset controls;
- displays the latest inference trace and receipt pointer.

Run it from the repository root with `pnpm run interview:dev`.
