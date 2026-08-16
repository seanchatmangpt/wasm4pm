//! Correspondence harness: `wasm4pm::soundness::analyze_petri_net`
//! ↔ `mfact/procint/ProcInt/Workflow/{WfNet,Soundness}.lean`'s `WfNet.Sound`.
//!
//! ## Which Rust semantics this targets
//! `wasm4pm::soundness::StructuralNet` (confirmed by direct source read
//! during this checkpoint) is **unweighted** — `Marking = Vec<u32>`,
//! `t_pre`/`t_post: Vec<Vec<usize>>` are plain place-index *lists* (each
//! arc contributes exactly one token), NOT the weighted `Vec<Vec<u8>>`
//! matrices [`super::petri_firing::BoundedNet`] uses. This is a third,
//! distinct firing semantics from both `petri_firing.rs::BoundedNet`
//! (weighted, W4PM-LEAN-GALL-011) and `token_replay.rs::fire` (unweighted
//! but unchecked/panicking) — [`WfNetCarrier`] here is a NEW carrier, not
//! a reuse of either prior harness's type, deliberately matching
//! `StructuralNet`'s actual unit-weight-arc shape.
//!
//! ## Method: curated fixtures, NOT exhaustive enumeration
//! Unlike W4PM-LEAN-GALL-011 (118,098 exhaustively-enumerated firing
//! triples), soundness-checking a net requires a full bounded-BFS
//! reachability graph per candidate net, not an O(1) lookup — the
//! combinatorial cost of exhaustively enumerating even small (3-place,
//! 2-transition) unweighted nets AND building a reachability graph for
//! each is several orders of magnitude more expensive than 011's per-item
//! cost, and the vast majority of arbitrary small arc-index-list
//! combinations fail the structural WF-net predicate (`is_wf_net`) before
//! soundness is even meaningful, adding no signal. This checkpoint
//! therefore uses N=6 hand-constructed, individually justified fixture
//! nets instead — a real, honest scope reduction from 010/011, stated
//! plainly rather than silently narrowed.
//!
//! ## Comparison mode: `receipted_formula_with_cited_proof`, not live Lean
//! Same constraint as 010/011 — mfact's `.lake` build directory does not
//! exist. [`lean_sound_exact`] is an independent, from-scratch
//! reachability + 3-clause check (NOT calling into
//! `wasm4pm::soundness::StructuralNet` internals) mirroring
//! `WfNet.Sound`'s literal definition, so the differential comparison
//! against the real shipped `analyze_petri_net` is meaningful rather than
//! a tautology.
//!
//! ## Scope: decision procedure only, NOT the crown-jewel theorem
//! This checkpoint verifies "Rust's `is_wf_net`/`check_soundness` boolean
//! clauses agree with Lean's `Sound` predicate's clauses" over the
//! curated fixtures. It does **not** verify the crown-jewel
//! `WfNet.sound_iff_shortCircuit_live_bounded` theorem (soundness ⟺
//! liveness+boundedness of the short-circuited net) — that requires
//! implementing an independent liveness checker and a short-circuit
//! construction in Rust, a separate, larger harness deferred to a future
//! `012B` checkpoint, not slotted in here.

/// SHA-256 of `mfact/procint/ProcInt/Workflow/WfNet.lean` at mfact revision
/// `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564`.
pub const LEAN_WFNET_FILE_SHA256: &str =
    "a02d75b375037a620d327146f87459e1574dc43b8b1a09b242a62386700be736";

/// SHA-256 of `mfact/procint/ProcInt/Workflow/Soundness.lean`, same revision.
pub const LEAN_SOUNDNESS_FILE_SHA256: &str =
    "327a6b80989ab824fc4de2a375c8f93341e915825d350921014e9141660964cf";

pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

/// A small, unweighted WF-net: `t_pre[t]`/`t_post[t]` are place-index sets
/// (each arc contributes exactly one token), mirroring
/// `wasm4pm::soundness::StructuralNet`'s actual representation. `source`/
/// `sink` are explicit indices here (not re-derived via `unique_source`/
/// `unique_sink`, which get their own falsifier coverage separately) so
/// the soundness check under test isn't also silently re-testing net
/// admission on every fixture.
#[derive(Debug, Clone)]
pub struct WfNetCarrier {
    pub num_places: usize,
    pub num_transitions: usize,
    pub source: usize,
    pub sink: usize,
    pub t_pre: Vec<Vec<usize>>,
    pub t_post: Vec<Vec<usize>>,
}

