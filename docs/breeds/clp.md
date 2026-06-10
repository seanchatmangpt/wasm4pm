# CLP (Constraint Logic Programming)

## 1. Intent
Performs Constraint Logic Programming over finite domains using the AC-3 algorithm for inference and backtracking search for variable assignment. It guarantees mathematically verifiable bounds consistency before search, fulfilling the deterministic propagation required by Tier P2 models.

## 2. Input/Output Schemas
* **Input Schema:** `clp_input_v1`
  - Accepts a list of facts defining domains (e.g., `domain:X:1..5`) and constraints (e.g., `constraint:X:<:Y`, `constraint:X:=+:Y:3`).
* **Output Schema:** `clp_output_v1`
  - Yields assigned variables as derived facts (e.g., `assigned:X:1`) if a solution is found.

## 3. Supported Fact/Rule/Goal Layouts
* **Facts:**
  * Variables are defined using keys `domain:VAR:VALUES`, e.g., `domain:X:1,2,3` or `domain:X:1..10`.
  * Constraints are defined via `constraint:VAR1:OP:VAR2`, supporting `alldiff`, `<`, `>`, `<=`, `>=`, `==`, `!=`, `=+C`, `=-C`.
* **Goals/Rules:** Not primarily used for the core constraint problem, though constraints can effectively act as bounds and declarative rules.

## 4. Trace Phases
1. **Load (post-and-propagate):** Emits `post-constraint` for each posted constraint, followed immediately by `propagate` bounds reduction via AC-3. Minimum 1 occurrence.
2. **Search:** Emits `label` (variable assignment), `propagate` (further MAC bounds reductions), and `backtrack` (domain exhaustion) events as it traverses the search tree. Occurrences are unbounded.
3. **Verdict:** Emits either a `solution` (success) or `inconsistent` (domain wipeout/failure) event to close the trace. Exactly 1 occurrence.

## 5. OCEL Lifecycle Phase Definitions
* **`post-and-propagate` Phase:** kinds `[post-constraint, propagate]`
* **`search` Phase:** kinds `[label, propagate, backtrack]`
* **`verdict` Phase:** kinds `[solution, inconsistent]`

## 6. Determinism Gate Conditions
* AC-3 propagation ordering depends on consistent iteration over constraints and variables. Variable selection uses lexical sorting of unassigned variable keys to guarantee deterministic `label` ordering.
* Branch assignment is similarly sorted to guarantee consistent exploration.

## 7. Known Failure Modes
* **Inconsistency Check:** Emits `inconsistent` on deterministic domain wipeout before or during search.
* **Over-Constrained:** Results in `inconsistent` verdict without any `solution`.

## 8. Literature Pedigree
* Jaffar, J., & Lassez, J. L. (1987). Constraint logic programming. *POPL '87: Proceedings of the 14th ACM SIGACT-SIGPLAN symposium on Principles of programming languages*, 111-119.
