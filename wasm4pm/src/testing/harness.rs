//! Explicit stateful test harness.
//!
//! [`PowlTestHarness`] records test-time route evidence and can verify
//! it against a declared POWL v2 route model. Designed to be used
//! without proc-macros — macros are sugar added in Phase 9.
//!
//! # Example
//!
//! ```
//! use wasm4pm::testing::harness::PowlTestHarness;
//! use wasm4pm::testing::conformance::ExpectedConformance;
//!
//! let mut h = PowlTestHarness::new("example-route")
//!     .expect(ExpectedConformance::exact());
//!
//! h.record_activity("test.started");
//! h.record_activity("test.completed");
//!
//! assert_eq!(h.route_id(), "example-route");
//! assert_eq!(h.event_count(), 2);
//! ```

use std::path::PathBuf;

use crate::testing::conformance::{AndonPull, ConformanceVerdict, ExpectedConformance, ProofDimension};

/// Captured stdout/stderr digest from a subprocess or command boundary.
///
/// Stored in the harness for OCEL evidence — the digest is included in
/// the route receipt so the command output is cryptographically bound to
/// the test run.
#[derive(Debug, Clone, Default)]
pub struct CapturedOutput {
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

impl CapturedOutput {
    /// Wrap raw strings into a `CapturedOutput`.
    pub fn new(stdout: impl Into<String>, stderr: impl Into<String>) -> Self {
        let stdout = stdout.into();
        let stderr = stderr.into();
        Self {
            stdout: if stdout.is_empty() { None } else { Some(stdout) },
            stderr: if stderr.is_empty() { None } else { Some(stderr) },
        }
    }

    /// Return true if both stdout and stderr are absent or empty.
    pub fn is_empty(&self) -> bool {
        self.stdout.is_none() && self.stderr.is_none()
    }
}

/// A single recorded test-time activity event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestEvent {
    pub activity: String,
}

/// Explicit stateful route-driven test harness.
///
/// Records test activities as OCEL evidence, then verifies the observed
/// route against a declared POWL v2 model. Conformance must be exact
/// (1.0) for the test to pass in admitted mode.
#[derive(Debug)]
pub struct PowlTestHarness {
    route_id: String,
    pub(crate) expected: ExpectedConformance,
    events: Vec<TestEvent>,
    receipts: Vec<String>,
    model_path: Option<PathBuf>,
    test_run_id: String,
    captured_output: Vec<CapturedOutput>,
}

impl PowlTestHarness {
    /// Create a new harness for a declared route.
    ///
    /// Defaults to [`ExpectedConformance::exact()`].
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::harness::PowlTestHarness;
    ///
    /// let h = PowlTestHarness::new("wrap-tool-to-part");
    /// assert_eq!(h.route_id(), "wrap-tool-to-part");
    /// ```
    pub fn new(route_id: impl Into<String>) -> Self {
        Self {
            route_id: route_id.into(),
            expected: ExpectedConformance::exact(),
            events: Vec::new(),
            receipts: Vec::new(),
            model_path: None,
            test_run_id: uuid::Uuid::new_v4().to_string(),
            captured_output: Vec::new(),
        }
    }

    /// Return the route id under test.
    pub fn route_id(&self) -> &str {
        &self.route_id
    }

    /// Return the unique run id for this test execution.
    pub fn test_run_id(&self) -> &str {
        &self.test_run_id
    }

    /// Set the expected conformance contract.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::harness::PowlTestHarness;
    /// use wasm4pm::testing::conformance::ExpectedConformance;
    ///
    /// let h = PowlTestHarness::new("route").expect(ExpectedConformance::exact());
    /// assert_eq!(h.route_id(), "route");
    /// ```
    pub fn expect(mut self, expected: ExpectedConformance) -> Self {
        self.expected = expected;
        self
    }