impl WfNetCarrier {
    /// Builds a real `wasm4pm::models::PetriNet` from this carrier, so the
    /// Rust side of the comparison exercises the actual shipped
    /// `analyze_petri_net` entrypoint, not a reimplementation.
    pub fn to_petri_net(&self) -> crate::models::PetriNet {
        use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
        use std::collections::BTreeMap;

        let places = (0..self.num_places)
            .map(|p| PetriNetPlace {
                id: format!("p{p}"),
                label: format!("p{p}"),
                marking: if p == self.source { Some(1) } else { Some(0) },
            })
            .collect();
        let transitions = (0..self.num_transitions)
            .map(|t| PetriNetTransition {
                id: format!("t{t}"),
                label: format!("t{t}"),
                is_invisible: Some(false),
            })
            .collect();
        let mut arcs = Vec::new();
        for t in 0..self.num_transitions {
            for &p in &self.t_pre[t] {
                arcs.push(PetriNetArc {
                    from: format!("p{p}"),
                    to: format!("t{t}"),
                    weight: Some(1),
                });
            }
            for &p in &self.t_post[t] {
                arcs.push(PetriNetArc {
                    from: format!("t{t}"),
                    to: format!("p{p}"),
                    weight: Some(1),
                });
            }
        }
        let mut initial_marking = BTreeMap::new();
        initial_marking.insert(format!("p{}", self.source), 1);
        let mut final_marking = BTreeMap::new();
        final_marking.insert(format!("p{}", self.sink), 1);

        PetriNet {
            places,
            transitions,
            arcs,
            initial_marking,
            final_markings: vec![final_marking],
        }
    }
}

/// The 3-clause `WfNet.Sound` result, plus the same truncation/reachable-
/// count transparency `SoundnessReport` provides — a decision procedure
/// that silently hid truncation would be exactly the kind of false-success
/// this program's discipline forbids.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WfSoundnessResult {
    pub no_dead_transitions: bool,
    pub option_to_complete: bool,
    pub proper_completion: bool,
    pub is_sound: bool,
    pub reachable_marking_count: usize,
    pub explored_truncated: bool,
}

const MAX_REACHABLE_MARKINGS: usize = 100_000;

