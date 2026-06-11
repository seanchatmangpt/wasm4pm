# hearsay — Blackboard Architecture

## 1. Identity & Lineage
HEARSAY-II (Erman et al. 1980, CMU). Blackboard architecture: cooperating knowledge sources post hypotheses to a shared blackboard, arbitrated by agenda priority. BreedId `hearsay`, module `src/breeds/hearsay.rs`.

## 2. Algorithm
Blackboard = BTreeMap of `level → hypotheses`. Knowledge sources (KSes) = rules with `premise` (trigger conditions on blackboard), `conclusion` (hypothesis to post at named level), `certainty` (agenda priority). At each step: (1) find all KSes whose triggers are satisfied by current blackboard, (2) sort by priority, (3) activate highest-priority KS, (4) post its hypothesis, (5) repeat until goal hypothesis present or max 32 cycles.

## 3. Input Contract
`input.facts`: initial blackboard entries as `level:entry` = `value`. `input.rules`: KSes. `input.goals`: target `level:hypothesis` to achieve.

## 4. Output Contract
`selected` = final goal hypothesis value. `confidence` = fraction of goal hypotheses achieved. Facts `hearsay:bb:<level>:<hyp>` for all blackboard entries.

## 5. Trace & OCEL Lifecycle
`load-blackboard`(1,1) → `schedule-ks`(1,*) → `activate-ks`(1,*) → `post-hypothesis`(1,*) → `goal-satisfied`(1,1). Report fitness 1.0.

## 6. Oracles
Paper: Erman et al. (1980) speech phrase "Are you free to discuss?": bottom-up KSes converge to phrase-level hypothesis. Priority ordering asserted in trace.

## 7. Determinism & Bounds
BTreeMap blackboard; priority sort with lex tiebreak; max 32 activation cycles.

## 8. Provenance
Fixture `tests/fixtures/papers/hearsay.json` (Erman et al. 1980 Figure 6 speech understanding example).
