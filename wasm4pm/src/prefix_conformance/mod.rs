//! Prefix / online conformance oracle (spec: `docs/archive/2026-06-09/ggen-oracle/
//! 04-prefix-and-online-conformance.md`, sections 6-9).
//!
//! Pure Rust — no `wasm-bindgen` dependency (spec acceptance criterion 8:
//! usable from a plain `cargo test`).

pub mod law;

pub use law::{CompiledLaw, OrderingLaw, Precedence};

use std::collections::HashMap;

/// Local mirror of `wasm4pm::receipt::FindingSeverity` (2-variant: Deny,
/// Warning). Defined locally per spec §13 Q1 recommendation to avoid
/// coupling `prefix_conformance` to `receipt.rs`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum FindingSeverity {
    Deny,
    Warning,
}

/// The verdict for one case's current prefix (spec §7.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PrefixVerdict {
    /// Legal prefix; at least one lawful completion to an accepting state
    /// exists.
    #[serde(rename = "ALIVE")]
    Alive,
    /// No lawful completion exists — STOP THE LINE.
    #[serde(rename = "DEAD")]
    Dead,
    /// The prefix is itself a complete, lawfully closed trace.
    #[serde(rename = "TERMINAL")]
    Terminal,
}

/// Stable refusal codes — mirrors `ReceiptTruthRefusal` (receipt.rs:33)
/// naming convention (spec §5, §7.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PrefixRefusal {
    ReceiptBeforeGate,
    RepairWithoutRoute,
    ClearWithoutDiagnostic,
    SuggestWithoutRoute,
    RouteWithoutDiagnostic,
    OutOfOrderTimestamp,
    DuplicateTerminal,
    RepeatedActivity,
    // TO BE BUILT (cross-checkpoint, sibling-owned; spec §5 D9/D10):
    HarnessActiveBeforeOutReceipt,
    ArtifactMutationOutsideSync,
}

/// One finding — same shape as `ReceiptFinding` (receipt.rs:62) so reports
/// are uniform across `receipt doctor` and the prefix oracle (spec §7.1).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrefixFinding {
    pub code: PrefixRefusal,
    pub severity: FindingSeverity,
    /// e.g. `"$.events[4]"` — index into the tape.
    pub json_path: String,
    pub message: String,
    /// `(file|diagnostic_code|run_id)`.
    pub case_id: String,
    /// The offending event's activity.
    pub activity: String,
}

/// Per-case incremental cursor (the online state). One per open episode
/// (spec §7.1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaseCursor {
    pub case_id: String,
    /// Current state in the [`CompiledLaw`] automaton.
    pub dfa_state: usize,
    /// Activities folded so far (small — up to roughly 8).
    pub seen: Vec<String>,
    /// For D6 temporal soundness.
    pub last_time_ms: i64,
    pub verdict: PrefixVerdict,
}

/// Minimal event the oracle needs — derived from an OCEL event (spec §7.1,
/// shape 2.A/2.C).
#[derive(Debug, Clone)]
pub struct PrefixEvent {
    /// From `OCELEvent.event_type` (serde alias `"activity"`).
    pub activity: String,
    /// From `OCELEvent.time`.
    pub time_ms: i64,
    /// Derived from `event.relationships`/`objects` per the law's
    /// `case_key`.
    pub case_id: String,
    /// Line number in the `.jsonl`, for `json_path`.
    pub tape_index: usize,
}

