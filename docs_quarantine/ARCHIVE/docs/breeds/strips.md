# STRIPS

## Origin
- **Paper:** "STRIPS: A New Approach to the Application of Theorem Proving to Problem Solving" (1971)
- **Authors:** Richard Fikes, Nils Nilsson
- **Tradition:** Automated planning, state-space search, symbolic AI

## Algorithm
STRIPS uses iterative deepening depth-first search (IDFS) to find a sequence of actions that transforms an initial state into a state satisfying all goals. At each depth limit `d` (0 through `MAX_PLAN_DEPTH = 16`), the algorithm identifies the first unsatisfied goal, finds an action whose effect adds that goal, and recursively applies the action if its preconditions hold. After a plan is found, it is verified by forward replay — each action is checked for applicability in sequence; the breed returns an error if replay fails or goals are not satisfied after all actions execute.

## Pseudocode
```
function run(input):
    initial = atoms_of(input.state)   // { "pred=val" strings }
    goals   = goal_strings(input.goals)

    for d in 0..MAX_PLAN_DEPTH:
        record TraceStep("iterate-depth", "d="+d)
        plan = idfs(initial, goals, input.rules, depth=d)
        if plan found: break
    if no plan: raise BreedError("unreachable goal within depth 16")

    // Verify by forward replay
    state = initial
    for action in plan:
        assert applicable(action, state)
        state = apply(action, state)
        record TraceStep("execute", action.id)
    assert goals_satisfied(goals, state)

    explanation = "STRIPS plan (N steps): a → b → c"
    return BreedOutput(selected=plan.join(","), explanation)

function idfs(state, goals, actions, depth):
    if goals_satisfied(goals, state): return []
    if depth == 0: return None
    unsat = first goal not in state
    record TraceStep("subgoal", unsat)
    for action in actions:
        if unsat not in action.adds: continue
        if not applicable(action, state): continue
        record TraceStep("try-action", action.id)
        next = apply(action, state)
        rest = idfs(next, goals, actions, depth-1)
        if rest found: return [action.id] + rest
    return None
```

## Input contract
- `intent`: not used by this breed
- `facts`: not used by this breed
- `rules`: required (precondition rejects if empty); each `Rule { id, premise: Vec<String>, conclusion: String, certainty }` is an action; `premise` are precondition atoms (`"pred=val"`); `conclusion` is semicolon-separated effects where `!atom` means delete and bare atoms mean add
- `goals`: required (precondition rejects if empty); each `Goal { predicate, value }` becomes the target atom `"predicate=value"`
- `cases`: not used by this breed
- `state`: initial state atoms; each `StateAtom { predicate, value }` becomes `"predicate=value"`
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: comma-joined action ids of the discovered plan (e.g. `"action1,action2,action3"`); `None` only when the plan is empty (goals already satisfied in the initial state)
- `explanation`: `"STRIPS plan (N steps): a → b → c"` using the action ids in order
- `inference_trace`: `"iterate-depth"` steps for each depth tried, `"subgoal"` and `"try-action"` steps during search, and `"execute"` steps during forward replay; postcondition requires a non-empty trace; a `BreedError` is returned if the goal is unreachable within depth 16 or if forward replay fails

## Complexity
- Time: O(b^d) where b = branching factor (applicable actions per state) and d = plan depth; worst case O(A^16) for A actions at `MAX_PLAN_DEPTH = 16`
- Space: O(d × |S|) for the recursive call stack with state clones, where |S| = state size
- Determinism: yes — action iteration order is the order of `input.rules`; first applicable action at each node is chosen

## Generalization examples
- **CI pipeline repair**: initial state encodes test failures and missing artifacts as atoms; goals encode "all tests pass and artifact present"; actions encode repair steps with their preconditions; STRIPS finds the minimum-step repair sequence
- **Process model conformance correction**: initial state encodes a deviating trace prefix; goals encode the required conforming state; actions encode corrective activities; STRIPS outputs a remediation plan

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: replay broken — a locally consistent receipt chain that disagrees with an external root triggers `REPLAY_BROKEN`; stub gate — zero-digest gate evidence triggers `STUB_GATE_PASS`
- Property tests: forward replay is mandatory — the breed verifies its own plan before returning it; an unreachable goal within `MAX_PLAN_DEPTH` returns a `BreedError` rather than an empty or partial plan

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/strips.rs` for source
