//! Universal anti-cheat oracle harness for cognition breeds.
//!
//! Each breed implements [`BreedOracle`] to supply three canonical inputs and
//! one trace assertion. [`run_universal_anticheat`] executes U1–U5 plus U2b.
//!
//! | Test | Adversary classes defeated |
//! |------|---------------------------|
//! | U1   | A1, A2 (novel input) |
//! | U2   | A4 (hollow trace) |
//! | U2b  | A4 (hollow trace values — Surface-3 content check) |
//! | U3   | A3, A6 (constant output / insensitivity) |
//! | U4   | A5 (never refuses) |
//! | U5   | A11 (sham determinism) |
//!
//! [`run_adversary_check`] additionally executes U6 (meta-oracle): the
//! oracle must reject an intentionally wrong [`BreedAdversary`].

use crate::breeds::dispatch::{dispatch_breed_id, provenance_lookup, provenance_now};

/// F1: verify the output hash was registered by a dispatch issued after
/// `window_start` — "trace provenance unbound" is the post-hoc fabrication
/// signal.
#[cfg(not(target_arch = "wasm32"))]
fn provenance_bound(window_start: u64, out: &BreedOutput) -> bool {
    let h = blake3::hash(serde_json::to_string(out).unwrap_or_default().as_bytes())
        .to_hex()
        .to_string();
    provenance_lookup(&h, window_start)
}
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{BreedId, BreedInput, BreedOutput};

/// Anti-cheat oracle contract for a single breed.
///
/// Implement on the same unit struct that implements [`crate::breeds::CognitionBreed`].
/// The trait is `Sized` (not object-safe) — static dispatch only.
pub trait BreedOracle: Sized {
    /// The [`BreedId`] this oracle covers.
    fn breed_id() -> BreedId;

    /// Novel input — not in any public fixture (defeats A1, A2).
    fn novel_input() -> BreedInput;

    /// Minimal pair: outputs MUST differ (defeats A3, A6).
    fn boundary_pair() -> (BreedInput, BreedInput);

    /// Semantically invalid input — must produce `Err` (defeats A5).
    fn refusal_input() -> BreedInput;

    /// Assert that the k-th step of the expected kind is correct for the
    /// `novel_input()` run (defeats A4 — hollow trace).
    ///
    /// `k` indexes the k-th step of the expected kind within the expected
    /// kind's subsequence. The harness calls k=0 and — for traces with
    /// len >= 2 — k=len/2 so a breed cannot emit one real step followed by
    /// filler. Oracles must handle arbitrary k.
    fn assert_intermediate(k: usize, trace: &TraceQuery<'_>) -> Result<(), String>;

    /// The step kinds this breed's oracle covers, drawn from the breed's
    /// documented vocabulary (its OCEL lifecycle model kinds plus any
    /// allowlisted debug kinds). Must be non-empty: an oracle that documents
    /// no vocabulary fails [`run_cross_oracle_check`]. Used by the
    /// cross-oracle invariants (F2) to check that every kind in a real
    /// dispatch trace is one the oracle claims to understand — the
    /// compensating control for oracles being self-graded.
    fn kind_vocabulary() -> &'static [&'static str];

    /// Surface-3 content check: assert the VALUES inside trace steps for the
    /// novel input — not just step kinds. Default Ok(()) until a breed opts in.
    fn assert_trace_values(_trace: &TraceQuery<'_>) -> Result<(), String> {
        Ok(())
    }
}

/// An intentionally wrong implementation embodying a breed's predicted primary
/// cheat mode (AC-* taxonomy). Used ONLY to verify the oracle is strong enough
/// to reject it (meta-oracle / test-testing). Never production code.
pub trait BreedAdversary {
    /// The oracle this adversary attacks.
    type Target: BreedOracle;
    /// The cheat's output for the target's novel input — raw BreedOutput,
    /// NOT routed through run_breed (the OCEL gate would mask what the
    /// oracle itself catches).
    fn run_cheat(input: &BreedInput) -> BreedOutput;
    /// AC-* taxonomy code for the embodied cheat.
    fn cheat_code() -> &'static str;
}