/// The impossible-prefix detectors (spec §5, D1-D5): given the activities
/// already folded for a case and the *next* activity that the DFA has
/// already rejected (i.e. there is no lawful edge for it), pick the stable
/// refusal code + message that names *why*. This is a law-specific mapping
/// (the code names are tied to the 6-link law's own activity vocabulary,
/// exactly as spec §5's table hardcodes them), not a generic Declare
/// checker.
fn detect_reason(seen: &[String], activity: &str) -> (PrefixRefusal, String) {
    let has = |name: &str| seen.iter().any(|s| s == name);

    if activity == "ReceiptEmitted" && !has("GatePassed") {
        return (
            PrefixRefusal::ReceiptBeforeGate,
            "ReceiptEmitted cannot follow this prefix: GatePassed never observed".to_string(),
        );
    }
    if activity == "RepairApplied" && !has("RouteSelected") {
        return (
            PrefixRefusal::RepairWithoutRoute,
            "RepairApplied cannot follow this prefix: RouteSelected never observed".to_string(),
        );
    }
    if (activity == "ReceiptEmitted" || activity == "RefusalEmitted" || activity == "GateFailed")
        && !has("DiagnosticRaised")
    {
        return (
            PrefixRefusal::ClearWithoutDiagnostic,
            format!("{activity} cannot follow this prefix: DiagnosticRaised never observed"),
        );
    }
    if activity == "RepairSuggested" && !has("RouteSelected") {
        return (
            PrefixRefusal::SuggestWithoutRoute,
            "RepairSuggested cannot follow this prefix: RouteSelected never observed".to_string(),
        );
    }
    if activity == "RouteSelected" && !has("DiagnosticRaised") {
        return (
            PrefixRefusal::RouteWithoutDiagnostic,
            "RouteSelected cannot follow this prefix: DiagnosticRaised never observed".to_string(),
        );
    }
    if activity == "GatePassed" && !has("RepairApplied") {
        // Not a named detector in spec §5's table (a genuine gap: no D-id
        // covers a bare GatePassed skipping RepairApplied); reuse the
        // nearest precedence-violation code rather than inventing a new
        // enum variant outside the spec.
        return (
            PrefixRefusal::RepairWithoutRoute,
            "GatePassed cannot follow this prefix: RepairApplied never observed".to_string(),
        );
    }

    // Fallback: illegal open (empty/insufficient prefix, activity not in
    // `law.initial` and not covered by a more specific predicate above).
    (
        PrefixRefusal::ClearWithoutDiagnostic,
        format!("{activity} cannot legally open or continue this prefix"),
    )
}

/// Shared stepping logic for both [`PrefixOracle::classify_prefix`] (batch)
/// and [`PrefixOracle::observe`] (incremental) — spec acceptance criterion
/// 3 requires these two paths to agree.
fn step(
    law: &CompiledLaw,
    cursor: &mut CaseCursor,
    case_id: &str,
    activity: &str,
    time_ms: i64,
    tape_index: usize,
) -> Vec<PrefixFinding> {
    let mut findings = Vec::new();

    // A case that already died stays dead; no further findings.
    if cursor.verdict == PrefixVerdict::Dead {
        return findings;
    }

    let json_path = format!("$.events[{tape_index}]");

    // D6: temporal soundness.
    if time_ms < cursor.last_time_ms {
        cursor.verdict = PrefixVerdict::Dead;
        findings.push(PrefixFinding {
            code: PrefixRefusal::OutOfOrderTimestamp,
            severity: FindingSeverity::Deny,
            json_path,
            message: format!(
                "event time {time_ms} precedes last observed time {} for case {case_id}",
                cursor.last_time_ms
            ),
            case_id: case_id.to_string(),
            activity: activity.to_string(),
        });
        return findings;
    }
    cursor.last_time_ms = time_ms;

    // D7: a case may close once.
    if cursor.verdict == PrefixVerdict::Terminal {
        cursor.verdict = PrefixVerdict::Dead;
        findings.push(PrefixFinding {
            code: PrefixRefusal::DuplicateTerminal,
            severity: FindingSeverity::Deny,
            json_path,
            message: format!(
                "case {case_id} already reached a terminal state; {activity} is not a lawful continuation"
            ),
            case_id: case_id.to_string(),
            activity: activity.to_string(),
        });
        return findings;
    }

    // D8: repeated activity — warning only, does not kill the prefix.
    if cursor.seen.iter().any(|a| a == activity) {
        findings.push(PrefixFinding {
            code: PrefixRefusal::RepeatedActivity,
            severity: FindingSeverity::Warning,
            json_path: json_path.clone(),
            message: format!("activity {activity} repeated for case {case_id}"),
            case_id: case_id.to_string(),
            activity: activity.to_string(),
        });
    }

    let next_state = law
        .edges
        .get(&(cursor.dfa_state, activity.to_string()))
        .copied()
        .unwrap_or(law.dead_sink);

    let dead_by_transition = next_state == law.dead_sink;
    let dead_by_completability =
        !dead_by_transition && !law.completable.get(next_state).copied().unwrap_or(false);

    if dead_by_transition || dead_by_completability {
        let (code, message) = detect_reason(&cursor.seen, activity);
        cursor.dfa_state = law.dead_sink;
        cursor.verdict = PrefixVerdict::Dead;
        cursor.seen.push(activity.to_string());
        findings.push(PrefixFinding {
            code,
            severity: FindingSeverity::Deny,
            json_path,
            message,
            case_id: case_id.to_string(),
            activity: activity.to_string(),
        });
        return findings;
    }

    cursor.dfa_state = next_state;
    cursor.seen.push(activity.to_string());
    cursor.verdict = if law.accepting.get(next_state).copied().unwrap_or(false) {
        PrefixVerdict::Terminal
    } else {
        PrefixVerdict::Alive
    };

    findings
}

