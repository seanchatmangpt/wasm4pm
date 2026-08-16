---
receipt: W4PM-LEAN-GALL-037
date: 2026-07-30
status: PARTIAL_ALIVE
gate: ggen-sync-only correspondence substrate (Lean↔wasm4pm one-to-one mapping, phase 3)
git_revision: 67e833ce9
predecessor: W4PM-LEAN-GALL-022 (receipts/W4PM-LEAN-GALL-022 pass, recorded in 010-024 receipts)
mfact_revision: a8b7b8d3c0b
---

# 037 — `ggen sync` as the Only Action: Substrate Built, Scaling Premise Refuted

Constraint for this checkpoint: **`ggen sync` is the only permitted action.** All logic in
`ggen.toml`, Tera, and TTL; **no domain logic in templates**; anything that cannot be made
generic indicates a misunderstanding, not an exception.

## The headline finding: `ggen sync` silently destroys hand-edited generated Lean

Running `ggen sync` in `/Users/sac/mfact` **deleted real, kernel-verified work from earlier
checkpoints in this very program**:

- `procint/ProcInt/Models/Dfg.lean` — **146 lines removed**: the whole of
  `W4PM-LEAN-GALL-023`'s multi-trace formalization (`dfgOfLog`, `Dfg.append`,
  `dfgOfLog_weight_eq_sum`, `startActivities`/`endActivities` and their lemmas). 023 was the
  first checkpoint in the program to reach a genuinely kernel-verified `ALIVE` standing.
- `procint/ProcInt.lean` — dropped `import ProcInt.Models.CausalNetClamp` (024),
  `import ProcInt.Models.SocialNetwork` (030b), and the three `MFW` imports.

Root cause: every one of those files is **ggen-rendered from TTL**, and each carries the
header `Do not edit by hand: candidates enter through the ontology, never here.` Checkpoints
023, 024, and 030b wrote Lean *directly into the generated files*, so the mathematics never
entered the ontology and the first render reverted it. `ProcInt.lean` even carried a
hand-written warning predicting exactly this ("`just render` regenerates this file from ggen
and drops these three lines — re-add them after any render"). The prediction was correct.

Nothing was lost — it was committed at `HEAD` and restored — but the exposure is the point:
**a substantial part of this program's Lean output was one `ggen sync` away from deletion, and
would have looked like an unexplained regression.** This is the strongest possible vindication
of the "ggen sync is the only action" constraint: work not in TTL is ephemeral by
construction.

**Fixed, not merely reported.** All 14 of 023's declarations are now `procint:Decl`
individuals (`fragments/zz-dfg-multitrace.ttl`, `declOrder` 8–21, each with a real
`procint:declName`). Regeneration is semantically lossless: the sole byte difference is a
hand-trimmed blank line restored to ggen's canonical two before `end ProcInt` — verified as
canonical against three untouched modules (`CausalNet`, `Declare`, `Moves`), all of which have
two. The `ProcInt.lean` imports are restored via a new `procint:IndexedImport` class.

## Built, with genericity verified

**1. The `verif:` schema, which did not exist** (`fragments/verif-schema.ttl`).
`verif:CorrespondenceObligation` and its ten predicates were *used* but never *declared* —
zero occurrences in `ontology/procint-schema.ttl`, no SHACL anywhere. A misspelled predicate
therefore made the consuming SPARQL `WHERE` conjunction fail to match, and `skip_empty: true`
dropped the rendered file with no error. Also reifies the
`DECLARED → EXTRACTED → STATED → PROVEN` ladder as individuals with `verif:statusRank`,
replacing the `status_order` dict hardcoded in `scripts/build_verif.py` — the ranking is
domain knowledge, so it now lives in TTL.

**2. A gate surface, where the pack had zero** (`gates/*.rq`). ggen has supported SPARQL gates
since SHACL was removed; mfact declared none. Four added, all reading domain knowledge from
TTL rather than hardcoding it:

| Gate | Replaces | Note |
|---|---|---|
| `10-obligation-required-predicates` | — | **Fully generic**: reads `verif:requiredOnObligation` from the schema, names no property. Declaring a new required property extends the gate automatically. |
| `20-correspondence-dangling` | `CORRESPONDENCE_DANGLING_REFUSED` | **Strictly stronger** than the Python: that grepped the filesystem, so any textual occurrence (a comment, a docstring) passed. This joins `procint:declName` in the admitted graph. |
| `30-status-unknown` | part of `PROOF_STATUS_MISMATCH_REFUSED` | Rung set read from the ontology. |
| `40-obligation-identity-collision` | — | Refuses at Stage 2b with the identity named, where ggen's own `FM-WRITE-008` fires later and reports only a path. |

**Gate 10 was demonstrated firing**, not merely written — the plan's own verification bar:
```
[FM-PACK-013] pack `lean-math-pack` gate `10-obligation-required-predicates.rq` refused the
sync against the union graph: ... SELECT returned 1 row(s); first row:
{ ?missingPredicate = https://mfact.dev/verif#importsBlock,
  ?obligation = https://mfact.dev/verif#Obl_token_replay_counts_corr }
```
This also established that pack gates are **auto-discovered** from `gates/*.rq` on 26.7.59 —
no `[law].gates` declaration required — and that `# MESSAGE:` text reaches the operator verbatim.

**3. Templates de-hardcoded.** `corr_module.lean.tmpl` hardcoded D1's four imports *and* its
`open` clause, so every future obligation would silently inherit them; moved to a
per-obligation `verif:importsBlock` literal mirroring the existing `procint:importsBlock`
pattern — **rendered output byte-identical**. `index.lean.tmpl` hardcoded two
`import ProcInt.Registry.*` lines; the new `procint:IndexedImport` class splits "listed in the
root index" from "file rendered by `module.lean.tmpl`" (Registry files come from dedicated
templates; MFW files are hand-authored, so declaring them `procint:Module` would have clobbered
them) — **import set and order both identical**.

