<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/breeds/tableaux.md; source-sha256: 5f440043dad74f74327e06a1f8ec2828116cb9fd04609fb5d09e43bddf31a003; reason: tooling or agent control surface -->

# Tableaux — Smullyan Signed Analytic Tableaux

## 1. Identity
- **Breed id:** `tableaux` · **Module:** `crates/wasm4pm-cognition/src/breeds/tableaux.rs`
- **Historical ancestor:** Smullyan 1968, *First-Order Logic*, Part I Ch. II (analytic tableaux)

## 2. Algorithm
Signed tableau over the propositional fragment: root `F φ`, alpha-first expansion
(alpha rules always applied before beta branching), branch closure on `T a`/`F a`
clash, countermodel extracted from an open saturated branch. φ is valid iff every
branch closes.

## 3. Contract (input facts)
- `tableaux:formula` — propositional formula (`!`, `&`, `|`, `->`, `true`, `false`, atoms)
- Caps: ≤ 256 chars, ≤ 64 AST nodes, ≤ 256 expansions (refusals)

## 4. Output facts
- `tableaux:verdict` = `valid` | `invalid`
- `tableaux:countermodel:<atom>` = `true`/`false` (invalid case; all atoms listed)

## 5. Trace kinds / OCEL lifecycle
`parse-formula`(1) → `sign-root`(1) → {`alpha-expand`,`beta-expand`,`close-branch`,`open-branch`}(1..*) → `verdict`(1).
Model: `ocel/models/l1/tableaux.ocpn.json`; fitness 1.0 (`ocel/reports/tableaux.json`).

## 6. Oracles
- Refusal: missing/malformed/temporal formula refused.
- Hidden: fresh K instance `zorp -> (wibble -> zorp)` valid with ZERO `beta-expand`
  steps (structural fingerprint); `zorp -> wibble` invalid with countermodel
  verified by an independent evaluator inside the test.
- Paper: K-axiom `a -> (b -> a)` valid, 0 beta expansions (Smullyan 1968).

## 7. Determinism & latency
Pure deterministic DFS, no RNG. Median 5.87 µs (≤ 100 µs budget).

## 8. Status
ADMITTED in `breeds/registry.json`; dispatch arm + WASM export `cognition_run`.