/// The online judge. Holds the compiled law plus all open case cursors
/// (spec §7.1).
pub struct PrefixOracle {
    law: CompiledLaw,
    cases: HashMap<String, CaseCursor>,
}

impl PrefixOracle {
    pub fn new(law: &OrderingLaw) -> Self {
        Self {
            law: law.compile(),
            cases: HashMap::new(),
        }
    }

    /// Static query: classify a complete prefix in one shot (batch /
    /// fixtures). No timestamp information is available in this shape, so
    /// D6 (`OutOfOrderTimestamp`) can never fire here — callers that need
    /// temporal soundness must use [`PrefixOracle::observe`].
    pub fn classify_prefix(
        &self,
        case_id: &str,
        activities: &[String],
    ) -> (PrefixVerdict, Vec<PrefixFinding>) {
        let mut cursor = CaseCursor {
            case_id: case_id.to_string(),
            dfa_state: 0,
            seen: Vec::new(),
            last_time_ms: i64::MIN,
            verdict: PrefixVerdict::Alive,
        };
        let mut all_findings = Vec::new();
        for (i, activity) in activities.iter().enumerate() {
            // Synthetic monotonic clock — classify_prefix has no timestamp
            // input, so ordering by tape position is the only signal.
            let time_ms = i as i64;
            let findings = step(&self.law, &mut cursor, case_id, activity, time_ms, i);
            all_findings.extend(findings);
            if cursor.verdict == PrefixVerdict::Dead {
                break;
            }
        }
        (cursor.verdict, all_findings)
    }

    /// Incremental step: fold ONE event. O(1) amortized.
    ///
    /// Returns the (possibly unchanged) verdict and any NEW findings this
    /// event produced. When the returned verdict is [`PrefixVerdict::Dead`],
    /// callers MUST emit an early STOP.
    pub fn observe(&mut self, ev: &PrefixEvent) -> (PrefixVerdict, Vec<PrefixFinding>) {
        let cursor = self.cases.entry(ev.case_id.clone()).or_insert_with(|| CaseCursor {
            case_id: ev.case_id.clone(),
            dfa_state: 0,
            seen: Vec::new(),
            last_time_ms: i64::MIN,
            verdict: PrefixVerdict::Alive,
        });
        let findings = step(
            &self.law,
            cursor,
            &ev.case_id,
            &ev.activity,
            ev.time_ms,
            ev.tape_index,
        );
        (cursor.verdict, findings)
    }

    /// Snapshot of all open cases (for the report `open_cases` array).
    pub fn snapshot(&self) -> Vec<CaseCursor> {
        self.cases.values().cloned().collect()
    }
}

/// Stable enterprise partition key. Identical case ids in different tenants
/// are intentionally distinct state machines.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CasePartitionKey {
    pub tenant_id: String,
    pub case_id: String,
}

/// Result of one bounded, tenant-partitioned online conformance step.
#[derive(Debug, Clone)]
pub struct PartitionedPrefixResult {
    pub key: CasePartitionKey,
    pub verdict: PrefixVerdict,
    pub findings: Vec<PrefixFinding>,
}

/// Fail-closed errors for the bounded enterprise router.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BoundedPrefixError {
    ZeroCapacity,
    CapacityExceeded {
        max_active_cases: usize,
        key: CasePartitionKey,
    },
    UnknownCase {
        key: CasePartitionKey,
    },
    CaseStillAlive {
        key: CasePartitionKey,
    },
}

impl std::fmt::Display for BoundedPrefixError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ZeroCapacity => write!(formatter, "ZERO_ACTIVE_CASE_CAPACITY"),
            Self::CapacityExceeded {
                max_active_cases,
                key,
            } => write!(
                formatter,
                "ACTIVE_CASE_CAPACITY_EXCEEDED:max={max_active_cases}:tenant={}:case={}",
                key.tenant_id, key.case_id
            ),
            Self::UnknownCase { key } => write!(
                formatter,
                "UNKNOWN_ACTIVE_CASE:tenant={}:case={}",
                key.tenant_id, key.case_id
            ),
            Self::CaseStillAlive { key } => write!(
                formatter,
                "CASE_STILL_ALIVE:tenant={}:case={}",
                key.tenant_id, key.case_id
            ),
        }
    }
}

