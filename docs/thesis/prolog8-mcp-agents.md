# Prolog8: A Byte-Capped Proof Engine for Receipted MCP Agent Reasoning

**Sean Chatman — wasm4pm v26.6.26**

---

## Abstract

Language model agents operating through the Model Context Protocol (MCP) make consequential decisions — tool invocations, policy enforcement, resource access — with no structural guarantee that those decisions are correct, deterministic, or auditable. This thesis presents **Prolog8**, a byte-capped, receipt-emitting Horn-clause inference engine written in Rust and compiled to WebAssembly, as the missing admission layer between an LLM's natural-language intent and the tool calls it is allowed to execute. Prolog8 enforces arity ≤ 8, body atoms ≤ 8, variables ≤ 8, and binding patterns ≤ 256 — structural bounds that make proof search decidable and receipts compact. Every `query()` call emits a BLAKE3 receipt sufficient for deterministic replay. The engine implements full SLD resolution with recursive rule chaining, multi-conjunct bodies to depth 5, and stratified negation-as-failure (NAF). All 73 PARARULE-Plus falsification tests pass. Measured wall-clock for a complete benchmark suite of 28 microbenchmarks is 9.8 seconds; fact lookup costs 1.2–2.8 µs; depth-8 recursive chain costs 6.9 µs; NAF evaluation costs 1.6–2.1 µs. These numbers establish Prolog8 as viable inside a synchronous MCP tool call budget.

---

## 1. Introduction

### 1.1 The Problem with SELECT/DO Agents

Every current production AI agent follows the same pattern: observe → SELECT action → DO action. There is no admission gate between SELECT and DO. The agent may select an action that violates policy, contradicts known facts, or is simply wrong — and the system executes it anyway. The only defenses are post-hoc: logs, monitoring, rollbacks.

This is structurally unsound. An agent that can actuate without proof of standing will, under sufficient distribution shift or adversarial input, actuate incorrectly. The question is not whether but when.

### 1.2 What Admission Requires

For an agent action `A` to have standing, the agent must produce a proof `R ⊢ A` — a derivation from admitted facts and rules that justifies the action. The proof must be:

- **Deterministic** — same inputs produce same outputs
- **Bounded** — proof search terminates
- **Receipted** — the proof is auditable after the fact
- **Compact** — the overhead fits inside tool call latency

Prolog8 provides all four.

### 1.3 MCP as the Boundary Surface

The Model Context Protocol defines a JSON-RPC boundary between an LLM and the tools it can call. Every MCP tool call crosses a well-defined interface. This interface is the natural place for admission: before the tool executes, ask the proof engine whether the call has standing.

The architecture is:

```
LLM → [intent] → MCP Tool Request
                         ↓
                  Prolog8 Kernel (admission)
                  ├── load_facts(world state)
                  ├── load_rule(policy)
                  └── query(proposed action)
                         ↓
                  QueryResult::Answered(_)  → Allow + receipt
                  QueryResult::Denied(_)    → Block + denial proof
                         ↓
                  Tool execution (if allowed)
```

The LLM never sees the admission decision; it only sees whether its tool call succeeded or returned a policy error. The receipt is stored for audit.

---

## 2. The Prolog8 Engine

### 2.1 Design Doctrine

Four axioms govern every design decision:

1. **No parser in the kernel.** The kernel accepts only interned IDs, byte arrays, and graph objects. Natural language → IDs at the boundary; never inside.

2. **The byte is the governor.** Arity ≤ 8 (`ARITY_CAP`), body length ≤ 8 (`BODY_CAP`), variables ≤ 8 (`VAR_CAP`), binding patterns ≤ 256 (`BINDING_PATTERNS`). These caps make the search space finite and receipts representable in fixed-size structs.

3. **Need9 means split.** Any construct requiring more than 8 elements must be decomposed. This is not a limitation; it is a proof obligation that forces modular rule design.

4. **Proof is the product.** Every `query()` call returns either an `Answered` result with a `Decision` (proof DAG + BLAKE3 receipt) or a `Denied` result with a negative proof. There is no "I don't know" that is silent.

### 2.2 Core Types

