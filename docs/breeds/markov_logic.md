# Markov Logic — Propositional MLN MAP via MaxWalkSAT

## 1. Identity
- **Breed id:** `markov_logic` · **Module:** `src/breeds/markov_logic.rs`
- **Historical ancestor:** Richardson & Domingos 2006, *Markov logic networks*
  (Machine Learning 62); MaxWalkSAT: Kautz, Selman & Jiang 1997

## 2. Algorithm
MAP state minimizes `cost = Σ weight(unsatisfied ground clauses)`. MaxWalkSAT:
pick a random unsatisfied clause; with p=0.5 random-walk flip, else greedy flip
minimizing resulting cost (lex-least tie-break). Evidence atoms are clamped and
never flipped. Determinism-over-paper-fidelity: deterministic init
(evidence-clamped, others false) and the single seeded RNG
`support::rng::seeded_rng()` (`SmallRng::seed_from_u64(42)`) — nothing else.

## 3. Contract (input facts)
- `mln:clause:<id>` = `<weight>|<lit>,<lit>` (lit = `atom` or `!atom`; weight finite ≥ 0)
- `evidence:<atom>` = `true`/`false`
- Caps: ≤ 256 atoms, ≤ 512 clauses, ≤ 5000 flips

## 4. Output facts
`mln:cost` (`{:.6}` fixed precision for bit-stable receipts), `mln:flips`,
`mln:atom:<a>` per atom.

## 5. Trace kinds / OCEL lifecycle
`ground-clauses`(1) → `clamp-evidence`(1) → `init-assignment`(1) →
{`flip`,`restart`}(0..*; sampled every flip ≤ 64, then every 64th) → `map-found`(1).
Model: `ocel/models/l1/markov_logic.ocpn.json`; fitness 1.0.

## 6. Oracles
- Refusal: empty clause set; negative/non-finite weight.
- Hidden: test exhaustively enumerates 2^k assignments (k=3, fresh atoms) — the
  breed's `mln:cost` must equal the exhaustive optimum; double run bit-identical.
- Paper: smokes/friends grounding for {anna, bob} with evidence smokes(anna),
  friends(anna,bob) → cost 0.000000, smokes(bob)=cancer(anna)=cancer(bob)=true.

## 7. Determinism & latency
Seeded SmallRng(42) only; bit-exact double run. Median 5.51 µs.

## 8. Status
PARTIAL_ALIVE; full BVC ceremony complete.
