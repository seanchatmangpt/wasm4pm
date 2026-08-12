# SatCdcl -- Paper Fidelity

<!--
Generated from wasm4pm-compat ontology (ggen rule: paper-fidelity-docs,
Overwrite mode -- hand edits are reverted by sync). Source facts:
breed-vocabulary.ttl (citation, algorithm_statement) and
paper-pointers.ttl (pointer_value/pointer_locus/pointer_derivation) --
the same real facts already backing this repo's generated anti-cheat and
fixture-provenance tests. Nothing on this page is composed for this
document; every claim traces to one of those two files.
-->

This page exists so the algorithm's original author, or anyone else
familiar with the published work, can check whether this implementation
faithfully matches it -- without needing familiarity with this
repository's internals.

## Citation

Marques-Silva, J. P., & Sakallah, K. A. (1999). IEEE Transactions on Computers, 48(5), 506-521.

## What the paper defines

CDCL with naive-scan unit propagation, lowest-index positive-phase branching, GRASP/1-UIP conflict analysis (resolving the conflicting clause backwards along implication-trail antecedents until one current-level literal remains), and non-chronological backjumping to the second-highest level in the learned clause. Every `learn-clause` trace step carries a resolution certificate (`learned=`, `from=` antecedent clause indices, `pivots=` resolution variables) so oracles re-derive the learned clause independently. Hidden oracle: PHP(3,2) UNSAT with ≥1 learned clause; each learned clause re-derived in the test by replaying the `from=`/`pivots=` resolution certificate and compared for equality. Paper fixture: GRASP conflict analysis exercised on PHP(3,2).

*(copied verbatim from docs/breeds/sat_cdcl.md, sections 'Algorithm', 'Generalization examples', and 'Adversarial coverage')*

## What our implementation computes

On the paper's own worked example, this implementation computes: **UNSAT**

Source: Marques-Silva & Sakallah 1999, IEEE Trans. Computers 48(5):506-521, Section 3 (conflict analysis / non-chronological backtracking)

How that value follows from the paper: expected.value/verdict = UNSAT for pigeonhole PHP(3,2), with min_learned_clauses = 1 (at least one learned conflict clause must fire)


## Independent verification

This is not a narrative claim -- it is backed by real, automated tests,
generated from the same ontology facts as this page, that assert the value
above is not merely asserted but was independently fixture-verified against
the paper.

Run them yourself:

```
cargo test -p wasm4pm-cognition sat_cdcl
```

Full technical detail (source file/line mapping, dispatch registration,
edge-case coverage, raw test output) is in
`reports/capability-validation/breeds/*-sat_cdcl.md` in this
repository, for anyone who wants it.