impl std::error::Error for BoundedPrefixError {}

/// Capacity-bounded router for Fortune-5-scale interleaved case streams.
///
/// Each partition owns its own [`PrefixOracle`], so identical case ids in
/// separate tenants cannot share cursor state. Closed cases must be explicitly
/// released; if callers fail to do so, capacity exhaustion is a typed refusal
/// rather than unbounded memory growth.
pub struct BoundedPrefixRouter {
    law: OrderingLaw,
    max_active_cases: usize,
    cases: HashMap<CasePartitionKey, PrefixOracle>,
}

impl BoundedPrefixRouter {
    pub fn new(law: &OrderingLaw, max_active_cases: usize) -> Result<Self, BoundedPrefixError> {
        if max_active_cases == 0 {
            return Err(BoundedPrefixError::ZeroCapacity);
        }
        Ok(Self {
            law: law.clone(),
            max_active_cases,
            cases: HashMap::new(),
        })
    }

    pub fn active_cases(&self) -> usize {
        self.cases.len()
    }

    pub fn max_active_cases(&self) -> usize {
        self.max_active_cases
    }

    pub fn observe(
        &mut self,
        key: &CasePartitionKey,
        activity: &str,
        time_ms: i64,
        tape_index: usize,
    ) -> Result<PartitionedPrefixResult, BoundedPrefixError> {
        let at_capacity = self.cases.len() >= self.max_active_cases;
        let oracle = match self.cases.entry(key.clone()) {
            std::collections::hash_map::Entry::Occupied(entry) => entry.into_mut(),
            std::collections::hash_map::Entry::Vacant(entry) => {
                if at_capacity {
                    return Err(BoundedPrefixError::CapacityExceeded {
                        max_active_cases: self.max_active_cases,
                        key: key.clone(),
                    });
                }
                entry.insert(PrefixOracle::new(&self.law))
            }
        };

        let event = PrefixEvent {
            activity: activity.to_string(),
            time_ms,
            case_id: key.case_id.clone(),
            tape_index,
        };
        let (verdict, findings) = oracle.observe(&event);
        Ok(PartitionedPrefixResult {
            key: key.clone(),
            verdict,
            findings,
        })
    }

    /// Release only a closed (TERMINAL or DEAD) case and return its final cursor.
    pub fn release_closed_case(
        &mut self,
        key: &CasePartitionKey,
    ) -> Result<CaseCursor, BoundedPrefixError> {
        let Some(oracle) = self.cases.get(key) else {
            return Err(BoundedPrefixError::UnknownCase { key: key.clone() });
        };
        let Some(cursor) = oracle.snapshot().into_iter().next() else {
            return Err(BoundedPrefixError::UnknownCase { key: key.clone() });
        };
        if cursor.verdict == PrefixVerdict::Alive {
            return Err(BoundedPrefixError::CaseStillAlive { key: key.clone() });
        }
        let _ = self.cases.remove(key);
        Ok(cursor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_law() -> OrderingLaw {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../fixtures/real/ggen-oracle-law/living-loop-6link.law.json"
        ))
        .expect("living-loop-6link.law.json fixture must exist");
        serde_json::from_str(&raw).expect("law fixture must be valid OrderingLaw JSON")
    }

    fn acts(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    /// Acceptance criterion 1: completability is exact. For this
    /// particular 6-link law, every non-DEAD state IS completable — from
    /// any non-empty state, `GateFailed`/`RefusalEmitted` are always a
    /// lawful (if abrupt) exit with no further precedence obligations, and
    /// the empty root state can always open on `DiagnosticRaised` and
    /// proceed from there. This is the hand-computable table for this law.
    #[test]
    fn compile_completability_matches_hand_computed_table() {
        let law = load_law().compile();
        assert!(!law.states.is_empty());
        for (id, completable) in law.completable.iter().enumerate() {
            if id == law.dead_sink {
                assert!(!completable, "DEAD sink must never be completable");
            } else {
                assert!(*completable, "state {id} ({}) should be completable", law.states[id]);
            }
        }
    }

    /// Acceptance criterion 2 (D1): ReceiptEmitted without a prior
    /// GatePassed is DEAD with ReceiptBeforeGate.
    #[test]
    fn classify_prefix_detects_receipt_before_gate() {
        let law = load_law();
        let oracle = PrefixOracle::new(&law);
        let (verdict, findings) = oracle.classify_prefix(
            "item.tera|GGEN-TPL-001|run-7",
            &acts(&[
                "DiagnosticRaised",
                "RouteSelected",
                "RepairSuggested",
                "RepairApplied",
                "ReceiptEmitted",
            ]),
        );
        assert_eq!(verdict, PrefixVerdict::Dead);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, PrefixRefusal::ReceiptBeforeGate);
        assert_eq!(findings[0].severity, FindingSeverity::Deny);
    }

