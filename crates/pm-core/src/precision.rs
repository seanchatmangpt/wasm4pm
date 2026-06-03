//! ETConformance precision result — escaping-edge approach. Separates precision computation types from the conformance result so callers can request fitness-only without computing precision (the --precision-mode fast flag pattern from Cycle 55).
//! Paper grounding: Munoz-Gama & Carmona 2010 'A Fresh Look at Precision in Process Conformance' §4: precision = 1 − Σ_σ|escaping(σ,N)| / (Σ_σ|escaping(σ,N)| + Σ_σ|consumed(σ,N)|). The escaping-edges measure counts net-allowed behaviours not observed in the log.

// No std — all collections from alloc.
extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::collections::BTreeSet;
use alloc::string::String;
use alloc::vec::Vec;
use core::fmt;
use core::ops::Deref;

// ---------------------------------------------------------------------------
// PrecisionScore — newtype over f64
// ---------------------------------------------------------------------------

/// Formal object from [MunozGama2010]: the ETConformance precision score
/// `precision_ETC ∈ [0.0, 1.0]` defined in §4 Definition 4.2 as:
///
/// ```text
/// precision_ETC = 1 − Σ_σ |escaping(σ, N)| / (Σ_σ |escaping(σ, N)| + Σ_σ |consumed(σ, N)|)
/// ```
///
/// # Invariant
/// The wrapped value is always in the closed interval `[0.0, 1.0]`.
/// A value of `1.0` means no escaping edges were observed (perfect precision).
/// A value of `0.0` means all enabled edges at every step escaped (no precision).
///
/// # Fast-mode note (Cycle 55)
/// Callers that pass `--precision-mode fast` receive a `FitnessOnlyResult`
/// and never construct this type. Precision computation is deferred or skipped
/// entirely; this newtype is only created when the full ETC replay is performed.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct PrecisionScore(f64);

impl PrecisionScore {
    /// Construct a `PrecisionScore`, clamping the value to `[0.0, 1.0]`.
    ///
    /// Panics in debug mode if `value` is not finite.
    pub fn new(value: f64) -> Self {
        debug_assert!(
            value.is_finite(),
            "PrecisionScore must be finite, got {value}"
        );
        PrecisionScore(value.clamp(0.0, 1.0))
    }

    /// Return the raw `f64` value.
    #[inline]
    pub fn value(self) -> f64 {
        self.0
    }

    /// Return the precision for an empty log: by convention, `1.0`.
    pub const fn empty_log() -> Self {
        PrecisionScore(1.0)
    }
}

impl Deref for PrecisionScore {
    type Target = f64;

    #[inline]
    fn deref(&self) -> &f64 {
        &self.0
    }
}

impl fmt::Display for PrecisionScore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:.6}", self.0)
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PrecisionScore {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_f64(self.0)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for PrecisionScore {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = f64::deserialize(d)?;
        Ok(PrecisionScore::new(v))
    }
}

// ---------------------------------------------------------------------------
// EtcPrecisionResult — primary result type
// ---------------------------------------------------------------------------

