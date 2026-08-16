//! W4PM-LEAN-GALL-026 — Inductive Miner Sequence-cut soundness (2-activity
//! restricted case).
//!
//! ## Lean theorem transcribed (hand-copy, cited by content hash)
//! `mfact/procint/ProcInt/InductiveMinerSoundness.lean` (new file, this
//! checkpoint, importing `ProcInt.Models.ProcessTree`'s already-proven
//! `ProcessTree.language` rather than redefining it):
//!
//! ```text
//! def SeqCutHolds (log : List (List α)) (a b : α) : Prop :=
//!   log ≠ [] ∧ ∀ t ∈ log, t = [a, b]
//!
//! theorem seqCutHolds_traceSet_eq_language (log : List (List α)) (a b : α)
//!     (h : SeqCutHolds log a b) :
//!     {w | w ∈ log} = ((ProcessTree.leaf a).seq (ProcessTree.leaf b)).language
//! ```
//!
//! In words: if a log's Sequence-cut criterion holds for two singleton
//! activity groups `{a}`, `{b}` (i.e. the log is nonempty and every trace is
//! exactly `[a, b]`), the log's trace set is EXACTLY the language of the
//! process tree `seq(leaf a, leaf b)` the Inductive Miner would construct
//! from that cut — no spurious traces admitted, no real trace rejected.
//!
//! ## Scope boundary (explicit, matches the Lean file's own doc comment)
//! This is the restricted 2-activity base case, NOT the full n-ary,
//! multi-trace, SCC-condensation Sequence-cut criterion
//! `find_sequence_cut` (`more_discovery.rs:697`) implements in general.
//! Formalizing and proving soundness for the general case is explicitly
//! out of scope for this checkpoint (would require formalizing the SCC
//! condensation itself as a Lean definition first) — left as future work.
//!
//! ## Differential test against the REAL production function
//! Calls `wasm4pm::more_discovery::discover_inductive_miner_from_log`
//! directly (the actual shipped Inductive Miner, delegating internally to
//! `inductive_miner_recursive`) on a log satisfying `SeqCutHolds` for two
//! activities, and asserts the discovered tree is exactly
//! `sequence(a, b)` — the shape `seq(leaf a, leaf b)` corresponds to in the
//! JSON tree representation, matching the pattern used by the existing
//! `inductive_miner_sequence_then_parallel_exact` / `..._non_contiguous_xor`
//! / `..._loop_cut_exact` tests in `tests/algorithm_correctness.rs`.
//!
//! Unlike every prior checkpoint in this program, `lake build
//! GallCheckpoint026` (covering both `HeuristicMiner.lean` and
//! `InductiveMinerSoundness.lean`) was actually attempted and SUCCEEDED
//! this session (8562 jobs, no `sorry`, no `axiom`) — the two Lean
//! theorems above are kernel-verified, not merely receipted. This
//! Rust-side differential test itself still runs against a hand-transcribed
//! copy of the theorem statement (not a live Lean-to-Rust FFI call), so the
//! Rust↔Lean correspondence claim remains `receipted_formula_with_cited_proof`
//! even though the Lean side alone is now build-verified.

pub const LEAN_INDUCTIVE_MINER_SOUNDNESS_FILE_SHA256: &str =
    "736a78cc9187b1c1836477780b6550aab084ecdc670bfdccf4c90a07845b12c1"; // see receipts/W4PM-LEAN-GALL-026-*.md
pub const MFACT_REVISION: &str = "cf5e047264ccd117b49c97b0effb392a5e478e6b";

/// Render a process-tree JSON node as a canonical string, matching the
/// `tree_shape` helper already used by `tests/algorithm_correctness.rs`'s
/// exact-shape inductive-miner assertions.
pub fn tree_shape(node: &serde_json::Value) -> String {
    let ty = node["node_type"].as_str().unwrap_or("?");
    if ty == "leaf" {
        return node["label"].as_str().unwrap_or("?").to_string();
    }
    let children: Vec<String> = node["children"]
        .as_array()
        .map(|cs| cs.iter().map(tree_shape).collect())
        .unwrap_or_default();
    format!("{}({})", ty, children.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use crate::more_discovery::discover_inductive_miner_from_log;
    use std::collections::BTreeMap;

    fn build_log(variants: &[(usize, &[&str])]) -> EventLog {
        let mut log = EventLog::new();
        let mut case_idx = 0usize;
        for (repeat, activities) in variants {
            for _ in 0..*repeat {
                let mut trace = Trace {
                    attributes: {
                        let mut m = BTreeMap::new();
                        m.insert(
                            "concept:name".to_string(),
                            AttributeValue::String(format!("case-{}", case_idx)),
                        );
                        m
                    },
                    events: Vec::new(),
                };
                for (i, &act) in activities.iter().enumerate() {
                    let mut attrs = BTreeMap::new();
                    attrs.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(act.to_string()),
                    );
                    attrs.insert(
                        "time:timestamp".to_string(),
                        AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", i)),
                    );
                    trace.events.push(Event { attributes: attrs });
                }
                log.traces.push(trace);
                case_idx += 1;
            }
        }
        log
    }

    /// Core theorem test: a log satisfying `SeqCutHolds log "a" "b"` (every
    /// trace is exactly `[a, b]`, log nonempty) must produce the discovered
    /// tree `sequence(a,b)` from the REAL production
    /// `discover_inductive_miner_from_log` — `seqCutHolds_traceSet_eq_language`
    /// differentially checked, not reimplemented.
    #[test]
    fn inductive_miner_two_activity_sequence_cut_exact() {
        // SeqCutHolds: log nonempty, every trace exactly ["a", "b"].
        let log = build_log(&[(7, &["a", "b"])]);
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
        let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
        let v: serde_json::Value =
            serde_json::from_str(&json_str).expect("inductive miner must return valid JSON");
        assert_eq!(
            tree_shape(&v["root"]),
            "sequence(a,b)",
            "SeqCutHolds(log, a, b) must discover seq(leaf a, leaf b), matching \
             seqCutHolds_traceSet_eq_language's exact-language claim"
        );
    }

    /// A different activity pair, and a larger repeat count, to check the
    /// theorem isn't an artifact of one specific log size (the Lean theorem
    /// is universally quantified over any nonempty log satisfying the
    /// criterion).
    #[test]
    fn inductive_miner_two_activity_sequence_cut_exact_other_pair() {
        let log = build_log(&[(20, &["x", "y"])]);
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
        let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
        let v: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(tree_shape(&v["root"]), "sequence(x,y)");
    }

    /// Negative control: when the criterion does NOT hold (e.g. traces are
    /// NOT all exactly `[a, b]` — here some traces are `[b, a]`, violating
    /// `∀ t ∈ log, t = [a, b]`), the discovered tree must NOT be the plain
    /// `sequence(a,b)` shape — confirming the test above is actually
    /// sensitive to the hypothesis, not vacuously true for any 2-activity
    /// log.
    #[test]
    fn inductive_miner_seq_cut_criterion_violated_gives_different_shape() {
        let log = build_log(&[(5, &["a", "b"]), (5, &["b", "a"])]);
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
        let json_str = discover_inductive_miner_from_log(&admitted, "concept:name");
        let v: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_ne!(
            tree_shape(&v["root"]),
            "sequence(a,b)",
            "when SeqCutHolds's hypothesis is violated (traces disagree on \
             order), the miner must not report a plain a-then-b sequence"
        );
    }
}