    /// Acceptance criterion 2 (D2): RepairApplied without a prior
    /// RouteSelected is DEAD with RepairWithoutRoute.
    #[test]
    fn classify_prefix_detects_repair_without_route() {
        let law = load_law();
        let oracle = PrefixOracle::new(&law);
        let (verdict, findings) = oracle.classify_prefix(
            "item.tera|GGEN-TPL-002|run-1",
            &acts(&["DiagnosticRaised", "RepairApplied"]),
        );
        assert_eq!(verdict, PrefixVerdict::Dead);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, PrefixRefusal::RepairWithoutRoute);
        assert_eq!(findings[0].severity, FindingSeverity::Deny);
    }

    /// Acceptance criterion 2 (positive control): the full 6-link happy
    /// path is TERMINAL with no findings.
    #[test]
    fn classify_prefix_full_happy_path_is_terminal() {
        let law = load_law();
        let oracle = PrefixOracle::new(&law);
        let (verdict, findings) = oracle.classify_prefix(
            "item.tera|GGEN-TPL-003|run-1",
            &acts(&[
                "DiagnosticRaised",
                "RouteSelected",
                "RepairSuggested",
                "RepairApplied",
                "GatePassed",
                "ReceiptEmitted",
            ]),
        );
        assert_eq!(verdict, PrefixVerdict::Terminal);
        assert!(findings.is_empty());
    }

    /// Acceptance criterion 3: incremental (`observe`, one event at a
    /// time) matches batch (`classify_prefix`) for the happy-path case.
    #[test]
    fn observe_matches_classify_prefix_on_happy_path() {
        let law = load_law();
        let activities = acts(&[
            "DiagnosticRaised",
            "RouteSelected",
            "RepairSuggested",
            "RepairApplied",
            "GatePassed",
            "ReceiptEmitted",
        ]);
        let case_id = "item.tera|GGEN-TPL-004|run-1";

        let batch_oracle = PrefixOracle::new(&law);
        let (batch_verdict, batch_findings) = batch_oracle.classify_prefix(case_id, &activities);

        let mut online_oracle = PrefixOracle::new(&law);
        let mut online_findings = Vec::new();
        let mut online_verdict = PrefixVerdict::Alive;
        for (i, activity) in activities.iter().enumerate() {
            let ev = PrefixEvent {
                activity: activity.clone(),
                time_ms: i as i64,
                case_id: case_id.to_string(),
                tape_index: i,
            };
            let (v, f) = online_oracle.observe(&ev);
            online_verdict = v;
            online_findings.extend(f);
        }

        assert_eq!(batch_verdict, online_verdict);
        assert_eq!(batch_findings.len(), online_findings.len());
        for (b, o) in batch_findings.iter().zip(online_findings.iter()) {
            assert_eq!(b.code, o.code);
            assert_eq!(b.severity, o.severity);
        }
    }

    /// Acceptance criterion 3/4: incremental == batch on the D1
    /// bad-prefix, and the early-STOP fires at the exact right tape index
    /// (the `ReceiptEmitted` event, index 4).
    #[test]
    fn observe_matches_classify_prefix_and_stops_at_right_index_on_d1() {
        let law = load_law();
        let activities = acts(&[
            "DiagnosticRaised",
            "RouteSelected",
            "RepairSuggested",
            "RepairApplied",
            "ReceiptEmitted",
        ]);
        let case_id = "item.tera|GGEN-TPL-005|run-1";

        let batch_oracle = PrefixOracle::new(&law);
        let (batch_verdict, batch_findings) = batch_oracle.classify_prefix(case_id, &activities);

        let mut online_oracle = PrefixOracle::new(&law);
        let mut last_verdict = PrefixVerdict::Alive;
        let mut stop_index = None;
        let mut online_findings = Vec::new();
        for (i, activity) in activities.iter().enumerate() {
            let ev = PrefixEvent {
                activity: activity.clone(),
                time_ms: i as i64,
                case_id: case_id.to_string(),
                tape_index: i,
            };
            let (v, f) = online_oracle.observe(&ev);
            last_verdict = v;
            if !f.is_empty() {
                online_findings.extend(f);
            }
            if last_verdict == PrefixVerdict::Dead && stop_index.is_none() {
                stop_index = Some(i);
            }
        }

        assert_eq!(batch_verdict, PrefixVerdict::Dead);
        assert_eq!(last_verdict, PrefixVerdict::Dead);
        assert_eq!(stop_index, Some(4), "ReceiptEmitted is tape_index 4");
        assert_eq!(batch_findings.len(), online_findings.len());
        assert_eq!(online_findings[0].code, PrefixRefusal::ReceiptBeforeGate);
    }

    #[test]
    fn snapshot_reflects_open_cases() {
        let law = load_law();
        let mut oracle = PrefixOracle::new(&law);
        let ev = PrefixEvent {
            activity: "DiagnosticRaised".to_string(),
            time_ms: 0,
            case_id: "case-x".to_string(),
            tape_index: 0,
        };
        oracle.observe(&ev);
        let snap = oracle.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].case_id, "case-x");
        assert_eq!(snap[0].verdict, PrefixVerdict::Alive);
    }

    #[test]
    fn bounded_router_refuses_capacity_instead_of_growing_without_limit() {
        let law = load_law();
        let mut router = BoundedPrefixRouter::new(&law, 1).expect("positive capacity");
        let first = CasePartitionKey {
            tenant_id: "tenant-a".to_string(),
            case_id: "case-1".to_string(),
        };
        let second = CasePartitionKey {
            tenant_id: "tenant-b".to_string(),
            case_id: "case-2".to_string(),
        };
        router
            .observe(&first, "DiagnosticRaised", 0, 0)
            .expect("first case fits");
        let error = router
            .observe(&second, "DiagnosticRaised", 0, 0)
            .expect_err("second active case must be refused");
        assert_eq!(
            error,
            BoundedPrefixError::CapacityExceeded {
                max_active_cases: 1,
                key: second,
            }
        );
        assert_eq!(router.active_cases(), 1);
    }

    #[test]
    fn bounded_router_isolates_identical_case_ids_between_tenants() {
        let law = load_law();
        let mut router = BoundedPrefixRouter::new(&law, 2).expect("positive capacity");
        let a = CasePartitionKey {
            tenant_id: "tenant-a".to_string(),
            case_id: "same-case".to_string(),
        };
        let b = CasePartitionKey {
            tenant_id: "tenant-b".to_string(),
            case_id: "same-case".to_string(),
        };

        let dead = router
            .observe(&a, "ReceiptEmitted", 0, 0)
            .expect("capacity exists");
        let alive = router
            .observe(&b, "DiagnosticRaised", 0, 0)
            .expect("separate tenant must have separate cursor");

        assert_eq!(dead.verdict, PrefixVerdict::Dead);
        assert_eq!(alive.verdict, PrefixVerdict::Alive);
        assert_eq!(dead.key.tenant_id, "tenant-a");
        assert_eq!(alive.key.tenant_id, "tenant-b");
        assert_eq!(router.active_cases(), 2);
    }

    #[test]
    fn releasing_closed_case_frees_capacity_but_alive_case_fails_closed() {
        let law = load_law();
        let mut router = BoundedPrefixRouter::new(&law, 1).expect("positive capacity");
        let first = CasePartitionKey {
            tenant_id: "tenant-a".to_string(),
            case_id: "case-1".to_string(),
        };
        let second = CasePartitionKey {
            tenant_id: "tenant-b".to_string(),
            case_id: "case-2".to_string(),
        };

        router
            .observe(&first, "DiagnosticRaised", 0, 0)
            .expect("first case fits");
        assert_eq!(
            router.release_closed_case(&first),
            Err(BoundedPrefixError::CaseStillAlive { key: first.clone() })
        );
        router
            .observe(&first, "GateFailed", 1, 1)
            .expect("abrupt lawful close");
        let released = router
            .release_closed_case(&first)
            .expect("terminal case may be released");
        assert_eq!(released.verdict, PrefixVerdict::Terminal);
        assert_eq!(router.active_cases(), 0);

        let next = router
            .observe(&second, "DiagnosticRaised", 0, 0)
            .expect("released slot is reusable");
        assert_eq!(next.verdict, PrefixVerdict::Alive);
    }

    #[test]
    fn bounded_router_refuses_zero_capacity() {
        let law = load_law();
        assert_eq!(
            BoundedPrefixRouter::new(&law, 0).err(),
            Some(BoundedPrefixError::ZeroCapacity)
        );
    }
}