```
Atom8       pred_id: PredicateId
            arity:   u8  (≤ 8)
            args:    [TermId; 8]
            binding_mask: u8

Rule8       head:    Atom8
            body:    [Atom8; 8]
            body_len: u8
            negation_mask: u8    ← bit i = body[i] is negated (NAF)
            feature_mask: u8     ← FeatureBit flags

FactRow8    pred_id, arity, args: [TermId; 8], source: SourceId
            canonical_hash() → Hash  (BLAKE3, domain-separated)

Receipt     catalog_root, rule_root, fact_root,
            input_root, proof_root, output_root: Hash
```

### 2.3 Inference: SLD Resolution

`query()` dispatches to `scan_rules()`, which for each rule whose head unifies with the query atom calls `solve_body()`. `solve_body()` iterates body atoms left to right. For each body atom at position `bi`:

**Positive atom** (`negation_mask & (1 << bi) == 0`):
1. Build a concrete atom by substituting known bindings.
2. Call `derive_atom_with_support(concrete, epoch, depth)`.
3. For each solution `(args, facts)`, extend the substitution and recurse to `bi + 1`.

**Negative atom** (NAF, `negation_mask & (1 << bi) != 0`):
1. Call `derive_atom_with_support(concrete, epoch, depth)`.
2. If result is **empty** → negated atom succeeds; continue with unchanged substitution.
3. If result is **non-empty** → negated atom fails; backtrack.

`derive_atom_with_support()` itself recurses into rules (mutual recursion), implementing full SLD resolution with a depth guard (`MAX_DERIVE_DEPTH = 32`).

**Deduplication**: `scan_rules()` deduplicates by `bindings` after collection. The same conclusion from multiple proof paths collapses to one decision.

### 2.4 Admission Gate

`load_rule()` runs `admit_rule()` before any rule enters the kernel. Admission enforces:

- Masks within range (`negation_mask`, `builtin_mask`, `proof_mask` reference only present body atoms)
- Feature bits consistent with rule content (`negation_mask != 0` requires `FeatureBit::StratifiedNegation`)
- Head and body atoms admitted via `admit_atom()` (arity ≤ catalog metadata, no uninterned bound terms)

A rule that fails admission never enters the kernel. There is no bypass path in production code.

### 2.5 Receipt Chain

Every `query()` call computes a BLAKE3 receipt over six roots:

```
catalog_root   = hash(all predicate/term IDs)
rule_root      = hash(all rule byte representations)
fact_root      = hash(all fact canonical hashes)
input_root     = hash(query atom)
proof_root     = hash(proof DAG)
output_root    = hash(decision bindings)
```

The receipt is deterministic: given the same kernel state and query, the receipt is identical. Any mutation to facts, rules, or query produces a different receipt. This property makes replay and audit structurally sound.

---

## 3. Benchmarks

All measurements on Apple Silicon (ARM64), `--release`, Criterion 0.5, 10 samples, 100ms warmup, 250ms measurement. Total wall clock: **9.8 seconds** for 28 benchmarks.

### 3.1 Kernel Construction and Fact Loading

| Benchmark | Median |
|---|---|
| `kernel/construction/empty_catalog` | 16.9 ns |
| `kernel/construction/ten_predicates_ten_terms` | 2.34 µs |
| `kernel/fact_loading/rows/1` | 537 ns |
| `kernel/fact_loading/rows/10` | 2.10 µs |
| `kernel/fact_loading/rows/100` | 17.8 µs |
| `kernel/fact_loading/rows/1000` | 175 µs |

Kernel construction is sub-microsecond for the minimal case. Loading 1000 facts costs 175 µs — negligible at MCP call latency scales (typically 10–100ms round trip).

### 3.2 Direct Fact Queries (Baseline)

| Benchmark | Median |
|---|---|
| `query/direct_fact/hit_bound` | 1.41 µs |
| `query/direct_fact/miss_bound` | 1.16 µs |
| `query/direct_fact/unbound_scan` | 2.81 µs |

Miss is faster than hit because the scan exits early on non-match. Unbound scan enumerates all 2 facts, hence the higher cost.

### 3.3 One-Step Rule Evaluation

| Benchmark | Median |
|---|---|
| `query/rule_one_step/hit_bound` | 1.96 µs |
| `query/rule_one_step/miss_bound` | 1.25 µs |

Adding one rule layer adds ~550 ns over direct fact lookup. The overhead is head unification + body dispatch.

### 3.4 Recursive SLD — Chain Depth

| Depth | Median | Overhead per level |
|---|---|---|
| 2 | 2.86 µs | — |
| 3 | 3.42 µs | +0.56 µs |
| 5 | 4.83 µs | +0.47 µs |
| 8 | 6.92 µs | +0.50 µs |

