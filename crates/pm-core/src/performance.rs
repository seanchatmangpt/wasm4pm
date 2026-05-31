//! Performance spectrum types using DurationNs newtype for all time measurements. The typed newtype prevents the ms/ns mixing bug and documents the unit at the type level.
//! Paper grounding: Denisov, Fahland & van der Aalst 2018 'Unbiased, Fine-Grained Description of Processes Performance from Event Data' §3: the performance spectrum is a 2D visualisation of case flow over time. Each segment (a, b) in the DFG has a distribution of durations across all observed transitions.

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use core::ops::Deref;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

// ─── Newtypes ──────────────────────────────────────────────────────────────

/// Newtype over [`String`] for an activity (node) name in a directly-follows
/// graph.
///
/// Using a dedicated type rather than a raw `String` makes field assignments
/// self-documenting at call sites and prevents mixing activity names with other
/// free-form strings (case IDs, resource labels, etc.).
///
/// # Zero-cost guarantee
/// `#[repr(transparent)]` ensures the layout is identical to `String`; the
/// compiler will optimise away the wrapper in release builds.
#[repr(transparent)]
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ActivityName(pub String);

impl ActivityName {
    /// Construct an [`ActivityName`] from any type that converts into a
    /// [`String`].
    #[inline]
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }
}

