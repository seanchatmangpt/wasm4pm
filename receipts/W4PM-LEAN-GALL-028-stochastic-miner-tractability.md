---
receipt: W4PM-LEAN-GALL-028
date: 2026-07-29
status: PARTIAL_ALIVE
gate: stochastic miner tractability -- elitism/monotonicity vs optimization-quality split (proof-dependency program, checkpoint 028)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-018 (receipts/W4PM-LEAN-GALL-018-heuristic-stochastic-miner-correspondence.md) -- chosen over W4PM-LEAN-GALL-020 because 018 is the checkpoint that established the exact factual baseline this one refines (the no_lean_coverage ledger for genetic/ACO/PSO and the ACO degenerate-result fix this checkpoint's ACO finding builds directly on); no W4PM-LEAN-GALL-020 receipt or ledger entry was found in receipts/ to compare against, so 018 is the more directly relevant and traceable predecessor.
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 028 — Stochastic Miner Tractability: Elitism-Monotonicity vs Optimization-Quality

## Question this checkpoint answers

W4PM-LEAN-GALL-018 established that genetic mining, ACO, and PSO
(`wasm4pm/src/genetic_discovery.rs`) are `no_lean_coverage` and "stochastic by
construction," with only a probabilistic convergence claim ever provable in principle. This
checkpoint asks a narrower, sharper question: separate from that (intractable) actual
optimization-quality claim, is there any genuinely deterministic, RNG-independent, formally
provable structural property connecting these algorithms to a Lean-style theorem --
specifically the elitism/monotonic-improvement pattern ("best fitness never decreases across
iterations")?

## mfact revision check

`git -C /Users/sac/mfact rev-parse HEAD` was run directly: `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564`
-- unchanged from the value cited in W4PM-LEAN-GALL-018 and this checkpoint's brief. No
discrepancy. (`mfw` was also checked for context: `f7477ae05383ec046719b60863f8ef33a0363782`,
not otherwise load-bearing for this checkpoint's claims.)

## Finding 1: GA's elitism-copy pattern is a genuine, RNG-independent, tractable invariant

`discover_genetic_algorithm_from_log` (`wasm4pm/src/genetic_discovery.rs`) sorts the
population descending by fitness each generation, then copies the top `elite_size =
(population_size/4).max(1)` tuples -- both `EdgeSet` and their already-computed `f64`
fitness -- verbatim into the next generation's population, before any crossover/mutation is
applied to the remaining slots:

```rust
population.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));
let elite_size = (population_size / 4).max(1);
let mut next = population[..elite_size].to_vec();
while next.len() < population_size {
    // ... crossover + mutation only for children beyond elite_size
}
```

The elite slice is never touched by `crossover_edges_seeded`/`mutate_edges_seeded`
afterward. Consequence: `population[0].1` (max fitness) at generation `g+1` is provably `>=`
`population[0].1` at generation `g`, because generation `g`'s best individual -- whatever the
RNG produced it -- is a literal, unmutated element of generation `g+1`'s population. This
argument never inspects what the RNG drew; it depends only on the syntactic fact that
`next[..elite_size]` is a copy of `population[..elite_size]` pre-sort. It holds for **every**
possible RNG trace.

**Theorem sketch (informal Lean-style):**
```
theorem ga_best_fitness_monotone
    (pop : Nat) (hpop : pop >= 2) (g g' : Nat) (hg : g <= g') :
    bestFitness log key pop g <= bestFitness log key pop g' := by
  induction on (g' - g), each extra generation preserving the invariant
  via the elite-copy lemma (population[0] survives unmutated into next generation).
```

**Hole check performed and ruled out:**
- Fitness recompute divergence: elite fitness values are carried as already-computed
  `f64`s, never recomputed post-copy -- no floating-point non-monotonicity risk from
  re-evaluation.
- Mutation of the elite itself: confirmed absent by reading the loop body -- `next[..elite_size]`
  bypasses `mutate_edges_seeded` entirely.
- `elite_size == 0` edge case: `(population_size/4).max(1)` guarantees `elite_size >= 1`
  whenever the existing `population_size < 2 => None` guard has already passed, so at least
  the single best individual always survives.

No hole found for this property as currently coded. Status: **tractable future target**.
Empirically tested today by `wasm4pm/tests/algorithm_correctness.rs:110`
`ga_convergence_more_generations_never_worse` (`f100 >= f1 - 1e-9` at population_size 20, 1
vs 100 generations) -- matches the theorem sketch up to float tolerance.

## Finding 2: PSO's global-best update is the cleanest of the three, and also tractable

`discover_pso_algorithm_from_log` tracks `best_global: Option<(EdgeSet, f64)>`, updated only
via strict-greater-than assignment, both at particle-spawn time and inside the per-iteration
per-particle loop:

```rust
if new_fitness > best_global.as_ref().unwrap().1 {
    best_global = Some((edge_set.clone(), new_fitness));
}
```

This is the simplest possible RNG-independent monotone-max pattern: `best_global.1` is
reassigned only when the candidate is strictly greater than the current value. By definition
of `if x > best { best = x }`, the sequence of `best_global.1` values across the run's
timeline is non-decreasing for any sequence of RNG draws -- the RNG determines which edge
sets are tried and what their fitness is, never whether a worse value can overwrite
`best_global`. Unlike GA, no auxiliary lemma about population-slice copying is needed.

**Theorem sketch:**
```
theorem pso_global_best_monotone
    (swarm : Nat) (hswarm : swarm >= 1) (i i' : Nat) (hi : i <= i') :
    bestGlobalFitness log key swarm i <= bestGlobalFitness log key swarm i' := by
  induction on (i' - i), each extra iteration preserving best_global
  via the strict-improvement-only-assignment lemma.
```

**Hole check performed:**
- No intervening mutation of `best_global` between comparison and assignment
  (single-threaded, sequential) -- confirmed by direct read.
- NaN/Inf fitness: unlike ACO, `discover_pso_algorithm_from_log` has no explicit
  `is_finite()` sanitization on `new_fitness` before the `>` comparison. If
  `evaluate_edges_fitness` ever returned NaN, IEEE 754 makes `NaN > x` false, so a NaN
  candidate can simply never win the comparison -- this does not break monotonicity of
  `best_global.1` itself (a NaN is never stored), though a NaN-valued particle would
  silently never contribute. Noted as an orthogonal, currently-unobserved concern, not rated
  as breaking this specific monotonicity claim.
- No post-loop fallback-substitution step of the kind ACO has (see Finding 3) -- the
  function returns `best_global?` directly, unmodified, after the iteration loop. This is
  precisely why PSO does not share ACO's hole.

Status: **tractable future target**, no hole found. Empirically tested today by
`wasm4pm/tests/algorithm_correctness.rs:183` `pso_convergence_more_iterations_never_worse`
(`f50 >= f5 - 1e-9` at swarm_size 20, 5 vs 50 iterations).

## Finding 3: ACO's internal best-tracking is the same clean pattern, but the RETURNED value is not monotone -- a real, code-cited hole

`discover_aco_algorithm_from_log`'s internal `best_solution: Option<(EdgeSet, f64)>` is
updated by the identical strict-greater-than pattern as PSO's `best_global`:

```rust
if best_solution.is_none() || fitness > best_solution.as_ref().unwrap().1 {
    best_solution = Some((ant_edges.clone(), fitness));
}
```

Taken alone, this sub-claim (`best_solution.1` is RNG-independently non-decreasing across
ants/iterations) is exactly as tractable as PSO's. **But** the function does not return
`best_solution` directly. Its final `.map(...)` closure -- the W4PM-LEAN-GALL-018
degenerate-result fix -- conditionally substitutes a completely different, independently
computed value whenever `best_solution`'s edge set is empty:

```rust
best_solution.map(|(edges, fitness)| {
    let (final_edges, final_fitness) = if edges.is_empty() {
        let fallback_fitness = evaluate_edges_fitness(
            &edge_vocab.iter().copied().collect(), &col, vocab_len,
        );
        (edge_vocab.iter().copied().collect::<EdgeSet>(), /* NaN-guarded */ fallback_fitness)
    } else {
        (edges, fitness)
    };
    (edge_set_to_dfg(&final_edges, ...), final_fitness)
})
```

`fallback_fitness` is computed once over the full observed edge vocabulary -- an edge set no
ant ever explored -- and is **not** compared against, and has no established ordering
relative to, `best_solution.1` from any other run at any other iteration count. Consequence:
a run at low iteration count that lands in the empty-edge-set branch returns
`fallback_fitness`; a run at higher iteration count might avoid that branch (returning a
nonempty `best_solution.1`) or might not, with no code-level guarantee about which is more
likely as iterations grow, and no `max(fallback_fitness, best_solution.1)` guard reconciling
the two. The general theorem ("returned fitness is non-decreasing in iteration count") does
**not** hold as stated for ACO's shipped output.

This is a specific, code-identified hole -- not a restatement of "ACO is stochastic." It is
also confirmed structurally, not just by inspection: `algorithm_correctness.rs` contains
`ga_convergence_more_generations_never_worse` (line 110) and
`pso_convergence_more_iterations_never_worse` (line 183), but **no ACO analog exists** --
confirmed by direct read of the full test file. The only ACO-specific tests are
`aco_never_returns_empty_dfg_on_nontrivial_input` (line 628, tests the fallback's presence,
not monotonicity) and `aco_deterministic_same_seed` (line 642). This absence is consistent
with the hole: such a test would not reliably pass across parameter sweeps straddling the
empty/nonempty boundary.

**Status: ruled out for the shipped output.** The narrower, unobservable internal claim
about `best_solution.1` alone (ignoring the fallback branch) is not itself ruled out -- it
would follow the same argument as PSO -- but it is never directly returned, so it cannot be
the subject of an end-to-end correctness theorem about this function's actual behavior.

## Optimization-quality claim: UNSUPPORTED, with three specifically named missing prerequisites

The claim that GA/ACO/PSO's returned solution is "good" or "near-optimal" relative to a
well-defined optimum (distinct from the elitism-monotonicity claims above, which are about
the algorithm's own best-tracked value trajectory, not that value's distance to a true
optimum) remains formally intractable in this codebase's current scope, for three concrete,
code-cited reasons:

1. **Unbounded/combinatorial solution space.** The search space is the powerset of
   `edge_vocab` (2^|edge_vocab| candidate DFGs) -- `edge_vocab.len()` is exactly the number
   of distinct directly-follows pairs observed in the log, with no bound or cap established
   anywhere in `genetic_discovery.rs`.
2. **No convexity/submodularity structure established.** `evaluate_edges_fitness`
   (`utilities.rs`, called identically by all three algorithms) is a black-box trace-coverage
   function; no comment, doc, or proof-adjacent structure in the code claims or establishes
   monotone-submodularity, convexity, or matroid structure over the edge-subset lattice --
   the kind of structure that would license a provable approximation-ratio guarantee (e.g. a
   `(1 - 1/e)` submodular-maximization bound). Region-theory/matroid arguments that would be
   relevant specifically to DFG discovery do not appear in `mfact` or `mfw` either (see the
   `ilp-petri-net` ledger entry in `heuristic-stochastic-miners.json`, the one algorithm
   where such theory is at least in-principle relevant and still entirely absent).
3. **RNG independence properties unanalyzed.** All three algorithms construct
   `StdRng::seed_from_u64(42)` locally (an architectural inconsistency already flagged, not
   fixed, in W4PM-LEAN-GALL-018 and not fixed here) rather than the project's documented
   `support::rng::seeded_rng()` convention. Independent of that inconsistency, no analysis in
   this codebase, `mfact`, or `mfw` establishes the statistical-independence or
   distributional properties (genuine uniformity and independence of successive
   `gen::<f64>()` draws across the many sequential calls each ant/particle/individual
   consumes) that any convergence-in-probability theorem -- the weakest optimization-quality
   claim that could survive the stochasticity at all -- would need as a hypothesis.

Consequence: even a convergence-in-probability claim is not merely unproven but **not yet
well-defined** in this codebase. It would require, first, (a) a bound or asymptotic
characterization of `|edge_vocab|` growth, (b) an established structural property of
`evaluate_edges_fitness` over the edge-subset lattice, and (c) a formalized independence
model for the RNG draws -- none of which exist. This is a stronger, more specific claim than
W4PM-LEAN-GALL-018's general "these are stochastic algorithms" observation: it names the
exact three missing prerequisites rather than gesturing at stochasticity generically.

## mfact/mfw search for reusable Lean material

Ran `mcp__plugin_lumen_lumen__semantic_search` (not grep/find, per project convention)
against both `/Users/sac/mfact` and `/Users/sac/mfw` for "monotone non-decreasing sequence
lemma elitism hill climbing invariant best-so-far."

**mfact top hits:** process-mining-adjacent formal material (sample-path Little's Law,
attention-conservation interval combinatorics, Gibbs' inequality -- all in
`docs/jira/v26.7.16/v26716-008-gap-theory-module.md`) and Lean-audit/tactic-search meta-
documentation (`AUDIT_FOLLOWUP.md`, `AGENTS.md`'s Crown-conjecture standing notes). None
touch population-based search or greedy-best-tracking invariants.

**mfw top hits:** an escort-distribution Rust unit test
(`higher_q_concentrates_mass_on_the_largest_input`,
`tools/mfw-cli/src/verbs/cmca.rs:152`) asserting `escort_high[2] > escort_low[2]` as `q`
increases, plus assorted LSP/thesis prose documents. The escort-distribution test is a
monotonicity-flavored assertion, but it is a **Rust test, not a Lean theorem**, and concerns
a different mathematical object (Renyi/escort-distribution mass concentration under a
temperature parameter `q`) with no genuine carrier map to elitism-based population search.

**Conclusion, applying this program's `LEAN_NAME_MATCH_WITHOUT_CARRIER_MAP` refusal rule:**
this superficial thematic proximity ("monotonicity," "concentration") is explicitly **not**
treated as coverage. No match is claimed. Both GA and PSO's theorem sketches above would
require genuinely new Lean work from scratch if this program ever pursues them; nothing in
`mfact` or `mfw` today reduces that work.

## Evidence class achieved

GA: `tractable_future_target` (elitism-copy pattern, RNG-independent, no code-level hole
found, already empirically tested). PSO: `tractable_future_target` (direct strict-greater-
than best-tracking, RNG-independent, cleanest of the three, no code-level hole found, already
empirically tested). ACO: `ruled_out_for_shipped_output` (the empty-edge-set
fallback-substitution breaks monotonicity of the function's returned fitness across
iteration counts; the internal, never-returned `best_solution.1` sub-claim would itself
satisfy the same argument as PSO, but is not the subject of an end-to-end theorem about this
function's actual behavior). Optimization-quality claim for all three: `UNSUPPORTED`, with
three specifically named missing prerequisites, not a generic stochasticity dismissal.

## Explicit scope boundary

This checkpoint does **not** claim: that any Lean proof of the GA or PSO
elitism-monotonicity theorem sketches exists (none does -- both are proposed future targets
only, stated informally, not mechanized); that ACO's internal `best_solution` monotonicity
sub-claim has been formally stated or proven (it is argued as plausible by direct analogy to
PSO's identical control-flow shape, not itself formalized or independently verified with a
new test in this checkpoint); that the optimization-quality claim is merely "hard" rather
than currently ill-posed in this codebase (three specific missing prerequisites are named,
not asserted as vague difficulty); that `mfact`/`mfw` contain any reusable Lean material for
this program (searched via lumen semantic search and explicitly not found, per the
refusal-rule discipline); that any Rust source file was modified this checkpoint (none was
-- this is research/analysis + ledger work only, per this checkpoint's explicit scope).

## Standing

`PARTIAL_ALIVE` -- two genuinely tractable, RNG-independent structural theorem sketches
(GA elitism-copy, PSO global-best strict-update) identified and argued from direct code
reading with an explicit hole-check for each; one genuine, specifically-cited hole found in
ACO's shipped-output monotonicity (the fallback-substitution branch), distinguished from its
still-plausible-but-unreturned internal sub-claim; the optimization-quality claim re-argued
as UNSUPPORTED with three named missing prerequisites rather than restated as a generic
stochasticity observation; an independent lumen-based search of `mfact`/`mfw` for reusable
Lean material, confirmed empty per the `LEAN_NAME_MATCH_WITHOUT_CARRIER_MAP` refusal rule. No
Rust source was modified. No Lean correspondence is claimed anywhere in this checkpoint for
GA, PSO, or ACO -- only informal, RNG-independent structural theorem sketches about existing
Rust control flow, explicitly marked as future targets pending new Lean work.
