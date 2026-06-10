# Meta-Reasoning — Conflict Detection + Confidence-Weighted Vote

## 1. Identity
- **Breed id:** `meta_reasoning` · **Module:** `src/breeds/meta_reasoning.rs`
- **Historical ancestor:** Cox & Raja 2011, *Metareasoning: Thinking about Thinking* (MIT Press)

## 2. Algorithm
The HOST fans prior breed outputs into `breed:<id>:conclusion` /
`breed:<id>:confidence` facts — there are NO Rust-side cross-breed calls.
Pairwise conflict detection over reports sharing a decision key: differing values,
explicit negation (`x` vs `not_x`), or confidence divergence > 0.5 on identical
conclusions. Resolution: per-key confidence-weighted vote; winner = max summed
confidence, lexicographic least value on ties.

## 3. Contract (input facts)
`breed:<id>:conclusion` = `<key>=<value>` (or bare value → key `decision`);
`breed:<id>:confidence` ∈ [0,1]. Requires ≥ 2 complete reports; ≤ 64 reports.

## 4. Output facts
`meta:conflicts` (count), `meta:decision:<key>`, `meta:weight:<key>` (`{:.6}`).

## 5. Trace kinds / OCEL lifecycle
`ingest-report`(1..*) → `conflict-detected`(0..*) → `vote`(1..*) → `resolve`(1).
Model: `ocel/models/l1/meta_reasoning.ocpn.json`; fitness 1.0.

## 6. Oracles
- Hidden: injected mycin-vs-prolog contradiction produces a `conflict-detected`
  step NAMING BOTH breeds; negative control with identical conclusions produces
  ZERO conflict steps.
- Paper: Cox & Raja 2011 meta-level monitoring/arbitration claim — conflict
  detected, resolved to the higher-confidence conclusion.

## 7. Determinism & latency
Deterministic (BTreeMap ordering); no RNG. Median 2.58 µs.

## 8. Status
PARTIAL_ALIVE; integrates LAST in the P4 order (consumes the ensemble via host fan-in).
