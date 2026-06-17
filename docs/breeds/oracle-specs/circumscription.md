# circumscription — Circumscription (McCarthy 1980)

Source of truth: `crates/wasm4pm-cognition/src/breeds/circumscription.rs`, `tests/fixtures/papers/circumscription.json`, oracle in `src/breeds/support/oracle_impls/logic.rs` (lines 239–286), `ocel/models/l1/circumscription.ocpn.json`, `breeds/registry.json`.

## Shape

**BreedInput fields used:** `intent`, `facts`, `rules`, `goals`.

| Convention | Meaning |
|---|---|
| fact key (any) | atom true in all models; key starting `ab_` also registers an abnormality atom |
| rule premise `ab_*` / conclusion `ab_*` | registers an abnormality atom |
| rule premise `not_<x>` | negation; permitted ONLY when `<x>` starts with `ab_` (else refusal) |
| `goals[i].value` | atom whose cautious entailment is tested (`predicate` is `entail` in fixture; value is what is read) |

**Caps:** ≤12 abnormality atoms (`custom_check` → `CognitionError::ComplexityCap`, "refusal, not truncation"); ≥1 rule and ≥1 goal required; `DomainBound::default()` via `BoundedBreed`.

Semantics: enumerate all 2^k abnormality sets S in bitmask order; candidate model = Horn closure of facts ∪ S with `not_ab_x` satisfied iff `ab_x ∉ S`; model iff derived ab-atoms == S and `false` not derived; keep subset-minimal S; cautious entailment = atom in EVERY minimal model's closure. No consistent model → `BreedError`.

**BreedOutput:** `facts` = `entailed:<atom>` = `"true"`/`"false"` per goal; `selected` = first entailed goal atom (or None); `explanation` = "circumscription over k ab-atoms found N models, M minimal; entailed e/g goals".

**Trace table:**

| kind | cardinality | detail format | OCPN phase (`circumscription-l1-v1`) |
|---|---|---|---|
| `load-defaults` | 1 (first) | `N rules; abnormality atoms: {…}` | t1: theory_pending→theory_loaded |
| `enumerate-model` | 2^k (k = ab atoms) | `S={…} -> model\|rejected` | t2: loop on models_enumerated |
| `minimize` | 1 per pruned (dominated) model | `pruned S={…}: strictly larger than another model's abnormality set` | t3: models_enumerated→models_minimal |
| `entail` | 1 per goal | `<atom> \|= true\|false in i/m minimal models -> bool` | t4: → entailment_tested |
| `decision` | 1 (last) | `M minimal models; cautiously entailed: {…}` | t5: → decision_emitted |

**Postconditions:** `require_non_empty_with_kinds(&["enumerate-model"])`.

## Data (canonical fixture)

McCarthy, J. (1980). "Circumscription — a form of non-monotonic reasoning." AI 13(1-2), 27–39; Section 4 bird/penguin example; extraction `instantiated`.

Input intent: `circumscribe abnormality over the bird/penguin theory`. Facts: `bird_tweety`, `bird_opus`, `penguin_opus` (all `"true"`). Rules (certainty 1.0): `r-fly-tweety`: [bird_tweety, not_ab_bird_tweety] → flies_tweety; `r-fly-opus`: [bird_opus, not_ab_bird_opus] → flies_opus; `r-penguin-ab`: [penguin_opus] → ab_bird_opus. Goals: g1 entail flies_tweety; g2 entail flies_opus.

Expected (asserted): `entailed` = {flies_tweety: true, flies_opus: false}; `minimal_ab_set` = ["ab_bird_opus"].

## Oracle diagram

`BreedOracle for Circumscription` (logic.rs):
- `novel_input`: fresh default-flight — fact `uo_wing`; rule `uo_r0`: [uo_wing, not_ab_uo_wing] → uo_glides; goal entail uo_glides.
- `boundary_pair`: entailed vs blocked (add `uo_r1`: [uo_wing] → ab_uo_wing).
- `refusal_input`: rule premise `not_uo_wing` (negation of non-ab atom).
- `assert_intermediate`: `require_non_empty()`; `require_first("load-defaults")`; `require_at_least("enumerate-model", 2)`; `require_kind("entail")`; `require_last("decision")`.
- `assert_trace_values`: not overridden (default).

**Step invariants:**
- Enforced: `enumerate-model` count is exactly 2^k (bitmask loop); only ab-atoms negated (precondition).
- PROPOSED (unenforced): each accepted model's closure is supported (derived ab set == S); minimal set is an antichain under ⊆; `entail` counts i/m consistent with the accepted/pruned model steps.

**Adversary** (anti-cheat-threat-model.md): forward chaining with hardcoded exceptions deriving the fixture answer without minimization. Killed by: penguin oracle on FRESH predicates (naive chaining derives the blocked conclusion, circumscription must not — the boundary pair's blocked side), `minimize` prune steps required in trace, and cautious entailment over MULTIPLE minimal models (atom true in one but not all must be rejected).

## Class & bounds

- Class trait: `BoundedBreed` (`breed_name` = "circumscription", `DomainBound::default()`, `custom_check` cap 12 ab-atoms). No Verifier/Optimizer trait.
- Registry: `status: PARTIAL_ALIVE`, `standing: ORACLED`, `complexity_caps: {"max_abnormality_atoms": 12}`; ancestor/family/relation = TBD; schemas `circumscription_input_v1`/`circumscription_output_v1`; ocel/oracle/receipt/wasm ids `none`.