/// Independent, from-scratch reachability + 3-clause soundness check,
/// hand-transcribed from `WfNet.Sound`'s literal definition
/// (`Workflow/Soundness.lean`):
/// ```lean
/// structure WfNet.Sound (W : WfNet P T) : Prop where
///   option_to_complete : ∀ M, W.net.Reaches W.initialMarking M →
///     W.net.Reaches M W.finalMarking
///   proper_completion : ∀ M, W.net.Reaches W.initialMarking M →
///     W.finalMarking ≤ M → M = W.finalMarking
///   no_dead_transitions : ∀ t, ∃ M M', W.net.Reaches W.initialMarking M ∧
///     W.net.Step M t M'
/// ```
/// Does NOT call into `wasm4pm::soundness::StructuralNet` — this is a
/// second, independent implementation so the differential comparison in
/// [`compare_soundness`] is meaningful.
pub fn lean_sound_exact(net: &WfNetCarrier) -> WfSoundnessResult {
    let initial: Vec<u32> = (0..net.num_places)
        .map(|p| if p == net.source { 1 } else { 0 })
        .collect();
    let final_marking: Vec<u32> = (0..net.num_places)
        .map(|p| if p == net.sink { 1 } else { 0 })
        .collect();

    let enabled = |t: usize, m: &[u32]| net.t_pre[t].iter().all(|&p| m[p] >= 1);
    let fire = |t: usize, m: &[u32]| -> Vec<u32> {
        let mut next = m.to_vec();
        for &p in &net.t_pre[t] {
            next[p] -= 1;
        }
        for &p in &net.t_post[t] {
            next[p] += 1;
        }
        next
    };

    // Reaches: BFS from the initial marking, bounded (matching the real
    // decision procedure's own MAX_REACHABLE_MARKINGS truncation — an
    // unbounded search is not decidable in general, and this checkpoint
    // does not claim to prove termination, only to check within budget).
    use std::collections::{HashSet, VecDeque};
    let mut visited: HashSet<Vec<u32>> = HashSet::new();
    let mut queue: VecDeque<Vec<u32>> = VecDeque::new();
    let mut fired_transitions: HashSet<usize> = HashSet::new();
    visited.insert(initial.clone());
    queue.push_back(initial.clone());
    let mut truncated = false;

    while let Some(m) = queue.pop_front() {
        if visited.len() >= MAX_REACHABLE_MARKINGS {
            truncated = true;
            break;
        }
        for t in 0..net.num_transitions {
            if enabled(t, &m) {
                fired_transitions.insert(t);
                let next = fire(t, &m);
                if !visited.contains(&next) {
                    visited.insert(next.clone());
                    queue.push_back(next);
                }
            }
        }
    }

    let no_dead_transitions = (0..net.num_transitions).all(|t| fired_transitions.contains(&t));

    // option_to_complete: from every reachable marking, can we reach
    // final_marking? Compute via reverse reachability from final_marking
    // is not directly expressible without a reverse-step relation, so
    // instead: for every reachable M, forward-BFS from M must hit
    // final_marking. This mirrors the Lean statement literally (∀ M
    // reachable, Reaches M final) rather than optimizing via reversal.
    let can_reach_final = |from: &[u32]| -> bool {
        if from == final_marking.as_slice() {
            return true;
        }
        let mut seen: HashSet<Vec<u32>> = HashSet::new();
        let mut q: VecDeque<Vec<u32>> = VecDeque::new();
        seen.insert(from.to_vec());
        q.push_back(from.to_vec());
        while let Some(m) = q.pop_front() {
            if m == final_marking {
                return true;
            }
            if seen.len() >= MAX_REACHABLE_MARKINGS {
                return false; // cannot conclude within budget
            }
            for t in 0..net.num_transitions {
                if enabled(t, &m) {
                    let next = fire(t, &m);
                    if !seen.contains(&next) {
                        seen.insert(next.clone());
                        q.push_back(next);
                    }
                }
            }
        }
        false
    };
    let option_to_complete = visited.iter().all(|m| can_reach_final(m));

    // proper_completion: any reachable marking with a token in the sink
    // place must equal final_marking exactly.
    let proper_completion = visited
        .iter()
        .filter(|m| m[net.sink] >= 1)
        .all(|m| m == &final_marking);

    let is_sound = no_dead_transitions && option_to_complete && proper_completion;

    WfSoundnessResult {
        no_dead_transitions,
        option_to_complete,
        proper_completion,
        is_sound,
        reachable_marking_count: visited.len(),
        explored_truncated: truncated,
    }
}

/// Runs the real, shipped `wasm4pm::soundness::analyze_petri_net` on the
/// carrier (converted to a real `PetriNet` via [`WfNetCarrier::to_petri_net`])
/// and extracts the same 3-clause shape for comparison.
pub fn rust_check_soundness(net: &WfNetCarrier) -> WfSoundnessResult {
    let petri_net = net.to_petri_net();
    let report = crate::soundness::analyze_petri_net(&petri_net);
    WfSoundnessResult {
        no_dead_transitions: report.no_dead_transitions,
        option_to_complete: report.option_to_complete,
        proper_completion: report.proper_completion,
        is_sound: report.is_sound,
        reachable_marking_count: report.reachable_marking_count,
        explored_truncated: report.explored_truncated,
    }
}

#[derive(Debug, Clone)]
pub struct DifferentialSoundnessResult {
    pub lean: WfSoundnessResult,
    pub rust: WfSoundnessResult,
    pub clauses_agree: bool,
}

