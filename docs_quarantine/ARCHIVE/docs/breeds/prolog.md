# Prolog

## Origin
- **Paper:** "A Machine-Oriented Logic Based on the Resolution Principle" (Robinson 1965); "Algorithm = Logic + Control" (Kowalski 1974)
- **Authors:** J.A. Robinson (unification); Robert Kowalski (SLD resolution and logic programming)
- **Tradition:** Logic programming, Horn-clause resolution, automated theorem proving

## Algorithm
The Prolog breed delegates to the `prolog8` crate, which implements byte-capped SLD resolution. It interns all `BreedInput` facts into a `Catalog` as unary predicates keyed by `fact.key`, then loads fact rows into a `Kernel`. A query atom is constructed from the first goal (or first fact when no goals are supplied), and `Kernel::query()` runs backward-chaining resolution. The kernel enforces ARD byte caps: arity ≤ 8, body atoms ≤ 8, variables ≤ 8, 256 binding patterns. The result is either `Answered` (positive proof with receipt), `Denied` (negative proof with receipt), or `Invalid` (admission rejected, returns `BreedError`).

## Pseudocode
```
function run(input):
    catalog = Catalog::new(CatalogId(1))

    // 1. Register predicates for all fact keys
    pred_map = { key → PredicateId }
    for each fact in input.facts:
        if key not in pred_map: catalog.add_predicate(label=key, arity=1)

    // 2. Intern fact values as term ids, build FactBlock8 per predicate
    for each fact in input.facts:
        record TraceStep("intern-fact", "key=value")
        rows[pred_id].push(FactRow8(term=catalog.intern_term(fact.value)))

    // 3. Load fact blocks into Kernel
    kernel = Kernel::new(catalog)
    for each (pid, block): kernel.load_facts(block)

    // 4. Build query atom from first goal or first fact
    (pred, args, binding_mask) = goal_or_fact_query(input)
    atom = Atom8(pred, args, binding_mask=GROUND)
    admit_atom(atom)  // byte-cap enforcement; error → BreedError
    q = QueryAtom8(atom, proof_mode=Both, epoch=0)
    record TraceStep("kernel-query", "pred_id=N binding_mask=0bX")

    // 5. Execute kernel
    result = kernel.query(q)
    match result:
        Answered(answers):
            record TraceStep("decision", "Allow with N proof nodes")
            selected = first bound term label
            explanation = "Prolog8 admitted query (proof nodes: N, receipt: [...])"
        Denied(d):
            record TraceStep("decision", "Deny with N negative proof nodes")
            selected = None
            explanation = "Prolog8 denied query (...)"
        Invalid(code):
            raise BreedError("admission rejected: code")
    return BreedOutput(selected, explanation, inference_trace)
```

## Input contract
- `intent`: predicate label for the primary query predicate; defaults to `"intent"` when empty
- `facts`: each `Fact { key, value }` becomes a unary predicate `key(value)` loaded as a ground fact; the kernel interns `value` as a term
- `rules`: present in the `BreedInput` struct but the current implementation encodes rules as facts; complex Horn clauses are not yet mapped to `prolog8` rule blocks
- `goals`: the first `Goal { predicate, value }` drives the query atom (`predicate(value)` with ground binding mask); remaining goals are not yet queried
- `cases`: not used by this breed
- `state`: not used by this breed
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: the term label of the first answer binding when the query is answered; the matched fact value when the query is a ground ground-check; `None` when the query is denied
- `explanation`: `"Prolog8 admitted query (proof nodes: N, receipt: [hex])"` on allow; `"Prolog8 denied query (negative proof nodes: N, receipt: [hex])"` on deny
- `inference_trace`: one `"intern-fact"` step per fact loaded, one `"kernel-query"` step, one `"decision"` step (`Allow` or `Deny`); `Invalid` results in a `BreedError` before any output is produced; postcondition requires non-empty trace

## Complexity
- Time: O(F + Q) where F = number of facts interned and Q = proof search depth in the Prolog8 kernel; the Prolog8 ARD caps bound worst-case search
- Space: O(F) for the catalog term table plus O(B) for binding patterns where B ≤ 256 (ARD cap)
- Determinism: yes — `Kernel::query` is deterministic for a given catalog and query atom; byte caps prevent unbounded search

## Generalization examples
- **Fact admission check**: facts encode known safe identifiers; goal queries whether a given identifier is admitted (`parent(alice)` → `Answered`); the receipt provides a cryptographic proof of the decision
- **Policy enforcement**: facts encode granted permissions; goal encodes a requested capability; `Answered` means the capability is authorised; the proof nodes in the receipt form an auditable chain

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/src/breeds/prolog.rs` (inline tests)
- Bypass attempts caught: `run_with_supporting_fact_returns_allow` — a matching fact produces `selected=Some("alice")`; `run_with_unmatched_goal_returns_deny` — a mismatched goal produces `selected=None` with `"denied"` in explanation; `precondition_rejects_completely_empty_input` — empty intent, facts, goals, and rules returns `Err`
- Property tests: `postconditions` rejects an empty inference trace; `admit_atom` byte-cap enforcement rejects queries that exceed ARD limits before the kernel runs

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/prolog.rs` for source
- `crates/prolog8/src/` for the Prolog8 kernel
