<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/orientation/06-state-and-data-flow.md; source-sha256: 3a58944ccdd418aeb96408175aecee329a097ade59a228f576e8ad2f028f60ba; reason: tooling or agent control surface -->

# Phase 6: State and Data Flow

The `wasm4pm` Truex Execution pipeline is designed for strict deterministic data flow. Object-centric data moves from raw files into immutable BLAKE3 receipts.

## Confidence Level: High

## Truex Execution Data Flow

```mermaid
sequenceDiagram
  participant Client as Host App / wpm
  participant TS as Kernel SDK
  participant JCS as JCS-OCEL Canonicalizer
  participant BLAKE3 as Cryptographic Engine
  
  Client->>TS: truexVerify(Receipt Envelope)
  TS->>JCS: Extract & Deserialize 'ocel2' payload
  JCS->>JCS: UTF-16 Sort Keys & Arrays
  JCS->>JCS: Truncate whitespace & nulls
  JCS->>BLAKE3: Canonical Byte Stream
  BLAKE3-->>TS: Computed 'ocel2_batch_hash'
  
  TS->>BLAKE3: session_id + batch_hash + expected_path
  BLAKE3-->>TS: Computed 'receipt_hash'
  
  TS->>TS: Compare Hashes
  
  alt Hashes Match
    TS-->>Client: { status: "ReceiptAdmitted", class: "EquivalentUnderProfileV1" }
  else Hashes Differ
    TS-->>Client: { status: "ReceiptForged" }
  end
```

## The Data Object Contract (OCEL 2.0)
- The Truex pipeline expects standard OCEL 2.0 JSON elements (`events`, `objects`, `objectChanges`).
- Data is strictly pass-by-value. Mutating the raw source file immediately triggers a `ReceiptForged` taxonomy error because the resulting BLAKE3 mathematical digest diverges.
