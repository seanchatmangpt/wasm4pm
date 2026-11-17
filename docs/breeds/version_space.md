<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/version_space.md; source-sha256: 013eae968d5467d654714fc252e3097f73ca14dd1fd255fa465c9504e51639fc; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, doc re-verified against the breed source; the
lane-4 change was oracle-side (adversary asserts the breed's real Debug
vocabulary; CheatVersionSpace stays AC-PARTIAL) — the breed contract itself
is unchanged.

# version_space — Candidate Elimination

## 1. Identity & Lineage
Version spaces / generalization as search (Mitchell, AIJ 1982). BreedId
`version_space`, module `src/breeds/version_space.rs`.

## 2. Algorithm
Candidate elimination over conjunctive nominal hypotheses ("?" any, "Ø"
bottom). Positive: prune non-covering G, minimally generalize S, keep only
G-bounded members, prune non-minimal. Negative: prune covering S,
specialize covering G members over the attribute's domain, keep only
S-bounded members, prune non-maximal. Collapse (empty boundary) is visible
in the boundaries, not an error.

## 3. Input Contract
Attributes: `vs:attrs`="a1,a2,..." (positional; domains inferred from
observed example values) or historical `attribute`="Name:v1,v2,...".
Examples: `vs:example:<i>`="v1,...,vn:+|-|positive|1|true" (numeric order)
or historical "k=v,...,label". Optional `classify`="k=v,..." fact (missing
values default "?"). Preconditions refuse missing attributes or examples.

## 4. Output Contract
Facts `vs:S` (" | "-joined), `vs:G`, `vs:intermediate_g_size` (|G| after
the final negative example), `vs:converged` ("true" iff S == G).
`selected` = classification verdict: "positive" iff the instance matches
all of S, "negative" iff it matches no G member, else "unknown".

## 5. Trace & OCEL Lifecycle
`vs-init`(1,1) → `vs-update`(1 per example; sorted S/G snapshots plus |G|)
→ `vs-verdict`(1,1). Postconditions require all three kinds. Report
fitness 1.0.

## 6. Oracles
Refusal: no attribute declarations / no example facts (precondition).
Hidden: novel texture/weight/hue domain — intermediate |G|=2 asserted from
trace, then exact S==G convergence. Paper: EnjoySport
S=⟨Sunny,Warm,?,Strong,?,?⟩, |G3|=3, G4 2 members. Oracle-side:
`CheatVersionSpace` (S-only update) remains AC-PARTIAL in
`support/oracle_impls/learning.rs`.

## 7. Determinism & Bounds
BTreeSet ordering gives sorted, deduped boundaries; numeric example
ordering; per-example snapshot in each `vs-update` detail.

## 8. Provenance
Fixture `tests/fixtures/papers/version_space.json` (verbatim Mitchell
EnjoySport sequence).
