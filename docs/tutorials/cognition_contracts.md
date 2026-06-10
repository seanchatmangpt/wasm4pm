# Tutorial: Executing Cognition Contracts

## Learning Objectives

In this tutorial, you will:

1. Understand the 13-breed cognition layer (9 Old AI + 4 Autoinstinct).
2. Select the correct breed and construct a strictly-typed `BreedInput`.
3. Execute a contract and read the output using exact field names.
4. Verify the BLAKE3 receipt chain.

---

## 1. Overview — 13 Breeds

The cognition layer ships 13 breeds in two families:

| Family | Count | Description |
|---|---|---|
| **Old AI** | 9 | Deterministic symbolic AI systems from the 1960s–1990s |
| **Autoinstinct** | 4 | Adaptive instinct layers wired to the Old AI substrate |

Every breed is registered in the kernel and dispatched via the same CLI contract:

```bash
wpm cognition run --contract <label> --input <path/to/intent.json> --format json
```

The `--contract` value is a human label for receipt tracking (not the breed ID). The breed is declared inside the input file.

---

## 2. Quick Example — mycin (verified working)

```bash
wpm cognition run --contract strep-diagnosis \
  --input examples/cognition/mycin/intent.json \
  --format json
```

Expected output shape (exact field names):

```json
{
  "status": "ok",
  "breed": "mycin",
  "run_id": "a3f7...",
  "output_hash": "b2e1c9d4...",
  "replay_pointer": "b2e1c9d4a7f3...",
  "options_profile": "balanced",
  "output": { ... }
}
```

Check `status === 'ok'` before consuming `output`. Use `run_id` to locate the receipt in `.wasm4pm/receipts/`.

---

## 3. Old AI Breeds

Thirteen breeds implement canonical AI architectures: 9 Old AI symbolic reasoning systems and 4 Autoinstinct breeds. All 9 Old AI breeds have verified working examples under `examples/cognition/<breed>/intent.json`.

| Breed Name | CLI ID (in JSON) | Rust file | Approx. Year | Technique | Example intent |
|---|---|---|---|---|---|
| MYCIN | `mycin` | `breeds/production_rules.rs` | 1972 | Forward-chaining production rules with certainty factors | Medical diagnosis |
| DENDRAL | `dendral` | `breeds/dendral.rs` | 1965 | Hypothesis-and-test generate-and-test search | Molecular structure |
| ELIZA | `eliza` | `breeds/frame.rs` | 1966 | Pattern-match frame rewriting (regex premises) | Dialogue |
| GPS | `gps` | `breeds/gps.rs` | 1957 | General Problem Solver — means-ends analysis | Planning |
| HEARSAY | `hearsay` | `breeds/hearsay.rs` | 1971 | Blackboard architecture with competing knowledge sources | Hypothesis voting |
| PROLOG | `prolog` | `breeds/prolog.rs` | 1972 | SLD-resolution backward chaining | Logic/policy |
| SOAR | `soar` | `breeds/soar.rs` | 1987 | Universal subgoaling + chunking cognitive architecture | Skill acquisition |
| STRIPS | `strips` | `breeds/strips.rs` | 1971 | Linear planning with add/delete effects | Task planning |
| CBR | `cbr` | `breeds/cbr.rs` | 1983 | Case-Based Reasoning — nearest-neighbor retrieval and adaptation | Recipe / support |

### Breed ID in input

The breed is declared at the top-level `breed` field of the input envelope — NOT inside `contract`:

```json
{
  "breed": "mycin",
  "contract": { ... BreedInput fields ... }
}
```

Sending a bare `BreedInput` without the `breed` wrapper causes Rust `deny_unknown_fields` to reject with `"missing field 'breed'"`.

---

## 4. Autoinstinct Breeds

Four breeds extend the Old AI layer with adaptive instinct capabilities. They share the same input envelope and output contract.