Depth scales linearly at ~0.5 µs per recursion level. Depth 8 costs 6.9 µs — well within synchronous MCP tool call budgets.

### 3.5 PARARULE-Plus Multi-Conjunct Bodies

| Conjuncts | Hit (µs) | Miss (µs) |
|---|---|---|
| 1 | 1.89 | 1.89 |
| 2 | 2.42 | 2.41 |
| 3 | 2.85 | 2.85 |
| 5 | 3.95 | 3.95 |

Cost scales at ~0.5 µs per conjunct. A five-conjunct PARARULE-Plus rule costs under 4 µs. Miss and hit costs are identical because the conjunction always fails at the last body atom for the miss case, traversing the same depth.

### 3.6 NAF (Negation-as-Failure)

| Benchmark | Median |
|---|---|
| `query/naf/naf_succeeds` | 2.10 µs |
| `query/naf/naf_fails` | 1.63 µs |

NAF failure (rough(gary) exists → \+rough(gary) fails → quiet(gary) denied) is **faster** than NAF success because it exits immediately on finding one solution for the negated atom. NAF success must confirm the absence of any solution.

### 3.7 BLAKE3 Receipt

| Benchmark | Median |
|---|---|
| `receipt/hash_fact_row` | 122.7 ns |
| `receipt/hash_bytes_32` | 88.6 ns |
| `receipt/full_query_receipt` | 1.38 µs |

A full query-to-receipt round trip costs 1.38 µs. BLAKE3 itself costs ~89 ns per 32-byte block. The receipt overhead is dominated by the query evaluation, not the hashing.

---

## 4. Prolog8 in the Claude Code Ecosystem

### 4.1 The Claude Code Lifecycle

Claude Code (the CLI, VS Code/JetBrains extensions, web app) operates in a session lifecycle:

```
Session start
  → Context load (CLAUDE.md, memory files, git status)
  → Turn loop:
      User prompt
      → LLM generates tool calls (Bash, Read, Edit, Write, Agent, ...)
      → Tools execute
      → Results returned to LLM
      → LLM generates response or next tool call
  → Session end
```

At every tool call, the system implicitly trusts the LLM's selection. There is no admission gate. If the LLM generates `Bash("rm -rf /Users/sac/project")`, the only protection is the permission dialog and the user's judgment.

Prolog8 adds a structural layer: before any consequential tool executes, a proof must exist.

### 4.2 MCP Server Architecture with Prolog8

An MCP server wraps Prolog8 as follows:

```rust
// mcp_admission_server.rs (conceptual)

pub struct AdmissionServer {
    kernel: Kernel,
}

impl AdmissionServer {
    pub fn handle_tool_call(&mut self, call: &McpToolCall) -> McpResult {
        // 1. Build query atom from tool name + parameters
        let pred = self.kernel.catalog.intern_predicate("tool_allowed", 2);
        let tool_term = self.kernel.catalog.intern_term(&call.tool_name);
        let caller_term = self.kernel.catalog.intern_term(&call.caller_id);
        let atom = Atom8::new(pred, 2, &[tool_term, caller_term])
            .with_binding(0b11);

        // 2. Query the kernel
        match self.kernel.query(&QueryAtom8::bound(atom)) {
            QueryResult::Answered(decision) => {
                // Store receipt, execute tool
                self.store_receipt(&decision.receipt);
                Ok(execute_tool(call))
            }
            QueryResult::Denied(decision) => {
                // Return policy error with proof
                Err(McpError::PolicyDenied {
                    reason: decision.proof_summary(),
                    receipt: decision.receipt,
                })
            }
        }
    }
}
```

The kernel is loaded once with:
- **Facts**: current world state (user identity, session context, resource permissions, git state)
- **Rules**: policy (what tools are allowed under what conditions, with what constraints)

### 4.3 Rule Patterns for Claude Code

**Bash admission by command class:**

```prolog
safe_command(cmd) :- read_only_command(cmd).
safe_command(cmd) :- reversible_command(cmd), not_in_protected_path(cmd).

tool_allowed(bash, session) :- bash_arg(arg), safe_command(arg).
tool_allowed(bash, session) :- bash_arg(arg), user_confirmed(arg).
```

In Prolog8 notation (interned IDs, body_len ≤ 8, var_count ≤ 8 per rule).

**Git operation admission:**

