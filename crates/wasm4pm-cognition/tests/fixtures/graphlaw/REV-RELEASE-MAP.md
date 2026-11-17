# Graphlaw rev → release crosswalk

Two identifiers name the graphlaw engine in this ecosystem and historically
had no linkage:

- **fixture rev** — `provenance.graphlaw_rev` in every
  `fixtures/graphlaw/*.json` vector (the graphlaw git revision the frozen
  vectors were generated at);
- **release pin** — the sibling runtime `/Users/sac/ash_graphlaw`
  (`priv/graphlaw/MANIFEST.json`), which pins a release tag by wasm sha256.

This table is the crosswalk. Facts below are real observations made 2026-10-13
against `/Users/sac/graphlaw` (read-only git) and the on-disk MANIFEST. The
enforcement court is
`graphlaw_vector_oracle.rs::graphlaw_rev_ancestry_court`: the fixture rev must
remain an ancestor of `/Users/sac/graphlaw` main; a graphlaw rebase or
history rewrite fails the court loudly. When the sibling checkout is absent
the court reports `BLOCKED:-skip` rather than passing vacuously.

## Table

| fixture graphlaw_rev | first containing tag (graphlaw) | rev date | sibling release pin (ash_graphlaw MANIFEST) | engine artifact sha256 | relationship | as-of |
|---|---|---|---|---|---|---|
| `82c67c2b7e2ed71e7ca6bbd557e36fc7f446b1bd` | `v26.10.13` | 2026-10-10 | `26.9.29` (tag `v26.9.29` @ `0a38b68c18a0375917914673094d25b98fc5a94f`, 2026-09-30) | `7bb2a7e5ebcef7584b0b960451272d56fa75414d76a12138d41e8973e126eee0` | fixture rev is NEWER than the sibling release pin; both are ancestors of graphlaw main; rev is NOT contained in v26.9.29/v26.10.5 | 2026-10-13 |
| `615dbfaf94d407cffe174af02804d0dbfb3f8f1d` | untagged (graphlaw main HEAD @ regen; crate version `26.10.21` stamped as `provenance.graphlaw_version`) | 2026-10-22 | `26.9.29` (unchanged, tag `v26.9.29` @ `0a38b68c18a0375917914673094d25b98fc5a94f`) | (not re-measured this row; description_logic 4-fixture regen only, serialization + provenance bump) | fixture rev is an ancestor of graphlaw main (it IS main HEAD); sibling pin unchanged | 2026-10-22 |

Verified observations (2026-10-13):

- `git -C /Users/sac/graphlaw rev-parse 82c67c2b…` resolves;
  `merge-base --is-ancestor 82c67c2b… main` → ancestor (yes).
- `git tag --contains 82c67c2b…` → only `v26.10.13` (NOT v26.9.28, v26.9.29,
  v26.10.5).
- Local `/Users/sac/ash_graphlaw/priv/graphlaw/graphlaw.wasm` sha256 =
  `7bb2a7e5…26eee0`, matching its MANIFEST `artifact.sha256` (release asset
  for v26.9.29, pinned by ontology.ttl — not a local build).

Consequence: the frozen vectors were generated against a graphlaw state
**ahead of** the 26.9.29 wasm the sibling runtime executes. Vector-vs-runtime
equivalence is therefore carried by the frozen-vector replay contract
(byte-level vectors + breed-level reimplementation), not by identical engine
revisions. Any bump of either side of this table must update the table row
and re-run `graphlaw_rev_ancestry_court`.

## Maintenance

- New vector generation against a new graphlaw rev → add a row
  (rev, containing tag, sibling pin, sha256, as-of) and stamp
  `provenance.graphlaw_version`.
- The court (`graphlaw_rev_ancestry_court` +
  `graphlaw_rev_court_sabotage_twin`) guards main-line ancestry and the
  40-hex / version-format loader contract; it does NOT assert the sibling
  release pin, which is ash_graphlaw's own manifest court's job.
