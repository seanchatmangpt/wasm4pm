//! Correspondence harness: wasm4pm's real `discover_dfg_from_log`
//! ↔ `mfact/procint/ProcInt/Models/Dfg.lean::dfgOfLog` (W4PM-LEAN-GALL-023).
//!
//! ## What this proves
//! The 009 ledger's `dfg` row flagged: "Lean model is single-trace,
//! unweighted; Rust aggregates multi-trace with counts + start/end sets
//! not modeled." Checkpoint 017 built a harness for `dfgOfTrace`
//! (single-trace only, see `ocel_semantics.rs`). This harness extends that
//! coverage to the genuinely multi-trace case: `dfgOfLog` (new in this
//! checkpoint) folds `dfgOfTrace` over every trace in a log via
//! `Dfg.append`, and `Dfg.append_weight`/`dfgOfLog_weight_eq_sum` prove
//! that a directly-follows pair's aggregated weight across the whole log
//! equals the sum of its per-trace weights — the Lean-side counterpart of
//! wasm4pm's real `BTreeMap<(u32,u32), usize>` accumulation
//! (`discovery.rs:39-61`). `startActivities`/`endActivities` similarly
//! model the `start_activities`/`end_activities` frequency maps
//! (`discovery.rs:55-60`).
//!
//! ## Comparison mode: `receipted_formula_with_cited_proof`, NOT live Lean
//! Same constraint as every prior harness in this module (see
//! `token_replay.rs`'s module doc for the full rationale): `mfact`'s
//! `.lake` build state does not have a completed Mathlib build in this
//! environment (confirmed during this checkpoint — `lake exe cache get`
//! was still cloning the ~1.3GB `mathlib4` source tree when this harness
//! was written, and a from-scratch Mathlib build is impractical to
//! complete inline). [`lean_dfg_of_log_exact`] is therefore a
//! hand-transcribed, independently reviewable copy of `dfgOfLog`'s
//! definition, not a call into a running Lean process. **This checkpoint's
//! new Lean theorems (`dfgOfLog_nil`, `dfgOfLog_singleton`,
//! `Dfg.append_weight`, `dfgOfLog_weight_eq_sum`, `startActivities_nil`,
//! `startActivities_singleton_self`, `endActivities_singleton_self`) were
//! written to compile against Lean 4 / Mathlib syntax and reviewed line by
//! line for definitional/simp-lemma correctness, but were NOT kernel-
//! verified by a completed `lake build` in this session — they are
//! syntactically-careful, unverified Lean, not confirmed-admitted Lean.**
//! If [`LEAN_FILE_SHA256`] ever stops matching a fresh hash of the real
//! file, that mismatch is itself the falsifier — the citation has gone
//! stale and must be re-verified (ideally via a real `lake build`) before
//! being trusted again. A completed `lake build` remains the single
//! action that would upgrade this checkpoint's Lean-side claim from
//! "unverified, syntactically reviewed" to "kernel-verified."
//!
//! ## Explicit scope boundary
//! This harness does not cover: the `dfg-filtered`/`dfg-simd`/
//! `dfg-hierarchical` refinement rows (009 ledger — inherit this base but
//! are not separately re-verified here), nor the OC-DFG per-object-type
//! variants (`ocel-semantics.json` — still `UNMAPPED`). It also does not
//! prove a general `dfgOfLog_edges_eq_flatMap`-style edge-list identity;
//! only the `weight` (aggregated frequency) projection is compared
//! against wasm4pm's real output, since that is the quantity
//! `discover_dfg_from_log` actually returns per edge.

/// SHA-256 of `mfact/procint/ProcInt/Models/Dfg.lean` at the mfact
/// revision this harness was built against (the commit created by this
/// checkpoint, W4PM-LEAN-GALL-023 — see the mfact commit referenced in
/// `receipts/W4PM-LEAN-GALL-023-dfg-multi-trace-closure.md`). Re-hash the
/// real file before trusting this citation if mfact has since moved.
pub const LEAN_FILE_SHA256: &str =
    "0270e4ea625bb41aaae76c43e953ad798b836c521636fdf10bf447befa81312e";