impl Deref for ActivityName {
    type Target = String;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<String> for ActivityName {
    #[inline]
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for ActivityName {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.into())
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Duration measured in **nanoseconds** (i.e. 10⁻⁹ seconds).
///
/// All performance-spectrum timing values are stored as `DurationNs` to make
/// the unit explicit at the type level.  This prevents the ms/ns confusion that
/// led to the audit finding in the original `wasm4pm` `ActivityPerformance`
/// struct (which used bare `f64` fields named `*_ms`).
///
/// Valid range: `[0, i64::MAX]`.  Negative durations are not meaningful in a
/// process-mining context; callers should clamp or reject negative raw values
/// before wrapping them.
///
/// # Zero-cost guarantee
/// `#[repr(transparent)]` ensures the layout is identical to `i64`.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DurationNs(pub i64);

impl DurationNs {
    /// The zero-duration sentinel (0 ns).
    pub const ZERO: Self = Self(0);

    /// Wrap a raw nanosecond count.
    #[inline]
    pub fn new(ns: i64) -> Self {
        Self(ns)
    }

    /// Return the raw nanosecond count.
    #[inline]
    pub fn as_i64(self) -> i64 {
        self.0
    }

    /// Convert to milliseconds as `f64` (lossy).
    #[inline]
    pub fn as_millis_f64(self) -> f64 {
        self.0 as f64 / 1_000_000.0
    }

    /// Construct from a millisecond value by scaling to nanoseconds.
    ///
    /// The conversion multiplies by 1 000 000 and truncates to `i64`.
    #[inline]
    pub fn from_millis_f64(ms: f64) -> Self {
        Self((ms * 1_000_000.0) as i64)
    }
}

impl Deref for DurationNs {
    type Target = i64;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<i64> for DurationNs {
    #[inline]
    fn from(ns: i64) -> Self {
        Self(ns)
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Count of event occurrences (trace visits) observed for a directly-follows
/// segment.
///
/// Using a dedicated newtype instead of `usize` documents the semantic at the
/// type level and distinguishes observation counts from array indices or
/// algorithm iteration counters.
///
/// Valid range: `[0, usize::MAX]`.
///
/// # Zero-cost guarantee
/// `#[repr(transparent)]` ensures the layout is identical to `usize`.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Frequency(pub usize);

impl Frequency {
    /// The zero-frequency sentinel.
    pub const ZERO: Self = Self(0);

    /// Wrap a raw count.
    #[inline]
    pub fn new(count: usize) -> Self {
        Self(count)
    }

    /// Return the raw count.
    #[inline]
    pub fn as_usize(self) -> usize {
        self.0
    }
}

impl Deref for Frequency {
    type Target = usize;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<usize> for Frequency {
    #[inline]
    fn from(n: usize) -> Self {
        Self(n)
    }
}

// ─── Core types ────────────────────────────────────────────────────────────

/// Segment statistics for directly-follows pair `(a, b)` — the statistical
/// summary of Δt(a, b) over all trace occurrences in the performance spectrum.
///
/// Formal object from [DenisovFahlandVanDerAalst2018]: the performance
/// spectrum partitions the 2-D time×segment space (§3 Def 3.1).  Each unique
/// `(from_activity, to_activity)` pair constitutes one *segment*; this struct
/// summarises the observed duration distribution for that segment.
///
/// # Unit invariant
/// All `*_duration` fields are expressed in nanoseconds via the [`DurationNs`]
/// newtype.  Callers converting from millisecond-resolution sources must apply
/// [`DurationNs::from_millis_f64`] before constructing this type.  Storing
/// values in nanoseconds avoids the audit-finding of silent ms/ns confusion
/// found in the legacy `wasm4pm` `ActivityPerformance` struct.
///
/// # Mathematical invariants
/// - `count` ≥ 0 (trivially, `Frequency` is unsigned)
/// - `min_duration` ≤ `median_duration` ≤ `max_duration` (when `count` > 0)
/// - `min_duration` ≤ `mean_duration` ≤ `max_duration` (when `count` > 0)
/// - When `count` == 0 all duration fields should be [`DurationNs::ZERO`]
///
/// These invariants are **not** enforced by the constructor (this is a
/// data-only type with no algorithm logic); they are the responsibility of the
/// algorithm that populates the struct.
///
/// # `DurationNs` replaces raw `f64 *_ms` values in wasm4pm `ActivityPerformance`
/// [`ActivityName`] newtypes replace raw [`String`] fields.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ActivityPerformance {
    /// Source activity of the directly-follows segment.
    ///
    /// Corresponds to node *a* in the segment `(a, b)` notation of
    /// Denisov et al. 2018 §3.
    pub from_activity: ActivityName,

    /// Target activity of the directly-follows segment.
    ///
    /// Corresponds to node *b* in the segment `(a, b)` notation of
    /// Denisov et al. 2018 §3.
    pub to_activity: ActivityName,

    /// Number of trace occurrences (case visits) observed for this segment.
    ///
    /// Equivalent to |{(c, i) : trace c contains the directly-follows pair
    /// (a, b) at position i}| in the log.
    pub count: Frequency,

    /// Minimum observed duration Δt(a, b) across all trace occurrences, in
    /// nanoseconds.
    pub min_duration: DurationNs,

    /// Maximum observed duration Δt(a, b) across all trace occurrences, in
    /// nanoseconds.
    pub max_duration: DurationNs,

    /// Arithmetic mean of all observed durations Δt(a, b), in nanoseconds.
    ///
    /// Mean is stored as `DurationNs` (i64) after rounding from the floating-
    /// point intermediate; algorithms computing the mean must round to the
    /// nearest nanosecond before storing.
    pub mean_duration: DurationNs,

    /// Median of all observed durations Δt(a, b), in nanoseconds.
    ///
    /// For even-cardinality observation sets the median is the average of the
    /// two central values, rounded to the nearest nanosecond.
    pub median_duration: DurationNs,
}

impl ActivityPerformance {
    /// Construct a new [`ActivityPerformance`].
    ///
    /// No invariant checking is performed; the caller is responsible for
    /// ensuring `min_duration` ≤ `median_duration` ≤ `max_duration`.
    #[inline]
    pub fn new(
        from_activity: ActivityName,
        to_activity: ActivityName,
        count: Frequency,
        min_duration: DurationNs,
        max_duration: DurationNs,
        mean_duration: DurationNs,
        median_duration: DurationNs,
    ) -> Self {
        Self {
            from_activity,
            to_activity,
            count,
            min_duration,
            max_duration,
            mean_duration,
            median_duration,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Performance spectrum anchored on one target activity node — the set of
/// directly-follows segments involving that activity.
///
/// Formal object from [DenisovFahlandVanDerAalst2018]: the performance
/// spectrum (§3) is a 2-D visualisation of case flow over time, partitioned by
/// directly-follows segment.  A [`PerformanceSpectrum`] value collects all
/// segments that have `target_activity` as their *source* node, summarised by
/// [`ActivityPerformance`] entries in `segments`.
///
/// # Relationship to wasm4pm `PerformanceSpectrumResult`
/// - `target_activity` is an [`ActivityName`] newtype (was `String`).
/// - `segments` replaces the `measurements` field of the legacy type, and each
///   entry uses typed [`DurationNs`] and [`ActivityName`] fields instead of raw
///   `f64 *_ms` / `String` pairs.
///
/// # Ordering
/// `segments` is not required to be in any particular order; consumers that
/// need a deterministic order should sort by `(from_activity, to_activity)`.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct PerformanceSpectrum {
    /// The activity node for which this spectrum was computed.
    ///
    /// Corresponds to the *source* node *a* whose outgoing directly-follows
    /// segments are enumerated in `segments`.
    pub target_activity: ActivityName,

    /// Segment-level performance summaries for every directly-follows pair
    /// `(target_activity, b)` observed in the event log.
    ///
    /// May be empty when the target activity has no outgoing directly-follows
    /// relations in the log (e.g. it is the last activity in every trace).
    pub segments: Vec<ActivityPerformance>,
}

impl PerformanceSpectrum {
    /// Construct a [`PerformanceSpectrum`] with an empty segment list.
    #[inline]
    pub fn empty(target_activity: ActivityName) -> Self {
        Self {
            target_activity,
            segments: Vec::new(),
        }
    }

    /// Construct a [`PerformanceSpectrum`] with a pre-populated segment list.
    #[inline]
    pub fn new(target_activity: ActivityName, segments: Vec<ActivityPerformance>) -> Self {
        Self {
            target_activity,
            segments,
        }
    }

    /// Return the number of distinct directly-follows segments recorded.
    #[inline]
    pub fn segment_count(&self) -> usize {
        self.segments.len()
    }

    /// Return the total number of trace observations across all segments.
    #[inline]
    pub fn total_observations(&self) -> usize {
        self.segments.iter().map(|s| s.count.as_usize()).sum()
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::string::ToString;

    // ── ActivityName ────────────────────────────────────────────────────────

    #[test]
    fn activity_name_roundtrip() {
        let name = ActivityName::new("Register");
        assert_eq!(*name, "Register".to_string());
    }

    #[test]
    fn activity_name_from_str() {
        let name: ActivityName = "Approve".into();
        assert_eq!(name.0, "Approve");
    }

    #[test]
    fn activity_name_deref_to_string() {
        let name = ActivityName::new("Complete");
        // Deref should let us call String methods directly.
        assert!(name.starts_with("Comp"));
    }

    #[test]
    fn activity_name_ordering() {
        let a = ActivityName::new("A");
        let b = ActivityName::new("B");
        assert!(a < b);
    }

    // ── DurationNs ──────────────────────────────────────────────────────────

    #[test]
    fn duration_ns_zero() {
        assert_eq!(DurationNs::ZERO.as_i64(), 0);
    }

    #[test]
    fn duration_ns_from_millis_roundtrip() {
        let ms = 1234.5_f64;
        let dur = DurationNs::from_millis_f64(ms);
        // Within 1 ns of the exact value.
        let back = dur.as_millis_f64();
        let diff = (back - ms).abs();
        assert!(diff < 0.001, "roundtrip error: {} ms", diff);
    }

    #[test]
    fn duration_ns_one_second() {
        let dur = DurationNs::new(1_000_000_000);
        assert_eq!(dur.as_millis_f64(), 1000.0);
    }

    #[test]
    fn duration_ns_ordering() {
        let d1 = DurationNs::new(100);
        let d2 = DurationNs::new(200);
        assert!(d1 < d2);
    }

    #[test]
    fn duration_ns_deref() {
        let d = DurationNs::new(42);
        assert_eq!(*d, 42_i64);
    }

    // ── Frequency ───────────────────────────────────────────────────────────

    #[test]
    fn frequency_zero() {
        assert_eq!(Frequency::ZERO.as_usize(), 0);
    }

    #[test]
    fn frequency_from_usize() {
        let f: Frequency = 7.into();
        assert_eq!(f.as_usize(), 7);
    }

    #[test]
    fn frequency_deref() {
        let f = Frequency::new(99);
        assert_eq!(*f, 99_usize);
    }

    // ── ActivityPerformance ─────────────────────────────────────────────────

    #[test]
    fn activity_performance_construction() {
        let ap = ActivityPerformance::new(
            ActivityName::new("A"),
            ActivityName::new("B"),
            Frequency::new(10),
            DurationNs::new(1_000_000),      // 1 ms min
            DurationNs::new(5_000_000),      // 5 ms max
            DurationNs::new(3_000_000),      // 3 ms mean
            DurationNs::new(2_500_000),      // 2.5 ms median
        );

        assert_eq!(ap.from_activity.0, "A");
        assert_eq!(ap.to_activity.0, "B");
        assert_eq!(ap.count.as_usize(), 10);
        assert_eq!(ap.min_duration.as_i64(), 1_000_000);
        assert_eq!(ap.max_duration.as_i64(), 5_000_000);
        assert_eq!(ap.mean_duration.as_i64(), 3_000_000);
        assert_eq!(ap.median_duration.as_i64(), 2_500_000);
    }

    #[test]
    fn activity_performance_clone_eq() {
        let ap = ActivityPerformance::new(
            ActivityName::new("X"),
            ActivityName::new("Y"),
            Frequency::new(1),
            DurationNs::ZERO,
            DurationNs::ZERO,
            DurationNs::ZERO,
            DurationNs::ZERO,
        );
        assert_eq!(ap.clone(), ap);
    }

    // ── PerformanceSpectrum ─────────────────────────────────────────────────

    #[test]
    fn performance_spectrum_empty() {
        let ps = PerformanceSpectrum::empty(ActivityName::new("Start"));
        assert_eq!(ps.segment_count(), 0);
        assert_eq!(ps.total_observations(), 0);
    }

    #[test]
    fn performance_spectrum_segment_count() {
        let seg_a = ActivityPerformance::new(
            ActivityName::new("Start"),
            ActivityName::new("A"),
            Frequency::new(3),
            DurationNs::new(100),
            DurationNs::new(300),
            DurationNs::new(200),
            DurationNs::new(200),
        );
        let seg_b = ActivityPerformance::new(
            ActivityName::new("Start"),
            ActivityName::new("B"),
            Frequency::new(7),
            DurationNs::new(50),
            DurationNs::new(500),
            DurationNs::new(275),
            DurationNs::new(250),
        );
        let ps = PerformanceSpectrum::new(
            ActivityName::new("Start"),
            alloc::vec![seg_a, seg_b],
        );

        assert_eq!(ps.segment_count(), 2);
        assert_eq!(ps.total_observations(), 10); // 3 + 7
    }

    #[test]
    fn performance_spectrum_clone_eq() {
        let ps = PerformanceSpectrum::empty(ActivityName::new("Z"));
        assert_eq!(ps.clone(), ps);
    }

    #[test]
    fn performance_spectrum_target_activity_preserved() {
        let ps = PerformanceSpectrum::empty(ActivityName::new("MyActivity"));
        assert_eq!(ps.target_activity.0, "MyActivity");
    }

    // ── Invariant smoke-tests ───────────────────────────────────────────────

    /// Verify the unit-conversion helpers are consistent:
    /// 1 000 ms == 1 000 000 000 ns.
    #[test]
    fn duration_ns_ms_conversion_consistency() {
        let one_second_ms = 1_000.0_f64;
        let dur = DurationNs::from_millis_f64(one_second_ms);
        assert_eq!(dur.as_i64(), 1_000_000_000_i64);
    }

    /// Converting 0 ms must yield 0 ns.
    #[test]
    fn duration_ns_zero_from_millis() {
        let dur = DurationNs::from_millis_f64(0.0);
        assert_eq!(dur, DurationNs::ZERO);
    }
}
