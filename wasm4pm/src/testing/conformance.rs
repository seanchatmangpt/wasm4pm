//! Route-driven test conformance types and classifier.
//!
//! All types in this module are pure — no I/O, no side effects, no global state.
//! Every function is deterministic and trivially testable.
//!
//! # Example
//!
//! ```
//! use wasm4pm::testing::conformance::{
//!     classify_conformance, ExpectedConformance, ProofDimension, ReplayReport,
//! };
//!
//! let report = ReplayReport {
//!     fitness: ProofDimension::Measured(1.0),
//!     precision: ProofDimension::Measured(1.0),
//!     receipt_coverage: ProofDimension::Measured(1.0),
//!     required_stage_coverage: ProofDimension::Measured(1.0),
//!     object_lifecycle_validity: ProofDimension::Measured(1.0),
//! };
//!
//! assert!(classify_conformance(&report, ExpectedConformance::exact()).is_passed());
//! ```

/// A proof dimension: either actually measured or declared absent.
///
/// `NotMeasured` is not zero — it is unknown. Unknown always fails admission.
/// An agent cannot fabricate a passing verdict by omitting a dimension;
/// `classify_conformance` returns [`AndonPull::TestRouteIncomplete`] unconditionally.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProofDimension {
    /// The dimension was computed and has a concrete value.
    Measured(f64),
    /// The dimension has not been implemented yet. Fails admission unconditionally.
    NotMeasured,
}

impl ProofDimension {
    /// Return the measured value, or `None` if not measured.
    pub fn value(&self) -> Option<f64> {
        match self {
            Self::Measured(v) => Some(*v),
            Self::NotMeasured => None,
        }
    }
}

/// Exact conformance requirements for an admitted test run.
///
/// Only one constructor exists: [`ExpectedConformance::exact()`]. There is no
/// "acceptable 0.8" constructor. Any value below 1.0 produces an [`AndonPull`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ExpectedConformance {
    pub fitness: f64,
    pub precision: f64,
    pub receipt_coverage: f64,
    pub required_stage_coverage: f64,
    pub object_lifecycle_validity: f64,
}

impl ExpectedConformance {
    /// Require exact conformance on every admitted route dimension.
    ///
    /// All five dimensions are set to 1.0. There is no other valid
    /// admitted configuration.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::conformance::ExpectedConformance;
    ///
    /// let c = ExpectedConformance::exact();
    /// assert_eq!(c.fitness, 1.0);
    /// assert_eq!(c.precision, 1.0);
    /// assert_eq!(c.receipt_coverage, 1.0);
    /// assert_eq!(c.required_stage_coverage, 1.0);
    /// assert_eq!(c.object_lifecycle_validity, 1.0);
    /// ```
    pub const fn exact() -> Self {
        Self {
            fitness: 1.0,
            precision: 1.0,
            receipt_coverage: 1.0,
            required_stage_coverage: 1.0,
            object_lifecycle_validity: 1.0,
        }
    }
}

/// Measured conformance from a POWL v2 replay against a declared route.
///
/// Each field is a [`ProofDimension`]: either `Measured(f64)` from an actual
/// computation, or `NotMeasured` when the implementation is not yet complete.
/// `NotMeasured` always fails admission — it cannot be fabricated as passing.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReplayReport {
    pub fitness: ProofDimension,
    pub precision: ProofDimension,
    pub receipt_coverage: ProofDimension,
    pub required_stage_coverage: ProofDimension,
    pub object_lifecycle_validity: ProofDimension,
}

/// Typed line-stop causes for route-conformance gaps.
///
/// Each variant maps to exactly one conformance dimension failure.
/// An [`AndonPull`] is not a warning — it is the test verdict.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AndonPull {
    /// Token-replay fitness < required (control-flow deviation).
    RouteConformanceGap,
    /// Behavioural precision < required (underfitted or illegal motion).
    IllegalRouteMotion,
    /// Receipt chain coverage < required (missing proof links).
    MissingReceiptCoverage,
    /// Required stage coverage < required (declared activity absent).
    MissingRouteActivity,
    /// Object lifecycle validity < required (lifecycle violated).
    ObjectLifecycleViolation,
    /// An authority claim appeared that was not declared in the route.
    UnexpectedAuthority,
    /// The test body panicked before route evidence was complete.
    UnhandledPanic,
    /// The harness could not load or execute the route model.
    TestRouteIncomplete,
}

