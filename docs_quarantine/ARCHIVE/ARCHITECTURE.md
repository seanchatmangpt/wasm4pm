# Architecture

wasm4pm is a process mining platform with a real Rust cognition kernel. This document describes the corrected architecture — the shape that emerged after the false-start of TS scaffolding with mock cognition was rejected and replaced with Rust-first authority.

## The product: a software fab cell

The cognition kernel is a manufacturing cell, not a conversation system. Every input passes through structured stages with proof gates. Nothing leaves without a signed receipt.

```mermaid
flowchart LR
    IC[Input Contract] --> FR[Frame]
    FR --> BR[Breed\neliza/mycin/strips/\nprolog/cbr/dendral/\ngps/soar/hearsay]
    BR --> FN[Findings]
    FN --> RC[Receipt\nBLAKE3 v2]
    RC --> VF{Verify\nV1-V8}
    VF -->|all pass| EX[Export / Artifact]
    VF -->|any fail| RP[Repair Report\n+ exit code]
```

Diagram 37: Input Contract to Frame to Breed to Findings to Receipt to Verify to either Export or Repair.

## Wrong shape vs right shape

### Wrong (rejected)

The wrong architecture had TypeScript making decisions, mock breeds returning stub data, and human-written text standing in as authoritative evidence. This architecture appears to work when tests are green, but produces no machine-verifiable proof that cognition actually occurred.

```mermaid
flowchart TD
    CLI[CLI] --> TSLayer[TS Layer\ndecides everything]
    TSLayer --> MockBreed[Mock Breed\ntodo return stub]
    MockBreed --> FakeReceipt[Fake Receipt\nno hash chain]
    FakeReceipt --> Pass[PASS\nbut no proof]

    style MockBreed fill:#c00,color:#fff
    style FakeReceipt fill:#c00,color:#fff
    style Pass fill:#c00,color:#fff
```

### Right (current)

```mermaid
flowchart TD
    CLI[CLI] --> TSboundary[TS boundary\nforwarding only]
    TSboundary --> WASM[WASM boundary\nwasm-bindgen]
    WASM --> RustCrate[Rust crate\nwasm4pm-cognition]
    RustCrate --> Breed[Real Breed\nRobinson unification\nShortliffe CF\nStrips regression\netc.]
    Breed --> InferenceTrace[Inference Trace\nactual reasoning steps]
    InferenceTrace --> BLAKE3[BLAKE3 Receipt v2\nlength-prefixed chain]
    BLAKE3 --> AdversarialGates[8 Adversarial Gates\nall must pass]
    AdversarialGates --> SignedReceipt[Signed Receipt\ncryptographic proof]

    style Breed fill:#060,color:#fff
    style BLAKE3 fill:#060,color:#fff
    style SignedReceipt fill:#060,color:#fff
```

Diagram 2: Wrong TS-scaffolding shape vs Right Rust-first shape.

## Authority boundary

The Rust crate is the authority. The TypeScript boundary is a thin forwarding layer. This boundary is enforced by CI gates — any TS code that makes a cognitive decision (chooses an action, interprets evidence, validates output) is a violation.

```mermaid
flowchart LR
    subgraph "TS (permitted)"
        CLI2[CLI argument parsing]
        FMT[Output formatting]
        SAVE[Receipt saving]
        REQ[Request marshalling]
    end

    subgraph "TS (forbidden)"
        DEC[Cognitive decision]
        VAL[Evidence validation]
        INF[Inference step]
        CERT[Self-certification]
    end

    subgraph "Rust (authoritative)"
        UNIF[Robinson unification]
        CHAIN[Shortliffe CF chain]
        PLAN[STRIPS regression]
        BLK[BLAKE3 receipt]
        DET[Adversarial detectors]
    end

    CLI2 --> REQ --> UNIF
    UNIF --> BLK
    BLK --> FMT

    style DEC fill:#c00,color:#fff
    style VAL fill:#c00,color:#fff
    style INF fill:#c00,color:#fff
    style CERT fill:#c00,color:#fff
```

Diagram 9: Authority boundary. Rust is authoritative; TS boundary cannot make cognitive decisions.

## Full corrected architecture

