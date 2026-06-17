# description_logic — EL Completion-Rule Classification (Baader, Brandt & Lutz 2005)

Source: `crates/wasm4pm-cognition/src/breeds/description_logic.rs`

## Shape

**BreedInput fields used:** `facts` (TBox axioms), `goals` (subsumption queries). `candidates` echoed through.

| Pattern | Meaning | Example |
|---|---|---|
| `dl:subclass:<A>` → `<B>` | A ⊑ B | `dl:subclass:Inflammation` = `Disease` |
| `dl:conj:<A1>+<A2>` → `<B>` | A1 ⊓ A2 ⊑ B (`+` separator required) | `dl:conj:Disease+HasLocationHeart` = `HeartDisease` |
| `dl:exists_rhs:<A>` → `<r>.<B>` | A ⊑ ∃r.B (`.` separator in value) | `dl:exists_rhs:Pericarditis` = `has_location.Heart` |
| `dl:exists_lhs:<r>.<A>` → `<B>` | ∃r.A ⊑ B | `dl:exists_lhs:has_location.Heart` = `HasLocationHeart` |
| Goal `{predicate:"dl:subsumes", value:"<A>:<B>"}` | query: is A ⊑ B entailed? | `dl:subsumes` = `Pericarditis:HeartDisease` |

**Caps (refusal):** `MAX_CONCEPTS = 32` distinct concept names (preconditions error `"concept count {n} exceeds cap 32"`). Also refused: zero dl:* axioms; zero `dl:subsumes` goals; goal value without `:`; malformed `dl:conj` key (no `+`); malformed `dl:exists_rhs` value / `dl:exists_lhs` key (no `.`). No BoundedBreed impl; registry has no complexity_caps entry for this breed.

**BreedOutput:**
- Output fact keys: `dl:verdict:<A>:<B>` = `"true"`/`"false"` (one per query).
- `selected`: first verdict string `"A⊑B=bool"`. `explanation`: "EL completion (CR1–CR4) to fixpoint over {n} concepts; verdicts: ...".

**Trace table:**

| kind | cardinality | detail format | OCPN phase (description_logic-l1-v1) |
|---|---|---|---|
| `normalize` | exactly 1, first | `"{c} concepts, {s} subclass, {j} conj, {r} exists-rhs, {l} exists-lhs axioms"` | t1 normalize |
| `apply-cr1` | per CR1 inference | `"{A} ⊑ {B} (via {A'} ⊑ {B})"` | t2 apply-cr1 |
| `apply-cr2` | per CR2 inference | `"{A} ⊑ {B} (via {A1} ⊓ {A2})"` | t3 apply-cr2 |
| `apply-cr3` | per new role edge | `"({A},{B}) ∈ R({r})"` | t4 apply-cr3 |
| `apply-cr4` | per CR4 inference | `"{A} ⊑ {C} (via ∃{r}.{B'})"` | t5 apply-cr4 |
| `fixpoint` | exactly 1 | `"saturated: {t} subsumptions, {e} role edges"` | t6 fixpoint |
| `classify-verdict` | one per query | `"{A} ⊑ {B} : {bool}"` | t7 classify-verdict |

## Data (canonical fixture)

`tests/fixtures/papers/description_logic.json` — provenance: Baader, Brandt & Lutz, "Pushing the EL Envelope", IJCAI 2005, pp. 364–369; Section 1 medical-ontology example + Section 3 Table 2 completion rules; extraction `adapted` (role inclusion pre-composed: `Pericarditis ⊑ ∃has_location.Heart` asserted directly).

Input facts:
```json
[
  {"key": "dl:subclass:Pericarditis", "value": "Inflammation"},
  {"key": "dl:subclass:Inflammation", "value": "Disease"},
  {"key": "dl:exists_rhs:Pericarditis", "value": "has_location.Heart"},
  {"key": "dl:exists_lhs:has_location.Heart", "value": "HasLocationHeart"},
  {"key": "dl:conj:Disease+HasLocationHeart", "value": "HeartDisease"}
]
```
Goals: `dl:subsumes` = `Pericarditis:HeartDisease` (q1), `HeartDisease:Pericarditis` (q2).

Expected (asserted): `dl:verdict:Pericarditis:HeartDisease = "true"`, `dl:verdict:HeartDisease:Pericarditis = "false"`; required trace kinds `["apply-cr1","apply-cr2","apply-cr3","apply-cr4"]`.

## Oracle diagram

BreedOracle impl: `src/breeds/support/oracle_impls/logic.rs:196`.

- `novel_input`: CR1 transitive chain `uo_Cat ⊑ uo_Mammal ⊑ uo_Animal`, query `uo_Cat:uo_Animal`.
- `boundary_pair`: forward query (entailed) vs reverse `uo_Animal:uo_Cat` (not entailed) over the same TBox.
- `refusal_input`: malformed `dl:conj:uo_Cat` key (no `+`) — refused.

`assert_intermediate`:
- `require_non_empty_with_kinds(["normalize", "apply-cr1"])`
- `require_sequence(["normalize", "fixpoint", "classify-verdict"])`

No `assert_trace_values` override.

Postconditions (breed): `require_non_empty_with_kinds(["fixpoint","classify-verdict"])`; at least one `dl:verdict:` fact.

**Step invariants:**
- Enforced: `normalize` precedes `fixpoint` precedes `classify-verdict` (oracle sequence assertion).
- PROPOSED (unenforced): subsumer sets S(C) grow monotonically across CR applications (each apply-cr* inserts, never removes); no apply-cr* step after `fixpoint`; verdict count == query count; CR3 edge set append-only.

**Adversary:** Primary cheat — answer `true` for every query (subsumption is reflexive-closure-trivially-positive cheat). Killed by the boundary pair: reverse query `uo_Animal:uo_Cat` must yield `false`; precision is also asserted in the breed unit test (`dl:verdict:Flarn:Zorp == "false"`). The fixture's required CR1–CR4 trace kinds kill a lookup-table cheat that emits verdicts without saturation. (No description_logic section found in `docs/breeds/anti-cheat-threat-model.md`.)

## Class & bounds

- Traits: `CognitionBreed` only — no BoundedBreed, no class trait. Cap MAX_CONCEPTS=32 enforced directly in `preconditions`.
- Registry: `status: PARTIAL_ALIVE`, `standing: DISPATCHABLE`, no `complexity_caps`.
- Registry metadata: input_schema `ontological_input_v1`, output_schema `ontological_output_v1`, specification_relation `subsumption_classification_reasoning`.