## Refuted: the extraction pipeline cannot scale to 65 algorithms

The plan's premise was that plumbing cost goes to zero per algorithm, so the work becomes
"declare 64 more obligations." A read-only audit of `/Users/sac/wasm4pm-compat` refutes this:

- **`verify/` does not exist** — never committed on any branch, not gitignored, simply absent.
  No `pipeline.json`, no Lake package, no `Abs.lean`, no `Generated/`, no `Corr/`, zero
  `*.llbc`. **Therefore D1's `PROVEN` status in `release/verif-receipt.json` — which quotes
  `lake build` output and an axiom check — is not reproducible today.** Its evidence is gone
  (plausibly only in `stash@{0}`, "WIP: wasm4pm-core subcrate extraction … do not drop").
- **The Charon/Aeneas lane is hard-BLOCKED** on three independent missing pieces: no
  `rustc-dev` on any of nine installed toolchains; pinned `nightly-2026-06-01` not installed;
  neither `charon` nor `aeneas` binary ever built (the opam switch exists and is initialized —
  contra the older plan — but contains only stock OCaml tooling).
- **`wasm4pm-core` contains zero `discover_*` functions.** One real algorithm
  (`conformance_counts`, and only its fitness *arithmetic*); ~85% of its LOC is types,
  validation, hashing, and typestate plumbing. All 88 `discover_*` live in a *different repo*
  outside the Charon perimeter. Worse, the admitted modules were *rewritten* for Charon
  (`HashSet` → linear scans, `chrono` stripped, closures removed) and **floats are declared
  permanently out of the verified surface**, which excludes most conformance/fitness metrics
  outright.

So extending this pipeline is **"rewrite a lot of Rust into `wasm4pm-core` first"**, per
algorithm, not "declare more obligations." "Declare more obligations" is cheap only for what is
already inside that crate — essentially the one algorithm already claimed.

## Verification

- Baseline before any change: `ggen sync --dry-run` exit 0, **81 decisions, all
  `skipped: unchanged: content identical`, 0 written, 0 errors** — a fully converged state, so
  any drift would surface immediately.
- After all changes: exit 0, **0 gate refusals**, re-sync **idempotent** (same 2 changed files
  on the second run as the first), and the only content differences are the two intended ones.
- `primary:` was **deliberately not added**, contradicting the approved plan's first action.
  Empirically confirmed absent from shipped ggen 26.7.59 — adding it raises
  `FM-TPL-002 unknown field 'primary'`. It exists only in local ggen source HEAD
  (`ba6c069bc`), so it is a **coupled change** that must land with a ggen upgrade, never
  before. `module.lean.tmpl` must keep its `a_`-prefix `BTreeMap`-ordering trick on this
  version. Corollary: the earlier claim that ggen's remediation string is buggy applies only
  to unreleased HEAD; 26.7.59 correctly lists its own 24 keys.

## Explicit scope boundary

Not done: `build_verif.py` still exists and still owns status derivation — the Actuation and
Admission primitives (driver script + evidence TTL) were **not** built, because with the
extraction lane BLOCKED there is no evidence for them to carry. `PROOF_STATUS_MISMATCH` and
`AENEAS_IMAGE_DRIFT` remain unported for the same reason: both compare against evidence that
does not currently exist in any graph. `CausalNetClamp` and `SocialNetwork` are `IndexedImport`
holding positions, not yet `procint:Module` individuals with their Lean in TTL. The justfile's
`cat fragments/*.ttl > ontology.ttl` concatenation still lives outside ggen.

## Standing

`PARTIAL_ALIVE` — the generic substrate is real and verified (schema, four gates with one
demonstrated firing, two templates de-hardcoded with byte-identical output, 146 lines of
kernel-verified Lean rescued into the ontology). The pipeline it was built to scale is
`BLOCKED` at the toolchain and, more fundamentally, mis-scoped: the extractable crate contains
almost none of the algorithms the mapping is supposed to cover. Recommend re-scoping the
one-to-one mapping goal against that constraint before further investment.
