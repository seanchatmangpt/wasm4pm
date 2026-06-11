# POMDP — Exact Bayes Filter + Bounded PBVI

## 1. Identity
- **Breed id:** `pomdp` · **Module:** `src/breeds/pomdp.rs`
- **Historical ancestor:** Kaelbling, Littman & Cassandra 1998 (AIJ 101);
  PBVI: Pineau, Gordon & Thrun 2003. Reuses `support::mdp` (validation + QMDP bound).

## 2. Algorithm
Exact belief update `b'(s') ∝ O(o|a,s')·Σ_s T(s'|s,a)·b(s)` over the supplied
action/observation history; belief-point expansion (≤ 16 points: b0, history
beliefs, one-step successors); point-based backups for `horizon` iterations;
action selected by the best alpha vector at the current belief (lex-least ties).

## 3. Contract (input facts)
`pomdp:states/actions/observations` (comma lists), `pomdp:gamma` ([0,1)),
`pomdp:horizon` (1..=8), `pomdp:t:<a>:<s>:<s'>`, `pomdp:o:<a>:<s'>:<o>`,
`pomdp:r:<a>:<s>`, `pomdp:b0:<s>`, `pomdp:step:<i>` = `<action>|<obs>`.
Refusals: |S|·|A|·|O| > 512; non-stochastic T/O/b0 rows; zero-probability observation.

## 4. Output facts
`pomdp:action`, `pomdp:value` (`{:.6}`), `pomdp:belief:<s>` (`{:.6}`).

## 5. Trace kinds / OCEL lifecycle
`parse-model`(1) → `init-belief`(1) → `belief-update`(0..*) →
`expand-belief-points`(1) → `pbvi-backup`(1..*) → `select-action`(1).
Model: `ocel/models/l1/pomdp.ocpn.json`; fitness 1.0.

## 6. Oracles
- Hidden (tiger): posterior after one hear-left = 0.850000 exactly; after two =
  289/298 = 0.969799 to 1e-6. **Plan-table erratum:** the P4 table lists 0.969697;
  hand-derived Bayes arithmetic gives 0.85²/(0.85²+0.15²) = 0.7225/0.745 =
  0.9697986…, asserted here as 0.969799. Tampered O matrix (0.85→0.6) must shift
  the posterior to 0.800000.
- Paper: tiger posterior 0.85 (Kaelbling/Littman/Cassandra 1998 §3).

## 7. Determinism & latency
No RNG; deterministic floating-point order. Median 61.4 µs on the tiger fixture.
**Latency-budget resolution:** PRD allots POMDP 50–300 µs; the global ≤ 100 µs gate
is KEPT — the structural caps (belief points ≤ 16, horizon ≤ 8, refuse
|S|·|A|·|O| > 512) are the paper-sanctioned PBVI approximation knob.

## 8. Status
ADMITTED; full BVC ceremony complete.