```mermaid
flowchart TD
    subgraph "User surface"
        USER[Practitioner]
        CLI3[wpm CLI\napps/wasm4pm/]
    end

    subgraph "TS monorepo (packages/)"
        ENGINE[engine\nstate machine]
        KERNEL[kernel\nWASM boundary]
        CONFIG[config\nZod-validated]
        PLANNER[planner\nExecution DAG]
        OBS[observability\nOTEL + consola]
        CONTRACTS[contracts\nreceipts + errors]
    end

    subgraph "WASM boundary"
        WB[wasm-bindgen\nbindings]
    end

    subgraph "Rust crates"
        PM[wasm4pm-algos\n41 process mining\nalgorithms]
        COG[wasm4pm-cognition\n9 breeds\nadversarial gates\nBLAKE3 receipts]
        TYPES[wasm4pm-compat\nshared structs]
    end

    subgraph "Storage"
        RESULTS[.wasm4pm/results/\nreceipt JSON]
        OTEL_SINK[OTEL collector\nJaeger / stdout]
    end

    USER --> CLI3
    CLI3 --> ENGINE
    CLI3 --> CONFIG
    ENGINE --> PLANNER
    PLANNER --> KERNEL
    KERNEL --> WB
    WB --> PM
    WB --> COG
    PM --> TYPES
    COG --> TYPES
    CLI3 --> OBS
    OBS --> OTEL_SINK
    ENGINE --> CONTRACTS
    CONTRACTS --> RESULTS
```

Diagram 40: The full corrected architecture.

## Cognition runtime flow

The sequence for a single `wpm cognition run` invocation:

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as wpm CLI
    participant TS as TS boundary
    participant WB as wasm-bindgen
    participant RU as Rust (wasm4pm-cognition)
    participant BR as Breed (e.g. MYCIN)
    participant RC as Receipt Chain

    U->>CLI: wpm cognition run --contract mycin --input symptoms.json
    CLI->>TS: parseArgs() + resolveConfig()
    TS->>WB: run_contract(breed, input_json, actor_id)
    WB->>RU: CognitionContract::run(input)
    RU->>RU: check_preconditions()
    RU->>BR: execute(frame)
    BR->>BR: forward_chain(rules, evidence)
    BR-->>RU: InferenceTrace + output
    RU->>RU: check_postconditions(output)
    RU->>RU: run_adversarial_gates(V1-V8)
    RU->>RC: ReceiptLedger::append(ihash, ohash, actor)
    RC-->>RU: ReceiptLink { hash, step }
    RU-->>WB: ContractResult { output, findings, receipt_hash, exit_code }
    WB-->>TS: JSON string
    TS-->>CLI: ContractResult (parsed)
    CLI-->>U: human output + auto-save receipt
```

Diagram 13: CLI to TS to WASM to Rust to Breed to Receipt.

## Multi-breed pipeline

When multiple breeds are chained (e.g. GPS for planning, CBR for case retrieval, MYCIN for evaluation):

```mermaid
flowchart LR
    INPUT[Input Contract] --> GPS_B[GPS\ngoal decomposition]
    GPS_B --> CBR_B[CBR\ncase retrieval]
    CBR_B --> MYCIN_B[MYCIN\nCF evaluation]
    MYCIN_B --> DOM[Pareto dominance\ncandidate ranking]
    DOM --> RECEIPT[Receipt chain\nall steps linked]

    GPS_B -->|receipt link 1| RECEIPT
    CBR_B -->|receipt link 2| RECEIPT
    MYCIN_B -->|receipt link 3| RECEIPT
```

Diagram 14: Multi-breed pipeline. Each breed appends a link to the shared receipt chain; the chain is traversable and replay-verifiable.

## Receipt generation and replay

### Generation (v2 encoding)

Each link in the receipt chain is hashed over a length-prefixed byte sequence to prevent canonicalization attacks:

```mermaid
flowchart TD
    DT[domain_tag 16 bytes] --> H
    VER[version_le 4 bytes] --> H
    STEP[step_le 8 bytes] --> H
    IL[ihash_len_le 4 bytes] --> H
    IB[ihash_bytes] --> H
    OL[ohash_len_le 4 bytes] --> H
    OB[ohash_bytes] --> H
    PL[prev_len_le 4 bytes] --> H
    PB[prev_bytes] --> H
    PKL[pubkey_len_le 4 bytes] --> H
    PKB[pubkey_bytes] --> H
    SL[sig_len_le 4 bytes] --> H
    SB[sig_bytes] --> H

    H[BLAKE3\nderived key:\nwasm4pm.recpt.v2.link] --> LINK[ReceiptLink hash]
