# ltl_monitor — LTL Runtime Monitor (Havelund & Rosu 2001)

Source of truth: `crates/wasm4pm-cognition/src/breeds/ltl_monitor.rs`, fixture `tests/fixtures/papers/ltl_monitor.json`, oracle `src/breeds/support/oracle_impls/logic.rs`, OCPN `ocel/models/l1/ltl_monitor.ocpn.json`.

## Shape

### BreedInput
Uses `facts` only (`candidates`, `cases`, `rules`, `goals`, `state` unused).

| Key pattern | Meaning | Example |
|---|---|---|
| `ltl:formula` | LTL formula text, parsed by shared `support::formula` Pratt parser, then translated to an LTL-only AST (CTL path quantifiers `A`/`E` rejected at translation; `Implies` desugared to `!a | b`; `Release(a,b)` weakened to `G b | (b U (a & b))`) | `G (red -> !green)` |
| `trace:N` | Comma-separated atoms true at step N (sorted by N before progression) | `trace:1` = `red,green` |

Caps (refusal semantics):
- formula length > 256 chars → `CognitionError::ComplexityCap` via `BoundedBreed::custom_check` (`"formula exceeds 256 chars (len=...)"`)
- `trace:` fact count > 1000 → `ComplexityCap` (`"trace exceeds 1000 events (len=...)"`)
- `DomainBound::default()` (all generic field caps uncapped)
- Preconditions refuse: missing `ltl:formula` fact; formula parse error; CTL path quantifiers (`"CTL path quantifiers are not valid in LTL"`); zero `trace:N` facts (`"missing trace:N facts (at least one trace event required)"`)

### BreedOutput
- `selected`: VerifierBreed verdict — exact vocabulary `["true", "false"]` (string of the boolean verdict).
- Output facts: input facts + `ltl:verdict` = `"true"`/`"false"`.
- `candidates`: passed through unchanged (`input.candidates.clone()`).
- `explanation`: `"LTL formula '<f>' evaluated to <v> by Havelund-Rosu progression over <n> events"`.
- Finite-trace semantics at end-of-trace: `G φ` → true (good prefix); `F`/`U`/`X`/bare atoms → false; connectives recursive. Early exit when residual progresses to True/False (verdict at that step; remaining events not consumed).

### Trace

| kind | cardinality | detail format | OCPN phase (place reached) |
|---|---|---|---|
| `ltl-init` | exactly 1 (first) | formula string verbatim | `formula_ready` → `monitor_armed` |
| `ltl-progress` | ≥1 | `trace:<idx> -> <residual Ltl Debug>` | `progressing` (self-loop t2) |
| `ltl-verdict` | exactly 1 (last) | `"true"`/`"false"` | `verdict_emitted` |

Step objects: `("formula","ltl")`, `("event","trace-<idx>")`, `("decision","verdict")`.

## Data (canonical fixture)

Provenance: Havelund, K., & Rosu, G. (2001). Monitoring Programs Using Rewriting. ASE 2001, 135-143. Section 4 (progression) and Section 2 (finite-trace LTL semantics); traffic-controller safety class.

Input facts:
```json
{"key":"ltl:formula","value":"G (red -> !green)"},
{"key":"trace:0","value":"red"},
{"key":"trace:1","value":"green"},
{"key":"trace:2","value":"red"},
{"key":"trace:3","value":"green"}
```
Violating input: same formula, trace `red` / `red,green` / `green`.

Expected (asserted):
- `verdict: true`, `progress_steps: 4`
- `violating_verdict: false`, `violating_progress_steps: 2` (violation at step k yields verdict false with exactly k+1 progression steps)

## Oracle diagram

### Oracle assertions (BreedOracle for LtlMonitor, logic.rs)
- `novel_input`: `G uo_ok` over 3-event trace (`uo_ok` / `uo_ok,uo_aux` / `uo_ok`) — satisfied.
- `boundary_pair`: satisfied novel input vs `G uo_ok` violated at step 1 (`uo_ok` then `uo_aux`).
- `refusal_input`: formula present but zero `trace:N` facts.
- `assert_intermediate`: `require_non_empty()`; `require_count("ltl-init", 1)`; `require_at_least("ltl-progress", 1)`; `require_last("ltl-verdict")`.
- `assert_trace_values`: none (default).

Postconditions (in-breed): `assert_verdict_valid` (VerifierBreed); `require_non_empty`; `require_count("ltl-init",1)`; `require_at_least("ltl-progress",1)`; `require_count("ltl-verdict",1)`; output must contain an `ltl:verdict` fact.

### Step invariants
- ltl-progress step count == number of trace events consumed; on violation at event k (0-based), exactly k+1 progress steps (enforced by fixture `violating_progress_steps`).
- Each `ltl-progress` detail carries the rewritten residual formula; once residual is `False`, no further progress steps follow (early exit) — PROPOSED as an explicit consecutive-step check (currently implicit in step counts).
- `ltl-verdict` detail must equal the `selected` value — PROPOSED (currently both derive from `final_verdict`, not cross-checked).

### Adversary (anti-cheat-threat-model.md, P1 table)
Cheat: pattern-match on formula STRINGS (`"G p"`, `"p U q"`) instead of parsing and progressing.
Killed by: hidden oracle with a nested formula never in fixtures (`G (zorp -> X blee)`); progression step COUNT == trace length assertion (string matchers emit no per-step rewrites); grep gate that no test formula string literal appears in `src/breeds/ltl_monitor.rs`.

## Class & bounds
- Breed class: **Verifier** (`VerifierBreed`, `valid_verdicts = ["true","false"]`).
- `BoundedBreed` adopted: `DomainBound::default()` + custom caps max_formula_chars=256, max_trace_events=1000.
- Registry: status `PARTIAL_ALIVE`, standing `ORACLED`, `complexity_caps: {max_formula_chars: 256, max_trace_events: 1000}`, oracle_suite `oracle_ltl_monitor_v1`, ocel `ocel_ltl_monitor_v1`.
