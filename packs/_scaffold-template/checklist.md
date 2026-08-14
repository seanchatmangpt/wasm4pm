# New combinatorial-pack checklist

Concrete, mechanically-checkable steps for building a new pack from this
scaffold. Every item is something you can run a command against and get a
pass/fail answer — not "review carefully."

This checklist encodes two bugs found and fixed independently in the two
real packs that established this pattern, `packs/workspace-pack` and
`packs/story-pack`. See `README.md` in this directory for the full
writeup and citations.

## Bug 1 — ontology not imported into the query graph

- [ ] After adding `packs/<your-pack>/ontology.ttl`, grep the ROOT
      `ggen.toml` for its path under `[ontology].imports`:

      ```sh
      grep -n "packs/<your-pack>/ontology.ttl" ggen.toml
      ```

      If this returns nothing, **your individuals are invisible to every
      SPARQL query** even though the pack is fully registered — see next
      item.

- [ ] Separately confirm the pack is ALSO registered via `[[packs]]` (both
      are required, neither substitutes for the other):

      ```sh
      grep -n "path.*=.*\"packs/<your-pack>\"" ggen.toml
      ```

- [ ] Run `ggen sync run` (or your project's equivalent) and confirm the
      generated output files are non-empty and contain your individuals'
      real field values, not an empty/placeholder render. An empty render
      with no error is the signature of "packs registered, ontology not
      imported" — `[[packs]]` registration alone never reaches the query
      graph.

## Bug 2 — ordered multi-valued property must be one blank node per item

- [ ] For every multi-valued property in `ontology.ttl`, confirm each
      value is inside its own `[ compat:itemText ...; compat:itemOrder N ]`
      blank node, sharing that ONE blank node for both text and order.
      Reject any pattern that puts `compat:xItem`/`compat:xOrder` (or any
      two properties describing "the same list entry") as flat pairs
      directly on the entity subject:

      ```sh
      # Should find zero matches. If it finds any, that property is a flat
      # value/order pair on the subject, not a blank-node list item -- fix
      # it before writing the extraction query.
      grep -nE '^\s*compat:\w+Order\b' packs/<your-pack>/ontology.ttl
      ```

      (A match here means an `*Order` property exists directly on the
      subject rather than nested inside a `[ ... ]` blank node next to its
      paired `itemText`/`itemOrder`.)

- [ ] For every multi-valued field in `queries/extract-*.rq`, confirm the
      extraction pattern is a `GROUP_CONCAT` over a subselect that ends
      with `} ORDER BY ?ord`, not a flat `GROUP_CONCAT` in the outer
      `WHERE`:

      ```sh
      grep -n "ORDER BY ?ord" packs/<your-pack>/queries/*.rq
      ```

      Zero matches for a query that has any multi-valued field is a real
      bug: `GROUP_CONCAT` alone does not guarantee row order in SPARQL
      1.1, and without the `ORDER BY`-then-aggregate subselect shape, a
      flat join on the outer subject silently cross-multiplies every
      value against every order (N values x N orders instead of N pairs).

- [ ] Render once, then render again with no ontology changes, and diff
      the two outputs — they must be byte-for-byte identical (BLAKE3
      receipt discipline, `.claude/rules/_core/absolute.md` #6). A
      cross-multiplication bug typically shows up here first: the
      duplicated-N-times symptom is visible as repeated list entries in
      the rendered output, even before you go looking at the TTL.

## Generic pre-PR checks

- [ ] `pack.toml` and `qualification.toml` exist and mirror the shape of
      `packs/workspace-pack/{pack.toml,qualification.toml}`.
- [ ] All `[[generation.rules]]` entries use `{ file = ... }` sourcing for
      both `query` and `template`, never `{ pack = ... }` (`QuerySource::Pack`
      / `TemplateSource::Pack` are known-broken on this ggen-engine version;
      `file =` is the only combination confirmed to render — see
      `workspace-pack/README.md` and `story-pack/README.md`).
- [ ] Every generated output path is new/additive, outside any
      hand-written `src/`/`Cargo.toml` — nothing hand-written is at risk
      from a re-run with `mode = "Overwrite"`.
