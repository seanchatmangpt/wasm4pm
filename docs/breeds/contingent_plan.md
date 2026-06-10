# Contingent Planning — AND-OR Search over Belief States

## 1. Identity
- **Breed id:** `contingent_plan` · **Module:** `src/breeds/contingent_plan.rs`
- **Historical ancestor:** Russell & Norvig, AIMA 3rd ed. §4.3.2 (AND-OR search,
  vacuum world conditional plans)

## 2. Algorithm
Belief = set of possible worlds (≤ 4 unknown atoms → ≤ 16 worlds). OR nodes choose
a physical action (preconditions must hold in EVERY world) or a sensing action;
sensing splits the belief into atom-true/atom-false halves, BOTH of which must
reach the goal (AND node). Depth ≤ 12 with belief-cycle detection. If the belief
is uncertain and no informative sensing exists, the breed REFUSES — it never emits
a linear plan valid in only some worlds.

## 3. Contract (input facts)
`cp:unknown` (comma list ≤ 4), `cp:init:<atom>`, `cp:goal:<atom>`,
`cp:act:<name>:pre/add/del` (lits `a`/`!a`), `cp:sense:<name>` = `<atom>`.

## 4. Output facts
`plan:tree` — replayable s-expression:
`(act <name> <sub>)` | `(sense <name> <atom> <then> <else>)` | `(done)`.

## 5. Trace kinds / OCEL lifecycle
`init-belief`(1) → {`or-expand`,`sense-branch`,`and-join`,`goal-reached`}(1..*) →
`plan-complete`(1). Model: `ocel/models/l1/contingent_plan.ocpn.json`; fitness 1.0.

## 6. Oracles
- Hidden: vacuum plan contains EXACTLY ONE Sense node; the test parses and REPLAYS
  the serialized tree against each initial world (dirt ∈ {true,false}), asserting
  goal satisfaction in all of them; with no sensing action the breed must refuse.
- Paper: AIMA vacuum → `(sense check-dirt dirt (act suck (done)) (done))`.

## 7. Determinism & latency
Deterministic (BTreeMap/BTreeSet, sorted action order); no RNG. Median 2.91 µs.

## 8. Status
PARTIAL_ALIVE; full BVC ceremony complete.