| Breed Name | CLI ID | Rust file | Technique |
|---|---|---|---|
| Autoinstinct Vision | `autoinstinct_vision` | `breeds/autoinstinct_vision.rs` | Perceptual pattern recognition instinct |
| Autoinstinct Semantics | `autoinstinct_semantics` | `breeds/autoinstinct_semantics.rs` | Semantic similarity and concept grounding |
| Autoinstinct Neurosis | `autoinstinct_neurosis` | `breeds/autoinstinct_neurosis.rs` | Anomaly-triggered defensive instinct loop |
| Autoinstinct Learning | `autoinstinct_learning` | `breeds/autoinstinct_learning.rs` | Online rule weight adaptation |

---

## 5. Output Contract

All 13 breeds return the same `ContractResult` shape. Source of truth: `crates/wasm4pm-cognition/src/wasm.rs` lines 182–190.

### Fields you MUST use

| Field | Type | Description |
|---|---|---|
| `status` | `"ok"` | Success check — only proceed if `status === 'ok'` |
| `breed` | `string` | Breed that executed |
| `run_id` | `string` | Unique execution ID — use this as receipt key |
| `output_hash` | `string` | BLAKE3 hash of the output — source of truth for integrity |
| `replay_pointer` | `string` | First 16 hex chars of `output_hash` — use for short references |
| `options_profile` | `string` | Profile used (`fast` / `balanced` / `quality` / `stream`) |
| `output` | `object` | Breed-specific inference result |

### Fields you MUST NEVER use

| Forbidden field | Why |
|---|---|
| `.exit_code` | Does not exist on `ContractResult` |
| `.receipt_chain` | Does not exist — chain is in `.wasm4pm/receipts/` |
| `.findings` | Only on `VerifyResult`, not `ContractResult` |
| `.decision` | Does not exist — check `output` for breed-specific verdict |
| `.hash` | Wrong name — use `.output_hash` |
| `.inference_trace` | Does not exist on `ContractResult` |

### Short hash pattern

```ts
const shortHash = result.output_hash.slice(0, 8);
```

---

## 6. Working Examples for Four Illustrative Breeds

### 6.1 MYCIN — Forward-Chaining Diagnosis

`examples/cognition/mycin/intent.json`:

```json
{
  "breed": "mycin",
  "contract": {
    "intent": "diagnosis",
    "candidates": [],
    "facts": [
      { "key": "organism", "value": "gram_positive_cocci" },
      { "key": "organism", "value": "strep" },
      { "key": "site", "value": "throat" }
    ],
    "cases": [],
    "rules": [
      {
        "id": "r1",
        "premise": ["organism=gram_positive_cocci", "organism=strep"],
        "conclusion": "diagnosis=strep_infection",
        "certainty": 0.7
      },
      {
        "id": "r2",
        "premise": ["diagnosis=strep_infection"],
        "conclusion": "antibiotic=penicillin",
        "certainty": 0.95
      }
    ],
    "goals": [
      { "id": "g1", "predicate": "antibiotic", "value": "penicillin" }
    ],
    "state": []
  }
}
```

```bash
wpm cognition run --contract strep-diagnosis \
  --input examples/cognition/mycin/intent.json \
  --format json
```

MYCIN fires rules in forward-chain order, accumulating certainty factors. The `output` field contains the derived conclusions and their combined certainty.

---

### 6.2 CBR — Case-Based Reasoning Retrieval

`examples/cognition/cbr/intent.json`:

```json
{
  "breed": "cbr",
  "contract": {
    "intent": "best-recipe",
    "candidates": [],
    "facts": [
      { "key": "ingredient", "value": "flour" },
      { "key": "ingredient", "value": "egg" },
      { "key": "prep_time", "value": "5min" }
    ],
    "cases": [
      {
        "id": "pancakes",
        "intent": "best-recipe",
        "architecture": "pancakes",
        "outcome_score": 0.9,
        "facts": [
          { "key": "ingredient", "value": "flour" },
          { "key": "ingredient", "value": "egg" },
          { "key": "ingredient", "value": "milk" }
        ]
      }
    ],
    "rules": [],
    "goals": [],
    "state": []
  }
}
```

