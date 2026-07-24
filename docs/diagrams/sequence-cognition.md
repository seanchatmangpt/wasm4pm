# Sequence: cognition-run flow

Source: `examples/interview-assist/lib/adapters/cognition-adapter.ts` (`runCognition`,
`loadCognitionModule`, `mapThrownToOutcome`) and `app/api/cognition/route.ts`, both read directly
this session. Four real outcome branches; only two of them attach a `TransitionReceipt`.

```mermaid
sequenceDiagram
    actor Candidate
    participant Page as page.tsx (client)
    participant Route as POST /api/cognition
    participant Adapter as cognition-adapter.ts
    participant Wasm as wasm4pm-cognition WASM (Eliza)
    participant Receipt as receipt-emitter.ts

    Candidate->>Page: submit utterance (intent)
    Page->>Route: POST { intent, prevReceipt? }

    alt intent is empty/whitespace
        Route->>Adapter: runCognition(intent)
        Adapter-->>Route: { status: "refused", reason }
        Route-->>Page: 422 (no WASM call made, no receipt)
    else WASM module fails to load
        Route->>Adapter: runCognition(intent)
        Adapter->>Wasm: require("wasm4pm-cognition")
        Wasm-->>Adapter: throws (module not found / corrupted install)
        Adapter-->>Route: { status: "unavailable", reason }
        Route-->>Page: 503 (no receipt: no real action occurred)
    else real WASM call, no keyword matches intent
        Route->>Adapter: runCognition(intent)
        Adapter->>Wasm: cognition_run({breed:"eliza", contract:{intent, rules: COGNITION_RULES}})
        Wasm-->>Adapter: throws '{"error":"...empty inference trace (fraud signal)"}'
        Adapter->>Receipt: emitReceipt("cognition-run", {generated: reason, prevReceipt})
        Receipt-->>Adapter: TransitionReceipt
        Adapter-->>Route: { status: "no-track-matched", reason, receipt }
        Route-->>Page: 422
    else real WASM call, keyword matches
        Route->>Adapter: runCognition(intent)
        Adapter->>Wasm: cognition_run({breed:"eliza", contract:{intent, rules: COGNITION_RULES}})
        Wasm-->>Adapter: { status:"ok", output:{selected, explanation}, signature, run_id }
        Adapter->>Receipt: emitReceipt("cognition-run", {generated: selected, prevReceipt})
        Receipt-->>Adapter: TransitionReceipt
        Adapter-->>Route: { status:"matched", selected, explanation, signature, receipt }
        Route-->>Page: 200
    end

    Page->>Candidate: render CognitionPanel<br/>(question, Yes/No/Correct, or refusal/unavailable message)
```

Notes (grounded, not inferred):
- Eliza's real `run()` requires a **non-empty `rules` array** — an empty one falls back to the
  1966 Rogerian wildcard, not a real interview-relevant response. `runCognition` always passes the
  full `COGNITION_RULES` set (ggen-generated from `packs/wasm4pm-interview-assist-pack/ontology/
  90-cognition-bridge.ttl` Part B).
- The thrown WASM error is a bare JS **string** (not an `Error` instance) containing JSON —
  `mapThrownToOutcome` parses it and checks for the literal substring
  `"postcondition failed: empty inference trace"` to distinguish "no-track-matched" from any other
  real refusal.
- HTTP status convention: 200 matched, 422 no-track-matched/refused (well-formed request, no
  admitted hypothesis — a disclosed non-match, not a server error), 503 unavailable (real
  infrastructure failure — the WASM dependency itself didn't load).
- A receipt is emitted whenever a **real WASM call actually happened**, whether it succeeded or
  threw — matching `sandbox-executor.ts`'s same discipline for non-zero exit codes. No receipt is
  fabricated for the pre-flight empty-intent check or a module-load failure, since no real
  cognition action occurred in either case.

## See Also

- [c4-component.md](c4-component.md) — where `cognition-adapter.ts` sits in the component graph
- [sequence-receipt-replay.md](sequence-receipt-replay.md) — how this step's receipt chains with
  the others
