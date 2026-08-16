---
receipt: W4PM-LEAN-GALL-030b
date: 2026-07-29
status: PARTIAL_ALIVE
gate: Lean coverage ledger — social-network cluster closure (checkpoint 030b)
git_revision: 35b0ee532866943ea55507a05478c78d4a988141 (base; see "Commit" section below for this checkpoint's own commit)
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md), W4PM-LEAN-GALL-009 (receipts/W4PM-LEAN-GALL-009-lean-coverage-ledger.md)
---

# Lean Coverage Ledger — Social-Network Cluster Closure (030b)

Re-investigates 4 rows from `W4PM-LEAN-GALL-009`'s ledger, all originally marked
`no_lean_coverage`: `handover-network`, `working-together-network`,
`community-detection`, `correlation-miner`. Per the governing program, every
claim below is re-derived from a fresh, independent source read this
checkpoint (lumen semantic search + direct `Read` of the actual current
Rust), not accepted from 009's prior notes.

## Rust test baseline

Before any change, `cargo test --lib` (repo root):

```
test result: ok. 394 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out   (miniml)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out     (ocpq)
test result: ok. 73 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out    (prolog8)
test result: ok. 1189 passed; 0 failed; 23 ignored; 0 measured; 0 filtered out (wasm4pm, derived: 1200 post-change - 11 new)
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out     (wasm4pm-cli)
test result: ok. 441 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out   (wasm4pm-cognition)
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out    (wasm4pm-planner)
```

Total: **2111 passed, 0 failed, 23 ignored**. The initial run's terminal
output was truncated (`tail -30`) before the `wasm4pm` crate's own summary
line printed, so that one figure (1189) is derived arithmetically from the
post-change total (1200) minus the 11 tests this checkpoint adds — every
other crate's line was captured directly, unmodified by this checkpoint's
changes. This differs from the task prompt's stated expectation of "~1004
passed" for the whole workspace; **1004 is not what this repo's current
state shows** — reporting the real number rather than the expected one.

After this checkpoint's changes:

