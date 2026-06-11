# asp — Answer Set Programming

## 1. Identity & Lineage
Gelfond–Lifschitz stable-model semantics (Gelfond & Lifschitz, ICLP/SLP 1988). BreedId `asp`, module `crates/wasm4pm-cognition/src/breeds/asp.rs`.

## 2. Algorithm
Enumerate every candidate atom set M (u32 bitmask, ≤12 atoms); build the GL reduct P^M (drop rules whose `not b` literal fails, strip surviving NAF literals); compute the least Horn model via `support::closure::forward_close`; accept iff LM(P^M) == M.

## 3. Input Contract
`rules` is the program. Premise atoms prefixed `"not "` are negation-as-failure literals; empty premise = fact. `Rule.certainty` required (use 1.0).

## 4. Output Contract
Facts `asp:answer_set:<i>` (sorted comma-joined atoms), `asp:answer_set_count`; `selected` = first answer set (None when 0 models).

## 5. Trace & OCEL Lifecycle
`ground`(1,1) → {`guess-candidate`,`reduct`,`least-model`,`stable-accept`,`stable-reject`}(1,*) → `answer-set`(1,1). Model: `ocel/models/l1/asp.ocpn.json`; report: `ocel/reports/asp.json` (fitness 1.0).

## 6. Oracles
Refusal: >12 atoms / NAF head. Hidden: even loop {a:-not b; b:-not a} → exactly 2 answer sets; {a:-not a} → 0; non-monotonic retraction (abnormal removes flies). Paper: GL88 unique stable model {p(1,2), q(1)}.

## 7. Determinism & Bounds
Pure bitmask enumeration in ascending order, BTreeSet atoms; ≤2^12 candidates. Bit-exact double-run test in `breed_determinism.rs`.

## 8. Provenance
Fixture `tests/fixtures/papers/asp.json` (verbatim-propositionalized GL88 Example, Section 2).
