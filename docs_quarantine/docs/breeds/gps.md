# GPS (General Problem Solver)

## Origin
- **Paper:** "GPS, a Program that Simulates Human Thought" (1963)
- **Authors:** Allen Newell, J.C. Shaw, Herbert Simon (Shaw cited as co-author in source as "Newell & Shaw 1963")
- **Tradition:** Means-ends analysis, cognitive simulation, symbolic AI

## Algorithm
GPS reduces the gap between the current state and the goal state by means-ends analysis. For each unsatisfied goal atom (the "gap"), GPS finds an operator (rule) whose effect adds that atom. If the operator's preconditions are not already satisfied, GPS recursively solves each precondition as a subgoal before applying the operator. A monotone progress invariant is enforced: the number of unsatisfied goals must strictly decrease on each outer iteration, preventing infinite loops. Cycle detection within `solve()` prevents the same goal from being pursued recursively. Maximum recursion depth is 32.

## Pseudocode
```
function run(input):
    state = atoms_of(input.state)
    goals = goal_strings(input.goals)
    plan = []

    last_gap_count = count_unsatisfied(goals, state) + 1
    while exists gap in goals not in state:
        gap_count = count_unsatisfied(goals, state)
        if gap_count >= last_gap_count:
            raise BreedError("gap not strictly decreasing")
        last_gap_count = gap_count
        gap = first_unsatisfied_goal(goals, state)
        solve(state, gap, input.rules, plan)

    explanation = "GPS plan (N ops): a → b → c"
    return BreedOutput(selected=plan.join(","), explanation)

function solve(state, goal, actions, plan, depth=0, visiting={}):
    if goal in state: return Ok
    if depth >= 32: raise "recursion limit"
    if goal in visiting: raise "cycle detected"
    visiting.add(goal)
    record TraceStep("reduce-gap", goal, depth)

    for each action in actions:
        if goal not in action.adds: continue
        snapshot = state.clone()
        ok = true
        for each pre in action.preconditions:
            try: solve(state, pre, actions, plan, depth+1, visiting)
            on error: restore snapshot; ok = false; break
        if not ok: continue
        apply action to state  // remove dels, add adds
        plan.push(action.id)
        record TraceStep("apply-operator", action.id, depth)
        visiting.remove(goal)
        return Ok
    raise "no operator produces <goal>"
```

## Input contract
- `intent`: not used by this breed
- `facts`: not used by this breed
- `rules`: required (precondition rejects if empty); each `Rule { id, premise: Vec<String>, conclusion: String }` is an operator; `premise` are precondition atoms; `conclusion` is semicolon-separated add/delete effects (prefix `!` = delete)
- `goals`: required (precondition rejects if empty); each `Goal { predicate, value }` becomes the target atom `"predicate=value"`
- `cases`: not used by this breed
- `state`: initial state atoms; each `StateAtom { predicate, value }` becomes `"predicate=value"`
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: comma-joined operator ids of the constructed plan; `None` when the plan is empty (all goals already satisfied)
- `explanation`: `"GPS plan (N ops): a → b → c"` using operator ids in order
- `inference_trace`: `"reduce-gap"` steps with recursion depth, and `"apply-operator"` steps when an operator is selected; `BreedError` is returned on unreachable goals, cycle detection, or monotonicity violation; postcondition requires non-empty trace

## Complexity
- Time: O(G × A^d) where G = number of goals, A = number of operators, d = maximum recursion depth (capped at 32)
- Space: O(d × |S|) for recursive state snapshots and the `visiting` set per outer iteration
- Determinism: yes — first-match policy on operators; recursion uses the order of `input.rules`

## Generalization examples
- **Workflow repair planning**: initial state encodes the process state after a deviation; goals encode conforming state atoms; operators encode corrective activities with preconditions; GPS constructs a minimal repair plan that satisfies all goals
- **Configuration management**: initial state encodes a partially misconfigured system; goals encode the required configuration atoms; operators encode configuration steps; GPS finds the application order that satisfies all constraints

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: replay broken — external root mismatch on a locally consistent receipt chain triggers `REPLAY_BROKEN`; bench missing — an unparseable outcome in a result file triggers `BENCHMARK_EXPECTATION_MISSING`
- Property tests: monotonicity invariant is enforced in the outer loop — a `BreedError` is returned if the gap count does not strictly decrease; cycle detection prevents infinite recursion on circular operator dependencies

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/gps.rs` for source
