# Handoff Report: PM4Py-LSP Analysis & PyO3 Bridge Design

## 1. Observation
- **Static Analysis File**: `crates/pm4py-lsp/src/analysis.rs` lines 22-23:
  ```rust
  let re_pm4py = Regex::new(r"(?m)^import\s+pm4py(?:\s+as\s+(\w+))?").unwrap();
  ```
  And lines 67-68:
  ```rust
  // Check for missing mappings in format_dataframe
  let re_full_format = Regex::new(&format!(r#"{}\.format_dataframe\s*\(([^)]+)\)"#, regex::escape(alias))).unwrap();
  ```
- **Bridge File**: `crates/pm4py-lsp/src/pm4py_bridge.rs` line 22-25:
  ```rust
  pub fn run_pm4py_logic<F, R>(f: F) -> Option<R>
  where
      F: FnOnce(Bound<'_, PyModule>) -> PyResult<R>,
  ```
- **Compilation Failures**: Running `cargo test --workspace` failed with:
  ```text
  error[E0425]: cannot find function `create_parity_fixture` in this scope
     --> crates/pm4py-lsp/src/lib.rs:245:36
  error[E0425]: cannot find function `diagnose_text` in this scope
     --> crates/pm4py-lsp/src/lib.rs:301:35
  error[E0599]: no method named `as_str` found for enum `LawAxis` in the current scope
      --> crates/pm4py-lsp/src/lib.rs:335:76
  error[E0560]: struct `RepairAction` has no field named `title`
     --> crates/pm4py-lsp/src/lib.rs:380:17
  ```
- **Vendor Code types**: `vendors/tower-lsp-max/tower-lsp-max-protocol/src/lib.rs` line 94-97:
  ```rust
  pub struct RepairAction {
      pub action_id: String,
      pub description: String,
  }
  ```

## 2. Logic Chain
1. **Gap 1: Line-based regex constraints**: The regex `^import\s+pm4py` requires the import to begin at the start of the line. Indented imports will not match.
2. **Gap 2: Direct function imports**: The regex requires `format_dataframe` to be prefixed by an alias (`{pm4py_alias}.format_dataframe`). If `format_dataframe` is imported directly (e.g. `from pm4py import format_dataframe`), the tool fails to identify the formatting call.
3. **Gap 3: Argument parsing truncation**: The regex `format_dataframe\s*\(([^)]+)\)` matches all characters except `)`. If an argument contains nested parentheses (e.g., `case_id=str(col)`), it stops matching at the first `)`, causing truncation and triggering false missing-parameter diagnostics.
4. **Gap 4: Bridge Execution Gating & Panic Safety**: The current `run_pm4py_logic` function returns `Option<R>` by discarding all PyErr using `ok()`. This hides detailed error messages and lacks capability gating, risking unhandled interpreter state crashes.
5. **Compilation Blockers**: In `crates/pm4py-lsp/src/lib.rs`, the code attempts to call `create_parity_fixture` and `diagnose_text` which do not exist. It also calls `.as_str()` on `LawAxis` which is undefined, and creates `RepairAction` with fields `title` and `command` which does not match the vendor-defined fields (`action_id` and `description`).

## 3. Caveats
- No actual PyO3 implementation was written into the repository files (per task constraint).
- The Python virtual environment was assumed to have pandas and pm4py installed when run in `RuntimeGated` mode.

## 4. Conclusion
- The static analysis crate contains critical gaps that can be bypassed or cause false positives on standard Python structures.
- A gated PyO3 runtime bridge (`PM4PyBridge`) can be safely introduced using an explicit capability gate (`RuntimeExecutionMode`) and custom error mapping (`BridgeError`).
- The cargo build is currently broken due to API mismatches in `lib.rs` and missing function exports. Resolving these is a prerequisite for downstream implementation tasks.

## 5. Verification Method
1. Verify the analysis report file exists at `/Users/sac/wasm4pm/.agents/explorer_m2_3/analysis.md`.
2. Inspect the proposed PyO3 runtime bridge implementation in the report.
3. Verify that running `cargo test --workspace` in the repository produces the exact compilation errors described in Section 1.