```

Diagram 34: BLAKE3 v2 receipt link encoding. Length prefixes prevent the canonicalization attack present in v1 string-concat encoding.

### Replay

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as wpm cognition replay
    participant L as ReceiptLedger
    participant B as Breed

    U->>CLI: --receipt-id <id>
    CLI->>L: load_receipt(id)
    L-->>CLI: ReceiptLink chain + inputs
    CLI->>B: re-execute(inputs)
    B-->>CLI: new_output
    CLI->>CLI: hash(new_output) == stored ohash?
    alt hashes match
        CLI-->>U: PASS (byte-identical determinism proved)
    else hashes differ
        CLI-->>U: FAIL V8: replay_broken (gate fires)
    end
```

Diagram 35: Receipt replay. Byte-identical re-execution proves determinism. Hash mismatch fires V8 (broken replay detector).

## The no-stub law

Any PR introducing the following patterns in cognition source paths is rejected by CI without review:

```mermaid
flowchart TD
    PR[Pull Request] --> SCAN[CI: scan cognition source]
    SCAN --> CHECK{forbidden tokens?}
    CHECK -->|pub struct Stub| REJECT
    CHECK -->|todo!| REJECT
    CHECK -->|unimplemented!| REJECT
    CHECK -->|placeholder| REJECT
    CHECK -->|mock| REJECT
    CHECK -->|fake| REJECT
    CHECK -->|none found| PASS2[continue CI pipeline]

    style REJECT fill:#c00,color:#fff
    style PASS2 fill:#060,color:#fff
```

Source paths subject to the no-stub law:
- `crates/wasm4pm-cognition/src/**`
- `apps/wasm4pm/src/commands/cognition*`
- `packages/cognition/src/**`

Diagram 10: No stub law. CI scans for forbidden tokens in cognition source files and rejects the PR if any are found.

## The no-placeholder CI gate

A CI gate that always passes (regardless of actual evidence) is itself a false-pass. The adversarial detector V1 (stub gate) detects this pattern at the code level. The CI gate itself must not be a stub.

```mermaid
flowchart TD
    GATE[CI Gate] --> EVIDENCE{has machine evidence?}
    EVIDENCE -->|OTEL span exists| E1[evidence 1]
    EVIDENCE -->|test assertion passes| E2[evidence 2]
    EVIDENCE -->|schema conformance exit=0| E3[evidence 3]
    E1 --> AND{all three?}
    E2 --> AND
    E3 --> AND
    AND -->|yes| GATE_PASS[Gate PASS]
    AND -->|no| GATE_FAIL[Gate FAIL\ncannot be bypassed]

    style GATE_FAIL fill:#c00,color:#fff
    style GATE_PASS fill:#060,color:#fff
```

Diagram 24: No placeholder CI gate. Three-layer evidence is required (AND logic, not OR).

## Cognition Verify Gate V1-V8

```mermaid
flowchart TD
    CONTRACT[ContractResult] --> V1{V1: stub gate\nno todo!/unimplemented!}
    V1 -->|fail| F1[Finding: Fatal]
    V1 -->|pass| V2{V2: human authority\nno human text as evidence}
    V2 -->|fail| F2[Finding: Error]
    V2 -->|pass| V3{V3: missing runtime evidence\nOTEL span exists}
    V3 -->|fail| F3[Finding: Error]
    V3 -->|pass| V4{V4: central firehose\nno single event stream}
    V4 -->|fail| F4[Finding: Warning]
    V4 -->|pass| V5{V5: self-certification\nno agent self-signs}
    V5 -->|fail| F5[Finding: Fatal]
    V5 -->|pass| V6{V6: missing benchmark\nperformance claim has data}
    V6 -->|fail| F6[Finding: Error]
    V6 -->|pass| V7{V7: threshold weakening\nrepair does not weaken gate}
    V7 -->|fail| F7[Finding: Error]
    V7 -->|pass| V8{V8: broken replay\nreplay hash matches}
    V8 -->|fail| F8[Finding: Fatal]
    V8 -->|pass| SIGNED[Receipt Signed\nexit code 0]

    F1 --> EXIT5[exit code 5: Fatal]
    F5 --> EXIT5
    F8 --> EXIT5
    F2 --> EXIT4[exit code 4: Error]
    F3 --> EXIT4
    F6 --> EXIT4
    F7 --> EXIT4
    F4 --> EXIT3[exit code 3: Warning]
```