/// Formal object from [MunozGama2010]: the full ETConformance precision result
/// carrying the aggregated escaping-edge counters alongside the derived score.
///
/// The counters satisfy the identity:
///
/// ```text
/// precision = 1 − total_escaping / (total_escaping + total_consumed)
/// ```
///
/// except when both counters are zero (empty log), in which case `precision = 1.0`.
///
/// ## Counter widths
/// `u64` counters are used instead of the `u32` counters in the legacy
/// `PrecisionResult` to prevent overflow on large real-world logs where
/// `total_consumed` can exceed `2^32`.
///
/// ## Relationship to `--precision-mode fast` (Cycle 55)
/// When the caller requests `--precision-mode fast`, this struct is **not**
/// constructed. The caller receives a `FitnessOnlyResult` instead. This struct
/// is only produced when the full ETC replay is performed (`--precision-mode full`
/// or `--precision-mode lazy` after the deferred precision call resolves).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EtcPrecisionResult {
    /// Aggregated ETConformance precision score over all traces.
    ///
    /// Formal object: `precision_ETC` from Munoz-Gama & Carmona 2010 §4 Def 4.2.
    pub precision: PrecisionScore,

    /// Total number of escaping tokens across all traces: `Σ_σ |escaping(σ, N)|`.
    ///
    /// An "escaping edge" at replay step `i` of trace `σ` is a transition that
    /// is currently enabled in the net's marking but whose label does not match
    /// the next activity in `σ`. Each such transition contributes one unit here.
    pub total_escaping: u64,

    /// Total number of consumed tokens across all traces: `Σ_σ |consumed(σ, N)|`.
    ///
    /// A token is consumed when a visible transition fires to match the next
    /// activity label in the trace. The preset size of the fired transition
    /// is added to this counter per firing step.
    pub total_consumed: u64,

    /// Number of traces that were replayed to produce this result.
    ///
    /// An empty log (`total_traces == 0`) yields `precision = 1.0` by convention.
    pub total_traces: u64,
}

impl EtcPrecisionResult {
    /// Construct an `EtcPrecisionResult` from raw counters, deriving the precision
    /// score according to the ETConformance formula (§4 Def 4.2).
    ///
    /// When `total_escaping == 0 && total_consumed == 0` (empty log or a log with
    /// no visible transitions), `precision` is set to `1.0`.
    pub fn from_counters(total_escaping: u64, total_consumed: u64, total_traces: u64) -> Self {
        let precision = if total_escaping == 0 && total_consumed == 0 {
            PrecisionScore::empty_log()
        } else {
            let e = total_escaping as f64;
            let c = total_consumed as f64;
            PrecisionScore::new(1.0 - e / (e + c))
        };
        EtcPrecisionResult {
            precision,
            total_escaping,
            total_consumed,
            total_traces,
        }
    }

    /// Return `true` if this result was produced from an empty log.
    #[inline]
    pub fn is_empty_log(&self) -> bool {
        self.total_traces == 0
    }

    /// Return the raw precision `f64`.
    #[inline]
    pub fn precision_f64(self) -> f64 {
        self.precision.value()
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for EtcPrecisionResult {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("EtcPrecisionResult", 4)?;
        st.serialize_field("precision", &self.precision)?;
        st.serialize_field("total_escaping", &self.total_escaping)?;
        st.serialize_field("total_consumed", &self.total_consumed)?;
        st.serialize_field("total_traces", &self.total_traces)?;
        st.end()
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for EtcPrecisionResult {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::{self, MapAccess, Visitor};

        struct EtcVisitor;

        impl<'de> Visitor<'de> for EtcVisitor {
            type Value = EtcPrecisionResult;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("struct EtcPrecisionResult")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut precision: Option<PrecisionScore> = None;
                let mut total_escaping: Option<u64> = None;
                let mut total_consumed: Option<u64> = None;
                let mut total_traces: Option<u64> = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "precision" => precision = Some(map.next_value()?),
                        "total_escaping" => total_escaping = Some(map.next_value()?),
                        "total_consumed" => total_consumed = Some(map.next_value()?),
                        "total_traces" => total_traces = Some(map.next_value()?),
                        _ => {
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }

                let total_escaping =
                    total_escaping.ok_or_else(|| de::Error::missing_field("total_escaping"))?;
                let total_consumed =
                    total_consumed.ok_or_else(|| de::Error::missing_field("total_consumed"))?;
                let total_traces =
                    total_traces.ok_or_else(|| de::Error::missing_field("total_traces"))?;
                // If precision is present in the payload, use it; otherwise recompute.
                let precision = precision.unwrap_or_else(|| {
                    EtcPrecisionResult::from_counters(total_escaping, total_consumed, total_traces)
                        .precision
                });

                Ok(EtcPrecisionResult {
                    precision,
                    total_escaping,
                    total_consumed,
                    total_traces,
                })
            }
        }

        d.deserialize_map(EtcVisitor)
    }
}

// ---------------------------------------------------------------------------
// PrecisionMode — encodes the --precision-mode flag (Cycle 55)
// ---------------------------------------------------------------------------

/// Formal object from [Cycle55LazyPrecision]: the computation mode selector for
/// the `--precision-mode` flag introduced in Cycle 55.
///
/// Separates fitness computation from precision computation so that callers
/// can avoid the O(|L|·|N|) ETC replay when only fitness is needed.
///
/// Variants ordered from cheapest (`Fast`) to most expensive (`Full`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PrecisionMode {
    /// Fitness only — precision computation is skipped entirely.
    ///
    /// Corresponds to `--precision-mode fast` in the CLI. Returns a
    /// `ConformanceOutcome::FitnessOnly` variant; `EtcPrecisionResult` is never
    /// constructed.
    Fast,