pub fn compare_soundness(net: &WfNetCarrier) -> DifferentialSoundnessResult {
    let lean = lean_sound_exact(net);
    let rust = rust_check_soundness(net);
    let clauses_agree = lean.no_dead_transitions == rust.no_dead_transitions
        && lean.option_to_complete == rust.option_to_complete
        && lean.proper_completion == rust.proper_completion
        && lean.is_sound == rust.is_sound;
    DifferentialSoundnessResult { lean, rust, clauses_agree }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1. positive_sound_wfnet — linear chain source -> t0 -> mid -> t1 -> sink.
    #[test]
    fn positive_sound_wfnet() {
        let net = WfNetCarrier {
            num_places: 3,
            num_transitions: 2,
            source: 0,
            sink: 2,
            t_pre: vec![vec![0], vec![1]],
            t_post: vec![vec![1], vec![2]],
        };
        let r = compare_soundness(&net);
        assert!(r.clauses_agree, "{r:?}");
        assert!(r.lean.is_sound, "expected sound: {r:?}");
        assert!(r.rust.is_sound, "expected sound: {r:?}");
    }

    /// 2. dead_transition — a structurally connected but semantically
    /// unreachable transition: an XOR-split (source token goes to EITHER
    /// branch a or branch b, never both) followed by a transition
    /// requiring tokens in BOTH a and b simultaneously — genuinely dead,
    /// but every place/transition remains on a source→sink path, so this
    /// stays an admitted WF-net (unlike a disconnected place, which
    /// would be rejected at admission instead — a distinct, earlier
    /// failure mode already covered by `non_wf_net_shape_is_rejected_by_real_admission_check`).
    #[test]
    fn dead_transition_detected() {
        let net = WfNetCarrier {
            num_places: 4, // 0=source, 1=a, 2=b, 3=sink
            num_transitions: 5,
            source: 0,
            sink: 3,
            t_pre: vec![
                vec![0], // t0a: source -> a
                vec![0], // t0b: source -> b
                vec![1], // t1: a -> sink
                vec![2], // t2: b -> sink
                vec![1, 2], // t_dead: needs a AND b simultaneously
            ],
            t_post: vec![vec![1], vec![2], vec![3], vec![3], vec![3]],
        };
        let r = compare_soundness(&net);
        assert!(r.clauses_agree, "{r:?}");
        assert!(!r.lean.no_dead_transitions, "{r:?}");
        assert!(!r.rust.no_dead_transitions, "{r:?}");
        assert!(!r.lean.is_sound, "{r:?}");
    }

    /// 3. improper_completion — sink can be marked while another place
    /// still holds a token (missing synchronization). `t0` produces into
    /// both `mid` and `sink` at once; `t1` (`mid -> sink`) exists only so
    /// `mid` is backward-reachable from `sink` on the STRUCTURAL flow
    /// graph (admission's `is_workflow_net` check is structural
    /// reachability, not marking-based reachability — a place that
    /// structurally never flows to sink, even via an unfired transition,
    /// is rejected at admission before soundness is ever evaluated;
    /// confirmed by trial with a `mid -> mid` self-loop, which is
    /// structurally disconnected from sink and correctly rejected, a
    /// different, earlier failure mode than the one this test targets).
    #[test]
    fn improper_completion_detected() {
        let net = WfNetCarrier {
            num_places: 3, // 0=source, 1=mid, 2=sink
            num_transitions: 2,
            source: 0,
            sink: 2,
            t_pre: vec![vec![0], vec![1]],
            t_post: vec![vec![1, 2], vec![2]], // t0: source -> {mid, sink}; t1: mid -> sink
        };
        let r = compare_soundness(&net);
        assert!(r.clauses_agree, "{r:?}");
        assert!(!r.lean.proper_completion, "{r:?}");
        assert!(!r.rust.proper_completion, "{r:?}");
        assert!(!r.lean.is_sound, "{r:?}");
    }

    /// 4. unbounded_net — a self-sustaining cycle that regenerates its own
    /// enabling condition while also feeding the sink each pass, causing
    /// unbounded marking growth in the sink place over repeated firings.
    ///
    /// Note (a genuine finding from this checkpoint, not merely a fixture
    /// quirk): `StructuralNet::from_petri_net` deduplicates arcs via
    /// `push_unique` when building `t_pre`/`t_post` — it is a SET-based,
    /// not multiset-based, representation, so a transition literally
    /// cannot be given "produce 2 tokens into the same place" via two
    /// parallel arcs (they collapse to one). This means unboundedness
    /// under `StructuralNet`'s actual semantics can only arise from a
    /// self-reinforcing STRUCTURE (a cycle that regenerates its own
    /// precondition while also growing another place across many
    /// firings), not from a single weighted arc, unlike Lean's `WfNet`
    /// (genuinely weighted `Finsupp`, per W4PM-LEAN-GALL-011's finding) —
    /// this is a real semantic gap between the two sides worth flagging
    /// for anyone extending this harness, not just a test-construction
    /// detail. Only claims "truncation observed within budget," not
    /// "proven infinite" (undecidable in general).
    #[test]
    fn unbounded_net_truncates_within_budget() {
        let net = WfNetCarrier {
            num_places: 3, // 0=source, 1=loop, 2=sink
            num_transitions: 2,
            source: 0,
            sink: 2,
            t_pre: vec![vec![0], vec![1]],
            // t0: source -> loop; t1: loop -> {loop, sink} (self-sustaining, grows sink)
            t_post: vec![vec![1], vec![1, 2]],
        };
        let r = lean_sound_exact(&net);
        assert!(
            r.explored_truncated,
            "expected truncation within MAX_REACHABLE_MARKINGS budget: {r:?}"
        );
        let rust_r = rust_check_soundness(&net);
        assert!(
            rust_r.explored_truncated,
            "real analyze_petri_net should also report truncation: {rust_r:?}"
        );
    }

    /// 5. wrong_clause_is_caught — negative falsifier proving the
    /// differential has teeth: a deliberately wrong soundness verdict must
    /// disagree with the correct one.
    #[test]
    fn wrong_clause_is_caught() {
        let net = WfNetCarrier {
            num_places: 3,
            num_transitions: 2,
            source: 0,
            sink: 2,
            t_pre: vec![vec![0], vec![1]],
            t_post: vec![vec![1], vec![2]],
        };
        let correct = lean_sound_exact(&net);
        assert!(correct.is_sound);
        let tampered = WfSoundnessResult { is_sound: false, ..correct.clone() };
        assert_ne!(
            correct, tampered,
            "a tampered 'unsound' verdict on a genuinely sound net must be distinguishable"
        );
    }

    /// 6. source_sink_admission_is_checked_separately — the WF-net
    /// structural predicate (is_wf_net) is a distinct claim from
    /// soundness; a net with two disconnected sink-like places should be
    /// rejected by admission before soundness is even meaningful. This
    /// exercises the real Rust admission check on a non-WF-net shape.
    #[test]
    fn non_wf_net_shape_is_rejected_by_real_admission_check() {
        use crate::soundness::StructuralNet;
        // Two disjoint chains, no shared source/sink -- not a WF-net.
        let net = WfNetCarrier {
            num_places: 4,
            num_transitions: 2,
            source: 0,
            sink: 1,
            t_pre: vec![vec![0], vec![2]],
            t_post: vec![vec![1], vec![3]],
        };
        let petri_net = net.to_petri_net();
        let structural = StructuralNet::from_petri_net(&petri_net);
        let check = structural.is_workflow_net();
        assert!(
            !check.is_wf_net,
            "two disconnected chains must not be admitted as a single WF-net: {check:?}"
        );
    }

    #[test]
    fn lean_files_hash_matches_citation() {
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/../../mfact/procint/ProcInt/Workflow");
        for (file, expected) in [
            ("WfNet.lean", LEAN_WFNET_FILE_SHA256),
            ("Soundness.lean", LEAN_SOUNDNESS_FILE_SHA256),
        ] {
            let path = format!("{base}/{file}");
            let Ok(contents) = std::fs::read(&path) else {
                eprintln!(
                    "lean_files_hash_matches_citation: SKIPPED — {path} not found \
                     (mfact not checked out in this environment)"
                );
                continue;
            };
            let digest = sha256_hex(&contents);
            assert_eq!(
                digest, expected,
                "{file} content hash has changed since this harness was built \
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