/// Outcome of a single universal anti-cheat test.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AntiCheatResult {
    /// Test passed.
    Pass {
        /// Short test identifier (e.g., `"U1"`).
        test_id: &'static str,
    },
    /// Test failed.
    Fail {
        /// Short test identifier.
        test_id: &'static str,
        /// Human-readable failure detail.
        detail: String,
    },
}

impl AntiCheatResult {
    /// Returns `true` iff this result is a pass.
    pub fn is_pass(&self) -> bool {
        matches!(self, Self::Pass { .. })
    }

    /// Returns `true` iff this result is a fail.
    pub fn is_fail(&self) -> bool {
        !self.is_pass()
    }

    /// Returns the test id.
    pub fn test_id(&self) -> &'static str {
        match self {
            Self::Pass { test_id } | Self::Fail { test_id, .. } => test_id,
        }
    }
}

/// Execute U1–U5 plus U2b universal anti-cheat tests for breed `B`.
///
/// Returns exactly 6 elements in order U1, U2, U2b, U3, U4, U5. All must be
/// `Pass` for the breed to be considered oracle-green. U2b runs the
/// [`BreedOracle::assert_trace_values`] Surface-3 content check (default
/// `Ok(())` until a breed opts in).
#[cfg(not(target_arch = "wasm32"))]
pub fn run_universal_anticheat<B: BreedOracle>() -> Vec<AntiCheatResult> {
    let mut results = Vec::with_capacity(6);
    let id = B::breed_id();
    let novel = B::novel_input();

    // U1: novel input runs without error, and the returned output's hash was
    // registered by THIS dispatch (F1 provenance binding).
    let window_start = provenance_now();
    let novel_output = match dispatch_breed_id(id, &novel) {
        Ok(out) => {
            if provenance_bound(window_start, &out) {
                results.push(AntiCheatResult::Pass { test_id: "U1" });
            } else {
                results.push(AntiCheatResult::Fail {
                    test_id: "U1",
                    detail: "trace provenance unbound (post-hoc fabrication signal)".to_string(),
                });
            }
            Some(out)
        }
        Err(e) => {
            results.push(AntiCheatResult::Fail {
                test_id: "U1",
                detail: format!("novel_input() returned Err: {}", e),
            });
            None
        }
    };

    // U2: assert_intermediate passes on the novel trace at k=0 and — for
    // traces with len >= 2 — at the mid-trace index k=len/2 (F3: one real
    // step followed by filler must fail).
    match &novel_output {
        Some(out) => {
            let tq = TraceQuery::new(&out.inference_trace);
            let mid = out.inference_trace.len() / 2;
            let r0 = B::assert_intermediate(0, &tq);
            let rmid = if out.inference_trace.len() >= 2 {
                B::assert_intermediate(mid, &tq)
            } else {
                Ok(())
            };
            match (r0, rmid) {
                (Ok(()), Ok(())) => results.push(AntiCheatResult::Pass { test_id: "U2" }),
                (Err(e), _) | (_, Err(e)) => results.push(AntiCheatResult::Fail {
                    test_id: "U2",
                    detail: e,
                }),
            }
        }
        None => results.push(AntiCheatResult::Fail {
            test_id: "U2",
            detail: "skipped because U1 failed".to_string(),
        }),
    }

    // U2b: assert_trace_values passes on the novel trace (Surface-3 content)
    match &novel_output {
        Some(out) => {
            let tq = TraceQuery::new(&out.inference_trace);
            match B::assert_trace_values(&tq) {
                Ok(()) => results.push(AntiCheatResult::Pass { test_id: "U2b" }),
                Err(e) => results.push(AntiCheatResult::Fail {
                    test_id: "U2b",
                    detail: e,
                }),
            }
        }
        None => results.push(AntiCheatResult::Fail {
            test_id: "U2b",
            detail: "skipped because U1 failed".to_string(),
        }),
    }

    // U3: boundary_pair outputs differ (both runs provenance-bound)
    {
        let (a, b) = B::boundary_pair();
        let window3 = provenance_now();
        match (dispatch_breed_id(id, &a), dispatch_breed_id(id, &b)) {
            (Ok(oa), Ok(ob)) => {
                if !provenance_bound(window3, &oa) || !provenance_bound(window3, &ob) {
                    results.push(AntiCheatResult::Fail {
                        test_id: "U3",
                        detail: "trace provenance unbound (post-hoc fabrication signal)"
                            .to_string(),
                    });
                } else {
                    let sa = serde_json::to_string(&oa).unwrap_or_default();
                    let sb = serde_json::to_string(&ob).unwrap_or_default();
                    if sa != sb {
                        results.push(AntiCheatResult::Pass { test_id: "U3" });
                    } else {
                        results.push(AntiCheatResult::Fail {
                            test_id: "U3",
                            detail: "boundary_pair() produced identical serialized outputs"
                                .to_string(),
                        });
                    }
                }
            }
            (Err(e), _) | (_, Err(e)) => results.push(AntiCheatResult::Fail {
                test_id: "U3",
                detail: format!("boundary_pair() run failed: {}", e),
            }),
        }
    }

    // U4: refusal_input returns Err
    match dispatch_breed_id(id, &B::refusal_input()) {
        Err(_) => results.push(AntiCheatResult::Pass { test_id: "U4" }),
        Ok(_) => results.push(AntiCheatResult::Fail {
            test_id: "U4",
            detail: "refusal_input() returned Ok — breed must refuse this input".to_string(),
        }),
    }

    // U5: bit-exact determinism on novel_input (runs provenance-bound)
    {
        let window5 = provenance_now();
        let r1 = dispatch_breed_id(id, &novel);
        let r2 = dispatch_breed_id(id, &novel);
        match (r1, r2) {
            (Ok(o1), Ok(o2)) => {
                if !provenance_bound(window5, &o1) || !provenance_bound(window5, &o2) {
                    results.push(AntiCheatResult::Fail {
                        test_id: "U5",
                        detail: "trace provenance unbound (post-hoc fabrication signal)"
                            .to_string(),
                    });
                }
                let s1 = serde_json::to_string(&o1).unwrap_or_default();
                let s2 = serde_json::to_string(&o2).unwrap_or_default();
                if s1 == s2 {
                    results.push(AntiCheatResult::Pass { test_id: "U5" });
                } else {
                    results.push(AntiCheatResult::Fail {
                        test_id: "U5",
                        detail: format!(
                            "double-run produced different bytes ({} vs {})",
                            s1.len(),
                            s2.len()
                        ),
                    });
                }
            }
            (Err(e), _) | (_, Err(e)) => results.push(AntiCheatResult::Fail {
                test_id: "U5",
                detail: format!("determinism run failed: {}", e),
            }),
        }
    }

    results
}

