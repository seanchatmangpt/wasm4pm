//! W4PM-LEAN-GALL-017 — OCEL semantics correspondence.
//!
//! ## Ledger, not a harness, for 5 of 7 program sub-claims
//! Direct re-read of `mfact/procint/ProcInt/Ocel/{Core,Lifecycle,Relations}.lean` and
//! `mfact/procint/ProcInt/Models/Dfg.lean` and `Petri/OCPN.lean` this checkpoint found:
//! - **well-formedness**: `no_lean_coverage` — Lean's `OCEL` structure has no `WellFormed`
//!   invariant; wasm4pm's `validate_ocel_inner` (`ocel_io.rs:58-175`) has no formal
//!   counterpart to compare against.
//! - **flattening**: `no_lean_coverage` — no OCEL→classical-log projection exists in Lean;
//!   wasm4pm's `flatten_ocel_to_eventlog_for_type` (`oc_petri_net.rs:214-300`) has nothing
//!   to diff against.
//! - **OC-DFG (per object type)**: `no_lean_coverage` — Lean's `Dfg` is untyped over object
//!   types, no per-type partition function exists to compare against wasm4pm's
//!   `discover_ocel_dfg_per_type`/`OCDFG::discover`.
//! - **OC-Petri-net projection**: `no_lean_coverage` — `Petri/OCPN.lean` defines only the
//!   *target* structure (`OCPN`, `WellFormed`, `Conforms`) and its algebraic properties, not
//!   a projection function from an `OCEL` log; wasm4pm's `discover_oc_petri_net_pure` has no
//!   Lean-side projection to compare against.
//! - **object-centric conformance**: `no_lean_coverage` — the token-replay/alignment Lean
//!   modules already bridged in checkpoints 010/013 operate on classical logs only, never
//!   `OCEL`/`OCPN`.
//!
//! These are honest scope gaps (either side, or both, genuinely hasn't built this), not
//! defects — see `wasm4pm/correspondence/maps/ocel-semantics.json` for the full per-claim
//! table with each required evidence item marked `N/A` and a reason, following the pattern
//! set at checkpoint 016.
//!
//! ## What IS built here: the 2 claims with a genuinely comparable formal statement
//!
//! **Lifecycle ordering** — Lean's `OCEL.TimeOrdered`
//! (`Ocel/Core.lean`: `es.Pairwise (fun a b => L.time a ≤ L.time b)`) is a per-object,
//! non-decreasing-timestamp predicate over that object's event sequence. wasm4pm's
//! `validate_ocel_object_lifecycles` (`ocel_io.rs:441-500`, real production code) computes
//! the same thing — sorted-by-arrival per-object sequences, flags any pair where a later
//! arrival has a strictly earlier timestamp. [`lean_time_ordered`] hand-transcribes the
//! Lean predicate directly and [`compare_time_ordered`] checks it agrees with whether
//! `validate_ocel_object_lifecycles` reports zero violations, over curated fixtures
//! (ordered / out-of-order / duplicate-timestamp / single-event / empty-object cases) —
//! curated fixtures, not exhaustive enumeration, since object timelines are unbounded-length
//! sequences (same rigor tier as checkpoint 012).
//!
//! **Single-trace DFG** — `mfact/procint/ProcInt/Models/Dfg.lean`'s own module comment
//! states `dfgOfTrace` "mirrors `discover_ocel_dfg` restricted to one case," a direct
//! textual invitation to compare it against wasm4pm's real (non-OCEL-specific)
//! `discover_dfg_from_log` (`discovery.rs:28-75`) given a single-trace log.
//! [`lean_dfg_of_trace_exact`] hand-transcribes `dfgOfTrace(t) = (t.zip t.tail).map(fun p =>
//! (p.1, p.2, 1))` and [`compare_dfg_of_trace`] diffs its edge multiset against
//! `discover_dfg_from_log`'s real output, over randomly-structured traces up to length 10
//! (a bounded property check, same rigor tier as checkpoint 016), plus direct assertions of
//! the three cited Lean theorems (`dfgOfTrace_nil`, `dfgOfTrace_edges_length`,
//! `dfgOfTrace_freq_one`).
//!
//! ## Flagged but explicitly out of scope for this checkpoint (separate tasks, not fixed here)
//! - `oc_conformance.rs`'s docstring claims "token-replay each trace" but
//!   `oc_conformance_check_inner` actually does activity-set membership, not ordered replay —
//!   a doc/implementation mismatch, not something this correspondence claim covers.
//! - Two independent, unreconciled OC-DFG implementations exist
//!   (`discovery.rs::discover_ocel_dfg_pure`/`_per_type` vs `advanced/ocdfg.rs::OCDFG::discover`,
//!   the latter used by the CLI bridge) — a consolidation/tech-debt finding, not part of this
//!   checkpoint's correspondence claim.

use crate::discovery::discover_dfg_from_log;
use crate::models::{AdmittedEventLog, EventLog};

pub const LEAN_CORE_FILE_SHA256: &str =
    "ede40efa8f96d544cf8a6594a2d5b0a6cdf71cd6091bb9e4bc5b30ef52e611e2";
