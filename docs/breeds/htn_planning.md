# HTN_PLANNING

## Origin
- **Paper:** "SHOP2: An HTN Planning System" (JAIR 20, 2003)
- **Authors:** Nau, Au, Ilghami, Kuter, Murdock, Wu, Yaman
- **Tradition:** Hierarchical task network planning

## Algorithm
Total-order decomposition: tasks come from goals; `method:<task>:<variant>` rules decompose a compound task into a subtask sequence when their preconditions hold; `op:<name>` rules are primitives with add/delete effects (`atom` / `!atom`). Method alternatives are tried in declaration order with chronological backtracking; depth ≤64, expansions ≤512. The returned plan is replayed against the initial state as a self-audit before being emitted.

## Pseudocode
```
function seek(state, tasks):
    if tasks empty: return []
    t = tasks[0]
    if t is op: if applicable: emit htn-apply; recurse on effect(state)
                on failure: emit htn-backtrack
    else: for each method:t:* applicable:
            emit htn-decompose; recurse with subtasks ++ rest
            on failure: emit htn-backtrack
function run: plan = seek(initial, goal tasks); replay plan (self-audit); emit htn-plan
```

## Input contract
- goals: each value is a task (compound name or `op:<name>`)
- rules: `method:<task>:<variant>` / `op:<name>` ids (required); state atoms `pred=val`

## Output contract
- `selected` / fact `htn:plan` — comma-joined operator sequence
- trace: {`htn-decompose`,`htn-apply`,`htn-backtrack`}(1,*) → `htn-plan`(1,1)

## Complexity
O(b^d) over method branching b, depth d; hard-capped at 512 expansions.

## Generalization examples
Logistics (load/drive/unload), travel planning, build pipelines.

## Adversarial coverage
- Refusal: no goals, no rules, rules without method:/op: ids
- Hidden: method A's operator precondition fails mid-sequence → forced backtrack to method B, exact plan + htn-backtrack step asserted
- Paper: Nau 2003 logistics — exact plan op:load,op:drive,op:unload (audit defect HTN-1/2 fixed: Rust fixture + lifecycle kinds match emissions)

## See also
- `csp_ac3.md`
