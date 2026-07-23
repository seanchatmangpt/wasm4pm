# Tutorial: State-Carrying Cognition Sessions

`wasm4pm-cognition` normally executes one old-AI breed per contract. Cognition sessions add a compound boundary for bounded domains that need evidence to accumulate across multiple observations without hidden mutable state.

## Core law

```text
SessionTurn(domain_pack, previous_state, observation, confirmation)
  -> next_state + projection + inference_trace + OCEL + receipt
```

The host persists `next_state` and supplies it on the next turn. Before admission, the Rust kernel verifies the state hash, replays every observation, confirmation, and explicit evidence retraction, reconstructs evidence, recomputes ranking and concept coverage, and verifies phase and confirmation state.

## Browser initialization

Browser applications initialize the web-target package through a bundle-visible loader:

```ts
import { initCognitionBrowser } from '@wasm4pm/cognition/browser';

await initCognitionBrowser({
  moduleLoader: () => import('wasm4pm-cognition-web'),
});
```

All wrappers then consume the same `WasmLoader` singleton.

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
    id: crypto.randomUUID(),
    source: 'candidate',
    text: 'I would use x and y and a dictionary of moves',
    retract_evidence_ids: [],
  },
});
state = result.output.state;
```

The TypeScript boundary validates and transports structured data only. Matching, evidence fusion, rule firing, commitment revision, phase transitions, hashing, and OCEL derivation execute in Rust/WASM.

## Domain packs

A version 2 domain pack declares:

- a guidance catalog for every concept;
- candidate tracks and applicable concepts;
- all-match phrases with signed per-track weights;
- forward-chaining rules whose premises have target-supporting producers;
- ordered workflow phases;
- confidence, margin, coverage, contradiction, and confirmation gates;
- hard resource caps.

The reference pack is:

```text
crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json
```

It contains coordinate traversal, grid DFS, graph DFS, and hash lookup.

## Track-conditioned coverage

Concept coverage is computed separately for every track. Evidence that establishes `data_structure` for graph DFS does not cover `data_structure` for coordinate traversal.

## Confirmation and revision

When the top hypothesis passes all machine gates, the projection exposes `pending_confirmation`:

```ts
const confirmed = await runSessionTurn({
  domain_pack: domainPack,
  previous_state: state,
  confirmation: { track_id: 'coordinate_traversal', accepted: true },
});
```

Later observations reopen a commitment when confidence, margin, minimum coverage, or contradiction authorization no longer holds.

## Persisted-state verification

Shape validation does not grant standing. Restored state must be replay-verified before rendering:

```ts
import { verifySessionState } from '@wasm4pm/cognition';

await verifySessionState(domainPack, restoredState);
```

`cognition_session_verify` performs no new turn. It validates the domain, checks the state hash, replays the ledger, compares reconstructed state, and emits a verified receipt or receipted refusal.

## Canonical Python projection

The cognition kernel can project a canonical Python artifact from replay-verified state:

```ts
import { projectSessionCode } from '@wasm4pm/cognition';

const projected = await projectSessionCode(domainPack, state);
console.log(projected.code?.filename);
console.log(projected.code?.source_hash);
```

The authority path is:

```text
SessionState
  -> replay verification
  -> committed track or leading non-eliminated hypothesis
  -> canonical first-class .py artifact
  -> domain-separated BLAKE3 source hash
  -> receipted cognition_session_code response
```

React does not map track IDs to source. The canonical files live at:

```text
crates/wasm4pm-cognition/examples/cognition/interview_session/python/
```

A leading hypothesis produces `selection_status = leading_hypothesis`. Confirmation changes the status to `committed` while preserving the same source and source hash.

## Next.js and Monaco

`examples/interview-assistant` is a Next.js App Router package. It:

- initializes the browser WASM package client-side;
- replay-verifies `localStorage` state before rendering;
- serializes observations and confirmations through one state chain;
- requests code through `projectSessionCode` after every successful turn;
- displays the returned Python source in read-only Monaco;
- displays source, code-projection, and turn receipt hashes;
- exposes explicit yes, no, and reset controls.

Monaco is loaded with `next/dynamic` and server-side rendering disabled because the editor requires a browser document.

Run it with:

```bash
pnpm run interview:dev
```

Build or type-check it with:

```bash
pnpm run interview:build
pnpm run interview:typecheck
```

## Full-hour text-screen simulation

The repository contains a realistic 9:00 AM–10:00 AM interview fixture with 26 ordered turns:

```bash
pnpm run interview:test:text
```

Nine checkpoints render deterministic text screens with elapsed time, turn number, phase, ranked hypotheses, commitment, coverage, transcript, and receipt prefixes. The final state is a complete committed coordinate-traversal solution and replaying the hour produces bit-identical state and screens.

Separate Rust tests prove that this state selects `coordinate_traversal.py` and that confirmation changes status without changing source identity.

## Correct refusals

The WASM boundaries return `status: "refused"` for malformed input, empty observations, domain violations, inconsistent state, domain mismatches, resource exhaustion, identity reuse, unknown retractions, and invalid confirmations. TypeScript preserves the exact refusal and receipt evidence in `CognitionError.details`.

## Receipts and attestations

The canonical computation commitment is the domain-separated BLAKE3 receipt. When `actor-ed25519` is enabled, the browser boundary adds an `ed25519-self-signed` local replay signature. It is not remote actor authentication.
