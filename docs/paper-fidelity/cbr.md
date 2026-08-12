# Cbr -- Paper Fidelity

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

A. Aamodt, E. Plaza (1994). Case-Based Reasoning: Foundational Issues, Methodological Variations, and System Approaches. AI Communications, IOS Press, Vol. 7, No. 1, pp. 39–59.

## What the paper defines

Build discrimination-net index: map `key=value` feature strings to case indices (O(log N) lookup). For each candidate case, compute `sim = |intersection(query_facts, case_facts)| / |union|`. Score = `sim × outcome_score`. Select maximum-score case (lex tiebreak on case id). Recommend `selected = best_case.architecture`. Structural oracle: Jaccard symmetry (a,b) == (b,a); identity (a,a) == 1; empty-set == 0. Hidden: partial match (1/3) beats zero match; exact case id asserted.

*(copied verbatim from docs/breeds/cbr.md, sections 2 and 6)*

## What our implementation computes

On the paper's own worked example, this implementation computes: **CASE-PHYSICIAN-2WK**

Source: Aamodt & Plaza 1994, AI Communications 7(1), section 1.2 p. 2 (physician vignette); CBR cycle Figure 1, p. 8

How that value follows from the paper: expected.retrieved_case = 'CASE-PHYSICIAN-2WK': highest Jaccard similarity (4 of 5 features match: medical/fever/cough/moderate), yielding suggested solution 'antibiotic-course'


## Independent verification

This is not a narrative claim -- it is backed by real, automated tests,
generated from the same ontology facts as this page, that assert the value
above is not merely asserted but was independently fixture-verified against
the paper, and that it is never hardcoded as a literal in the implementation's source -- the algorithm must genuinely *derive* it.

Run them yourself:

```
cargo test -p wasm4pm-cognition cbr
```

Full technical detail (source file/line mapping, dispatch registration,
edge-case coverage, raw test output) is in
`reports/capability-validation/breeds/*-cbr.md` in this
repository, for anyone who wants it.