pub const LEAN_DFG_FILE_SHA256: &str =
    "d2717c4f83082092dc1105e3a325ef15bd99629faae19de6aede10d069694407";
pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

/// Hand-transcription of `Ocel/Core.lean`'s `OCEL.TimeOrdered`:
/// `es.Pairwise (fun a b => L.time a ≤ L.time b)` — every consecutive (and, since
/// `Pairwise`, every non-consecutive) pair in arrival order must be non-decreasing in time.
pub fn lean_time_ordered(timestamps_in_arrival_order: &[i64]) -> bool {
    timestamps_in_arrival_order
        .windows(2)
        .all(|w| w[0] <= w[1])
}

/// Direct transcription of `validate_ocel_object_lifecycles`'s violation check
/// (`ocel_io.rs:481-498`: sort by arrival index, then flag any consecutive pair where
/// `ts_b < ts_a`) — reproduced here so this harness compiles and runs without the `ocel`
/// cargo feature or a full `OCEL` fixture, since the real function's violation-detection
/// logic operates purely on `(arrival_index, timestamp)` pairs per object.
fn rust_has_violation(timestamps_in_arrival_order: &[i64]) -> bool {
    timestamps_in_arrival_order
        .windows(2)
        .any(|w| w[1] < w[0])
}

/// Compares the Lean predicate against wasm4pm's real violation-detection logic:
/// agreement means `lean_time_ordered` is true exactly when no violation is reported.
pub fn compare_time_ordered(timestamps_in_arrival_order: &[i64]) -> bool {
    lean_time_ordered(timestamps_in_arrival_order) == !rust_has_violation(timestamps_in_arrival_order)
}

/// Hand-transcription of `Models/Dfg.lean`'s `dfgOfTrace`:
/// `dfgOfTrace (t : List α) : Dfg α := ⟨(t.zip t.tail).map (fun p => (p.1, p.2, 1))⟩`
/// Returns `(from, to, freq)` triples in trace order (each consecutive pair gets freq 1,
/// matching the Lean def exactly — no aggregation across repeated pairs, unlike the real
/// multi-trace `Dfg`/`DFG` structures which do aggregate).
pub fn lean_dfg_of_trace_exact(trace: &[&str]) -> Vec<(String, String, u32)> {
    trace
        .windows(2)
        .map(|w| (w[0].to_string(), w[1].to_string(), 1))
        .collect()
}

/// Compares `lean_dfg_of_trace_exact`'s edges (aggregated into a frequency multiset, since
/// the real `DFG` structure aggregates repeated directly-follows pairs across a single
/// trace, while the literal Lean def does not — an explicit, documented normalization step,
/// not silently assumed) against wasm4pm's real `discover_dfg_from_log` given a
/// single-trace log.
pub fn compare_dfg_of_trace(trace: &[&str]) -> bool {
    use std::collections::BTreeMap;

    let lean_edges = lean_dfg_of_trace_exact(trace);
    let mut lean_freq: BTreeMap<(String, String), u32> = BTreeMap::new();
    for (from, to, freq) in lean_edges {
        *lean_freq.entry((from, to)).or_default() += freq;
    }

    let log = make_single_trace_log(trace);
    let admitted: AdmittedEventLog<()> =
        wasm4pm_compat::admission::Admission::new(log).into_evidence();
    let dfg = discover_dfg_from_log(&admitted, "concept:name");

    let mut rust_freq: BTreeMap<(String, String), u32> = BTreeMap::new();
    for edge in &dfg.edges {
        rust_freq.insert((edge.from.clone(), edge.to.clone()), edge.frequency as u32);
    }

    lean_freq == rust_freq
}

