# allen_temporal — Allen Interval Algebra (Allen 1983)

Source of truth: `crates/wasm4pm-cognition/src/breeds/allen_temporal.rs`, fixture `tests/fixtures/papers/allen_temporal.json`, oracle `src/breeds/support/oracle_impls/logic.rs`, OCPN `ocel/models/l1/allen_temporal.ocpn.json`.

## Shape

### BreedInput
Uses `facts` and `state` (`rules`, `goals`, `candidates`, `cases` unused).

| Key pattern | Meaning | Example |
|---|---|---|
| fact `relation` = `"A,B,r1|r2|..."` | Symbolic constraint between intervals A,B (mask = union of listed relations) | `relation` = `A,B,m` |
| state atom `interval` = `"name,start,end"` | Concrete-endpoint interval (start < end, i32) | `interval` = `uo_a,1,2` |

Relation symbols (fixed index order): `p`(0) `pi`(1) `m`(2) `mi`(3) `o`(4) `oi`(5) `d`(6) `di`(7) `s`(8) `si`(9) `f`(10) `fi`(11) `eq`(12). 13×13 composition table derived at compile time by exhaustive endpoint enumeration over endpoints 1..=6.

Caps (refusal semantics — plain precondition `Err`, no BoundedBreed):
- requires at least one `relation` fact or `interval` state atom
- malformed relation (`!= 3` comma parts) → `"malformed relation fact ..."`
- relation list with zero valid symbols → `"relation fact ... has no valid relations"`
- > 32 distinct interval names → `"exceeded 32 intervals (got N)"` (checked in preconditions and again in run)
- run-level: malformed/`start>=end` interval; empty narrowed mask → `"inconsistent constraint ..."`; path-consistency wipeout → `"inconsistency detected between X and Y"`

### BreedOutput
- `selected`: always `Some("temporal-consistent")` on success (inconsistency is a run error, not a verdict).
- Output facts: `derived:A,B` for EVERY ordered pair (lexicographic node order), value = post-fixpoint mask symbols joined by `|` in index order. Input facts are NOT echoed.
- `candidates` passed through; `explanation`: `"Allen interval network over <n> intervals reached path-consistency fixpoint"`.

### Trace

| kind | cardinality | detail format | OCPN phase |
|---|---|---|---|
| `allen-load` | ≥1 | `interval <name> [<s>,<e>]` or `rel <raw>` | `network_empty`/`network_loaded` (self-loop t1) |
| `allen-compose` | 0+ (one per matrix narrowing during path consistency) | `<k> via <i> -> <j>: <mask>` | `propagating` |
| `allen-verdict` | exactly 1 (last) | `path-consistency-fixpoint` | `fixpoint_reached` |

## Data (canonical fixture)

Provenance: Allen, J. F. (1983). Maintaining Knowledge about Temporal Intervals. CACM 26(11), 832-843. Table 1 transitivity entry: m ; d = (o s d). Extraction: verbatim table entry.

Input facts: `relation` = `A,B,m`; `relation` = `B,C,d`. (No state, rules, goals.)

Expected (asserted):
- `derived:A,C` = `o|d|s`
- `derived:C,A` = `oi|di|si`

(Note: `o|d|s` is the implementation's index order p,pi,m,mi,o,oi,d,di,s,si,f,fi,eq — the paper's `(o s d)` reordered.)

## Oracle diagram

### Oracle assertions (BreedOracle for AllenTemporal, logic.rs)
- `novel_input`: chain `relation` = `uo_a,uo_b,p` and `uo_b,uo_c,p`.
- `boundary_pair`: `uo_a p uo_b` with concrete intervals `uo_a,1,2`/`uo_b,3,4` vs `uo_a pi uo_b` with `uo_a,3,4`/`uo_b,1,2` — opposite derived facts.
- `refusal_input`: `relation` = `uo_a,uo_b,uo_notarel` (no valid relation symbols).
- `assert_intermediate`: `require_non_empty()`; `require_at_least("allen-load", 2)`; `require_kind("allen-compose")`; `require_count("allen-verdict", 1)`; `require_last("allen-verdict")`.
- `assert_trace_values`: none (default).

Postconditions (in-breed): `require_non_empty_with_kinds(["allen-load"])`; `require_count("allen-verdict", 1)`; output must contain at least one `derived:` fact.

### Step invariants
- Relation masks are monotone non-increasing under path consistency: every `allen-compose` step records a strictly narrowed mask for `(k,j)`, and `matrix[j][k]` is simultaneously set to the inverse mask. PROPOSED as a per-pair trace check (mask in later `allen-compose` for the same pair ⊆ earlier mask).
- A narrowing to the empty mask never appears in trace — it is a run error instead.
- Algebraic table invariants enforced by inline unit tests in `allen_temporal.rs`: `r∘eq = eq∘r = r` for all 13; `INVERSE` is an involution; `(r1∘r2)⁻¹ = r2⁻¹∘r1⁻¹` over all 169 pairs; `p∘m = p`.

### Adversary (anti-cheat-threat-model.md)
Cheat: hardcode only composition-table entries that tests touch, or inject oracle intervals inside `run()` (observed A8 instance: `gamma/delta/eps`).
Killed by: algebraic property sweep over ALL 169 entries (identity, involution, composition-inverse duality — a partial table fails closure); path consistency on a fresh 4-interval network requiring an unexercised entry; A8 source-grep gate (fresh `uo_` names must not appear in `src/breeds/`).

## Class & bounds
- Breed class: none (no Verifier/Planner/Classifier/Optimizer trait; `selected` is the fixed token `temporal-consistent`).
- `BoundedBreed`: not adopted; cap of 32 intervals enforced in preconditions/run directly.
- Registry: status `PARTIAL_ALIVE`, standing `DISPATCHABLE`, no `complexity_caps` field (32-interval cap is source-only — discrepancy noted in report).
