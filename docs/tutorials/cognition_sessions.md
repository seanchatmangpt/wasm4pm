# Tutorial: State-Carrying Cognition Sessions

`wasm4pm-cognition` normally executes one old-AI breed per contract. Cognition sessions add a compound boundary for bounded domains that need evidence to accumulate across multiple observations without hidden mutable state.

## Core law

```text
SessionTurn(domain_pack, previous_state, observation, confirmation)
  -> next_state + projection + inference_trace + OCEL + receipt
```

The host persists `next_state` and supplies it on the next turn. Before admission, the Rust kernel verifies the state hash, replays every observation and explicit evidence retraction, reconstructs the evidence set, recomputes the ranking and concept coverage, and verifies the stored phase and confirmation state. A state with a freshly recomputed hash is still refused when its derived contents do not follow from its admitted observations.

Session state is explicit rather than server-owned. This makes one turn a deterministic function of the domain pack, prior state, observation, and confirmation.

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
  type SessionState,
} from '@wasm4pm/cognition';
import domainPackJson from './domain.json';

const domainPack = DomainPackSchema.parse(domainPackJson);
let state: SessionState | undefined;

const result = await runSessionTurn({
  domain_pack: domainPack,
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

The TypeScript boundary validates and transports structured data only. Matching, negation, evidence fusion, rule firing, commitment revision, phase transitions, hashing, and OCEL derivation execute in Rust/WASM.

## Domain packs

A version 2 domain pack declares:

- a guidance catalog for every concept;
- candidate tracks and the concepts applicable to each track;
- all-match phrases with signed per-track weights;
- forward-chaining rules whose premises must be producible by patterns;
- ordered workflow phases;
- confidence, margin, coverage, contradiction, and confirmation gates;
- hard resource caps.

The coding-interview reference pack is located at:

```text
crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json
```

It contains coordinate traversal, grid DFS, graph DFS, and hash lookup. The domain pack is canonical source data, not generated output or kernel code.

## Track-conditioned coverage

Concept coverage is computed separately for every track. Evidence that establishes `data_structure` for graph DFS does not mark `data_structure` covered for coordinate traversal. A workflow phase is skipped only when its required concept does not apply to the committed track; for example, hash lookup does not need an artificial transition-function phase.

## Confirmation and revision

When the top hypothesis passes all machine gates, the projection exposes `pending_confirmation`. Submit a confirmation-only turn:

```ts
const confirmed = await runSessionTurn({
  domain_pack: domainPack,
  previous_state: state,
  confirmation: { track_id: 'coordinate_traversal', accepted: true },
});
```

A rejection must target the pending or currently committed track. It eliminates that track and recomputes the ranking. Later observations can also reopen a previously confirmed commitment when contradiction, confidence, or margin gates cease to hold.

## Correct refusals

The WASM boundary returns `status: "refused"` for malformed input, empty observations, domain violations, inconsistent state, domain mismatches, resource exhaustion, unknown retractions, and invalid confirmations. `runSessionTurn` converts this into a `CognitionError` with code `SESSION_REFUSED` while preserving the exact refusal, refusal hash, attested hash, replay pointer, and attestation in `error.details`.

Input validation, malformed boundary JSON, invalid boundary shapes, WASM initialization, and execution failures retain separate TypeScript error codes.

## Receipts and attestations

The canonical computation commitment is the domain-separated BLAKE3 receipt. A successful boundary response exposes the receipt's combined hash as `attested_hash`; a refusal exposes its refusal hash.

When the crate includes `actor-ed25519`, the browser boundary adds an `ed25519-self-signed` attestation over the run ID, input hash, and attested hash. The deterministic browser key is intentionally described as a local replay signature, not remote actor authentication. Without that feature, the response reports `blake3-only` with null signature fields.

## Reference UI

`examples/interview-assistant` is the laptop-oriented lower-screen application. It:

- serializes speech, manual observations, and confirmations through one state chain;
- processes only newly finalized Web Speech results;
- validates persisted state before reuse;
- displays ranked tracks, exact matched phrases, concept coverage, and remaining ontology guidance;
- provides explicit yes, no, and reset controls;
- displays the latest inference trace and receipt pointer.

Run it from the repository root with `pnpm run interview:dev`.