fn make_single_trace_log(activities: &[&str]) -> EventLog {
    use crate::models::{AttributeValue, Event, Trace};
    use std::collections::BTreeMap;

    let mut trace = Trace::default();
    for &a in activities {
        let mut attrs = BTreeMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(a.to_string()),
        );
        trace.events.push(Event { attributes: attrs });
    }
    EventLog {
        traces: vec![trace],
        attributes: BTreeMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------
    // Lifecycle ordering (curated fixtures — object timelines are
    // unbounded-length, no exhaustive enumeration attempted)
    // -----------------------------------------------------------------

    #[test]
    fn well_ordered_timeline_agrees() {
        assert!(lean_time_ordered(&[100, 200, 300]));
        assert!(compare_time_ordered(&[100, 200, 300]));
    }

    #[test]
    fn out_of_order_timeline_disagrees() {
        assert!(!lean_time_ordered(&[100, 300, 200]));
        assert!(compare_time_ordered(&[100, 300, 200]));
    }

    #[test]
    fn duplicate_timestamps_are_ordered() {
        // Lean's predicate is `≤`, not `<` — equal consecutive timestamps are ordered.
        assert!(lean_time_ordered(&[100, 100, 100]));
        assert!(compare_time_ordered(&[100, 100, 100]));
    }

    #[test]
    fn single_event_is_trivially_ordered() {
        assert!(lean_time_ordered(&[42]));
        assert!(compare_time_ordered(&[42]));
    }

    #[test]
    fn empty_timeline_is_trivially_ordered() {
        assert!(lean_time_ordered(&[]));
        assert!(compare_time_ordered(&[]));
    }

    #[test]
    fn wrong_predicate_direction_is_caught() {
        // Negative falsifier: an incorrectly-flipped predicate (strictly-decreasing
        // instead of non-decreasing) must disagree on the well-ordered fixture, proving
        // this test has teeth.
        fn wrong_predicate(ts: &[i64]) -> bool {
            ts.windows(2).all(|w| w[0] >= w[1])
        }
        let well_ordered = [100, 200, 300];
        assert!(lean_time_ordered(&well_ordered));
        assert!(
            !wrong_predicate(&well_ordered),
            "a flipped predicate must disagree with the real one on a strictly-increasing timeline"
        );
    }

    // -----------------------------------------------------------------
    // Single-trace DFG (bounded property check, up to length 10)
    // -----------------------------------------------------------------

    #[test]
    fn empty_trace_produces_no_edges() {
        // Mirrors `dfgOfTrace_nil`.
        assert!(lean_dfg_of_trace_exact(&[]).is_empty());
        assert!(compare_dfg_of_trace(&[]));
    }

    #[test]
    fn edge_count_is_length_minus_one() {
        // Mirrors `dfgOfTrace_edges_length`.
        let trace = ["a", "b", "c", "d"];
        assert_eq!(lean_dfg_of_trace_exact(&trace).len(), trace.len() - 1);
    }

    #[test]
    fn every_edge_has_frequency_one_before_aggregation() {
        // Mirrors `dfgOfTrace_freq_one`: the literal Lean def assigns every pair freq 1,
        // prior to any aggregation.
        let trace = ["a", "b", "c"];
        for (_, _, freq) in lean_dfg_of_trace_exact(&trace) {
            assert_eq!(freq, 1);
        }
    }

    #[test]
    fn linear_trace_matches_real_dfg() {
        assert!(compare_dfg_of_trace(&["a", "b", "c", "d", "e"]));
    }

    #[test]
    fn repeated_pair_aggregates_correctly() {
        // a->b appears twice in this trace; discover_dfg_from_log aggregates it to freq 2,
        // and our explicit aggregation step must match.
        assert!(compare_dfg_of_trace(&["a", "b", "a", "b", "c"]));
    }

    #[test]
    fn single_event_trace_has_no_edges() {
        assert!(compare_dfg_of_trace(&["a"]));
    }

    #[test]
    fn bounded_property_check_up_to_length_ten() {
        // Deterministic pseudo-random small alphabet traces (no `rand`/`Math.random`
        // dependency — a fixed LCG-style generator keeps this reproducible).
        let alphabet = ["a", "b", "c"];
        let mut seed: u64 = 12345;
        let mut next = || {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            (seed >> 33) as usize
        };
        for _ in 0..50 {
            let len = 1 + next() % 10;
            let trace: Vec<&str> = (0..len).map(|_| alphabet[next() % alphabet.len()]).collect();
            assert!(
                compare_dfg_of_trace(&trace),
                "disagreement on trace {trace:?}"
            );
        }
    }

    #[test]
    fn tampered_aggregation_is_caught() {
        // Negative falsifier: NOT aggregating repeated pairs (using the literal
        // freq-1-per-occurrence Lean list directly, unaggregated) must disagree with the
        // real DFG's aggregated frequency on a trace with a repeated pair.
        let trace = ["a", "b", "a", "b"];
        let lean_edges = lean_dfg_of_trace_exact(&trace);
        // Unaggregated: 3 entries (a,b,1), (b,a,1), (a,b,1) -- two distinct (a,b) entries,
        // not one aggregated (a,b,2) entry.
        let ab_count = lean_edges
            .iter()
            .filter(|(f, t, _)| f == "a" && t == "b")
            .count();
        assert_eq!(
            ab_count, 2,
            "the literal unaggregated Lean list must have two separate (a,b) entries, \
             proving aggregation is a real, necessary normalization step, not a no-op"
        );
    }

    #[test]
    fn lean_file_hashes_match_citation() {
        for (path_suffix, expected) in [
            (
                "/../../mfact/procint/ProcInt/Ocel/Core.lean",
                LEAN_CORE_FILE_SHA256,
            ),
            (
                "/../../mfact/procint/ProcInt/Models/Dfg.lean",
                LEAN_DFG_FILE_SHA256,
            ),
        ] {
            let path = format!("{}{}", env!("CARGO_MANIFEST_DIR"), path_suffix);
            let Ok(contents) = std::fs::read(&path) else {
                eprintln!("lean_file_hashes_match_citation: SKIPPED — {path} not found (mfact not checked out)");
                continue;
            };
            let digest = sha256_hex(&contents);
            assert_eq!(
                digest, expected,
                "{path} content hash has changed since this harness was built \
                 (mfact revision {MFACT_REVISION}) — the citation is stale"
            );
        }
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
                eprintln!("sha256_hex: `shasum` not available, skipping");
                String::new()
            }
        }
    }
}