/// U6: the oracle must FAIL the adversary. Returns Pass only when
/// `assert_intermediate` rejects the cheat's trace. Mid-trace k=len/2 is also
/// checked when the cheat trace has len >= 2 (F3, same as U2).
#[cfg(not(target_arch = "wasm32"))]
pub fn run_adversary_check<A: BreedAdversary>() -> AntiCheatResult {
    let input = A::Target::novel_input();
    let output = A::run_cheat(&input);
    let tq = TraceQuery::new(&output.inference_trace);
    let mut intermediate_rejects = A::Target::assert_intermediate(0, &tq).is_err();
    if output.inference_trace.len() >= 2 {
        intermediate_rejects |= A::Target::assert_intermediate(output.inference_trace.len() / 2, &tq).is_err();
    }
    let values_reject = A::Target::assert_trace_values(&tq).is_err();
    if intermediate_rejects || values_reject {
        AntiCheatResult::Pass { test_id: "U6" }
    } else {
        AntiCheatResult::Fail {
            test_id: "U6",
            detail: format!("oracle did not reject {} cheat", A::cheat_code()),
        }
    }
}

/// F2 cross-oracle invariants, shared across all 54 oracle impls.
///
/// Asserts, for a REAL dispatch of `B::novel_input()`:
/// (a) the trace is non-empty (Fm-5),
/// (b) every step kind is in the oracle's documented vocabulary, and
/// (c) determinism: two dispatches produce byte-identical output.
///
/// Oracles are self-graded; these shared invariants plus the U6 meta-oracle
/// are the compensating controls. Third-party oracles are out of scope this
/// lane.
#[cfg(not(target_arch = "wasm32"))]
pub fn run_cross_oracle_check<B: BreedOracle>() -> Vec<AntiCheatResult> {
    let mut results = Vec::with_capacity(3);
    let id = B::breed_id();

    // X1: vocabulary must be non-empty (an undocumented oracle fails here).
    if B::kind_vocabulary().is_empty() {
        results.push(AntiCheatResult::Fail {
            test_id: "X1",
            detail: "kind_vocabulary() is empty — oracle documents no vocabulary".to_string(),
        });
        return results;
    }
    results.push(AntiCheatResult::Pass { test_id: "X1" });

    // X2: real dispatch — non-empty trace, all kinds within vocabulary.
    match dispatch_breed_id(id, &B::novel_input()) {
        Ok(out) => {
            if out.inference_trace.is_empty() {
                results.push(AntiCheatResult::Fail {
                    test_id: "X2",
                    detail: "trace is empty (fraud signal)".to_string(),
                });
            } else {
                let vocab = B::kind_vocabulary();
                let unknown: Vec<&str> = out
                    .inference_trace
                    .iter()
                    .map(|s| s.kind.as_str())
                    .filter(|k| !vocab.contains(k))
                    .collect();
                if unknown.is_empty() {
                    results.push(AntiCheatResult::Pass { test_id: "X2" });
                } else {
                    results.push(AntiCheatResult::Fail {
                        test_id: "X2",
                        detail: format!(
                            "trace kinds outside documented vocabulary: {:?}",
                            unknown
                        ),
                    });
                }
            }
        }
        Err(e) => results.push(AntiCheatResult::Fail {
            test_id: "X2",
            detail: format!("novel_input() dispatch failed: {}", e),
        }),
    }

    // X3: determinism (re-runs U5's property in the cross-oracle surface).
    match (
        dispatch_breed_id(id, &B::novel_input()),
        dispatch_breed_id(id, &B::novel_input()),
    ) {
        (Ok(o1), Ok(o2)) => {
            let s1 = serde_json::to_string(&o1).unwrap_or_default();
            let s2 = serde_json::to_string(&o2).unwrap_or_default();
            if s1 == s2 {
                results.push(AntiCheatResult::Pass { test_id: "X3" });
            } else {
                results.push(AntiCheatResult::Fail {
                    test_id: "X3",
                    detail: "double-run produced different bytes".to_string(),
                });
            }
        }
        (Err(e), _) | (_, Err(e)) => results.push(AntiCheatResult::Fail {
            test_id: "X3",
            detail: format!("determinism run failed: {}", e),
        }),
    }

    results
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use crate::breeds::TraceStep;

    fn empty_output() -> BreedOutput {
        BreedOutput {
            breed: BreedId::Eliza,
            candidates: vec![],
            facts: vec![],
            selected: None,
            explanation: String::new(),
            inference_trace: vec![],
            ocel_log: None,
            retained_cases: vec![],
        }
    }

    /// Oracle whose assert_intermediate accepts any trace (too weak).
    struct WeakOracle;
    impl BreedOracle for WeakOracle {
        fn breed_id() -> BreedId {
            BreedId::Eliza
        }
        fn novel_input() -> BreedInput {
            BreedInput::default()
        }
        fn boundary_pair() -> (BreedInput, BreedInput) {
            (BreedInput::default(), BreedInput::default())
        }
        fn refusal_input() -> BreedInput {
            BreedInput::default()
        }
        fn assert_intermediate(_k: usize, _trace: &TraceQuery<'_>) -> Result<(), String> {
            Ok(())
        }
        fn kind_vocabulary() -> &'static [&'static str] {
            &["fire-rule"]
        }
    }

    /// Oracle whose assert_intermediate demands a specific step kind (strong).
    struct StrongOracle;
    impl BreedOracle for StrongOracle {
        fn breed_id() -> BreedId {
            BreedId::Eliza
        }
        fn novel_input() -> BreedInput {
            BreedInput::default()
        }
        fn boundary_pair() -> (BreedInput, BreedInput) {
            (BreedInput::default(), BreedInput::default())
        }
        fn refusal_input() -> BreedInput {
            BreedInput::default()
        }
        fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
            if trace.has_kind("fire-rule") {
                Ok(())
            } else {
                Err("missing fire-rule step".to_string())
            }
        }
        fn kind_vocabulary() -> &'static [&'static str] {
            &["fire-rule"]
        }
    }

    /// Hollow-trace adversary (AC-A4): emits a trace with a meaningless kind.
    struct HollowAdversary<T>(core::marker::PhantomData<T>);
    impl<T: BreedOracle> BreedAdversary for HollowAdversary<T> {
        type Target = T;
        fn run_cheat(_input: &BreedInput) -> BreedOutput {
            let mut out = empty_output();
            out.inference_trace.push(TraceStep {
                step: 0,
                kind: "noop".to_string(),
                detail: "hollow".to_string(),
                depth: 0,
                objects: vec![],
            });
            out
        }
        fn cheat_code() -> &'static str {
            "AC-A4"
        }
    }

    #[test]
    fn u6_fails_when_oracle_is_too_weak() {
        let r = run_adversary_check::<HollowAdversary<WeakOracle>>();
        assert!(r.is_fail(), "weak oracle accepted the cheat but U6 passed");
        assert_eq!(r.test_id(), "U6");
        if let AntiCheatResult::Fail { detail, .. } = &r {
            assert!(
                detail.contains("AC-A4"),
                "detail must name cheat code: {}",
                detail
            );
        }
    }

    #[test]
    fn u6_passes_when_oracle_rejects_the_cheat() {
        let r = run_adversary_check::<HollowAdversary<StrongOracle>>();
        assert!(r.is_pass(), "strong oracle should reject the hollow trace");
        assert_eq!(r.test_id(), "U6");
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod cross_oracle_tests {
    use super::*;

    struct EmptyVocabOracle;
    impl BreedOracle for EmptyVocabOracle {
        fn breed_id() -> BreedId {
            BreedId::Eliza
        }
        fn novel_input() -> BreedInput {
            BreedInput::default()
        }
        fn boundary_pair() -> (BreedInput, BreedInput) {
            (BreedInput::default(), BreedInput::default())
        }
        fn refusal_input() -> BreedInput {
            BreedInput::default()
        }
        fn assert_intermediate(_k: usize, _trace: &TraceQuery<'_>) -> Result<(), String> {
            Ok(())
        }
        fn kind_vocabulary() -> &'static [&'static str] {
            &[]
        }
    }

    #[test]
    fn x1_empty_vocabulary_fails_cross_oracle_check() {
        let results = run_cross_oracle_check::<EmptyVocabOracle>();
        assert!(
            results.iter().any(|r| r.test_id() == "X1" && r.is_fail()),
            "an oracle with an empty vocabulary must fail X1, got {results:?}"
        );
    }

    #[test]
    fn x2_kind_outside_vocabulary_fails() {
        // Eliza's real trace kinds are not all in this 1-entry vocabulary...
        // Actually exercise the negative directly: an oracle whose vocabulary
        // excludes the kinds the real dispatch emits must fail X2.
        struct NarrowVocabOracle;
        impl BreedOracle for NarrowVocabOracle {
            fn breed_id() -> BreedId {
                BreedId::Eliza
            }
            fn novel_input() -> BreedInput {
                BreedInput {
                    intent: "i am uo_flustrated because uo_grindle hums at me".to_string(),
                    ..Default::default()
                }
            }
            fn boundary_pair() -> (BreedInput, BreedInput) {
                (Self::novel_input(), Self::novel_input())
            }
            fn refusal_input() -> BreedInput {
                BreedInput::default()
            }
            fn assert_intermediate(_k: usize, _trace: &TraceQuery<'_>) -> Result<(), String> {
                Ok(())
            }
            fn kind_vocabulary() -> &'static [&'static str] {
                &["kind-that-never-occurs"]
            }
        }
        let results = run_cross_oracle_check::<NarrowVocabOracle>();
        assert!(
            results.iter().any(|r| r.test_id() == "X2" && r.is_fail()),
            "a vocabulary that excludes real trace kinds must fail X2, got {results:?}"
        );
    }
}