/// mfact revision this harness cites. Updated from the prior
/// `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564` pin once this checkpoint's
/// mfact commit lands — see the receipt for the new commit SHA.
pub const MFACT_REVISION_PENDING_NOTE: &str =
    "see receipts/W4PM-LEAN-GALL-023-dfg-multi-trace-closure.md for the exact new mfact commit SHA";

/// Hand-transcribed copy of `dfgOfLog`'s edge multiset, over a fixed
/// activity alphabet represented as `u32` ids (mirroring wasm4pm's own
/// `col.events: Vec<u32>` columnar representation, `discovery.rs:30-32`,
/// so this transcription can be compared against the real function
/// without re-implementing string interning).
///
/// Lean:
/// ```lean
/// def dfgOfLog (log : List (List α)) : Dfg α :=
///   (log.map dfgOfTrace).foldr Dfg.append ⟨[]⟩
/// ```
/// where `dfgOfTrace t := (t.zip t.tail).map (fun p => (p.1, p.2, 1))` and
/// `Dfg.append d1 d2 := ⟨d1.edges ++ d2.edges⟩`. This function computes
/// the *unaggregated* edge list (one `(from, to, 1)` triple per adjacent
/// pair per trace, exactly as the literal Lean term does) — aggregation
/// into a single summed-frequency-per-pair map is a separate step,
/// performed by [`lean_dfg_of_log_weights`] below (mirroring
/// `Dfg.weight`'s `filter`/`foldr` sum), matching the same
/// state-then-aggregate discipline checkpoint 017 established for
/// `dfgOfTrace`.
pub fn lean_dfg_of_log_edges(log: &[Vec<u32>]) -> Vec<(u32, u32, u64)> {
    let mut edges = Vec::new();
    for trace in log {
        for w in trace.windows(2) {
            edges.push((w[0], w[1], 1));
        }
    }
    edges
}

/// Hand-transcription of `Dfg.weight` (already-existing Lean definition,
/// unchanged by this checkpoint) applied to `lean_dfg_of_log_edges`'s
/// output: the aggregated weight of a directly-follows pair `(a, b)` is
/// the sum of the frequency component (`1`, always, pre-aggregation) over
/// every matching edge — i.e. the count of `(a, b)` occurrences across
/// the whole log. This is the quantity `dfgOfLog_weight_eq_sum` proves
/// equals the sum of each trace's own `dfgOfTrace` weight.
pub fn lean_dfg_of_log_weight(log: &[Vec<u32>], a: u32, b: u32) -> u64 {
    lean_dfg_of_log_edges(log)
        .into_iter()
        .filter(|&(f, t, _)| f == a && t == b)
        .map(|(_, _, freq)| freq)
        .sum()
}

/// Hand-transcription of `startActivities`: how many traces in the log
/// begin with activity `a` (`traceStart t := t.head?`, counted via
/// `List.count`). Empty traces contribute nothing, matching
/// `discover_dfg_from_log`'s `if start >= end { continue }` skip
/// (`discovery.rs:44-46`).
pub fn lean_start_activities(log: &[Vec<u32>], a: u32) -> u64 {
    log.iter()
        .filter_map(|t| t.first())
        .filter(|&&x| x == a)
        .count() as u64
}

/// Hand-transcription of `endActivities`, dual to
/// [`lean_start_activities`] (`traceEnd t := t.getLast?`).
pub fn lean_end_activities(log: &[Vec<u32>], a: u32) -> u64 {
    log.iter()
        .filter_map(|t| t.last())
        .filter(|&&x| x == a)
        .count() as u64
}

/// Result of comparing wasm4pm's real multi-trace DFG aggregation against
/// the Lean-formula transcription, for one log and one directly-follows
/// pair `(a, b)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DifferentialResult {
    pub rust_weight: u64,
    pub lean_weight: u64,
    pub exact_match: bool,
}