    /// Fitness is computed eagerly; precision is cached and resolved on the
    /// next explicit precision query.
    ///
    /// Corresponds to `--precision-mode lazy`. The first call returns fitness;
    /// subsequent calls (or explicit `--precision-only` calls) resolve precision
    /// from the `ConformanceCache` (Cycle 55 `conformance-cache.ts` pattern).
    Lazy,

    /// Fitness and precision are both computed and returned together (default).
    ///
    /// Corresponds to `--precision-mode full` (the pre-Cycle-55 behaviour).
    /// Backward-compatible default.
    Full,
}

impl PrecisionMode {
    /// Return `true` if precision should be computed immediately.
    #[inline]
    pub fn computes_precision_eagerly(self) -> bool {
        self == PrecisionMode::Full
    }

    /// Return `true` if precision is deferred or omitted.
    #[inline]
    pub fn skips_precision(self) -> bool {
        matches!(self, PrecisionMode::Fast | PrecisionMode::Lazy)
    }
}

impl fmt::Display for PrecisionMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PrecisionMode::Fast => f.write_str("fast"),
            PrecisionMode::Lazy => f.write_str("lazy"),
            PrecisionMode::Full => f.write_str("full"),
        }
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for PrecisionMode {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(match self {
            PrecisionMode::Fast => "fast",
            PrecisionMode::Lazy => "lazy",
            PrecisionMode::Full => "full",
        })
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for PrecisionMode {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let s = String::deserialize(d)?;
        match s.as_str() {
            "fast" => Ok(PrecisionMode::Fast),
            "lazy" => Ok(PrecisionMode::Lazy),
            "full" => Ok(PrecisionMode::Full),
            other => Err(D::Error::unknown_variant(other, &["fast", "lazy", "full"])),
        }
    }
}

// ---------------------------------------------------------------------------
// ConformanceOutcome — discriminated union for fitness-only vs full result
// ---------------------------------------------------------------------------

/// Formal object from [Cycle55LazyPrecision]: the discriminated result type
/// returned by conformance checking depending on the active `PrecisionMode`.
///
/// This type replaces the undifferentiated `(fitness, Option<precision>)` tuple
/// pattern. Pattern-matching on `ConformanceOutcome` forces callers to handle
/// the fitness-only case explicitly, preventing accidental precision reads that
/// would panic or return `None` without a compile-time indication.
#[derive(Clone, Debug, PartialEq)]
pub enum ConformanceOutcome {
    /// Fitness was computed; precision was skipped (`--precision-mode fast`).
    ///
    /// The `computed_at` string records which mode was active for audit trails.
    FitnessOnly {
        /// Token-replay fitness score in `[0.0, 1.0]`.
        fitness: f64,
        /// The mode string, always `"fast"`.
        computed_at: String,
    },

