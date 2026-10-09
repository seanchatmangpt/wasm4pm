# WORKGRAPH Standings Witness Log — Lane R58 (2026-10-09)

Witness log for the v26.10.8 workgraph standing-resolution pass over
`docs/sjira/v26.10.8/WORKGRAPH.ttl`. Every standing change below is backed by a
real command run at HEAD = 2bb0c4ecf (merge of PR #672) in the canonical
checkout `/Users/sac/wasm4pm`, branch `docs/workgraph-standings-r58`.
No standing was changed without a witnessed run; unrunnable falsifiers stayed
UNKNOWN with the blocker named.

## Standing census (before / after)

`WORKGRAPH.ttl` carries 28 `sj:standing` values total
(9 orders + 9 checkpoints + 9 epics + 1 milestone).

| standing  | before | after | delta detail |
|-----------|--------|-------|--------------|
| UNKNOWN   | 24     | 8     | −16: 7 orders + 7 checkpoints → ALIVE; 1 order + 1 checkpoint → REFUTED |
| ALIVE     | 3      | 17    | +14 (orders 001,002,004–008 + their checkpoints, all witnessed this pass) |
| REFUTED   | 0      | 2     | +2 (SJIRA-26108-009 order + checkpoint, typed below) |
| PARTIAL_ALIVE | 1  | 1     | milestone, unchanged |

Epics (8 × UNKNOWN; Epic-archive was and remains ALIVE) are unchanged: no
per-epic falsifier was run this pass
(see "Not run" below).

## Falsifier classes run (shared evidence)

Real commands, run at HEAD, outputs quoted verbatim.

### F1. `cargo test --workspace` (declared `sj:falsifier` on every order)

```
$ cargo test --workspace    # in /Users/sac/wasm4pm, exit 0
...
test result: ok. 77 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out; finished in 23.81s
CARGO_EXIT=0
```
Exit 0 at HEAD. Output file tail captured (doc-tests shown above; unit-test
output preceded, exit code is the witness). 0 failures.

### F2. Member-SHA rooting (per order)

```
$ git merge-base --is-ancestor <sha> HEAD   # for all 16 member SHAs
```
Result: all 16 cited member SHAs exist and are ancestors of HEAD (16/16 YES).
This grounds every order's `sj:landedCommit` set.

### F3. Deterministic regen — agent card (`scripts/gen_agent_card.py`)

```
$ python3 scripts/gen_agent_card.py   # run 1 -> wrote .well-known/agent-card.json
$ python3 scripts/gen_agent_card.py   # run 2
$ cmp /tmp/r58-card-after-run1.json .well-known/agent-card.json
DOUBLE-RUN-BYTE-IDENTICAL
$ git diff --quiet .well-known/agent-card.json && echo MATCHES-HEAD-COMMITTED
MATCHES-HEAD-COMMITTED
```
Generator exit 0 both runs; fail-closed property intact (`scripts/gen_agent_card.py:6`:
"loses its lib.rs export, generation refuses" — exit 0 at HEAD witnesses that
every published skill still has its lib.rs export).

### F4. External agent-card validator (ggen-marketplace)

```
$ python3 /Users/sac/ggen-marketplace/scripts/validate_agent_cards.py --json
# wasm4pm row:
{'repo': 'wasm4pm', 'status': 'PASS', 'cards': [{'file': '/Users/sac/wasm4pm/.well-known/agent-card.json', 'errors': []}], 'error_count': 0}
VALIDATOR_EXIT=0
```

### F5. Deterministic regen — WORKGRAPH.ttl (`ggen-marketplace/scripts/gen_workgraph.py`)

```
$ python3 ~/ggen-marketplace/scripts/gen_workgraph.py --repo /Users/sac/wasm4pm --version v26.10.8   # run 1 -> /tmp/r58-workgraph-regen.ttl
$ python3 ... > /tmp/r58-workgraph-regen2.ttl                                                        # run 2
$ cmp /tmp/r58-workgraph-regen.ttl /tmp/r58-workgraph-regen2.ttl
WORKGRAPH-DOUBLE-RUN-BYTE-IDENTICAL
$ cmp /tmp/r58-workgraph-regen.ttl docs/sjira/v26.10.8/WORKGRAPH.ttl
/tmp/r58-workgraph-regen.ttl docs/sjira/v26.10.8/WORKGRAPH.ttl differ: char 31965, line 530
```
The regen-at-HEAD is deterministic but differs from the committed projection:
the committed file was generated at subject SHA af6e5c5e8 and HEAD has since
advanced (member commits 2b6dea687 "docs(sjira): workgraph sha citation
completeness" and merge 6bb…/PR #672 landed after generation). Typed below
against SJIRA-26108-009.

### F6. Blob-repair / cache-exclusion check (docs axis)

```
$ git rev-list --objects HEAD -- .oclnr-cache | wc -l
0
$ git rev-list --objects HEAD | awk '{print $2}' | grep -c oclnr-cache
0
```
No `.oclnr-cache` path is reachable from HEAD. The historical 664,159,796-byte
blob cd1e2573cc31 exists only as an unreachable object (verified
`git rev-list --objects HEAD | grep -c cd1e2573cc` → 0). The 633 MB classifier
cache was genuinely excised from the reachable tree.

## Per-order falsifier results

### SJIRA-26108-001 (a2a, subject 5d052f2fe) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 rooted; F3 regen double-run byte-identical and
  matches the committed `.well-known/agent-card.json` at HEAD.
- The card's claimed property ("emits deterministically, byte-identical,
  fail-closed") was exercised, not just read.

### SJIRA-26108-002 (agent-card, 070c5e96f + 700e4d27e) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 rooted; F4 external validator PASS (v1.0
  member-contract: no top-level `url`, `supportedInterfaces[0].protocolVersion`
  = "1.0" — checked via `jq 'has("url"), has("supportedInterfaces")'`:
  `has_url=false has_supportedInterfaces=true protoVer=1.0 cardProto=1.0`).

### SJIRA-26108-003 (archive, 1edbdbd6a) — ALIVE (re-witnessed, unchanged)
- Citation-completeness grep:
  `grep -c 1edbdbd6acdc72ec26a24d1b8fa3deaac6af1d95 docs/sjira/v26.10.8/CAMPAIGN-RECEIPT.md`
  → `1`. The witnessing artifact still cites the subject commit; its falsifier
  ("witnessing artifact no longer cites 1edbdbd6a") did not fire.

### SJIRA-26108-004 (changelog, 72da25146) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 rooted; artifact check at subject SHA:
  `git show 72da25146:CHANGELOG.md | grep -E '^## .*26\.10\.[678]'`
  → sections `## [26.10.8] — 2026-10-08`, `## [26.10.7] — 2026-10-07`,
  `## [26.10.6] — 2026-10-07` all present at the cited commit.

### SJIRA-26108-005 (docs, 6 member commits) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 all 6 member SHAs rooted; F6 no `.oclnr-cache`
  blobs reachable from HEAD.

### SJIRA-26108-006 (policy, 77e8b09dd) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 rooted;
  `git cat-file -e 77e8b09dd…:docs/DOCUMENTATION_MANIFEST.md` → EXISTS.
  Manifest regen via `scripts/docs/migrate-markdown.mjs` was not re-run
  (full-checkout generator over a shared checkout mid-flight); artifact
  existence at subject SHA + F1 witnessed instead. Disclosure: this is the
  weakest ALIVE in this pass — the manifest byte-regen check is available as a
  follow-up falsifier.

### SJIRA-26108-007 (reference, 5a59b1be4) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 rooted;
  `git cat-file -e 5a59b1be4…:docs/reference/ocel-conformance.md` → EXISTS
  (also present at HEAD); cited artifact `crates/ocpq/` exists at HEAD.

### SJIRA-26108-008 (sa2a-actuator, 7146a5312) — UNKNOWN → ALIVE
- F1 cargo test exit 0; F2 rooted; F3 fail-closed generator exit 0 at HEAD
  (skills ↔ lib.rs re-export check exercised); F4 external validator PASS;
  card skills enumerated (`wasm4pm.actuator.execute`, `.effect.digest`,
  `.certificate.signing_message`, `.verify`, `.resource.admit`, `.ledger`)
  and all six map to `pub mod`/`pub use` surface in
  `crates/wasm4pm-sa2a-actuator/src/lib.rs`.

### SJIRA-26108-009 (sjira, 0021d6151 + af6e5c5e8) — UNKNOWN → REFUTED (typed)
- What passed: F1 cargo test exit 0; F2 rooted; F5 double-run determinism
  (`WORKGRAPH-DOUBLE-RUN-BYTE-IDENTICAL`); committed WORKGRAPH.ttl exists at
  af6e5c5e8.
- What refutes: the regen byte-diff class ran and failed. Failing output:
  `cmp /tmp/r58-workgraph-regen.ttl docs/sjira/v26.10.8/WORKGRAPH.ttl` →
  `differ: char 31965, line 530`; the diff is exactly the post-generation
  member commit 2b6dea687 ("docs(sjira): workgraph sha citation completeness")
  plus merge PR #672 missing from the committed projection. Typed as
  REFUTED[STALE-PROJECTION]: the committed WORKGRAPH.ttl is not the
  deterministic regen of the repo state it sits at the head of — regeneration
  is required and supersedes this file. Generator nondeterminism is
  explicitly NOT the refutation (double-run was byte-identical).
- Note: this pass edits standing lines in WORKGRAPH.ttl under explicit lane
  pathspec authority, which widens the F5 diff; disclosed here.

## Not run (remain UNKNOWN, blockers named)

- All 8 UNKNOWN epic standings (Epic-a2a, Epic-agent-card, Epic-changelog,
  Epic-docs, Epic-policy, Epic-reference, Epic-sa2a-actuator, Epic-sjira;
  Epic-archive was already ALIVE): no per-epic
  falsifier exists in the graph and none was run; epic standing inherits from
  member orders but no epic-level court receipt was executed. Blocker: no
  epic-level falsifier spec to run.
- SJIRA-26108-006 manifest byte-regen (see disclosure above) — order still
  ALIVE on cargo + artifact-existence evidence.
- Exact-head courts binding each subject SHA into a durable 5-field receipt
  (the `sj:promotionRule` class): out of lane scope; these standings are
  falsifier-witnessed, not court-promoted.

## Subject identity

- Branch: `docs/workgraph-standings-r58` (from 2bb0c4ecf, main's merge of PR #672)
- Exact HEAD witnessed: 2bb0c4ecf
- Changed pathspec: `docs/sjira/v26.10.8/WORKGRAPH.ttl`,
  `docs/sjira/v26.10.8/WORKGRAPH-STANDINGS-WITNESS.md` (this file)