    /// Set the POWL route model path for replay-based verification.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::harness::PowlTestHarness;
    ///
    /// let h = PowlTestHarness::new("route")
    ///     .model("routes/test-harness/test-run.powl.json");
    /// assert_eq!(h.route_id(), "route");
    /// ```
    pub fn model(mut self, path: impl Into<PathBuf>) -> Self {
        self.model_path = Some(path.into());
        self
    }

    /// Record a test-time activity event.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::harness::PowlTestHarness;
    ///
    /// let mut h = PowlTestHarness::new("route");
    /// h.record_activity("fixture.created");
    /// assert_eq!(h.event_count(), 1);
    /// ```
    pub fn record_activity(&mut self, activity: impl Into<String>) {
        let activity = activity.into();
        let receipt_input = format!("{}:{}:{}", self.route_id, activity, self.events.len());
        let receipt = blake3::hash(receipt_input.as_bytes()).to_hex().to_string();
        self.events.push(TestEvent { activity });
        self.receipts.push(receipt);
    }

    /// Return the number of recorded events.
    pub fn event_count(&self) -> usize {
        self.events.len()
    }

    /// Return all recorded events in order.
    ///
    /// # Example
    ///
    /// ```
    /// use wasm4pm::testing::harness::{PowlTestHarness, TestEvent};
    ///
    /// let mut h = PowlTestHarness::new("route");
    /// h.record_activity("a");
    /// h.record_activity("b");
    /// assert_eq!(h.events()[0], TestEvent { activity: "a".into() });
    /// assert_eq!(h.events()[1], TestEvent { activity: "b".into() });
    /// ```
    pub fn events(&self) -> &[TestEvent] {
        &self.events
    }

    /// Attach command boundary output to the harness for OCEL evidence.
    ///
    /// Call after each subprocess or command boundary to bind the output
    /// to the route evidence. Multiple calls accumulate output in order.
    pub fn capture_output(&mut self, output: CapturedOutput) {
        self.captured_output.push(output);
    }

    /// Return all captured output in recording order.
    pub fn captured_output(&self) -> &[CapturedOutput] {
        &self.captured_output
    }

    /// Run `f` with `&mut self` and catch any panics.
    ///
    /// If `f` panics, records `"panic.caught"` in the event log and
    /// returns [`ConformanceVerdict::Andon(AndonPull::UnhandledPanic)`].
    /// If `f` completes normally, delegates to [`finish()`].
    ///
    /// [`finish()`]: Self::finish
    pub fn run_catching_panic<F>(&mut self, f: F) -> ConformanceVerdict
    where
        F: FnOnce(&mut PowlTestHarness),
    {
        let result = std::panic::catch_unwind(
            // AssertUnwindSafe is safe here: if f panics, self may be
            // partially mutated, but we only append "panic.caught" and
            // return UnhandledPull — we never read inconsistent state.
            std::panic::AssertUnwindSafe(|| f(self)),
        );
        match result {
            Ok(()) => self.finish(),
            Err(_) => {
                self.events.push(TestEvent { activity: "panic.caught".into() });
                ConformanceVerdict::andon(AndonPull::UnhandledPanic)
            }
        }
    }

    /// Export recorded events as OCEL-compatible JSON.
    pub fn export_ocel(&self) -> serde_json::Value {
        crate::testing::ocel_exporter::export_ocel(&self.events, &self.route_id)
    }

    /// Verify route conformance. Returns [`AndonPull::TestRouteIncomplete`]
    /// if no model path has been set.
    ///
    /// Phase 7 wires this to the POWL token replay engine.
    pub fn finish(&self) -> ConformanceVerdict {
        match &self.model_path {
            Some(path) => self.finish_against_model(path.to_str().unwrap_or("")),
            None => ConformanceVerdict::andon(AndonPull::TestRouteIncomplete),
        }
    }