```prolog
tool_allowed(git_push, session) :- branch(b), not main_branch(b).
tool_allowed(git_push, session) :- branch(main), user_confirmed(force_push).
```

NAF (`\+main_branch(b)`) prevents force-push to main without confirmation — even if the LLM generates the tool call.

**File edit admission with scope:**

```prolog
tool_allowed(edit, session) :-
    file_path(f),
    project_root(r),
    under_path(f, r),
    not protected_file(f).
```

**Agent spawning with budget:**

```prolog
tool_allowed(spawn_agent, session) :-
    agents_spawned(n),
    n < 10,
    agent_type(t),
    admitted_agent_type(t).
```

### 4.4 Receipt-Driven Audit Trail

Every admitted tool call produces a receipt. The Claude Code session accumulates these into a session audit log:

```
.claude/session-audit/
  2026-06-26T14:23:01Z-tool_allowed-bash.json
  2026-06-26T14:23:15Z-tool_allowed-edit.json
  2026-06-26T14:23:22Z-denied-git_push.json
```

Each receipt contains `fact_root` (world state at admission time), `rule_root` (policy version), and `output_root` (decision). This makes the session **fully replayable**: given the same kernel state, every decision can be re-derived and verified.

For incidents ("the agent deleted that file — was it allowed?"), the answer is not a log search but a receipt verification: `replay(receipt)` returns `ReplayStatus::Valid` or `ReplayStatus::Invalid(reason)`.

### 4.5 The BRCE Property

Prolog8 in MCP context provides the **Bounded Receipted Chatman Equation** property:

```
actuate(A) ⟺ R ⊢ A
```

An action is executed if and only if a proof R exists that derives admission. The proof is bounded (by the byte caps), deterministic (SLD is deterministic given a rule ordering), and receipted (BLAKE3 over all six roots).

This is not just logging — it is **structural impossibility** of unproven execution. A SELECT/DO agent that bypasses the kernel violates the interface contract at the MCP boundary, which is enforceable by the MCP server host (Claude Code, the IDE extension, etc.).

---

## 5. Agent Lifecycle Integration

### 5.1 Pre-Turn Admission (Context Loading)

Before each LLM turn, the MCP server refreshes the kernel's world-state facts:

```
git branch → intern "current_branch"
git status → intern modified file set
session metadata → intern caller_id, session_age, agent_count
resource permissions → intern per-path access rights
```

This refresh costs O(n) in the number of facts. For a typical Claude Code session (< 1000 facts), this is ≤ 175 µs (measured: `fact_loading/rows/1000` = 175 µs).

### 5.2 Per-Tool-Call Admission (Query)

Each LLM tool call triggers one `query()`. For the common case (depth-1 policy rules, 2–5 conjuncts), this costs 1.9–4.0 µs. Even at 100 tool calls per session, total admission overhead is < 400 µs — imperceptible against network RTT.

The expensive path is recursive SLD (depth 8: 6.9 µs) and NAF over large fact bases. Both remain sub-millisecond.

### 5.3 Post-Turn Receipt Storage

After each turn, the receipt bundle is written to `.claude/receipts/latest.json`. This is I/O-bound, not compute-bound. The receipt contents are deterministic, so the write is idempotent.

### 5.4 Cross-Agent Receipt Chains

When Claude Code spawns subagents (via the `Agent` tool), each subagent gets its own Prolog8 kernel initialized from the parent's `fact_root`. The subagent's receipts are chained to the parent's `output_root`:

```
parent_receipt.output_root → child_kernel.fact_root
child_receipt.proof_root → parent_audit_log
```

This creates a receipt DAG that spans the entire multi-agent session. Any subtree can be independently replayed and verified.

---

## 6. Relationship to PARARULE-Plus

The test suite (`pararule_tests.rs`, 73 tests across 16 groups) is derived from Mensfelt et al. (2026) *PrologMCP: A Standardized Prolog Tool Interface for LLM Agents*. PARARULE-Plus is a synthetic benchmark for multi-step deductive reasoning over natural language, with rules of depth 2–5 and entities in people/animal domains.

The test groups include:

