<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/breeds/dendral.md; source-sha256: eb70019e0dffe1e3bf4351ec97acfc7110a6ce68a3ad5b2e08b7e73201ccd655; reason: path-local documentation retained pending domain-specific supersession -->

# dendral — Generate-and-Test Isomer Enumeration

## 1. Identity & Lineage
DENDRAL (Feigenbaum, Buchanan & Lederberg 1971, AIM-131, Stanford).
Generate-and-test over molecular structure space — DENDRAL's actual
contribution — plus constraint-based candidate elimination. BreedId
`dendral`, module `src/breeds/dendral.rs`.

## 2. Algorithm

### Layer 1 — candidate constraint elimination (always runs)
1. Parse constraints from `input.facts[key="constraint"]`: `forbid:<id>`,
   `require:<token>`, `max-score:<f>`, `min-score:<f>`.
2. Validate each constraint up front (unknown prefixes / non-parseable
   thresholds → `BreedError`, Andon-loud).
3. Eliminate candidates that violate any constraint (monotonic: once
   eliminated, never restored).
4. Highest-score survivor is `selected` (lex tiebreak on id).

### Layer 2 — constitutional-isomer generate-and-test (runs when a
`molecular-formula` fact is present; additive, never alters Layer 1)
1. **GENERATE**: parse the formula (elements C, H, N, O) and enumerate every
   connected valence-respecting bond-order assignment over the heavy atoms
   (bond orders 1–3; H implicit as residual valence; valences C=4, N=3, O=2).
2. **CANONICALIZE**: each structure is canonicalized (lex-min adjacency
   string over element-preserving labelings); duplicates dropped via
   `BTreeSet`. Deterministic (sorted enumeration + sorted canonical set).
3. **TEST**: structural predicates computed from the actual bond graph —
   `ring`, `double-bond`, `triple-bond`, `carbonyl`, `hydroxyl`, `ether`,
   `amine`. `require:`/`forbid:` constraints with these tokens act as
   post-filters over generated structures (the same constraints still apply
   to candidate ids as Layer-1 string matching — both labeled honestly).
4. **RANK/SELECT**: survivors ranked by the stated plausibility score
   `1/(1 + DBE)` (DBE = rings + double bonds + 2×triple bonds), gated by
   existing `min-score:`/`max-score:` constraints; top survivor emitted as
   the `selected-isomer` fact. This is a documented unsaturation heuristic —
   no spectral-prediction model is claimed.

### Caps are refusals, not truncation
Heavy atoms > 8, distinct isomers > 10 000, or raw bond-assignment nodes
> 500 000 → typed `BreedError` ("refusal, not truncation"). A
`molecular-formula` fact that fails to parse (unknown element, bad count) is
also a typed refusal.

## 3. Input Contract
`input.candidates`: `Candidate { id: String, score: f32 }` (required
non-empty). `input.facts`: `constraint` predicates; optional
`molecular-formula` (e.g. `C5H10O`) enables Layer 2.

## 4. Output Contract
Layer 1: `selected` = winning candidate id. Layer 2 adds facts
`isomer-count`, `isomer-survivor-count`, `isomer:<formula>` (per-survivor
property strings, first 64 listed; `isomer-list-cap` notes the cap),
`selected-isomer` (`none` when constraints kill every isomer). Output
`selected` stays candidate-based for backward compatibility.

## 5. Trace & OCEL Lifecycle
Layer 1: `validate-constraints`(1,1) → `eliminate`(1,*) → `select`(1,1).
Layer 2 appends `generate-isomers`(1,1) → `test-constraints`(1,1) →
`select-solution`(1,1) with real counts. Report fitness 1.0.

## 6. Oracles
Structural: `forbid:X` eliminates exactly X; `require:online` eliminates all
candidates not containing "online". Malformed constraint → error
(Andon-loud). Formula grammar: `CH4`→1 isomer, `C3H8`→1, `C4H10`→2,
`C5H12`→3 (known constitutional-isomer counts); `C5H10O` space contains
carbonyl structures and no triple bonds (DBE=1 budget); oversize formulas
refuse. Paper: Feigenbaum 1971 mass-spectrometry ketone fixture
(C5H10O / MW=86 / 3-pentanone ranked first).

## 7. Determinism & Bounds
Constraint validation first (fail-fast); lex tiebreak on candidate id;
isomer enumeration, canonical forms, ids and selection all sorted/`BTreeSet`
based; double-run byte-identical.

## 8. Provenance
Fixture `tests/fixtures/papers/dendral.json` (Feigenbaum, Buchanan &
Lederberg 1971, AIM-131, Tables 4–5 ketone family; adapted).
