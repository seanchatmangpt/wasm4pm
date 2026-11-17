<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/breeds/asp.md; source-sha256: 9cd8dc221282f71709a02c3547d12991699f6ef3bd6ef4ff1be0f3f067242b6e; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, GL pipeline trace (ground/guess-candidate/reduct/
least-model/stable-accept|reject/answer-set), NAF-head refusal, asp:answer_set_count fact.

# Answer Set Programming (ASP)

## Origin
- **Paper:** "The Stable Model Semantics for Logic Programming" (Gelfond & Lifschitz, 1988)
- **Authors:** Michael Gelfond, Vladimir Lifschitz
- **Tradition:** Logic Programming, Stable Models Semantics, Negation as Failure (NAF)

## Algorithm
The Answer Set Programming breed computes stable models of a normal logic program
using the Gelfond-Lifschitz reduct
(`crates/wasm4pm-cognition/src/breeds/asp.rs`):
1. Partition atoms: all fact atoms are forced-true (a fact is a zero-body rule, so it
   is in the least model of every reduct); only rule-referenced atoms not already
   forced are enumerated. Candidate ids are never derivable and never enumerated.
2. Emit a `ground` step: `"N atoms, M rules"` over the rule-referenced atom set.
3. For each interpretation mask over the enumerable atoms (≤16):
   - `guess-candidate`: the mask as candidate model M (forced atoms included).
   - `reduct`: discard rules whose NAF premise holds in M; report kept/dropped counts.
   - `least-model`: fixpoint of the positive reduct P^M seeded with the forced facts,
     reported as `LM(P^M)={...}`.
   - If M equals LM(P^M): `stable-accept` (M is a stable model); else `stable-reject`
     with both sets in the detail.
4. Final `answer-set` step: `"<N> answer set(s)"`.

## Pseudocode
```
function solve(input):
    forced = atoms of all facts (key or non-empty value, minus "relation" key)
    enum   = rule-referenced atoms - forced
    for mask in 0..2^|enum|:
        M      = forced ∪ mask
        reduct = rules whose NAF premises fail in M
        LM     = fixpoint(reduct, seed=forced)
        if M == LM: stable_models.push(M)
    return stable_models
```

## Input contract
- `intent`: not used
- `facts`: each fact's key (except `relation`) and any non-empty value are
  forced-true atoms of every stable model.
- `rules`: `conclusion` + premise list; NAF uses the `"not "` prefix in premises.
  A rule head starting with `not ` is refused (NAF heads are not normal rules).
- `goals`: not used
- `candidates`: ids are never derivable; any candidate in the first stable model
  gets score 1.0, the first such is `selected`.

## Output contract
- `selected`: first candidate id contained in the first stable model, if any.
- `explanation`: `"ASP: found <N> stable model(s). Selected candidate: <id?>"`.
- `facts`: `stable_models_count`, the mirror fact `asp:answer_set_count` (both = N),
  and `model_0_<i>` atoms of the first stable model.
- `inference_trace`: `ground` → per-mask `guess-candidate`/`reduct`/`least-model`/
  `stable-accept`|`stable-reject` → final `answer-set`.

## Refusal contract
- No rules and no facts: refused (`ASP requires at least one rule or fact`).
- Rule head starting with `not `: refused (`ASP rule head cannot contain
  negation-as-failure: <rule id>`).
- More than 16 enumerable atoms: refused (`Too many atoms for exact ASP solver`).

## Complexity
- Time: O(2^A · R) over rule-referenced non-fact atoms A (max 16) and rules R;
  each mask runs a least-model fixpoint over the rules. Forcing fact atoms out of
  the enumeration keeps unrelated admitted context facts from tripping the cap
  without changing any stable model.
- Space: O(A + R) for interpretations and the atom partition.

## Generalization examples
- **Process Configuration Rules**: check process variants against
  negation-as-failure configuration constraints.
- **Workflow Resource Constraints**: enforce mutually exclusive role assignments
  via stable model rules.

## Adversarial coverage
- Precondition refuses the empty program, NAF rule heads, and >16 atoms.
- Postcondition pins trace shape: non-empty trace, first step `ground`, last step
  `answer-set`, and the `asp:answer_set_count` fact must be present.
- Fact-as-premise regression: fact p + rule p→q yields exactly the stable model
  {p, q} (a fact atom referenced by a rule premise is never flippable).