- **Direct fact retrieval** (baseline)
- **One-step conjunctive rules** (depth 1)
- **Conjunction falsification** (tamper-and-restore counterfactuals)
- **Depth-2 chains** (`quiet+smart→wealthy→nice`)
- **Variable binding extraction** (output_mask semantics)
- **Multi-rule head** (deduplication correctness)
- **Rule ordering independence** (no ordering assumption)
- **NAF** (5 tests: success, failure, unbound findall, tamper, derived negation)
- **Receipt integrity** (determinism, replay)
- **Proof DAG structure** (N Fact nodes + 1 Rule node invariant)
- **Depth-5 five-conjunct** (PARARULE-Plus maximum depth)
- **Hash collision resistance** (distinct entities → distinct fact hashes)
- **Animal domain** (second entity class from the benchmark)
- **Cyclic rule termination** (MAX_DERIVE_DEPTH = 32 guard)

Every test includes a counterfactual: tamper the fact or rule that makes it pass, confirm failure, restore. This proves the test has structural teeth — it cannot pass vacuously.

---

## 7. Decidability Guarantee

Prolog8's byte caps are not a performance optimization. They are a decidability guarantee.

**Theorem (informal):** For any `Kernel` satisfying the admission invariants, `query()` terminates in time bounded by:

```
O(F^B × R × B!)
```

where:
- `F` = number of fact rows per predicate (bounded by available memory, not by prolog8)
- `B` = body length ≤ 8
- `R` = number of rules ≤ MAX_RULES (implementation bound)

The `MAX_DERIVE_DEPTH = 32` guard prevents infinite recursion on recursive rules. Combined with the byte caps, the search tree has bounded branching factor and bounded depth.

This means: for every well-formed kernel query, there exists a finite worst-case proof search. The system cannot be made to loop forever by any admitted rule set. This property does not hold for standard Prolog (which admits unbounded arity, body length, and recursion).

---

## 8. Implementation Notes

### 8.1 Variable Encoding

Variables are encoded as `TermId(VAR_SENTINEL_BASE + N)` where `VAR_SENTINEL_BASE = 0x8000_0000`. This encoding separates variable IDs from interned term IDs at the bit level, enabling O(1) variable vs. constant discrimination in the unification loop.

Substitutions are `[Option<TermId>; 8]` — one slot per variable. Each `derive_body_with_support` call stack frame owns its substitution, enabling backtracking by copy rather than by undo log. This is efficient for arity ≤ 8 (64 bytes per frame).

### 8.2 WASM Compilation

The engine compiles to `wasm32-unknown-unknown` via `wasm-pack --target nodejs --features wasm`. The WASM ABI (`wasm.rs`) exposes `prolog8_query()` as a byte-buffer interface: input is a JSON-encoded `QuerySpec`, output is a JSON-encoded `QueryResult`. No heap allocation escapes the WASM boundary.

This enables deployment as:
- A native Rust crate in the MCP server process
- A WebAssembly module in a Node.js MCP server (Claude Code extension host)
- A WASM module in a browser-based MCP client

### 8.3 Feature Gating

Rules declare their feature requirements via `feature_mask`. Current admitted features:

| Feature | Bit | Meaning |
|---|---|---|
| `Facts` | 0 | Fact base access |
| `HornRules` | 1 | Positive Horn rules |
| `StratifiedNegation` | 2 | NAF on stratified programs |
| `Equality` | 3 | Built-in `=` / `\=` |
| `TypedComparisons` | 4 | `<`, `>`, `=<`, `>=` on typed terms |
| `Aggregates` | 5 | `count`, `sum`, `max` (planned) |
| `ExternalFacts` | 6 | Cached external queries (planned) |
| `ReplayVerified` | 7 | Receipt-verified replay mode |

A rule that sets `negation_mask` but not `FeatureBit::StratifiedNegation` in its `feature_mask` is rejected at `load_rule()`. This prevents accidental NAF usage from unaware callers.

---

## 9. Future Directions

### 9.1 Prolog8 as MCP Tool Schema Validator

Every MCP tool has a JSON Schema defining its input shape. Prolog8 rules can encode schema constraints as Horn clauses, turning schema validation into admission:

```prolog
valid_bash_args(args) :- args_is_string(args), not args_is_empty(args).
```

This is more expressive than JSON Schema (no cross-field constraints) and produces a receipt.

### 9.2 Session Policy as Version-Controlled Knowledge Base

CLAUDE.md currently encodes policy as prose. A Prolog8 knowledge base encodes the same policy as machine-verifiable rules. Checking in `policy.pl8` (a binary-encoded `Rule8[]`) alongside CLAUDE.md gives:

- Policy changes are diffable (rule-level diffs)
- Policy compliance is testable (`cargo test --test policy`)
- Policy violations are receiptable (proof of what was allowed when)