/// Policy for handling a process-conformance gap in a test run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AndonPolicy {
    /// Fail immediately — classifies the run as a line stop.
    PullLine,
}

/// Final route-driven test verdict.
///
/// A test either passed all conformance planes or pulled the Andon cord.
/// There is no partial pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConformanceVerdict {
    Passed,
    Andon(AndonPull),
}

impl ConformanceVerdict {
    /// Construct a passing verdict.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::conformance::ConformanceVerdict;
    ///
    /// assert!(ConformanceVerdict::passed().is_passed());
    /// ```
    pub const fn passed() -> Self {
        Self::Passed
    }

    /// Construct an Andon verdict with a specific pull reason.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::conformance::{AndonPull, ConformanceVerdict};
    ///
    /// let v = ConformanceVerdict::andon(AndonPull::MissingReceiptCoverage);
    /// assert!(!v.is_passed());
    /// ```
    pub const fn andon(reason: AndonPull) -> Self {
        Self::Andon(reason)
    }

    /// Returns `true` if the verdict is [`ConformanceVerdict::Passed`].
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::conformance::{AndonPull, ConformanceVerdict};
    ///
    /// assert!(ConformanceVerdict::Passed.is_passed());
    /// assert!(!ConformanceVerdict::Andon(AndonPull::RouteConformanceGap).is_passed());
    /// ```
    pub const fn is_passed(&self) -> bool {
        matches!(self, Self::Passed)
    }
}

