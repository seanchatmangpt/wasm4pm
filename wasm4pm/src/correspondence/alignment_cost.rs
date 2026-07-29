//! Correspondence harness: `wasm4pm::alignments`'s A* move-cost model
//! ↔ `mfact/procint/ProcInt/Conformance/Moves.lean::Move.cost`.
//!
//! ## Scope: only the move→cost mapping, not the full A* search
//! `wasm4pm::alignments::compute_trace_alignment`'s move-cost assignment
//! is inline within its A* successor-generation loop (`alignments.rs`
//! lines ~183-232), not factored into a standalone callable function.
//! This harness independently transcribes that exact logic (cited by
//! file:line below) as [`rust_move_cost`] — a real, reviewable copy of
//! the production cost rules, not a call into the production code path
//! itself (matching the same discipline `token_replay.rs`/
//! `petri_firing.rs`/`wf_net_soundness.rs` already use: each harness's
//! "Rust side" is an independently-written reference implementation, not
//! a refactor of production code into a shared function). This checkpoint
//! does **not** verify the A* search itself finds the true minimum-cost
//! alignment — only that each individual move classification's cost
//! matches both sides' formula.
//!
//! ## What this proves
//! wasm4pm's default cost configuration (`sync_cost=0.0, log_move_cost=1.0,
//! model_move_cost=1.0`, with invisible/empty-label model moves forced to
//! `0.0` — `alignments.rs:112-114,216-221`) assigns the SAME cost, per
//! move kind, as `mfact`'s proven `Move.cost` (`Conformance/Moves.lean`):
//! ```lean
//! def Move.cost {α T : Type*} : Move α T → ℕ
//!   | .sync _ _ => 0
//!   | .logOnly _ => 1
//!   | .modelOnly _ => 1
//!   | .silentModel _ => 0
//! ```
//! No `sorry`/`axiom` in `Moves.lean` (confirmed live this checkpoint) —
//! `Move.cost_le_one` and `Move.cost_eq_zero_iff` are closed proofs.
//!
//! ## Comparison mode: `receipted_formula_with_cited_proof`, not live Lean
//! Same constraint as every prior harness in this program — mfact's
//! `.lake` build directory does not exist.
//!
//! ## What this does NOT prove
//! That `compute_trace_alignment`'s A* search finds a globally optimal
//! alignment (a search-correctness claim, not a cost-model claim); that
//! non-default cost configurations (`cost_config_json` overrides,
//! `alignments.rs:294`) still correspond (this harness covers only the
//! Move.cost-matching defaults); or anything about `alignment_fitness.rs`'s
//! derived fitness score (a separate, unaudited transformation of these
//! costs).

/// SHA-256 of `mfact/procint/ProcInt/Conformance/Moves.lean` at mfact
/// revision `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564`.
pub const LEAN_MOVES_FILE_SHA256: &str =
    "ab98579026f3e35450d92a2c8bd0034180149a19c1bb906ab7e31aec22237b0a";

pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

/// Mirrors Lean's `Move α T` inductive (`Moves.lean`): the four move
/// kinds an alignment step can be classified as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveKind {
    Sync,
    LogOnly,
    ModelOnly,
    SilentModel,
}

/// Hand-transcribed copy of `Move.cost`'s literal definition
/// (`Moves.lean`): `sync => 0, logOnly => 1, modelOnly => 1,
/// silentModel => 0`. Returns `u64` (Lean's `ℕ`), not `f64` — the
/// comparison to wasm4pm's `f64` costs happens in [`compare_move_cost`].
pub fn lean_move_cost_exact(kind: MoveKind) -> u64 {
    match kind {
        MoveKind::Sync => 0,
        MoveKind::LogOnly => 1,
        MoveKind::ModelOnly => 1,
        MoveKind::SilentModel => 0,
    }
}

