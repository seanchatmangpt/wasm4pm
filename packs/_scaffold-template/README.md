# _scaffold-template

Generic starting point for a **new** combinatorial ggen pack: one ontology
class with real individuals, driving N Tera templates via
`{ file = ... }`-sourced `[[generation.rules]]`. This directory is
documentation and example scaffolding only — it is **not** registered in
the root `ggen.toml` `[[packs]]` or `[ontology].imports`, and it is not
synced. Copy it, rename it, register the copy.

## Why this scaffold exists

Two packs already built this exact pattern for real, independently:
`packs/workspace-pack` (crate x {README header, CI job, registry doc}) and
`packs/story-pack` (story x {Gherkin feature, QA procedure, ticket}). Both
hit the same two bugs on their first pass. This scaffold exists so the
third pack doesn't hit them a third time.

## Bug 1: `[[packs]]` registration alone never reaches the query graph

A pack can be fully registered — `path = "packs/<your-pack>"` under
`[[packs]]`, `pack.toml` present, `qualification.toml` present — and its
`[[generation.rules]]` entries can point at real query and template files,
and still render nothing (or render against an empty/absent individual
set), because `[[packs]]` registration and `[ontology].imports` are two
separate concerns in `ggen.toml`. Only the latter puts a `.ttl` file's
triples into the graph that SPARQL queries run against.

The fix in both real packs was the same one-line addition to the root
`ggen.toml`:

```toml
[ontology]
imports = [
  # ...existing imports...
  "packs/workspace-pack/ontology.ttl",
  "packs/story-pack/ontology.ttl",
]
```

Confirmed against this repo's actual root `ggen.toml` (lines 27–28 at time
of writing): both packs' ontology paths are listed there, in addition to
their `[[packs]]` entries elsewhere in the same file. Registering a pack
without also adding its ontology to `[ontology].imports` is the failure
mode; see `checklist.md` for the exact grep to catch it before a sync run.

## Bug 2: flat value/order property pairs corrupt `GROUP_CONCAT` with a cartesian product

`packs/story-pack/ontology.ttl` documents this bug directly in its own
header comment, because it was found and fixed live during that pack's
first draft: the first real render duplicated every multi-valued list N
times. The root cause: an ordered, multi-valued property modeled as flat
pairs directly on the entity subject —

```turtle
# WRONG — do not do this
compat:qaPrecondition "a" ; compat:qaPreconditionOrder 1 ;
compat:qaPrecondition "b" ; compat:qaPreconditionOrder 2 ;
compat:qaPrecondition "c" ; compat:qaPreconditionOrder 3 .
```

— gives SPARQL no RDF-level pairing between a given value and its own
order. A query pattern like `?story compat:qaPrecondition ?text ;
compat:qaPreconditionOrder ?ord` performs a shared-subject join, and that
join matches every `?text` against every `?ord` for that subject: 3 values
x 3 orders = 9 bindings instead of 3, and `GROUP_CONCAT` over that join
emits each value duplicated N times.

The fix, used throughout `story-pack/ontology.ttl` (see its
`compat:ListItem` class and every `compat:*Item` property) and now the
default in `ontology.ttl.example` in this directory: one blank node per
list item, pairing `itemText` and `itemOrder` on a **shared** blank node —

```turtle
# CORRECT
compat:qaPreconditionItem [ compat:itemText "a" ; compat:itemOrder 1 ] ;
compat:qaPreconditionItem [ compat:itemText "b" ; compat:itemOrder 2 ] ;
compat:qaPreconditionItem [ compat:itemText "c" ; compat:itemOrder 3 ] .
```

Because `itemText` and `itemOrder` live on the same blank node, there is
exactly one binding per item — no cross-multiplication is possible. The
corresponding extraction-query shape (also required, not optional) is an
`ORDER BY`-then-`GROUP_CONCAT` subselect per multi-valued field; see
`packs/story-pack/queries/extract-stories.rq`'s own header comment for the
full explanation of why `GROUP_CONCAT` alone (without an `ORDER BY`
evaluated before the aggregation) does not guarantee deterministic order
under SPARQL 1.1, and `queries/extract-widgets.rq.example` in this
directory for a copy-pasteable version of the same subselect pattern.

## What to copy from here

- `ontology.ttl.example` → your pack's `ontology.ttl`: rename `Widget` to
  your entity, replace `widgetId`/`widgetName` with your real scalar
  properties, and either reuse or extend the `widgetTagItem`/
  `compat:ListItem` pattern for each ordered multi-valued property you
  need.
- `queries/extract-widgets.rq.example` → your pack's
  `queries/extract-<entities>.rq`: rename `Widget`/`widgetTags`, and copy
  one `OPTIONAL { SELECT ... GROUP_CONCAT ... ORDER BY ?ord ... }`
  subselect block per multi-valued field.
- `checklist.md`: run through it once your pack's files exist, before
  wiring `[[generation.rules]]` and before opening a PR.

## What this scaffold does NOT include

- Templates (`.tera` files) — these are entity- and output-shape-specific
  enough that copying `workspace-pack/templates/*.tera` or
  `story-pack/templates/*.tera` as a starting point for your own output
  format is more useful than a generic example here.
- `pack.toml` / `qualification.toml` — copy these directly from
  `packs/workspace-pack/` (simplest real example) and edit the pack name
  and description.
- Any `ggen.toml` wiring — that's the last step, done in your real pack's
  own PR, not here.
