# HtnPlanning -- Paper Fidelity

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

Nau, D., Au, T.-C., Ilghami, O., Kuter, U., Murdock, J. W., Wu, D., & Yaman, F. (2003). SHOP2: An HTN Planning System. Journal of Artificial Intelligence Research, 20, 379-404.

## What the paper defines

Chronological backtracking over method choice (declaration order), depth cap 64, expansion cap 512. After planning, the plan is REPLAYED against the initial state (self-audit): a plan that does not replay is refused. Paper: Logistics/transport domain, deliver decomposes into load;drive;unload.

*(copied verbatim from docs/breeds/htn_planning.md, sections 2 and 6)*

## What our implementation computes

On the paper's own worked example, this implementation computes: **op:load,op:drive,op:unload**

Source: Nau et al. 2003, SHOP2, JAIR 20:379-404, Section 2 (total-order decomposition) with the logistics/transport domain

How that value follows from the paper: expected.value / expected.plan: deliver decomposes via method:deliver:by_truck into the unique executable operator sequence load;drive;unload verified by hand replay in fixture notes


## Independent verification

This is not a narrative claim -- it is backed by real, automated tests,
generated from the same ontology facts as this page, that assert the value
above is not merely asserted but was independently fixture-verified against
the paper, and that it is never hardcoded as a literal in the implementation's source -- the algorithm must genuinely *derive* it.

Run them yourself:

```
cargo test -p wasm4pm-cognition htn_planning
```

Full technical detail (source file/line mapping, dispatch registration,
edge-case coverage, raw test output) is in
`reports/capability-validation/breeds/*-htn_planning.md` in this
repository, for anyone who wants it.