```
$ cargo test -p wasm4pm --lib social_network_semantics
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 1048 filtered out

$ cargo test --lib
test result: ok. 394 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
test result: ok. 73 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
test result: ok. 1200 passed; 0 failed; 23 ignored; 0 measured; 0 filtered out
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
test result: ok. 441 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Total: **2122 passed, 0 failed, 23 ignored** — exactly +11 over baseline
(this checkpoint's new tests), 0 regressions.

## Findings

### 1. `handover-network` — TRACTABLE, new Lean theorem + harness built

**Rust** (`wasm4pm/wasm4pm/src/social_network.rs:15-58`,
`discover_handover_network_from_log`, re-read directly this checkpoint):
for each trace, walks consecutive resource pairs and records an edge
`(r1, r2)` iff both are present and `r1 != r2`. Deterministic, no
optimization.

**Lean** (new file `mfact/procint/ProcInt/Models/SocialNetwork.lean`):
`handoverEdges [DecidableEq α] (rs : List α) : List (α × α) := (rs.zip
rs.tail).filter (fun p => decide (p.1 ≠ p.2))`, with theorem
`handoverEdges_iff : (a, b) ∈ handoverEdges rs ↔ (a, b) ∈ rs.zip rs.tail ∧
a ≠ b` plus `handoverEdges_nil`, `handoverEdges_singleton`,
`handoverEdges_irrefl`. Verified via `lake env lean
ProcInt/Models/SocialNetwork.lean` from `/Users/sac/mfact/procint` — clean
exit, zero errors, zero warnings, against a real local Mathlib build
(`.lake/packages/mathlib`, 266M, present). `grep sorry\|axiom` on the file:
zero hits.

**Harness**: `wasm4pm/wasm4pm/src/correspondence/social_network_semantics.rs`
— `lean_handover_edge` transcribes `handoverEdges_iff`, differentially
checked against the real `discover_handover_network_from_log` output for
every ordered pair in the resource universe (full edge-set equivalence).
5 positive tests + 1 shared negative falsifier + 1 shared hash-citation
test, all passing.

### 2. `working-together-network` — TRACTABLE, new Lean theorem + harness built

**Rust** (`wasm4pm/wasm4pm/src/social_network.rs:73-116`,
`discover_working_together_network_from_log`): for each trace, collects the
distinct resource set, then emits an edge for every unordered pair of two
distinct resources both present. Deterministic, no optimization.

**Lean** (same new file, `SocialNetwork.lean`): `workingTogetherEdges
[DecidableEq α] (rs : List α) : List (α × α) := (rs.dedup ×ˢ
rs.dedup).filter (fun p => decide (p.1 ≠ p.2))`, theorem
`workingTogetherEdges_iff : (a, b) ∈ workingTogetherEdges rs ↔ a ∈ rs ∧ b ∈
rs ∧ a ≠ b`, plus `workingTogetherEdges_nil`, `workingTogetherEdges_irrefl`,
`workingTogetherEdges_constant`. Same clean build verification as above
(one file, one `lake env lean` invocation covers both theorems).

**Harness**: same Rust file, `lean_working_together_edge`, differentially
checked against `discover_working_together_network_from_log` (checking
both edge directions since the Rust function only emits one direction per
unordered pair). 4 positive tests, all passing.

**mfact commit for both theorems**: `68fb4b393f527ecac178facb565e70b58fd4390a`
(committed separately in `/Users/sac/mfact`, see below).
**Lean file SHA-256** (cited in the Rust harness for staleness detection):
`76b1ebbc2a5373ba2266a05e3d7e8e4e49b7f31a440d314a1365fce0a3edea10`.

**Honest limitation**: mfact's top-level `ProcInt.lean` umbrella import does
NOT currently build end-to-end (`lake env lean ProcInt.lean` fails on a
pre-existing, unrelated missing `.olean` for `ProcInt.Foundations.Metric`).
Confirmed via `git stash` that this failure predates this checkpoint's
changes and is not caused by them. Only the new `SocialNetwork.lean` file
was verified standalone (`lake env lean ProcInt/Models/SocialNetwork.lean`),
which succeeds cleanly — the umbrella-level build gap is a separate,
pre-existing item, not claimed as fixed here.

### 3. `community-detection` — re-confirmed `no_lean_coverage`

**Verification method**: direct re-read of `wasm4pm/wasm4pm/src/
network_metrics.rs`'s `SocialNetwork::community_detection` and
`SocialNetwork::modularity_gain`, not a repeat of 009's claim. The function
body's own comment reads "Louvain algorithm (simplified greedy version)".
Confirmed: every node starts in its OWN singleton community; a bounded
(`MAX_ITERATIONS = 10`) greedy local-moving loop repeatedly tries moving
each node to a neighboring community and accepts the move iff
`modularity_gain(...) > best_gain` — a real modularity-style delta
(`new_comm_edge_weight - old_comm_edge_weight`), not a connectivity check.
This is **not** connected-components and **not** any other trivially
decidable structural query — it is genuine local-search optimization over a
set-partition space, the NP-hard-in-general problem class (modularity
maximization, Brandes et al. 2008).

**Lean search**: fresh grep/semantic search across mfact and mfw for
"modularity", "community detection", "Louvain", "graph partition": zero
hits in either repo.

**Verdict**: `no_lean_coverage`, confirmed. 009's conclusion stands, now
with line-level evidence rather than a name-search summary: no
modularity-optimality proof is possible without resolving NP-hardness
first, and even a hypothetical optimality theorem would not apply to this
specific implementation, since it is a bounded-iteration strictly-improving
greedy heuristic with no global-optimum guarantee by construction.

### 4. `correlation-miner` — re-confirmed `no_lean_coverage`

**Verification method**: direct re-read of `wasm4pm/wasm4pm/src/
correlation_miner.rs`'s `mine_correlation` (lines 115-232),
`compute_ps_matrix`/`compute_duration_matrix` (~lines 280-338), and
`resolve_edges` (lines 396-440+). Confirmed algorithm: case-ID-free
correlation mining — flattens all events, sorts by timestamp, computes a
precede-succeed fraction and a duration statistic per activity pair, then
`resolve_edges` builds a cost `dur[i][j] / ps[i][j] / min(count_i,
count_j)` per candidate edge, sorts candidates by ascending cost, and
GREEDILY assigns edge frequency by consuming remaining in/out-degree
budget per activity, with a cycle-avoidance heuristic (skip if
`ps[j][i] >= ps[i][j] * 0.8`).

**Why not tractable**: this is a greedy heuristic assignment over a
real-valued, globally-ranked cost function — edge existence depends on the
relative cost ranking across the WHOLE activity universe, not a local,
position-based fact about any one pair, so no simple `edge (a,b) exists iff
<predicate>` law can be stated (unlike handover/working-together above).
No optimality claim exists in the Rust code or its doc comments, and greedy
min-cost matching with degree-budget consumption is not in general
provably optimal.

**Lean search**: fresh grep/semantic search across mfact and mfw for
"correlation", "precede-succeed", "PS matrix", "case-free"/"unlabeled DFG":
zero hits in either repo. Distinct from the plain multi-trace `dfg` carrier
(`ProcInt.Dfg`) — correlation-miner's distinguishing contribution (trace
inference AND edge-weight inference from an unlabeled event stream via the
greedy heuristic above) has no Lean counterpart at any granularity.

**Verdict**: `no_lean_coverage`, confirmed.

## Deliverables

- `wasm4pm/wasm4pm/correspondence/maps/social-network-cluster-030b.json` —
  full structured findings for all 4 algorithms (this repo's actual
  correspondence-maps directory is `wasm4pm/wasm4pm/correspondence/maps/`,
  matching every prior map file's location; not the top-level
  `correspondence/` path named in the task prompt, which does not exist in
  this repo).
- `mfact/procint/ProcInt/Models/SocialNetwork.lean` — new file, 2 proven
  theorems (`handoverEdges_iff`, `workingTogetherEdges_iff`) plus 5
  supporting lemmas, zero `sorry`/`axiom`.
- `wasm4pm/wasm4pm/src/correspondence/social_network_semantics.rs` — new
  harness, registered in `wasm4pm/wasm4pm/src/correspondence/mod.rs`
  (alphabetically, between `rework_detection` and `token_replay`).

## Commits

- **mfact**: `68fb4b393f527ecac178facb565e70b58fd4390a` — "feat(procint):
  prove handover/working-together social-network correctness laws". Note:
  mfact's pre-commit hook (`HAND_CODED_GENERATED_OUTPUT` guard) initially
  refused the commit since `SocialNetwork.lean` is not `ggen`-rendered;
  committed with `MFACT_SOURCE_CHANGED=1` per the hook's own documented
  override path, since this is a legitimately new hand-written file with no
  corresponding ontology template to regenerate from (consistent with this
  repo's own `ggen sync` being currently blocked per `CLAUDE.md`).
- **wasm4pm**: this checkpoint's commit — see the commit immediately
  following this receipt in `git log`, message "feat(correspondence):
  handover/working-together social-network Lean correspondence harness
  (W4PM-LEAN-GALL-030b)".

Note: `mfw` was checked for any pre-existing social-network Lean work
(`ls /Users/sac/mfw`) — no `procint`-style Lean model tree exists there at
all (mfw's directory structure is a distinct, non-Lean-model-centric
project layout); all new Lean work this checkpoint went into `mfact`, the
same repo every predecessor harness (`declare_semantics.rs`,
`rework_detection.rs`, etc.) has cited.

## Standing

`PARTIAL_ALIVE` — 2 of the 4 targeted rows (`handover-network`,
`working-together-network`) close this checkpoint with a real, verified,
sorry/axiom-free Lean theorem and a passing differential Rust harness. The
other 2 (`community-detection`, `correlation-miner`) are honestly
re-confirmed `no_lean_coverage` with line-level evidence, not merely
repeated from 009. 0 test regressions (2111 → 2122 passed, +11, 0 failed
throughout).
