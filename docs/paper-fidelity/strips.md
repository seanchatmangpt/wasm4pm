# Strips -- Paper Fidelity

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

Fikes, R. E., & Nilsson, N. J. (1971). STRIPS: A new approach to the application of theorem proving to problem solving. Artificial Intelligence, 2(3–4), 189–208.

## What the paper defines

State = HashSet of `predicate=value` atoms. Actions = rules with `premise` (preconditions), `conclusion` (add/delete list, `!` prefix = delete). Iterative-deepening depth-first search (max depth 16). Frame axioms in `facts[key="frame"]` preserve atoms across specified actions. Goal = all `goal` predicate=value atoms satisfied. Paper worked example: Fikes & Nilsson (1971) Sussman anomaly: 3-block stack; plan "unstack-C;stack-A-B;stack-C-A" or equivalent.

*(copied verbatim from docs/breeds/strips.md, sections 2 and 6)*

## What our implementation computes

On the paper's own worked example, this implementation computes: **turn-on-light,close-door1**

Source: Fikes & Nilsson 1971, Artificial Intelligence 2(3-4), Section 2 (p. 191) — world model, goal G, operators O1..On; room-navigation domain of Section 3

How that value follows from the paper: expected.plan joined with commas — 2-step forward-search plan; goals ordered light=on then door1=closed


## Independent verification

This is not a narrative claim -- it is backed by real, automated tests,
generated from the same ontology facts as this page, that assert the value
above is not merely asserted but was independently fixture-verified against
the paper, and that it is never hardcoded as a literal in the implementation's source -- the algorithm must genuinely *derive* it.

Run them yourself:

```
cargo test -p wasm4pm-cognition strips
```

Full technical detail (source file/line mapping, dispatch registration,
edge-case coverage, raw test output) is in
`reports/capability-validation/breeds/*-strips.md` in this
repository, for anyone who wants it.