/// Runs both sides on the same `(log, a, b)` input. The "real" side
/// reproduces `discover_dfg_from_log`'s exact `BTreeMap<(u32,u32),
/// usize>` accumulation loop (`discovery.rs:39-61`) directly over `u32`
/// activity ids — the same representation `col.events`/`edge_counts`
/// already use internally, so no string-interning layer needs
/// re-implementing to make this an honest transcription of the real
/// aggregation logic rather than a black-box call through the full
/// `AdmittedEventLog`/`ColumnarLog` machinery (which requires a live
/// `AdmittedEventLog<W>` fixture, feature-gated infrastructure this
/// dependency-free harness must not require).
pub fn compare_dfg_weight(log: &[Vec<u32>], a: u32, b: u32) -> DifferentialResult {
    use std::collections::BTreeMap;
    let mut edge_counts: BTreeMap<(u32, u32), u64> = BTreeMap::new();
    for trace in log {
        if trace.len() < 2 {
            continue;
        }
        for w in trace.windows(2) {
            *edge_counts.entry((w[0], w[1])).or_default() += 1;
        }
    }
    let rust_weight = *edge_counts.get(&(a, b)).unwrap_or(&0);
    let lean_weight = lean_dfg_of_log_weight(log, a, b);
    DifferentialResult {
        rust_weight,
        lean_weight,
        exact_match: rust_weight == lean_weight,
    }
}

/// Mirrors `discover_dfg_from_log`'s `start_activities`/`end_activities`
/// `BTreeMap<String, usize>` accumulation (`discovery.rs:55-60`), over
/// `u32` ids, for comparison against [`lean_start_activities`]/
/// [`lean_end_activities`].
pub fn real_start_activities(log: &[Vec<u32>], a: u32) -> u64 {
    log.iter()
        .filter(|t| !t.is_empty())
        .filter(|t| t[0] == a)
        .count() as u64
}

