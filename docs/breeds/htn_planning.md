# HTN Planning

Hierarchical Task Network (HTN) Planning is a cognitive breed based on SHOP2 (Nau et al., 2003) for total-order task decomposition.

## Overview

Unlike STRIPS, which searches backward from goals, HTN planning starts with an initial high-level task and uses domain-specific methods to decompose it into smaller subtasks, continuing until primitive operators are reached. This allows domain knowledge to guide and restrict the search space, making it efficient.

## Lifecycle

The `htn_planning` breed follows a strict lifecycle model with trace steps representing its search:
1. `htn-decompose`: Selects a method to break down a compound task.
2. `htn-apply`: Applies a primitive operator, modifying the state.
3. `htn-backtrack`: Reverses a choice if decomposition fails.
4. `htn-plan`: Emits the successfully verified plan.

## Input Encoding

* **Initial State**: Defined in `input.state`.
* **Initial Tasks**: Encoded in `input.goals` with `predicate: "task"` and `value: "task-name"`.
* **Methods**: Defined in `input.rules` with `id: "method:<task>:<variant>"`. The `conclusion` is a semicolon-separated list of subtasks.
* **Operators**: Defined in `input.rules` with `id: "op:<name>"`. The `conclusion` contains adds and deletes (prefixed with `!`).

## Algorithm Limits

* **Max Depth**: 64
* **Max Expansions**: 512
* **Backtracking**: Chronological

## Self-Audit

The resulting plan is always replayed against the initial state to ensure that every operator's preconditions were correctly met in sequence, preventing state leakage during the depth-first search.
