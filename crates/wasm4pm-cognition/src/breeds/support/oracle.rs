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

use crate::breeds::{BreedId, BreedInput, BreedOutput};
use crate::breeds::dispatch::dispatch_breed_id;
use crate::breeds::support::trace_query::TraceQuery;

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
    fn assert_intermediate(k: usize, trace: &TraceQuery<'_>) -> Result<(), String>;

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

    // U1: novel input runs without error
    let novel_output = match dispatch_breed_id(id, &novel) {
        Ok(out) => {
            results.push(AntiCheatResult::Pass { test_id: "U1" });
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

    // U2: assert_intermediate passes on the novel trace
    match &novel_output {
        Some(out) => {
            let tq = TraceQuery::new(&out.inference_trace);
            match B::assert_intermediate(0, &tq) {
                Ok(()) => results.push(AntiCheatResult::Pass { test_id: "U2" }),
                Err(e) => results.push(AntiCheatResult::Fail { test_id: "U2", detail: e }),
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
                Err(e) => results.push(AntiCheatResult::Fail { test_id: "U2b", detail: e }),
            }
        }
        None => results.push(AntiCheatResult::Fail {
            test_id: "U2b",
            detail: "skipped because U1 failed".to_string(),
        }),
    }

    // U3: boundary_pair outputs differ
    {
        let (a, b) = B::boundary_pair();
        match (dispatch_breed_id(id, &a), dispatch_breed_id(id, &b)) {
            (Ok(oa), Ok(ob)) => {
                let sa = serde_json::to_string(&oa).unwrap_or_default();
                let sb = serde_json::to_string(&ob).unwrap_or_default();
                if sa != sb {
                    results.push(AntiCheatResult::Pass { test_id: "U3" });
                } else {
                    results.push(AntiCheatResult::Fail {
                        test_id: "U3",
                        detail: "boundary_pair() produced identical serialized outputs".to_string(),
                    });
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

    // U5: bit-exact determinism on novel_input
    {
        let r1 = dispatch_breed_id(id, &novel);
        let r2 = dispatch_breed_id(id, &novel);
        match (r1, r2) {
            (Ok(o1), Ok(o2)) => {
                let s1 = serde_json::to_string(&o1).unwrap_or_default();
                let s2 = serde_json::to_string(&o2).unwrap_or_default();
                if s1 == s2 {
                    results.push(AntiCheatResult::Pass { test_id: "U5" });
                } else {
                    results.push(AntiCheatResult::Fail {
                        test_id: "U5",
                        detail: format!(
                            "double-run produced different bytes ({} vs {})",
                            s1.len(), s2.len()
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
/// `assert_intermediate` rejects the cheat's trace.
#[cfg(not(target_arch = "wasm32"))]
pub fn run_adversary_check<A: BreedAdversary>() -> AntiCheatResult {
    let input = A::Target::novel_input();
    let output = A::run_cheat(&input);
    let tq = TraceQuery::new(&output.inference_trace);
    let intermediate_rejects = A::Target::assert_intermediate(0, &tq).is_err();
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
            assert!(detail.contains("AC-A4"), "detail must name cheat code: {}", detail);
        }
    }

    #[test]
    fn u6_passes_when_oracle_rejects_the_cheat() {
        let r = run_adversary_check::<HollowAdversary<StrongOracle>>();
        assert!(r.is_pass(), "strong oracle should reject the hollow trace");
        assert_eq!(r.test_id(), "U6");
    }
}