Diagram 25: V1-V8 adversarial gate flow. Fatal findings (V1, V5, V8) produce exit code 5. Error findings produce exit code 4. All must be clean for exit code 0 and a signed receipt.

## Cognition Build Definition of Done

A cognition breed is done when all of the following are true:

```mermaid
flowchart TD
    DOD[Definition of Done] --> R1[Rust implementation\nno unsafe, no stubs]
    R1 --> R2[wasm-bindgen export\nrun_contract in wasm.rs]
    R2 --> R3[TS type binding\npackages/cognition/src/]
    R3 --> R4[CLI verb\nwpm cognition run --contract <name>]
    R4 --> R5[Inference trace\nactual reasoning steps in output]
    R5 --> R6[BLAKE3 receipt\nappended to ledger]
    R6 --> R7[V1-V8 all pass\nexit code 0]
    R7 --> R8[Replay verifies\nbyte-identical determinism]
    R8 --> R9[Unit tests\nseeded RNG, deterministic]
    R9 --> R10[OTEL span\noperation name + attributes]
    R10 --> DONE[DONE]

    style DONE fill:#060,color:#fff
```

Diagram 39: Cognition breed definition of done.

## Repository layout

```
wasm4pm/                          # Rust workspace root
├── Cargo.toml
├── crates/
│   ├── wasm4pm-cognition/        # Cognition kernel (9 breeds + adversarial + receipts)
│   │   └── src/
│   │       ├── breeds/           # eliza.rs mycin.rs strips.rs prolog.rs cbr.rs
│   │       │                     # dendral.rs gps.rs soar.rs hearsay.rs
│   │       ├── autosystems/      # cost_law.rs dominance.rs receipt.rs adversarial/
│   │       ├── authority.rs      # authority boundary enforcement
│   │       ├── evidence.rs       # EvidenceSource trait
│   │       └── registry.rs       # breed registry
│   ├── wasm4pm-algos/            # 41 process mining algorithms
│   └── wasm4pm-compat/            # shared structs (EventLog, Trace, etc.)
├── wasm4pm/                      # Original WASM crate (41 algorithms, Node.js target)
│   └── src/                      # 114 modules
├── packages/                     # TypeScript monorepo (10 packages)
│   ├── contracts/                # receipts, errors, plans, hashing
│   ├── engine/                   # state machine
│   ├── kernel/                   # WASM boundary
│   ├── config/                   # Zod-validated config
│   ├── planner/                  # execution DAG
│   ├── observability/            # OTEL + consola
│   ├── testing/                  # parity, determinism, CLI harnesses
│   ├── ml/                       # ML analysis (6 algorithms)
│   └── swarm/                    # multi-worker convergence
├── apps/
│   └── wasm4pm/                  # CLI tool (@wasm4pm/cli)
│       └── src/commands/         # run.ts compare.ts predict.ts cognition*.ts
├── docs/
│   ├── cognition-overview.md     # standalone primer
│   └── cognition-doctrine.md     # architecture manifesto with all diagrams
├── ARCHITECTURE.md               # this file
├── CONTRIBUTING.md
└── README.md
```

## Key invariants

1. **Authority in Rust.** The TypeScript layer holds no authoritative state and makes no cognitive decisions. Violation is detected by CI.

2. **No receipt, no proof.** A run that produced no BLAKE3-linked receipt produced no provable output. "It passed the test" is not evidence. The receipt is evidence.

3. **Replay proves determinism.** Same inputs must produce byte-identical outputs. If `wpm cognition replay` produces a different hash, the breed is non-deterministic and V8 fires.

4. **All 8 gates.** A receipt with exit code > 0 is a proof of failure, not a partial proof of success. There is no partial pass.

5. **OTEL span or it did not happen.** Every operation must emit an OTEL span with `status: "ok"` or `status: "error"`. Missing spans are a V3 violation (missing runtime evidence).

6. **No stub law.** `todo!()`, `unimplemented!()`, `pub struct Stub`, `placeholder`, `mock`, and `fake` are forbidden in cognition source paths. CI rejects the PR.
