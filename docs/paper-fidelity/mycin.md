# Mycin -- Paper Fidelity

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

Shortliffe, E. H., & Buchanan, B. G. (1975). A model of inexact reasoning in medicine. Mathematical Biosciences, 23(3–4), 351–379. Reprinted as Chapter 11 in: Buchanan, B. G., & Shortliffe, E. H. (Eds.), Rule-Based Expert Systems. Addison-Wesley, 1984.

## What the paper defines

Forward-chaining CF propagation. Each rule fires if all `premise` atoms match `input.facts`. Fired CF combined via MYCIN disjunctive rule: `CF(A,B) = A + B(1−A)` (both positive), `A + B(1+A)` (both negative), `(A+B)/(1−min(|A|,|B|))` (mixed). Highest-CF conclusion selected (lex tiebreak). Paper worked example: Shortliffe (1976) Table 3-1 bacteremia — two rules fire, CF=0.7 and CF=0.3, combined 0.79.

*(copied verbatim from docs/breeds/mycin.md, sections 2 and 6)*

## What our implementation computes

On the paper's own worked example, this implementation computes: **0.7**

Source: Shortliffe & Buchanan 1975, Math. Biosciences 23(3–4):351–379, §11.4 p.247 (MB[h,e]=0.7 for the streptococcus rule)

How that value follows from the paper: expected.organism_cf = 0.7; paper states MB[h,e]=0.7 ('7 out of 10' expert certainty, p.238 fn4) for gram-positive+coccus+chains→streptococcus.


## Independent verification

This is not a narrative claim -- it is backed by real, automated tests,
generated from the same ontology facts as this page, that assert the value
above is not merely asserted but was independently fixture-verified against
the paper, and that it is never hardcoded as a literal in the implementation's source -- the algorithm must genuinely *derive* it.

Run them yourself:

```
cargo test -p wasm4pm-cognition mycin
```

Full technical detail (source file/line mapping, dispatch registration,
edge-case coverage, raw test output) is in
`reports/capability-validation/breeds/*-mycin.md` in this
repository, for anyone who wants it.