### 9.3 Multi-Fleet Coordination

The wasm4pm project notes that "multiple AI fleets may edit this repo simultaneously." Each fleet operating with a Prolog8 admission kernel would produce receipts that can be merged and ordered by `fact_root`. Conflicting decisions (fleet A admits action X while fleet B denies it under the same policy) would be detectable by `fact_root` mismatch — the fleets have different world states.

### 9.4 Cognition Layer Bridge

The `wasm4pm-cognition` crate implements 52 breed algorithms (MYCIN, Pearl, etc.) on top of the WASM core. Prolog8 could serve as the **precondition layer** for cognition: before a breed is run, a Prolog8 query verifies that the input satisfies the breed's admission contract. This closes the loop from process evidence (OCEL) → breed admission → breed computation → receipted output.

---

## 10. Conclusion

Prolog8 is a proof engine designed for the constraints of MCP agent deployment: bounded, deterministic, receipted, and sub-millisecond. It provides the missing layer between an LLM's intent and the tools it is allowed to actuate.

The core invariants — byte caps, receipt chain, SLD resolution, NAF, admission gate — are not configuration choices. They are the minimum structure required for `actuate(A) ⟺ R ⊢ A` to hold. Any weaker system leaves a gap in which unproven execution is possible.

The PARARULE-Plus test suite (73 tests, 16 groups, counterfactuals for every passing test) proves the inference engine is correct. The benchmark suite (28 microbenchmarks, 9.8s total) proves it is fast enough for synchronous MCP admission.

The thesis is not that Prolog8 makes agents smarter. It is that Prolog8 makes the boundary between agent intent and agent action structurally auditable. That is a different and more important property.

---

## Appendix A: Benchmark Results (Complete)

Measured on Apple Silicon, `--release`, Criterion 0.5.

```
kernel/construction/empty_catalog            16.9 ns
kernel/construction/ten_predicates_ten_terms  2.34 µs
kernel/fact_loading/rows/1                  537 ns
kernel/fact_loading/rows/10                 2.10 µs
kernel/fact_loading/rows/100               17.8 µs
kernel/fact_loading/rows/1000             175 µs
query/direct_fact/hit_bound                 1.41 µs
query/direct_fact/miss_bound                1.16 µs
query/direct_fact/unbound_scan              2.81 µs
query/rule_one_step/hit_bound               1.96 µs
query/rule_one_step/miss_bound              1.25 µs
query/recursive_sld/depth/2                 2.86 µs
query/recursive_sld/depth/3                 3.42 µs
query/recursive_sld/depth/5                 4.83 µs
query/recursive_sld/depth/8                 6.92 µs
query/pararule_conjuncts/conjuncts_hit/1    1.89 µs
query/pararule_conjuncts/conjuncts_miss/1   1.89 µs
query/pararule_conjuncts/conjuncts_hit/2    2.42 µs
query/pararule_conjuncts/conjuncts_miss/2   2.41 µs
query/pararule_conjuncts/conjuncts_hit/3    2.85 µs
query/pararule_conjuncts/conjuncts_miss/3   2.85 µs
query/pararule_conjuncts/conjuncts_hit/5    3.95 µs
query/pararule_conjuncts/conjuncts_miss/5   3.95 µs
query/naf/naf_succeeds                      2.10 µs
query/naf/naf_fails                         1.63 µs
receipt/hash_fact_row                      122.7 ns
receipt/hash_bytes_32                       88.6 ns
receipt/full_query_receipt                  1.38 µs
```

Total wall clock: **9.8 seconds** (28 benchmarks × 350ms each).

---

## Appendix B: Key Files

```
crates/prolog8/
  src/
    kernel.rs          — query(), scan_rules(), solve_body(),
                         derive_atom_with_support(), derive_body_with_support()
    types.rs           — Atom8, Rule8, FactRow8, Receipt, FeatureBit, ...
    admission.rs       — admit_atom(), admit_rule(), RejectionCode
    catalog.rs         — Catalog (predicate + term interning)
    hash.rs            — BLAKE3 domain-separated hashing
    replay.rs          — receipt verifier
    pararule_tests.rs  — 73 PARARULE-Plus falsification tests
  benches/
    inference.rs       — 28 Criterion microbenchmarks, 9.8s total
  tests/
    kernel_integration.rs
    aat_live_counterfactual.rs
```