```bash
wpm cognition run --contract recipe-lookup \
  --input examples/cognition/cbr/intent.json \
  --format json
```

CBR computes nearest-neighbor similarity between `facts` and each `cases` entry, returning the best match.

---

### 6.3 GPS — Means-Ends Planning

`examples/cognition/gps/intent.json`:

```json
{
  "breed": "gps",
  "contract": {
    "intent": "means-ends planning",
    "candidates": [],
    "facts": [],
    "cases": [],
    "rules": [
      {
        "id": "get-dressed",
        "premise": ["shirt=on"],
        "conclusion": "dressed=yes",
        "certainty": 1.0
      },
      {
        "id": "put-on-shirt",
        "premise": [],
        "conclusion": "shirt=on",
        "certainty": 1.0
      }
    ],
    "goals": [
      { "id": "g1", "predicate": "dressed", "value": "yes" }
    ],
    "state": []
  }
}
```

```bash
wpm cognition run --contract get-dressed \
  --input examples/cognition/gps/intent.json \
  --format json
```

GPS chains operators by reducing the difference between current state and goal state, producing an ordered plan.

---

### 6.4 ELIZA — Frame Pattern Rewriting

`examples/cognition/eliza/intent.json`:

```json
{
  "breed": "eliza",
  "contract": {
    "intent": "I feel sad about my deadlines",
    "candidates": [],
    "facts": [],
    "cases": [],
    "rules": [
      {
        "id": "feel-pattern",
        "premise": ["pattern:I feel (\\w+)"],
        "conclusion": "Why do you feel $1?",
        "certainty": 1.0
      }
    ],
    "goals": [],
    "state": []
  }
}
```

```bash
wpm cognition run --contract eliza-session \
  --input examples/cognition/eliza/intent.json \
  --format json
```

ELIZA matches the `intent` string against regex `premise` patterns in `frame.rs` and rewrites matched groups into the `conclusion` template.

---

## 7. Receipt Chain

Every successful run emits a BLAKE3-chained receipt to `.wasm4pm/receipts/`.

### Key receipt fields

| Field | Source | Use |
|---|---|---|
| `output_hash` | `ContractResult.output_hash` | Full integrity hash of the execution output |
| `replay_pointer` | First 16 hex chars of `output_hash` | Short reference for logs and UI display |
| `run_id` | `ContractResult.run_id` | Links the receipt file to the execution |

### Verify a receipt

```bash
wpm verify .wasm4pm/receipts/<run_id>.json
```

### TypeScript pattern

```ts
const result = await cogRun(input);
if (result.status !== 'ok') throw new Error(`breed ${result.breed} failed`);

const shortRef = result.output_hash.slice(0, 8);  // replay_pointer prefix
const receiptPath = `.wasm4pm/receipts/${result.run_id}.json`;

console.log(`run_id=${result.run_id}  hash=${shortRef}  profile=${result.options_profile}`);
```

The `replay_pointer` in `ContractResult` equals `output_hash.slice(0, 16)` — both are available directly on the result; no file read required for short-hash display.

---

## Rule Struct Reference

All breeds share a common `Rule` struct (`breeds/mod.rs`):

```json
{
  "id": "string",
  "premise": ["string"],
  "conclusion": "string",
  "certainty": 0.0
}
```

`certainty` is **required** — it has no serde default. Omitting it causes a deserialization error.

---

## 8. Running All 9 Breeds

All 9 Old AI breeds have working examples under `examples/cognition/`. Each directory contains `intent.json` and `run.sh`:

```bash
# Run one breed
bash examples/cognition/mycin/run.sh

# Run all 9 breeds
bash examples/cognition/run-all.sh
```

Full example index: [examples/cognition/README.md](../../examples/cognition/README.md)