    /// Fitness was computed and cached; precision is deferred (`--precision-mode lazy`).
    ///
    /// The `cache_key` can be used to retrieve precision from a `ConformanceCache`
    /// (Cycle 55 conformance-cache.ts pattern) in a subsequent call.
    LazyPending {
        /// Token-replay fitness score in `[0.0, 1.0]`.
        fitness: f64,
        /// Opaque key (e.g., `"<log_hash>:<model_hash>"`) for cache lookup.
        cache_key: String,
        /// The mode string, always `"lazy"`.
        computed_at: String,
    },

    /// Both fitness and precision were computed (`--precision-mode full`, default).
    Full {
        /// Token-replay fitness score in `[0.0, 1.0]`.
        fitness: f64,
        /// ETConformance precision result (escaping-edge approach).
        precision: EtcPrecisionResult,
        /// The mode string, always `"full"`.
        computed_at: String,
    },
}

impl ConformanceOutcome {
    /// Return the fitness value regardless of which variant is active.
    pub fn fitness(&self) -> f64 {
        match self {
            ConformanceOutcome::FitnessOnly { fitness, .. } => *fitness,
            ConformanceOutcome::LazyPending { fitness, .. } => *fitness,
            ConformanceOutcome::Full { fitness, .. } => *fitness,
        }
    }

    /// Return the precision score if available, or `None` for fast/lazy variants.
    pub fn precision(&self) -> Option<PrecisionScore> {
        match self {
            ConformanceOutcome::Full { precision, .. } => Some(precision.precision),
            _ => None,
        }
    }

    /// Return the `computed_at` mode tag.
    pub fn computed_at(&self) -> &str {
        match self {
            ConformanceOutcome::FitnessOnly { computed_at, .. } => computed_at.as_str(),
            ConformanceOutcome::LazyPending { computed_at, .. } => computed_at.as_str(),
            ConformanceOutcome::Full { computed_at, .. } => computed_at.as_str(),
        }
    }

    /// Return `true` if precision is available in this result.
    pub fn has_precision(&self) -> bool {
        matches!(self, ConformanceOutcome::Full { .. })
    }
}

// ---------------------------------------------------------------------------
// TraceEscapingEdgeSummary — per-trace diagnostics
// ---------------------------------------------------------------------------

/// Formal object from [MunozGama2010] §4: the per-trace breakdown of escaping
/// and consumed token counts used to aggregate `EtcPrecisionResult`.
///
/// Stored in sorted collections (`BTreeMap`/`BTreeSet`) for deterministic output.
///
/// # Invariant
/// `precision_contribution ∈ [0.0, 1.0]`.
#[derive(Clone, Debug, PartialEq)]
pub struct TraceEscapingEdgeSummary {
    /// Index of this trace in the event log (0-based).
    pub trace_index: u64,

    /// Escaping token count for this trace: `|escaping(σ, N)|`.
    pub escaping: u64,

    /// Consumed token count for this trace: `|consumed(σ, N)|`.
    pub consumed: u64,

    /// Per-trace precision contribution:
    /// `1 − escaping / (escaping + consumed)`, or `1.0` if both are zero.
    ///
    /// Invariant: value ∈ [0.0, 1.0].
    pub precision_contribution: f64,

    /// Sorted set of activity labels that were observed as escaping at some
    /// replay step in this trace. Populated for diagnostic/reporting purposes.
    pub escaping_activity_labels: BTreeSet<String>,
}

impl TraceEscapingEdgeSummary {
    /// Construct a summary, deriving `precision_contribution` from raw counters.
    pub fn from_counters(
        trace_index: u64,
        escaping: u64,
        consumed: u64,
        escaping_activity_labels: BTreeSet<String>,
    ) -> Self {
        let precision_contribution = if escaping == 0 && consumed == 0 {
            1.0
        } else {
            let e = escaping as f64;
            let c = consumed as f64;
            (1.0 - e / (e + c)).clamp(0.0, 1.0)
        };
        TraceEscapingEdgeSummary {
            trace_index,
            escaping,
            consumed,
            precision_contribution,
            escaping_activity_labels,
        }
    }
}

// ---------------------------------------------------------------------------
// EscapingEdgeIndex — activity-level escaping edge accounting
// ---------------------------------------------------------------------------

