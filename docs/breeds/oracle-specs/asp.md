# asp — Answer Set Programming, stable-model semantics (Gelfond & Lifschitz 1988)

Source: `crates/wasm4pm-cognition/src/breeds/asp.rs`

## Shape

**BreedInput fields used:** `rules` only (premise atom prefixed `"not "` = NAF literal; empty premise = fact). `candidates` echoed through. `intent/facts/cases/goals/state` unused.

| Pattern | Meaning | Example |
|---|---|---|
| `Rule.premise: ["a", "not b"]` | body: positive atom `a`, NAF literal `not b` | `{id:"r1", premise:["not b"], conclusion:"a", certainty:1.0}` |
| `Rule.conclusion: <atom>` | head atom (NAF head refused) | `"a"` |

**Caps (refusal, not truncation):**
- `MAX_ATOMS = 12` distinct atoms in the universe (2^12 = 4096 candidate sets). Exceeding → `CognitionError::ComplexityCap` via `BoundedBreed::custom_check` (registry: `complexity_caps.max_atoms: 12`).
- Preconditions also refuse: empty `rules`; empty rule conclusion; `"not "`-prefixed head.

**BreedOutput:**
- `selected`: first answer set as sorted comma-joined atoms (e.g. `"p,q"`), `None` if zero stable models.
- Output fact keys: `asp:answer_set:<i>` (value = comma-joined atom set, masks ascending) and `asp:answer_set_count` (count as string).
- `candidates`: input echo. `explanation`: "Gelfond–Lifschitz enumeration over N atoms (2^N candidates): K stable model(s)."

**Trace table:**

| kind | cardinality | detail format | OCPN phase (asp-l1-v1) |
|---|---|---|---|
| `ground` | exactly 1, first | `"{n} atoms, {m} rules"` | t1 ground (program_loaded→grounded) |
| `guess-candidate` | 2^n (one per mask, ascending) | `"M={{...}}"` | t2 guess_candidate |
| `reduct` | one per candidate | `"{k} rules kept, {d} dropped"` | t3 reduct |
| `least-model` | one per candidate | `"LM(P^M)={{...}}"` | t4 least_model |
| `stable-accept` / `stable-reject` | one per candidate | `"{{...}} is a stable model"` / `"LM(P^M) != M (... vs ...)"` | t5 stable-accept / reject |
| `answer-set` | exactly 1, last | `"{k} answer set(s)"` | answer_sets place |

## Data (canonical fixture)

`tests/fixtures/papers/asp.json` — provenance: Gelfond & Lifschitz 1988, ICLP/SLP, pp. 1070–1080; Section 2 Examples 1–2 (program {p(1,2). q(x) ← p(x,y), ¬q(y)}); extraction `verbatim-propositionalized`.

Input rules:
```json
[
  {"id": "f-p12", "premise": [], "conclusion": "p_1_2", "certainty": 1.0},
  {"id": "r-q1", "premise": ["p_1_2", "not q_2"], "conclusion": "q_1", "certainty": 1.0}
]
```
Expected (asserted): `answer_set_count = "1"`, `answer_set_0 = "p_1_2,q_1"`, contains `["p_1_2","q_1"]`, excludes `["q_2"]`. Unique stable model {p(1,2), q(1)} per GL88 Section 2.

## Oracle diagram

BreedOracle impl: `src/breeds/support/oracle_impls/rule_fact.rs` (impl at line 472).

- `novel_input`: `{uo_p. ; uo_q :- not uo_p.}` — unique stable model `{uo_p}`.
- `boundary_pair`: that program (count 1) vs even loop `{uo_p :- not uo_q. ; uo_q :- not uo_p.}` (count 2) — `asp:answer_set_count` differs.
- `refusal_input`: rule head `"not uo_p"` — refused by `preconditions` (note in source: `Asp::run()` itself never returns Err).

`assert_intermediate` TraceQuery assertions:
- `require_at_least("ground", 1)`
- `require_at_least("guess-candidate", 1)`
- `require_at_least("reduct", 1)`
- `require_at_least("stable-accept", 1)`
- `require_last("answer-set")`

`assert_trace_values`:
- `stable-accept` detail must contain `uo_p` and NOT contain `uo_q`.
- `answer-set` detail must contain `"1 answer set"`.

Postconditions (breed): `require_non_empty_with_kinds(["ground"])`; final step kind must be `answer-set`; fact `asp:answer_set_count` must exist.

**Step invariants:**
- Enforced: trace begins `ground`, ends `answer-set` (postcondition).
- PROPOSED (unenforced): each `guess-candidate` is followed by exactly one `reduct`, one `least-model`, then one of `stable-accept`/`stable-reject` before the next `guess-candidate`; candidate masks strictly ascending; `stable-accept` count == `asp:answer_set_count`; for definite programs (no NAF) exactly one accept and it equals the Horn least model.

**Adversary:** Primary cheat — emit the candidate set itself (or always-accept) without computing LM(P^M); e.g. accept every guess. Killed by the boundary pair: the even loop must yield count 2 while the definite-ish program yields 1, and `assert_trace_values` kills any output where `stable-accept` mentions `uo_q` (only {uo_p} is stable) or the count is not exactly 1. Odd-loop behaviour (`a :- not a` → 0 models, `selected = None`) is covered by unit test `odd_loop_zero_stable_models`. (No asp section found in `docs/breeds/anti-cheat-threat-model.md`.)

## Class & bounds

- Traits: `CognitionBreed` + `BoundedBreed` (`breed_name = "asp"`, `domain_bound = DomainBound::default()` i.e. all generic dims uncapped, `custom_check` enforces MAX_ATOMS=12). No Planner/Classifier/Optimizer class trait.
- Registry (`breeds/registry.json`): `status: PARTIAL_ALIVE`, `standing: ORACLED`, `complexity_caps: {"max_atoms": 12}`.
