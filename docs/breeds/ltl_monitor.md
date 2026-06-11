# LTL_MONITOR

## Origin
- **Paper:** "Monitoring Programs Using Rewriting" (ASE 2001)
- **Authors:** Klaus Havelund, Grigore Roşu
- **Tradition:** Runtime verification, temporal logic monitoring

## Algorithm
Parses the property with the shared `support::formula` Pratt parser, translates to an LTL-only AST (CTL quantifiers rejected, `R` rewritten via `G`/`U`), then applies Havelund–Roşu progression: each trace event rewrites the formula to its residual obligation, with eager True/False simplification. If progression never resolves, the residual formula is valued at end-of-trace with finite-trace semantics: `G φ` is true (good prefix), `F`/`U`/`X`/atoms are false.

## Pseudocode
```
function run(input):
    phi = ltl(parse(facts["ltl:formula"]))
    emit ltl-init
    for each trace:N event (sorted by N):
        phi = progress(phi, event); emit ltl-progress
        if phi == True:  verdict = true;  break
        if phi == False: verdict = false; break
    if no early verdict: verdict = evaluate_end(phi)   // G→true, F/U/X/atom→false
    emit ltl-verdict; output fact ltl:verdict
```

## Input contract
- fact `ltl:formula` — formula text, ≤256 chars (`! & | -> X F G U R`, atoms)
- facts `trace:N` — comma-separated atoms true at step N; 1..=1000 events required

## Output contract
- `selected` / fact `ltl:verdict` — `"true"`/`"false"`
- trace: `ltl-init`(1,1) → `ltl-progress`(1,*) → `ltl-verdict`(1,1)

## Complexity
O(|trace| × |φ|²) — each progression can at most double conjunction depth before simplification; formula size capped.

## Generalization examples
Safety monitoring (`G (req -> F ack)`), mutual exclusion (`G !(a & b)`), liveness-to-deadline checks over bounded logs.

## Adversarial coverage
- Refusal: missing `ltl:formula`, formula >256 chars, >1000 events (oracle_negative.rs)
- Hidden: `G zorp` violated exactly at step 3 (4 progressions); `quux U blee` satisfied at step 2; fully conforming `G zorp` MUST be satisfied (finite-trace fix for audit defect LTL-2) (oracle_hidden.rs)
- Paper: Havelund & Roşu 2001 progression — conforming/violating traffic-light traces with exact progression counts (paper_grounded.rs)

## See also
- `allen_temporal.md` — the other P1 temporal breed (interval algebra, not traces)