/// Classify a replay report against an expected conformance contract.
///
/// This function is pure: no I/O, no state, deterministic for all inputs.
/// Dimensions are checked in priority order: fitness → precision →
/// receipt coverage → stage coverage → lifecycle validity.
///
/// Any `NotMeasured` dimension returns [`AndonPull::TestRouteIncomplete`]
/// unconditionally — before any threshold comparison.
/// Any measured dimension strictly below the expected value produces an [`AndonPull`].
/// `0.999 < 1.0` is a gap. There is no tolerance.
///
/// # Example
///
/// ```
/// use wasm4pm::testing::conformance::{
///     classify_conformance, ConformanceVerdict, ExpectedConformance, ProofDimension, ReplayReport,
/// };
///
/// let exact = ReplayReport {
///     fitness: ProofDimension::Measured(1.0),
///     precision: ProofDimension::Measured(1.0),
///     receipt_coverage: ProofDimension::Measured(1.0),
///     required_stage_coverage: ProofDimension::Measured(1.0),
///     object_lifecycle_validity: ProofDimension::Measured(1.0),
/// };
/// assert!(classify_conformance(&exact, ExpectedConformance::exact()).is_passed());
///
/// let gap = ReplayReport { fitness: ProofDimension::Measured(0.999), ..exact };
/// assert!(!classify_conformance(&gap, ExpectedConformance::exact()).is_passed());
///
/// let unmeasured = ReplayReport { receipt_coverage: ProofDimension::NotMeasured, ..exact };
/// assert!(!classify_conformance(&unmeasured, ExpectedConformance::exact()).is_passed());
/// ```
pub fn classify_conformance(
    report: &ReplayReport,
    expected: ExpectedConformance,
) -> ConformanceVerdict {
    macro_rules! check {
        ($dim:expr, $threshold:expr, $andon:expr) => {
            match $dim {
                ProofDimension::NotMeasured => {
                    return ConformanceVerdict::andon(AndonPull::TestRouteIncomplete);
                }
                ProofDimension::Measured(v) if v < $threshold => {
                    return ConformanceVerdict::andon($andon);
                }
                _ => {}
            }
        };
    }
    check!(
        report.fitness,
        expected.fitness,
        AndonPull::RouteConformanceGap
    );
    check!(
        report.precision,
        expected.precision,
        AndonPull::IllegalRouteMotion
    );
    check!(
        report.receipt_coverage,
        expected.receipt_coverage,
        AndonPull::MissingReceiptCoverage
    );
    check!(
        report.required_stage_coverage,
        expected.required_stage_coverage,
        AndonPull::MissingRouteActivity
    );
    check!(
        report.object_lifecycle_validity,
        expected.object_lifecycle_validity,
        AndonPull::ObjectLifecycleViolation
    );
    ConformanceVerdict::passed()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exact_report() -> ReplayReport {
        ReplayReport {
            fitness: ProofDimension::Measured(1.0),
            precision: ProofDimension::Measured(1.0),
            receipt_coverage: ProofDimension::Measured(1.0),
            required_stage_coverage: ProofDimension::Measured(1.0),
            object_lifecycle_validity: ProofDimension::Measured(1.0),
        }
    }

    #[test]
    fn all_measured_at_1_0_passes() {
        assert_eq!(
            classify_conformance(&exact_report(), ExpectedConformance::exact()),
            ConformanceVerdict::Passed,
        );
    }

    #[test]
    fn fitness_gap_gives_route_conformance_gap() {
        let report = ReplayReport {
            fitness: ProofDimension::Measured(0.999),
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::RouteConformanceGap),
        );
    }

    #[test]
    fn precision_gap_gives_illegal_route_motion() {
        let report = ReplayReport {
            precision: ProofDimension::Measured(0.999),
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::IllegalRouteMotion),
        );
    }

    #[test]
    fn receipt_coverage_gap_gives_missing_receipt_coverage() {
        let report = ReplayReport {
            receipt_coverage: ProofDimension::Measured(0.999),
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::MissingReceiptCoverage),
        );
    }

    #[test]
    fn stage_coverage_gap_gives_missing_route_activity() {
        let report = ReplayReport {
            required_stage_coverage: ProofDimension::Measured(0.999),
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::MissingRouteActivity),
        );
    }

    #[test]
    fn lifecycle_gap_gives_object_lifecycle_violation() {
        let report = ReplayReport {
            object_lifecycle_validity: ProofDimension::Measured(0.999),
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::ObjectLifecycleViolation),
        );
    }

    #[test]
    fn not_measured_fitness_returns_test_route_incomplete() {
        let report = ReplayReport {
            fitness: ProofDimension::NotMeasured,
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
        );
    }

    #[test]
    fn not_measured_receipt_coverage_returns_test_route_incomplete() {
        let report = ReplayReport {
            receipt_coverage: ProofDimension::NotMeasured,
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
        );
    }

    #[test]
    fn not_measured_object_lifecycle_returns_test_route_incomplete() {
        let report = ReplayReport {
            object_lifecycle_validity: ProofDimension::NotMeasured,
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
        );
    }

    #[test]
    fn not_measured_checked_before_threshold() {
        // NotMeasured returns TestRouteIncomplete even when threshold would also fire.
        // This proves NotMeasured is not just "zero" — it has its own semantic.
        let report = ReplayReport {
            receipt_coverage: ProofDimension::NotMeasured,
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
            "NotMeasured must return TestRouteIncomplete, not MissingReceiptCoverage"
        );
    }

    #[test]
    fn is_passed_works_for_passed() {
        assert!(ConformanceVerdict::Passed.is_passed());
    }

    #[test]
    fn is_passed_works_for_andon() {
        assert!(!ConformanceVerdict::Andon(AndonPull::RouteConformanceGap).is_passed());
    }

    #[test]
    fn exact_conformance_returns_all_ones() {
        let c = ExpectedConformance::exact();
        assert_eq!(c.fitness, 1.0);
        assert_eq!(c.precision, 1.0);
        assert_eq!(c.receipt_coverage, 1.0);
        assert_eq!(c.required_stage_coverage, 1.0);
        assert_eq!(c.object_lifecycle_validity, 1.0);
    }

    #[test]
    fn zero_fitness_is_andon() {
        let report = ReplayReport {
            fitness: ProofDimension::Measured(0.0),
            ..exact_report()
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::RouteConformanceGap),
        );
    }

    #[test]
    fn priority_order_fitness_checked_first() {
        let report = ReplayReport {
            fitness: ProofDimension::Measured(0.0),
            precision: ProofDimension::Measured(0.0),
            receipt_coverage: ProofDimension::Measured(0.0),
            required_stage_coverage: ProofDimension::Measured(0.0),
            object_lifecycle_validity: ProofDimension::Measured(0.0),
        };
        assert_eq!(
            classify_conformance(&report, ExpectedConformance::exact()),
            ConformanceVerdict::Andon(AndonPull::RouteConformanceGap),
        );
    }

    #[test]
    fn proof_dimension_value_returns_some_for_measured() {
        assert_eq!(ProofDimension::Measured(0.5).value(), Some(0.5));
    }

    #[test]
    fn proof_dimension_value_returns_none_for_not_measured() {
        assert_eq!(ProofDimension::NotMeasured.value(), None);
    }
}