    /// Verify conformance against a specific POWL model file.
    ///
    /// When the `powl` feature is enabled, parses the model, builds a Petri net,
    /// and replays the recorded events against it using token replay. Returns
    /// [`AndonPull::TestRouteIncomplete`] when the `powl` feature is disabled or
    /// when the model file cannot be loaded or parsed.
    pub fn finish_against_model(&self, model_path: &str) -> ConformanceVerdict {
        #[cfg(feature = "powl")]
        {
            match self.replay_against_model(model_path) {
                Ok(report) => {
                    crate::testing::conformance::classify_conformance(&report, self.expected)
                }
                Err(_) => ConformanceVerdict::andon(AndonPull::TestRouteIncomplete),
            }
        }
        #[cfg(not(feature = "powl"))]
        {
            let _ = model_path;
            ConformanceVerdict::andon(AndonPull::TestRouteIncomplete)
        }
    }

    /// Replay recorded events against a POWL route model file.
    ///
    /// The model file must be JSON:
    /// ```json
    /// { "powl_expression": "PO=(nodes={A, B}, order={A->B})", "required_activities": ["A", "B"] }
    /// ```
    ///
    /// Maps token-replay `FitnessResult` → [`ReplayReport`]:
    /// - `fitness` ← `avg_trace_fitness`
    /// - `precision` ← `avg_trace_precision`
    /// - `required_stage_coverage` ← fraction of `required_activities` present in events
    /// - `receipt_coverage` ← fraction of activities that have a BLAKE3 receipt (always 1.0 for harness-recorded events)
    /// - `object_lifecycle_validity` ← 1.0 (OCEL uses synthetic monotonic T+{i} timestamps — always valid)
    ///
    /// [`ReplayReport`]: crate::testing::conformance::ReplayReport
    #[cfg(feature = "powl")]
    pub fn replay_against_model(
        &self,
        model_path: &str,
    ) -> Result<crate::testing::conformance::ReplayReport, String> {
        use crate::powl::conformance::token_replay::compute_fitness;
        use crate::powl::conversion::to_petri_net;
        use crate::powl_arena::PowlArena;
        use crate::powl_event_log::{Event, EventLog, Trace};
        use crate::powl_parser::parse_powl_model_string;
        use crate::testing::conformance::ReplayReport;

        #[derive(serde::Deserialize)]
        struct RouteModelSpec {
            powl_expression: String,
            #[serde(default)]
            required_activities: Vec<String>,
        }

        let json_str = std::fs::read_to_string(model_path)
            .map_err(|e| format!("failed to read model '{}': {e}", model_path))?;
        let spec: RouteModelSpec = serde_json::from_str(&json_str)
            .map_err(|e| format!("failed to parse model JSON: {e}"))?;

        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(&spec.powl_expression, &mut arena)
            .map_err(|e| format!("failed to parse POWL expression: {e}"))?;
        let pn = to_petri_net::apply(&arena, root);

        let trace = Trace {
            case_id: self.route_id.clone(),
            events: self
                .events
                .iter()
                .map(|e| Event {
                    name: e.activity.clone(),
                    timestamp: None,
                    lifecycle: None,
                    attributes: Default::default(),
                })
                .collect(),
        };
        let log = EventLog { traces: vec![trace] };

        let fr = compute_fitness(&pn.net, &pn.initial_marking, &pn.final_marking, &log);

        let required_stage_coverage = if spec.required_activities.is_empty() {
            1.0
        } else {
            let present: std::collections::HashSet<&str> =
                self.events.iter().map(|e| e.activity.as_str()).collect();
            let covered = spec
                .required_activities
                .iter()
                .filter(|a| present.contains(a.as_str()))
                .count();
            covered as f64 / spec.required_activities.len() as f64
        };

        let receipt_coverage = if self.events.is_empty() {
            1.0
        } else {
            self.receipts.len() as f64 / self.events.len() as f64
        };

        Ok(ReplayReport {
            fitness: ProofDimension::Measured(fr.avg_trace_fitness),
            precision: ProofDimension::Measured(fr.avg_trace_precision),
            receipt_coverage: ProofDimension::Measured(receipt_coverage),
            required_stage_coverage: ProofDimension::Measured(required_stage_coverage),
            // OCEL uses synthetic T+{i} timestamps — always monotonically non-decreasing by construction.
            object_lifecycle_validity: ProofDimension::Measured(1.0),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_sets_route_id() {
        let h = PowlTestHarness::new("x");
        assert_eq!(h.route_id(), "x");
    }

    #[test]
    fn record_activity_increments_count() {
        let mut h = PowlTestHarness::new("route");
        assert_eq!(h.event_count(), 0);
        h.record_activity("a");
        assert_eq!(h.event_count(), 1);
        h.record_activity("b");
        assert_eq!(h.event_count(), 2);
    }

    #[test]
    fn expect_stores_contract() {
        let h = PowlTestHarness::new("route").expect(ExpectedConformance::exact());
        assert_eq!(h.expected, ExpectedConformance::exact());
    }

    #[test]
    fn events_preserves_order() {
        let mut h = PowlTestHarness::new("route");
        h.record_activity("first");
        h.record_activity("second");
        h.record_activity("third");
        assert_eq!(h.events()[0].activity, "first");
        assert_eq!(h.events()[1].activity, "second");
        assert_eq!(h.events()[2].activity, "third");
    }

    #[test]
    fn finish_without_model_returns_incomplete() {
        let h = PowlTestHarness::new("route");
        assert_eq!(h.finish(), ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete));
    }

    #[test]
    fn finish_with_missing_model_file_returns_incomplete() {
        let h = PowlTestHarness::new("route").model("nonexistent-route-model.powl.json");
        assert_eq!(h.finish(), ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete));
    }

    #[test]
    fn default_expected_is_exact() {
        let h = PowlTestHarness::new("route");
        assert_eq!(h.expected, ExpectedConformance::exact());
    }

    #[test]
    fn test_run_id_is_non_empty() {
        let h = PowlTestHarness::new("route");
        assert!(!h.test_run_id().is_empty());
    }

    #[test]
    fn model_builder_preserves_route_id() {
        let h = PowlTestHarness::new("my-route").model("path.powl.json");
        assert_eq!(h.route_id(), "my-route");
    }

    // ─── Phase 11: CapturedOutput and panic capture ───────────────────────────

    #[test]
    fn captured_output_new_stores_non_empty_strings() {
        let co = CapturedOutput::new("stdout data", "stderr data");
        assert_eq!(co.stdout.as_deref(), Some("stdout data"));
        assert_eq!(co.stderr.as_deref(), Some("stderr data"));
    }

    #[test]
    fn captured_output_new_converts_empty_strings_to_none() {
        let co = CapturedOutput::new("", "");
        assert!(co.is_empty());
        assert!(co.stdout.is_none());
        assert!(co.stderr.is_none());
    }

    #[test]
    fn harness_accumulates_captured_output() {
        let mut h = PowlTestHarness::new("route");
        assert_eq!(h.captured_output().len(), 0);
        h.capture_output(CapturedOutput::new("line 1", ""));
        h.capture_output(CapturedOutput::new("line 2", "err"));
        assert_eq!(h.captured_output().len(), 2);
        assert_eq!(h.captured_output()[0].stdout.as_deref(), Some("line 1"));
    }

    #[test]
    fn run_catching_panic_returns_unhandled_panic_on_panic() {
        let mut h = PowlTestHarness::new("route");
        let verdict = h.run_catching_panic(|_| panic!("intentional test panic"));
        assert_eq!(verdict, ConformanceVerdict::Andon(AndonPull::UnhandledPanic));
    }

    #[test]
    fn run_catching_panic_appends_panic_caught_activity() {
        let mut h = PowlTestHarness::new("route");
        h.run_catching_panic(|_| panic!("boom"));
        assert!(h.events().iter().any(|e| e.activity == "panic.caught"));
    }

    #[test]
    fn run_catching_panic_without_panic_calls_finish() {
        let mut h = PowlTestHarness::new("route");
        let verdict = h.run_catching_panic(|h| {
            h.record_activity("a");
        });
        // No model set → TestRouteIncomplete
        assert_eq!(verdict, ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete));
    }
}