/// Formal object from [MunozGama2010] §4: a sorted index mapping each activity
/// label to the cumulative number of times it appeared as an escaping edge
/// across all traces.
///
/// Uses `BTreeMap` for deterministic iteration order.
///
/// # Example
/// ```text
/// {
///   "Approve": 3,   // transition "Approve" was enabled-but-not-fired 3 times
///   "Reject":  7,
/// }
/// ```
#[derive(Clone, Debug, PartialEq, Eq)]
#[repr(transparent)]
pub struct EscapingEdgeIndex(BTreeMap<String, u64>);

impl EscapingEdgeIndex {
    /// Create an empty index.
    pub fn new() -> Self {
        EscapingEdgeIndex(BTreeMap::new())
    }

    /// Increment the escaping count for `activity` by `count`.
    pub fn record(&mut self, activity: &str, count: u64) {
        *self.0.entry(activity.into()).or_insert(0) += count;
    }

    /// Return the total number of escaping edge occurrences across all activities.
    pub fn total_escaping(&self) -> u64 {
        self.0.values().copied().sum()
    }

    /// Return the sorted activity labels with non-zero escaping counts.
    pub fn escaping_activities(&self) -> Vec<&str> {
        self.0.keys().map(|s| s.as_str()).collect()
    }
}

impl Default for EscapingEdgeIndex {
    fn default() -> Self {
        EscapingEdgeIndex::new()
    }
}

impl Deref for EscapingEdgeIndex {
    type Target = BTreeMap<String, u64>;

