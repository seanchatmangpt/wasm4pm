# Breed Chains — Combinatorial Maximalism

Breed chains wire multiple cognition breeds end-to-end so that **each breed's output becomes the next breed's input**. This is combinatorial maximalism: no breed is run in isolation; every breed's output must be parseable as a lawful contract for the next breed in the sequence.

The chain runner emits a BLAKE3 receipt at each stage. A chain is only valid if every stage exits with `status: ok`.

## Quickstart

```bash
bash examples/cognition/chains/run-all-chains.sh
```

This runs all three chains in order and reports pass/fail per chain.

---

## Data Flow

Each stage produces a `result.json` (the raw `wpm cognition run --format json` output). A `transform.py` at every non-zero stage reads the previous `result.json` from stdin and writes a new `intent.json` to stdout. The transform extracts the semantically meaningful payload from the upstream breed and repackages it as a valid contract input for the downstream breed.

```
intent.json  →  [wpm cognition run]  →  result.json
                                              ↓
                                        transform.py
                                              ↓
                                        intent.json (next stage)
```

The artifact type flowing between stages is always a JSON object whose shape satisfies the downstream breed's `BreedInput` contract (enforced by Rust `deny_unknown_fields`).

---

## Case Study 1: Socratic Diagnosis (7 breeds)

A clinical diagnosis chain that begins with a patient's free-text complaint, passes it through semantic and emotional analysis, applies differential diagnosis, goal-directed planning, action planning, and closes with case retention.

```
eliza
  └── [therapist reflection + keyword extraction]
       └── autoinstinct_semantics
             └── [conceptual dependency parse → ATRANS/PTRANS/MTRANS acts]
                  └── autoinstinct_neurosis
                        └── [affect simulation + conflict belief update]
                             └── mycin
                                   └── [CF-combining differential diagnosis]
                                        └── gps
                                              └── [means-ends goal reduction]
                                                   └── strips
                                                         └── [action plan]
                                                              └── cbr
                                                                    └── [4R: retrieve, reuse, revise, retain]
```

**Breeds:** `eliza` → `autoinstinct_semantics` → `autoinstinct_neurosis` → `mycin` → `gps` → `strips` → `cbr`

---

## Case Study 2: Scientific Discovery (6 breeds)

A scientific hypothesis pipeline: acoustic signals are aggregated across expert sources, candidate molecular structures are enumerated, logical constraints are checked, scenes are interpreted visually, patterns are learned, and the best hypothesis is selected via bounded subgoal search.

```
hearsay
  └── [KSAR blackboard: multi-source hypothesis fusion]
       └── dendral
             └── [constrained structure enumeration with forbid/require]
                  └── prolog
                        └── [Robinson unification + SLD resolution]
                             └── autoinstinct_vision
                                   └── [blocks-world scene: support-graph, clear-set]
                                        └── autoinstinct_learning
                                              └── [STRIPS/HACKER bitwise heuristic planning]
                                                   └── soar
                                                         └── [preference resolution + impasse subgoal]
```

**Breeds:** `hearsay` → `dendral` → `prolog` → `autoinstinct_vision` → `autoinstinct_learning` → `soar`

---

## Case Study 3: Factory Agent (13 breeds — Full Cognitive Stack)

The factory-agent chain is the **full cognitive stack**: all 13 breeds in sequence, covering every AI paradigm represented in wasm4pm. It is the existence proof that the complete breed set composes without loss of contract fidelity.

A factory floor anomaly is detected visually, understood semantically, aggregated across sensor sources, diagnosed for cause, planned for goal resolution, replanned for actions, learned for future prevention, reflected upon via subgoal search, confirmed structurally, validated logically, assessed for emotional load, retained as a case, and surfaced to a human operator via conversational reflection.

```
autoinstinct_vision
  └── autoinstinct_semantics
        └── hearsay
              └── mycin
                    └── gps
                          └── strips
                                └── autoinstinct_learning
                                      └── soar
                                            └── dendral
                                                  └── prolog
                                                        └── autoinstinct_neurosis
                                                              └── cbr
                                                                    └── eliza
```

**Breeds (all 13):**
`autoinstinct_vision` → `autoinstinct_semantics` → `hearsay` → `mycin` → `gps` → `strips` → `autoinstinct_learning` → `soar` → `dendral` → `prolog` → `autoinstinct_neurosis` → `cbr` → `eliza`

This chain exercises:
- All 4 Autoinstinct breeds (vision, semantics, learning, neurosis)
- All 9 Old AI breeds (mycin, gps, strips, soar, dendral, prolog, hearsay, cbr, eliza)

---

## Directory Structure

```
chains/
├── run-all-chains.sh          # Master runner — runs all 3 chains
├── README.md                  # This file
├── socratic-diagnosis/
│   ├── chain.sh               # 7-stage orchestrator
│   └── stages/
│       ├── 0-eliza/           # intent.json, result.json, (no transform — seed)
│       ├── 1-autoinstinct_semantics/  # transform.py, intent.json, result.json
│       ├── 2-autoinstinct_neurosis/
│       ├── 3-mycin/
│       ├── 4-gps/
│       ├── 5-strips/
│       └── 6-cbr/
├── scientific-discovery/
│   ├── chain.sh               # 6-stage orchestrator
│   └── stages/
│       ├── 0-hearsay/
│       ├── 1-dendral/
│       ├── 2-prolog/
│       ├── 3-autoinstinct_vision/
│       ├── 4-autoinstinct_learning/
│       └── 5-soar/
└── factory-agent/
    ├── chain.sh               # 13-stage orchestrator
    └── stages/
        ├── 0-autoinstinct_vision/
        ├── 1-autoinstinct_semantics/
        ├── 2-hearsay/
        ├── 3-mycin/
        ├── 4-gps/
        ├── 5-strips/
        ├── 6-autoinstinct_learning/
        ├── 7-soar/
        ├── 8-dendral/
        ├── 9-prolog/
        ├── 10-autoinstinct_neurosis/
        ├── 11-cbr/
        └── 12-eliza/
```

---

## Running Individual Chains

```bash
# Socratic diagnosis — 7 breeds
bash examples/cognition/chains/socratic-diagnosis/chain.sh

# Scientific discovery — 6 breeds
bash examples/cognition/chains/scientific-discovery/chain.sh

# Factory agent — all 13 breeds
bash examples/cognition/chains/factory-agent/chain.sh
```

---

## Theoretical Grounding

The breed chain architecture is grounded in the OLDIA thesis:

> `docs/thesis/oldia/`

OLDIA establishes that each breed is a lawful process object whose lifecycle is attested by an OCEL 2.0 event log. Chaining breeds is valid when the output object of breed N satisfies the input contract of breed N+1. The chain runner enforces this by requiring `status: ok` and a non-empty `output_hash` at every stage — if either is absent, the chain fails immediately.

The factory-agent chain is the empirical falsification target: if all 13 breeds compose correctly, the full cognitive stack is sound. If any stage fails, it is a defect, not a discrepancy.

---

## Prerequisites

- `wpm` on PATH, or TypeScript CLI built at `apps/wasm4pm/dist/bin/wpm.js`
- WASM core built: `cd wasm4pm && npm run build:nodejs`
- TypeScript CLI built: `cd apps/wasm4pm && pnpm build`
- Python 3 available (for `transform.py` scripts at each non-zero stage)