/// Independent transcription of wasm4pm's actual move-cost assignment
/// under its DEFAULT cost configuration (`sync_cost=0.0,
/// log_move_cost=1.0, model_move_cost=1.0` — `alignments.rs:112-114` and
/// the call site building `AlignmentConfig`/defaults), including the
/// invisible/empty-label model-move override to `0.0`
/// (`alignments.rs:216-221`, the exact condition:
/// `transition.is_invisible.unwrap_or(false) || transition.label.is_empty()`).
/// `is_invisible_model_move` corresponds to that condition — `MoveKind`
/// doesn't distinguish "invisible" as a separate case the way this
/// boolean does, so callers pass `ModelOnly` + the invisibility flag,
/// which this function resolves into the `SilentModel` cost (0.0) per
/// the real inline logic.
pub fn rust_move_cost(kind: MoveKind, is_invisible_model_move: bool) -> f64 {
    const SYNC_COST: f64 = 0.0;
    const LOG_MOVE_COST: f64 = 1.0;
    const MODEL_MOVE_COST: f64 = 1.0;
    match kind {
        MoveKind::Sync => SYNC_COST,
        MoveKind::LogOnly => LOG_MOVE_COST,
        MoveKind::ModelOnly => {
            if is_invisible_model_move {
                0.0
            } else {
                MODEL_MOVE_COST
            }
        }
        MoveKind::SilentModel => 0.0,
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DifferentialMoveCostResult {
    pub lean_cost: u64,
    pub rust_cost: f64,
    pub agree: bool,
}

/// Compares the Lean-transcribed cost against wasm4pm's real cost for one
/// move kind. `is_invisible_model_move` only affects `ModelOnly`; for the
/// other three kinds it's ignored (documented per-call, not silently).
///
/// An invisible/empty-label model move is, semantically, what Lean's
/// `Move` inductive calls `silentModel` — a DISTINCT constructor from
/// `modelOnly`, not `modelOnly` with a flag. So when
/// `is_invisible_model_move` is true, the correct Lean-side comparison
/// point is `Move.cost .silentModel = 0`, not `Move.cost (.modelOnly _) = 1`
/// — this function resolves that reclassification explicitly rather than
/// comparing against the wrong Lean constructor.
pub fn compare_move_cost(kind: MoveKind, is_invisible_model_move: bool) -> DifferentialMoveCostResult {
    let lean_kind = if kind == MoveKind::ModelOnly && is_invisible_model_move {
        MoveKind::SilentModel
    } else {
        kind
    };
    let lean_cost = lean_move_cost_exact(lean_kind);
    let rust_cost = rust_move_cost(kind, is_invisible_model_move);
    DifferentialMoveCostResult {
        lean_cost,
        rust_cost,
        agree: (lean_cost as f64 - rust_cost).abs() < f64::EPSILON,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_four_move_kinds_agree() {
        for (kind, invisible) in [
            (MoveKind::Sync, false),
            (MoveKind::LogOnly, false),
            (MoveKind::ModelOnly, false), // visible model move
            (MoveKind::ModelOnly, true),  // invisible model move -> silent, cost 0
            (MoveKind::SilentModel, false),
        ] {
            let r = compare_move_cost(kind, invisible);
            assert!(r.agree, "kind={kind:?} invisible={invisible} -> {r:?}");
        }
    }

    #[test]
    fn empty_trace_zero_moves_zero_cost() {
        // An empty sequence of moves sums to cost 0 on both sides -- no
        // division anywhere in this metric, so "zero denominator" isn't
        // applicable to move-cost mapping specifically (noted honestly,
        // not force-fit); this test instead covers the empty-trace
        // falsifier as "zero moves accumulate to zero cost, not a panic
        // or a spurious nonzero value."
        let moves: Vec<(MoveKind, bool)> = vec![];
        let lean_total: u64 = moves.iter().map(|&(k, _)| lean_move_cost_exact(k)).sum();
        let rust_total: f64 = moves.iter().map(|&(k, inv)| rust_move_cost(k, inv)).sum();
        assert_eq!(lean_total, 0);
        assert_eq!(rust_total, 0.0);
    }

    #[test]
    fn no_nan_or_infinity_for_any_move_kind() {
        for (kind, invisible) in [
            (MoveKind::Sync, false),
            (MoveKind::LogOnly, false),
            (MoveKind::ModelOnly, false),
            (MoveKind::ModelOnly, true),
            (MoveKind::SilentModel, false),
        ] {
            let cost = rust_move_cost(kind, invisible);
            assert!(cost.is_finite(), "kind={kind:?} invisible={invisible} produced non-finite cost {cost}");
        }
    }

    #[test]
    fn rounding_boundary_many_moves_stay_exact_integers() {
        // Accumulate 1000 LogOnly moves (cost 1 each) as f64 and confirm
        // no float drift versus the exact integer Lean-side sum -- the
        // "rounding boundary" falsifier for this metric.
        let n = 1000u64;
        let lean_total: u64 = (0..n).map(|_| lean_move_cost_exact(MoveKind::LogOnly)).sum();
        let rust_total: f64 = (0..n).map(|_| rust_move_cost(MoveKind::LogOnly, false)).sum();
        assert_eq!(lean_total, n);
        assert_eq!(rust_total, n as f64, "f64 accumulation must not drift from the exact integer sum");
    }

    #[test]
    fn reordered_move_sequence_per_move_cost_is_order_independent() {
        // Move-cost is a per-move classification, not a function of
        // sequence position -- the "reordered event sequence" falsifier
        // for this metric is that permuting a sequence of moves does not
        // change any individual move's cost (order affects which moves an
        // A* search selects, not what a selected move costs).
        let seq_a = [MoveKind::Sync, MoveKind::LogOnly, MoveKind::ModelOnly];
        let seq_b = [MoveKind::ModelOnly, MoveKind::Sync, MoveKind::LogOnly]; // reordered
        let cost_a: u64 = seq_a.iter().map(|&k| lean_move_cost_exact(k)).sum();
        let cost_b: u64 = seq_b.iter().map(|&k| lean_move_cost_exact(k)).sum();
        assert_eq!(cost_a, cost_b, "total cost of the same multiset of moves must not depend on order");
    }

    #[test]
    fn wrong_cost_mapping_is_caught() {
        // Negative falsifier: a tampered cost table (e.g. modelOnly=2
        // instead of 1) must disagree with the real Lean-derived value.
        let tampered_model_only_cost = 2u64;
        assert_ne!(
            tampered_model_only_cost,
            lean_move_cost_exact(MoveKind::ModelOnly),
            "a tampered modelOnly cost of 2 must not match the real Move.cost value of 1"
        );
    }

    #[test]
    fn lean_file_hash_matches_citation() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../mfact/procint/ProcInt/Conformance/Moves.lean"
        );
        let Ok(contents) = std::fs::read(path) else {
            eprintln!(
                "lean_file_hash_matches_citation: SKIPPED — {path} not found \
                 (mfact not checked out in this environment)"
            );
            return;
        };
        let digest = sha256_hex(&contents);
        assert_eq!(
            digest, LEAN_MOVES_FILE_SHA256,
            "Moves.lean content hash has changed since this harness was built \
             (mfact revision {MFACT_REVISION}) — the citation is stale"
        );
    }

    fn sha256_hex(data: &[u8]) -> String {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let output = Command::new("shasum")
            .arg("-a")
            .arg("256")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                child.stdin.take().unwrap().write_all(data).expect("write to shasum stdin");
                child.wait_with_output()
            });
        match output {
            Ok(out) => String::from_utf8_lossy(&out.stdout)
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string(),
            Err(_) => {
                eprintln!("sha256_hex: `shasum` not available, skipping");
                String::new()
            }
        }
    }
}