    fn deref(&self) -> &BTreeMap<String, u64> {
        &self.0
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for EscapingEdgeIndex {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(s)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for EscapingEdgeIndex {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        BTreeMap::deserialize(d).map(EscapingEdgeIndex)
    }
}

// ---------------------------------------------------------------------------
// PrecisionDiagnostics — full diagnostic payload
// ---------------------------------------------------------------------------

/// Formal object from [MunozGama2010]: the complete diagnostic payload produced
/// by a full ETConformance precision computation.
///
/// Contains the aggregated `EtcPrecisionResult`, per-trace summaries (sorted by
/// `trace_index`), and an activity-level `EscapingEdgeIndex`.
///
/// Callers requesting `--precision-mode fast` never receive this type.
#[derive(Clone, Debug, PartialEq)]
pub struct PrecisionDiagnostics {
    /// Aggregated result (formula §4 Def 4.2).
    pub result: EtcPrecisionResult,

    /// Per-trace breakdowns, ordered by `trace_index`.
    ///
    /// Stored in a `BTreeMap` keyed by `trace_index` for O(log n) lookup and
    /// deterministic serialisation.
    pub trace_summaries: BTreeMap<u64, TraceEscapingEdgeSummary>,

    /// Activity-level escaping edge counts across all traces.
    pub escaping_index: EscapingEdgeIndex,

    /// The `PrecisionMode` that was active when this diagnostics object was built.
    pub mode: PrecisionMode,
}

impl PrecisionDiagnostics {
    /// Build `PrecisionDiagnostics` from a collection of per-trace summaries.
    ///
    /// Aggregates `escaping` and `consumed` counters across all summaries and
    /// derives the overall `EtcPrecisionResult`.
    pub fn from_trace_summaries(
        summaries: Vec<TraceEscapingEdgeSummary>,
        mode: PrecisionMode,
    ) -> Self {
        let total_traces = summaries.len() as u64;
        let mut total_escaping: u64 = 0;
        let mut total_consumed: u64 = 0;
        let mut escaping_index = EscapingEdgeIndex::new();
        let mut trace_summaries: BTreeMap<u64, TraceEscapingEdgeSummary> = BTreeMap::new();

        for summary in summaries {
            total_escaping = total_escaping.saturating_add(summary.escaping);
            total_consumed = total_consumed.saturating_add(summary.consumed);
            for label in &summary.escaping_activity_labels {
                escaping_index.record(label, 1);
            }
            trace_summaries.insert(summary.trace_index, summary);
        }

        let result =
            EtcPrecisionResult::from_counters(total_escaping, total_consumed, total_traces);

        PrecisionDiagnostics {
            result,
            trace_summaries,
            escaping_index,
            mode,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::string::ToString;

    // --- PrecisionScore ---

    #[test]
    fn precision_score_clamps_above_one() {
        let s = PrecisionScore::new(1.5);
        assert!((s.value() - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn precision_score_clamps_below_zero() {
        let s = PrecisionScore::new(-0.1);
        assert!((s.value() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn precision_score_deref() {
        let s = PrecisionScore::new(0.75);
        // deref gives &f64
        assert!((*s - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn precision_score_empty_log() {
        assert!((PrecisionScore::empty_log().value() - 1.0).abs() < f64::EPSILON);
    }

    // --- EtcPrecisionResult ---

    #[test]
    fn etc_result_formula_matches_paper() {
        // Munoz-Gama & Carmona 2010 §4 Def 4.2:
        // precision = 1 − escaping / (escaping + consumed)
        let r = EtcPrecisionResult::from_counters(10, 30, 5);
        let expected = 1.0 - 10.0 / (10.0 + 30.0); // 0.75
        assert!((r.precision_f64() - expected).abs() < 1e-10);
        assert_eq!(r.total_escaping, 10);
        assert_eq!(r.total_consumed, 30);
        assert_eq!(r.total_traces, 5);
    }

    #[test]
    fn etc_result_empty_log_yields_one() {
        let r = EtcPrecisionResult::from_counters(0, 0, 0);
        assert!((r.precision_f64() - 1.0).abs() < f64::EPSILON);
        assert!(r.is_empty_log());
    }

    #[test]
    fn etc_result_no_escaping_yields_one() {
        // consumed > 0 but escaping == 0 → precision = 1.0
        let r = EtcPrecisionResult::from_counters(0, 100, 10);
        assert!((r.precision_f64() - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn etc_result_all_escaping_yields_zero() {
        // escaping >> consumed → precision approaches 0
        let r = EtcPrecisionResult::from_counters(1_000_000, 0, 10);
        assert!((r.precision_f64() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn etc_result_precision_in_range() {
        for (e, c) in [(0u64, 0), (5, 5), (10, 90), (99, 1), (0, 50)] {
            let r = EtcPrecisionResult::from_counters(e, c, 1);
            assert!(
                r.precision_f64() >= 0.0 && r.precision_f64() <= 1.0,
                "out of range for e={e}, c={c}"
            );
        }
    }

    // --- PrecisionMode ---

    #[test]
    fn precision_mode_fast_skips_precision() {
        assert!(PrecisionMode::Fast.skips_precision());
        assert!(!PrecisionMode::Fast.computes_precision_eagerly());
    }

    #[test]
    fn precision_mode_full_computes_eagerly() {
        assert!(PrecisionMode::Full.computes_precision_eagerly());
        assert!(!PrecisionMode::Full.skips_precision());
    }

    #[test]
    fn precision_mode_lazy_skips_precision() {
        assert!(PrecisionMode::Lazy.skips_precision());
        assert!(!PrecisionMode::Lazy.computes_precision_eagerly());
    }

    #[test]
    fn precision_mode_display() {
        assert_eq!(PrecisionMode::Fast.to_string(), "fast");
        assert_eq!(PrecisionMode::Lazy.to_string(), "lazy");
        assert_eq!(PrecisionMode::Full.to_string(), "full");
    }

    // --- ConformanceOutcome ---

    #[test]
    fn outcome_fitness_only_has_no_precision() {
        let o = ConformanceOutcome::FitnessOnly {
            fitness: 0.88,
            computed_at: "fast".into(),
        };
        assert!((o.fitness() - 0.88).abs() < f64::EPSILON);
        assert!(o.precision().is_none());
        assert!(!o.has_precision());
        assert_eq!(o.computed_at(), "fast");
    }

    #[test]
    fn outcome_full_has_precision() {
        let prec = EtcPrecisionResult::from_counters(5, 45, 3);
        let o = ConformanceOutcome::Full {
            fitness: 0.90,
            precision: prec,
            computed_at: "full".into(),
        };
        assert!((o.fitness() - 0.90).abs() < f64::EPSILON);
        assert!(o.precision().is_some());
        assert!(o.has_precision());
        assert_eq!(o.computed_at(), "full");
    }

    #[test]
    fn outcome_lazy_pending_has_no_precision() {
        let o = ConformanceOutcome::LazyPending {
            fitness: 0.85,
            cache_key: "abc:def".into(),
            computed_at: "lazy".into(),
        };
        assert!((o.fitness() - 0.85).abs() < f64::EPSILON);
        assert!(o.precision().is_none());
    }

    // --- TraceEscapingEdgeSummary ---

    #[test]
    fn trace_summary_precision_contribution_formula() {
        let labels: BTreeSet<String> = ["A".into(), "B".into()].into_iter().collect();
        let s = TraceEscapingEdgeSummary::from_counters(0, 10, 30, labels);
        let expected = 1.0 - 10.0 / 40.0;
        assert!((s.precision_contribution - expected).abs() < 1e-10);
    }

    #[test]
    fn trace_summary_empty_trace_yields_one() {
        let s = TraceEscapingEdgeSummary::from_counters(0, 0, 0, BTreeSet::new());
        assert!((s.precision_contribution - 1.0).abs() < f64::EPSILON);
    }

    // --- EscapingEdgeIndex ---

    #[test]
    fn escaping_index_accumulates_counts() {
        let mut idx = EscapingEdgeIndex::new();
        idx.record("A", 3);
        idx.record("B", 7);
        idx.record("A", 2);
        assert_eq!(idx.get("A").copied(), Some(5));
        assert_eq!(idx.get("B").copied(), Some(7));
        assert_eq!(idx.total_escaping(), 12);
    }

    #[test]
    fn escaping_index_sorted_keys() {
        let mut idx = EscapingEdgeIndex::new();
        idx.record("Zeta", 1);
        idx.record("Alpha", 1);
        idx.record("Mu", 1);
        let keys: Vec<&str> = idx.escaping_activities();
        assert_eq!(keys, vec!["Alpha", "Mu", "Zeta"]);
    }

    #[test]
    fn escaping_index_deref_gives_btreemap() {
        let mut idx = EscapingEdgeIndex::new();
        idx.record("X", 5);
        // deref access
        assert_eq!((*idx).get("X"), Some(&5u64));
    }

    // --- PrecisionDiagnostics ---

    #[test]
    fn precision_diagnostics_aggregates_summaries() {
        let s0 =
            TraceEscapingEdgeSummary::from_counters(0, 4, 16, ["A".into()].into_iter().collect());
        let s1 =
            TraceEscapingEdgeSummary::from_counters(1, 6, 24, ["B".into()].into_iter().collect());
        let diag =
            PrecisionDiagnostics::from_trace_summaries(alloc::vec![s0, s1], PrecisionMode::Full);

        assert_eq!(diag.result.total_escaping, 10);
        assert_eq!(diag.result.total_consumed, 40);
        assert_eq!(diag.result.total_traces, 2);
        // 1 − 10/50 = 0.8
        assert!((diag.result.precision_f64() - 0.8).abs() < 1e-10);
        assert_eq!(diag.trace_summaries.len(), 2);
        assert_eq!(diag.mode, PrecisionMode::Full);
    }

    #[test]
    fn precision_diagnostics_empty_yields_full_precision() {
        let diag = PrecisionDiagnostics::from_trace_summaries(alloc::vec![], PrecisionMode::Fast);
        assert!((diag.result.precision_f64() - 1.0).abs() < f64::EPSILON);
        assert_eq!(diag.result.total_traces, 0);
    }
}