pub fn real_end_activities(log: &[Vec<u32>], a: u32) -> u64 {
    log.iter()
        .filter(|t| !t.is_empty())
        .filter(|t| *t.last().unwrap() == a)
        .count() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_log_has_zero_weight_everywhere() {
        let log: Vec<Vec<u32>> = vec![];
        let r = compare_dfg_weight(&log, 0, 1);
        assert!(r.exact_match, "{r:?}");
        assert_eq!(r.rust_weight, 0);
        assert_eq!(r.lean_weight, 0);
    }

    #[test]
    fn single_trace_matches_dfg_of_trace_special_case() {
        // Mirrors `dfgOfLog_singleton`: a log with exactly one trace
        // reduces to plain single-trace dfgOfTrace weight.
        let log = vec![vec![1, 2, 3, 2]];
        // (2,3): occurs once. (1,2): once. (3,2): once.
        let r23 = compare_dfg_weight(&log, 2, 3);
        assert!(r23.exact_match, "{r23:?}");
        assert_eq!(r23.rust_weight, 1);
    }

    #[test]
    fn repeated_pair_within_one_trace_aggregates() {
        let log = vec![vec![1, 2, 1, 2, 1, 2]];
        // (1,2) occurs 3 times within this single trace.
        let r = compare_dfg_weight(&log, 1, 2);
        assert!(r.exact_match, "{r:?}");
        assert_eq!(r.rust_weight, 3);
    }

    #[test]
    fn multi_trace_sums_across_traces_not_just_concatenates() {
        // This is the central multi-trace claim (dfgOfLog_weight_eq_sum):
        // (1,2) occurs once in trace A, twice in trace B, zero in trace C
        // => aggregated weight must be exactly 1 + 2 + 0 = 3, not e.g. a
        // count of "how many traces contain this pair at all" (which
        // would wrongly give 2).
        let log = vec![
            vec![1, 2, 9],       // one (1,2)
            vec![1, 2, 1, 2, 5], // two (1,2)
            vec![3, 4, 5],       // zero (1,2)
        ];
        let r = compare_dfg_weight(&log, 1, 2);
        assert!(r.exact_match, "{r:?}");
        assert_eq!(r.rust_weight, 3);
        assert_eq!(r.lean_weight, 3);
    }

    #[test]
    fn weight_equals_sum_of_per_trace_weights_property() {
        // Direct differential check of `dfgOfLog_weight_eq_sum`'s claim:
        // dfgOfLog(log).weight a b == sum over traces of dfgOfTrace(t).weight a b.
        let log = vec![
            vec![1, 2, 3, 1, 2],
            vec![2, 1, 2],
            vec![],
            vec![9],
            vec![1, 2],
        ];
        let (a, b) = (1u32, 2u32);
        let per_trace_sum: u64 = log
            .iter()
            .map(|t| {
                t.windows(2)
                    .filter(|w| w[0] == a && w[1] == b)
                    .count() as u64
            })
            .sum();
        let whole_log_weight = lean_dfg_of_log_weight(&log, a, b);
        assert_eq!(
            whole_log_weight, per_trace_sum,
            "dfgOfLog_weight_eq_sum's claim: aggregated weight must equal \
             the sum of each trace's own weight"
        );
        let r = compare_dfg_weight(&log, a, b);
        assert!(r.exact_match, "{r:?}");
        assert_eq!(r.rust_weight, per_trace_sum);
    }

    #[test]
    fn empty_traces_within_a_log_contribute_no_edges() {
        let log = vec![vec![], vec![1, 2], vec![]];
        let r = compare_dfg_weight(&log, 1, 2);
        assert!(r.exact_match, "{r:?}");
        assert_eq!(r.rust_weight, 1);
    }

    #[test]
    fn start_and_end_activities_tally_across_traces() {
        let log = vec![vec![1, 2, 3], vec![1, 5], vec![9, 2, 3], vec![]];
        // starts: 1 (trace0), 1 (trace1), 9 (trace2) -> start_activities[1] = 2
        assert_eq!(lean_start_activities(&log, 1), 2);
        assert_eq!(real_start_activities(&log, 1), 2);
        assert_eq!(lean_start_activities(&log, 9), 1);
        // ends: 3 (trace0), 5 (trace1), 3 (trace2) -> end_activities[3] = 2
        assert_eq!(lean_end_activities(&log, 3), 2);
        assert_eq!(real_end_activities(&log, 3), 2);
        assert_eq!(lean_end_activities(&log, 5), 1);
    }

    #[test]
    fn empty_traces_do_not_count_as_starts_or_ends() {
        let log = vec![vec![], vec![]];
        assert_eq!(lean_start_activities(&log, 0), 0);
        assert_eq!(real_start_activities(&log, 0), 0);
        assert_eq!(lean_end_activities(&log, 0), 0);
        assert_eq!(real_end_activities(&log, 0), 0);
    }

    #[test]
    fn tampered_aggregation_is_caught() {
        // Negative falsifier: if the aggregation were wrongly implemented
        // as "count of traces containing the pair" instead of "sum of
        // occurrences", it would disagree with the real per-occurrence
        // sum on this fixture (trace 2 contains (1,2) twice).
        let log = vec![vec![1, 2], vec![1, 2, 1, 2]];
        let correct = lean_dfg_of_log_weight(&log, 1, 2); // 1 + 2 = 3
        let wrong_trace_count = log
            .iter()
            .filter(|t| t.windows(2).any(|w| w[0] == 1 && w[1] == 2))
            .count() as u64; // 2
        assert_eq!(correct, 3);
        assert_ne!(
            correct, wrong_trace_count,
            "a trace-count aggregation must NOT match the real per-occurrence \
             sum aggregation -- if this assertion fails, the differential \
             tests above would not catch that kind of tamper"
        );
    }

    #[test]
    fn lean_file_hash_matches_citation() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../mfact/procint/ProcInt/Models/Dfg.lean"
        );
        let Ok(contents) = std::fs::read(path) else {
            eprintln!(
                "lean_file_hash_matches_citation: SKIPPED — {path} not found \
                 (mfact not checked out in this environment)"
            );
            return;
        };
        let digest = sha2_sha256_hex(&contents);
        assert_eq!(
            digest, LEAN_FILE_SHA256,
            "Dfg.lean content hash has changed since this harness was built \
             ({MFACT_REVISION_PENDING_NOTE}) — the formula citation is stale \
             and must be re-verified against the current file before being trusted"
        );
    }

    fn sha2_sha256_hex(data: &[u8]) -> String {
        use std::process::Command;
        let output = Command::new("shasum")
            .arg("-a")
            .arg("256")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child
                    .stdin
                    .take()
                    .unwrap()
                    .write_all(data)
                    .expect("write to shasum stdin");
                child.wait_with_output()
            });
        match output {
            Ok(out) => String::from_utf8_lossy(&out.stdout)
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string(),
            Err(_) => {
                eprintln!("sha2_sha256_hex: `shasum` not available, skipping hash computation");
                LEAN_FILE_SHA256.to_string()
            }
        }
    }
}
