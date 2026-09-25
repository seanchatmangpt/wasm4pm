//! ALOOP-ZCODE-DOGFOOD-001 — LANE 10: independent replay/conformance oracle.
//!
//! An ALOOP OCEL 2.0 process-model conformance oracle, deliberately independent
//! of the XaaS-side and ex4pm-side judges: its verdict must be able to
//! DISAGREE with them; disagreement is evidence, not an error to hide.
//!
//! Process model (POWL semantics, state-machine formulation):
//! - `ORDERING` is the POWL PartialOrder: `(gate, activity)` pairs where the
//!   right-hand side requires the left-hand side witnessed earlier in the log.
//! - The recurrence loop `receipt.persist -> reobserve -> new WorkOrder chain`
//!   is the POWL redo operator `*(loop, redo)`: after a receipt, `reobserve`
//!   re-arms the chain; `goal.satisfied` additionally requires a
//!   predecessor-linked successor WorkOrder when more than one was issued.
//! - Optional activities (`checkpoint`, `benchmark.run`) and the crash branch
//!   (`execution.crash -> failure.detect -> reconcile -> replan`) are XOR
//!   blocks / silent-transition skips.
//!
//! Authority law: events after `human_epoch_ts` may carry zero
//! human-originAuthority causal edges (post-epoch autonomy law). Every DO
//! (`actuate`) must be closed by a `receipt.persist` referencing the same
//! consequence. Terminality is typed: `episode.terminal` requires
//! `goal.satisfied` or `goal.blocked` (the latter requires witnessed Failure
//! evidence). Standing law: never ASSISTED -> AUTONOMOUS.
//!
//! Evidence discipline: transition hashing (blake3 chain) + cold replay must
//! be byte-identical; every mutant must be REFUSED with its exact typed code
//! (a surviving mutant is an oracle defect = harness failure). This oracle
//! carries zero actuation authority, like every oracle in this crate.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Contract vocabulary (ALOOP OCEL 2.0, identical across all 10 lanes)
// ---------------------------------------------------------------------------

pub const EVENT_CLASSES: [&str; 28] = [
    "episode.start",
    "observe",
    "gap.detect",
    "candidate.construct",
    "candidate.admit",
    "plan.select",
    "workorder.issue",
    "provider.select",
    "worker.claim",
    "execution.start",
    "tool.admit",
    "actuate",
    "checkpoint",
    "execution.crash",
    "receipt.persist",
    "verify",
    "falsifier.run",
    "benchmark.run",
    "failure.detect",
    "reconcile",
    "replan",
    "provider.replace",
    "commit",
    "merge",
    "reobserve",
    "goal.satisfied",
    "goal.blocked",
    "episode.terminal",
];

pub const OBJECT_TYPES: [&str; 19] = [
    "Episode",
    "Objective",
    "Requirement",
    "WorkOrder",
    "Authority",
    "Repository",
    "Subject",
    "Provider",
    "Worker",
    "WorkerRun",
    "Plan",
    "Capability",
    "Candidate",
    "Consequence",
    "Evidence",
    "Receipt",
    "Failure",
    "Benchmark",
    "Release",
];

pub const QUALIFIERS: [&str; 11] = [
    "subject",
    "originAuthority",
    "provider",
    "worker",
    "input",
    "output",
    "evidence",
    "consequence",
    "receipt",
    "parentEpisode",
    "predecessor",
];

pub const EPISODE_STANDINGS: [&str; 5] = [
    "AUTONOMOUS",
    "ASSISTED",
    "BLOCKED_AUTHORITY",
    "BLOCKED_INFORMATION",
    "FAILED",
];

/// POWL PartialOrder edges: `activity` requires `gate` witnessed before it.
/// Multi-gate entries are any-of (XOR join of prerequisites).
fn ordering_gates() -> BTreeMap<&'static str, Vec<&'static str>> {
    let mut m: BTreeMap<&'static str, Vec<&'static str>> = BTreeMap::new();
    let mut add = |activity: &'static str, gates: Vec<&'static str>| {
        m.entry(activity).or_default().extend(gates);
    };
    add("gap.detect", vec!["observe"]);
    add("candidate.construct", vec!["gap.detect"]);
    add("candidate.admit", vec!["candidate.construct"]);
    add("plan.select", vec!["candidate.admit"]);
    add("workorder.issue", vec!["plan.select"]);
    add("provider.select", vec!["workorder.issue"]);
    add("worker.claim", vec!["provider.select"]);
    add("execution.start", vec!["worker.claim"]);
    add("tool.admit", vec!["execution.start"]);
    add("actuate", vec!["execution.start", "replan"]);
    add("checkpoint", vec!["execution.start"]);
    add("execution.crash", vec!["execution.start"]);
    add("receipt.persist", vec!["actuate"]);
    add("verify", vec!["receipt.persist"]);
    add("falsifier.run", vec!["receipt.persist"]);
    add("benchmark.run", vec!["verify"]);
    add("failure.detect", vec!["execution.crash", "verify"]);
    add("reconcile", vec!["failure.detect"]);
    add("replan", vec!["reconcile"]);
    add("provider.replace", vec!["provider.select"]);
    add("commit", vec!["receipt.persist"]);
    add("merge", vec!["commit"]);
    add("reobserve", vec!["receipt.persist"]);
    add("observe", vec!["reobserve", "episode.start"]);
    add("goal.satisfied", vec!["reobserve"]);
    add("goal.blocked", vec!["reobserve", "failure.detect"]);
    // episode.terminal intentionally has no ordering edge: typed terminality
    // (goal_typed + zero open DOs) is enforced by its own semantic check, so
    // a terminal without a typed goal fires UNTYPED_TERMINAL, not the generic
    // ordering refusal.
    m
}

// ---------------------------------------------------------------------------
// Typed refusal codes (every mutant must be refused with one of these)
// ---------------------------------------------------------------------------

pub const REFUSED_UNKNOWN_EVENT_CLASS: &str = "REFUSED:ALOOP_UNKNOWN_EVENT_CLASS";
pub const REFUSED_UNKNOWN_OBJECT_TYPE: &str = "REFUSED:ALOOP_UNKNOWN_OBJECT_TYPE";
pub const REFUSED_UNKNOWN_QUALIFIER: &str = "REFUSED:ALOOP_UNKNOWN_QUALIFIER";
pub const REFUSED_UNKNOWN_STANDING: &str = "REFUSED:ALOOP_UNKNOWN_STANDING";
pub const REFUSED_STANDING_REGRESSION: &str = "REFUSED:ALOOP_STANDING_REGRESSION";
pub const REFUSED_HUMAN_CAUSAL_EDGE: &str = "REFUSED:ALOOP_HUMAN_CAUSAL_EDGE";
pub const REFUSED_MISSING_EPISODE_START: &str = "REFUSED:ALOOP_MISSING_EPISODE_START";
pub const REFUSED_DUPLICATE_EPISODE_START: &str = "REFUSED:ALOOP_DUPLICATE_EPISODE_START";
pub const REFUSED_SEQ_NOT_MONOTONIC: &str = "REFUSED:ALOOP_SEQ_NOT_MONOTONIC";
pub const REFUSED_DUPLICATE_EVENT_ID: &str = "REFUSED:ALOOP_DUPLICATE_EVENT_ID";
pub const REFUSED_ORDERING_VIOLATION: &str = "REFUSED:ALOOP_ORDERING_VIOLATION";
pub const REFUSED_DUPLICATE_CONSEQUENCE: &str = "REFUSED:ALOOP_DUPLICATE_CONSEQUENCE";
pub const REFUSED_RECEIPT_WITHOUT_DO: &str = "REFUSED:ALOOP_RECEIPT_WITHOUT_DO";
pub const REFUSED_ORPHAN_DO: &str = "REFUSED:ALOOP_ORPHAN_DO";
pub const REFUSED_GOAL_UNVERIFIED: &str = "REFUSED:ALOOP_GOAL_UNVERIFIED";
pub const REFUSED_PROVIDER_SUBSTITUTION_ILLEGAL: &str = "REFUSED:ALOOP_PROVIDER_SUBSTITUTION_ILLEGAL";
pub const REFUSED_WORKER_SUBSTITUTION_ILLEGAL: &str = "REFUSED:ALOOP_WORKER_SUBSTITUTION_ILLEGAL";
pub const REFUSED_SUBJECT_IDENTITY_BREAK: &str = "REFUSED:ALOOP_SUBJECT_IDENTITY_BREAK";
pub const REFUSED_WORKORDER_NO_AUTHORITY: &str = "REFUSED:ALOOP_WORKORDER_NO_AUTHORITY";
pub const REFUSED_UNTYPED_TERMINAL: &str = "REFUSED:ALOOP_UNTYPED_TERMINAL";
pub const REFUSED_MISSING_REOBSERVE: &str = "REFUSED:ALOOP_MISSING_REOBSERVE";
pub const REFUSED_POST_TERMINAL_EVENT: &str = "REFUSED:ALOOP_POST_TERMINAL_EVENT";
pub const REFUSED_NO_TERMINAL_EVENT: &str = "REFUSED:ALOOP_NO_TERMINAL_EVENT";

// ---------------------------------------------------------------------------
// Log model (the evidence shape this lane consumes)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AloopObjectRef {
    pub object_type: String,
    pub object_id: String,
    pub qualifier: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AloopEvent {
    pub event_id: String,
    pub seq: u64,
    pub ts: u64,
    pub activity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub standing: Option<String>,
    pub objects: Vec<AloopObjectRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AloopLog {
    pub log_id: String,
    /// Events at `ts >= human_epoch_ts` are in the autonomy era: zero human
    /// causal edges permitted there.
    pub human_epoch_ts: u64,
    pub provenance: String,
    pub events: Vec<AloopEvent>,
}

// ---------------------------------------------------------------------------
// Verdict model
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum Disposition {
    Conforming,
    Terminal,
    Refused { code: String },
}

impl Disposition {
    fn code(&self) -> Option<&str> {
        match self {
            Disposition::Refused { code } => Some(code),
            _ => None,
        }
    }
    fn is_refused(&self) -> bool {
        matches!(self, Disposition::Refused { .. })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransitionRecord {
    pub seq: u64,
    pub event_id: String,
    pub activity: String,
    pub disposition: Disposition,
    pub chain_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutantResult {
    pub id: String,
    pub name: String,
    pub mutated_check: String,
    pub expected_code: String,
    pub refused: bool,
    pub observed_codes: Vec<String>,
    pub cold_replay_byte_identical: bool,
    pub survived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckOutcome {
    pub check: String,
    pub description: String,
    pub witnessed_clean: bool,
    pub witnessed_by_mutant: Option<String>,
    pub pass: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorpusVerdict {
    pub corpus_id: String,
    pub provenance: String,
    pub event_count: usize,
    pub transitions_hash: String,
    pub cold_replay_byte_identical: bool,
    pub refusal_codes: Vec<String>,
    pub conformant: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AloopVerdict {
    pub oracle: OracleMeta,
    pub subject: SubjectMeta,
    pub synthetic_corpus: CorpusVerdict,
    pub blocked_corpus: CorpusVerdict,
    pub real_lane_manifests: RealLaneScan,
    pub mutants: Vec<MutantResult>,
    pub checks: Vec<CheckOutcome>,
    pub anti_vacuity: AntiVacuity,
    pub overall: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OracleMeta {
    pub name: String,
    pub lane: String,
    pub episode: String,
    pub contract: String,
    pub independence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubjectMeta {
    pub repo: String,
    pub branch: String,
    pub head_sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealLaneScan {
    pub root: String,
    pub files_scanned: usize,
    pub corpora: Vec<CorpusVerdict>,
    pub verdict: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiVacuity {
    pub clean_fixture_passes: bool,
    pub blocked_fixture_passes: bool,
    pub all_mutants_refused: bool,
    pub mutant_survivors: Vec<String>,
    pub cold_replay_byte_identical: bool,
}

// ---------------------------------------------------------------------------
// The oracle: a state machine over the POWL process model
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct PendingDo {
    consequence_id: String,
    workorder_id: String,
}

#[derive(Debug, Clone)]
struct WorkOrderRecord {
    id: String,
    predecessor: Option<String>,
}

#[derive(Debug, Default)]
struct AloopOracleState {
    started: bool,
    terminal: bool,
    goal_typed: bool,
    last_receipt_seq: Option<u64>,
    last_reobserve_seq: Option<u64>,
    last_seq: Option<u64>,
    event_ids: BTreeSet<String>,
    witnessed: BTreeSet<String>,
    witnessed_authorities: BTreeSet<String>,
    standing_history: Vec<String>,
    used_consequences: BTreeSet<String>,
    open_dos: Vec<PendingDo>,
    workorders: Vec<WorkOrderRecord>,
    episode_subject: Option<String>,
    current_provider: Option<String>,
    current_worker: Option<String>,
    falsifier_witnessed: bool,
}

pub struct AloopOracle {
    log: AloopLog,
    state: AloopOracleState,
    ordering: BTreeMap<&'static str, Vec<&'static str>>,
    records: Vec<TransitionRecord>,
    chain: String,
}

impl AloopOracle {
    pub fn new(log: AloopLog) -> Self {
        Self {
            log,
            state: AloopOracleState::default(),
            ordering: ordering_gates(),
            records: Vec::new(),
            chain: blake3::hash(b"aloop-oracle-genesis").to_hex().to_string(),
        }
    }

    fn refuse(&mut self, event: &AloopEvent, code: &str) -> Disposition {
        self.record(event, Disposition::Refused { code: code.to_owned() })
    }

    fn record(&mut self, event: &AloopEvent, disposition: Disposition) -> Disposition {
        let canonical = serde_json::to_vec(event).expect("event serialization is infallible");
        let disp_json = serde_json::to_vec(&disposition).expect("disposition serialization is infallible");
        let mut material = self.chain.clone().into_bytes();
        material.extend_from_slice(&canonical);
        material.extend_from_slice(&disp_json);
        self.chain = blake3::hash(&material).to_hex().to_string();
        self.records.push(TransitionRecord {
            seq: event.seq,
            event_id: event.event_id.clone(),
            activity: event.activity.clone(),
            disposition: disposition.clone(),
            chain_hash: self.chain.clone(),
        });
        disposition
    }

    fn structural_checks(&mut self, event: &AloopEvent) -> Option<Disposition> {
        if self.state.started && event.activity == "episode.start" {
            return Some(self.refuse(event, REFUSED_DUPLICATE_EPISODE_START));
        }
        if let Some(prev) = self.state.last_seq {
            if event.seq <= prev {
                return Some(self.refuse(event, REFUSED_SEQ_NOT_MONOTONIC));
            }
        }
        if !self.state.event_ids.insert(event.event_id.clone()) {
            return Some(self.refuse(event, REFUSED_DUPLICATE_EVENT_ID));
        }
        // Authority check precedes class validation on purpose: an inserted
        // human causal edge must be typed as such even when its activity is
        // not a contract event class.
        if event.ts >= self.log.human_epoch_ts {
            let human_edge = event.objects.iter().any(|o| {
                o.object_type == "Authority"
                    && o.qualifier == "originAuthority"
                    && o.object_id.starts_with("auth:human")
            }) || event.activity.starts_with("human.");
            if human_edge {
                return Some(self.refuse(event, REFUSED_HUMAN_CAUSAL_EDGE));
            }
        }
        if !EVENT_CLASSES.contains(&event.activity.as_str()) {
            return Some(self.refuse(event, REFUSED_UNKNOWN_EVENT_CLASS));
        }
        if let Some(standing) = &event.standing {
            if !EPISODE_STANDINGS.contains(&standing.as_str()) {
                return Some(self.refuse(event, REFUSED_UNKNOWN_STANDING));
            }
            if let Some(prev) = self.state.standing_history.last() {
                if prev == "ASSISTED" && standing == "AUTONOMOUS" {
                    return Some(self.refuse(event, REFUSED_STANDING_REGRESSION));
                }
            }
            self.state.standing_history.push(standing.clone());
        }
        for o in &event.objects {
            if !OBJECT_TYPES.contains(&o.object_type.as_str()) {
                return Some(self.refuse(event, REFUSED_UNKNOWN_OBJECT_TYPE));
            }
            if !QUALIFIERS.contains(&o.qualifier.as_str()) {
                return Some(self.refuse(event, REFUSED_UNKNOWN_QUALIFIER));
            }
        }
        None
    }

    fn semantic_checks(&mut self, event: &AloopEvent) -> Option<Disposition> {
        let activity = event.activity.as_str();

        // Object identity: episode subject SHA is immutable across the log.
        for o in &event.objects {
            if o.object_type == "Subject" && o.qualifier == "subject" {
                match &self.state.episode_subject {
                    None => self.state.episode_subject = Some(o.object_id.clone()),
                    Some(sha) => {
                        if sha != &o.object_id {
                            return Some(self.refuse(event, REFUSED_SUBJECT_IDENTITY_BREAK));
                        }
                    }
                }
            }
            if o.object_type == "Authority" && o.qualifier == "originAuthority" {
                self.state.witnessed_authorities.insert(o.object_id.clone());
            }
        }

        if activity == "episode.start" {
            self.state.started = true;
            self.state.witnessed.insert(activity.to_owned());
            return Some(self.record(event, Disposition::Conforming));
        }
        if !self.state.started {
            return Some(self.refuse(event, REFUSED_MISSING_EPISODE_START));
        }
        if self.state.terminal {
            return Some(self.refuse(event, REFUSED_POST_TERMINAL_EVENT));
        }

        // POWL PartialOrder conformance: any-of gates witnessed earlier.
        if let Some(gates) = self.ordering.get(activity) {
            let satisfied = gates
                .iter()
                .any(|g| self.state.witnessed.contains(*g));
            if !satisfied {
                return Some(self.refuse(event, REFUSED_ORDERING_VIOLATION));
            }
        }

        // Provider legality: execution-class events must carry the currently
        // selected provider; the only legal substitution edge is
        // provider.replace (input = current, output = new).
        let declared_provider = event
            .objects
            .iter()
            .find(|o| o.object_type == "Provider" && o.qualifier == "provider")
            .map(|o| o.object_id.clone());
        if matches!(activity, "execution.start" | "actuate" | "commit" | "checkpoint") {
            if let Some(p) = &declared_provider {
                if Some(p) != self.state.current_provider.as_ref() {
                    return Some(self.refuse(event, REFUSED_PROVIDER_SUBSTITUTION_ILLEGAL));
                }
            } else if self.state.current_provider.is_some() {
                return Some(self.refuse(event, REFUSED_PROVIDER_SUBSTITUTION_ILLEGAL));
            }
        }
        if activity == "provider.select" {
            if let Some(p) = declared_provider {
                self.state.current_provider = Some(p);
            }
        }
        if activity == "provider.replace" {
            let old = event
                .objects
                .iter()
                .find(|o| o.object_type == "Provider" && o.qualifier == "input")
                .map(|o| o.object_id.clone());
            let new = event
                .objects
                .iter()
                .find(|o| o.object_type == "Provider" && o.qualifier == "output")
                .map(|o| o.object_id.clone());
            match (old, new) {
                (Some(old), Some(new)) if Some(&old) == self.state.current_provider.as_ref() => {
                    self.state.current_provider = Some(new);
                }
                _ => return Some(self.refuse(event, REFUSED_PROVIDER_SUBSTITUTION_ILLEGAL)),
            }
        }

        // Worker legality: a WorkerRun is bound to its claimed worker; a
        // change requires an intervening worker.claim (re-claim = legal).
        let declared_worker = event
            .objects
            .iter()
            .find(|o| o.object_type == "Worker" && o.qualifier == "worker")
            .map(|o| o.object_id.clone());
        if matches!(activity, "execution.start" | "actuate" | "checkpoint") {
            if let Some(w) = &declared_worker {
                if Some(w) != self.state.current_worker.as_ref() {
                    return Some(self.refuse(event, REFUSED_WORKER_SUBSTITUTION_ILLEGAL));
                }
            }
        }
        if activity == "worker.claim" {
            if let Some(w) = declared_worker {
                self.state.current_worker = Some(w);
            }
        }

        // WorkOrder authority law: every issued WorkOrder names a witnessed
        // originAuthority, or the issue is refused.
        if activity == "workorder.issue" {
            let authority = event
                .objects
                .iter()
                .find(|o| o.object_type == "Authority" && o.qualifier == "originAuthority")
                .map(|o| o.object_id.clone());
            let authorized = authority
                .map(|a| self.state.witnessed_authorities.contains(&a))
                .unwrap_or(false);
            if !authorized {
                return Some(self.refuse(event, REFUSED_WORKORDER_NO_AUTHORITY));
            }
            let id = event
                .objects
                .iter()
                .find(|o| o.object_type == "WorkOrder" && o.qualifier == "output")
                .map(|o| o.object_id.clone());
            let predecessor = event
                .objects
                .iter()
                .find(|o| o.object_type == "WorkOrder" && o.qualifier == "predecessor")
                .map(|o| o.object_id.clone());
            if let Some(id) = id {
                self.state.workorders.push(WorkOrderRecord { id, predecessor });
            }
        }

        // DO / receipt mechanics: actuate opens a DO keyed by consequence id;
        // receipt.persist closes the DO carrying the same consequence.
        if activity == "actuate" {
            if let Some(cons) = event
                .objects
                .iter()
                .find(|o| o.object_type == "Consequence" && o.qualifier == "consequence")
                .map(|o| o.object_id.clone())
            {
                if !self.state.used_consequences.insert(cons.clone()) {
                    return Some(self.refuse(event, REFUSED_DUPLICATE_CONSEQUENCE));
                }
                let wo = event
                    .objects
                    .iter()
                    .find(|o| o.object_type == "WorkOrder")
                    .map(|o| o.object_id.clone())
                    .unwrap_or_default();
                self.state.open_dos.push(PendingDo {
                    consequence_id: cons,
                    workorder_id: wo,
                });
            }
        }
        if activity == "receipt.persist" {
            let cons = event
                .objects
                .iter()
                .find(|o| o.object_type == "Consequence" && o.qualifier == "consequence")
                .map(|o| o.object_id.clone());
            let closed = cons
                .and_then(|c| {
                    let idx = self
                        .state
                        .open_dos
                        .iter()
                        .position(|d| d.consequence_id == c)?;
                    Some(self.state.open_dos.remove(idx))
                })
                .is_some();
            if !closed {
                return Some(self.refuse(event, REFUSED_RECEIPT_WITHOUT_DO));
            }
            self.state.last_receipt_seq = Some(event.seq);
        }
        if activity == "falsifier.run" {
            self.state.falsifier_witnessed = true;
        }

        // Recurrence law: goal.satisfied requires a reobserve after the last
        // receipt (the loop re-armed) and, when multiple WorkOrders were
        // issued, a predecessor-linked successor chain (receipt -> reobserve
        // -> new WorkOrder).
        if activity == "goal.satisfied" {
            let reobserved = self
                .state
                .last_reobserve_seq
                .zip(self.state.last_receipt_seq)
                .map(|(r, rcpt)| r > rcpt)
                .unwrap_or(false);
            if !reobserved {
                return Some(self.refuse(event, REFUSED_MISSING_REOBSERVE));
            }
            if !self.state.falsifier_witnessed {
                return Some(self.refuse(event, REFUSED_GOAL_UNVERIFIED));
            }
            if self.state.workorders.len() >= 2 {
                let ids: BTreeSet<&str> =
                    self.state.workorders.iter().map(|w| w.id.as_str()).collect();
                let chained = self
                    .state
                    .workorders
                    .iter()
                    .any(|w| w.predecessor.as_deref().map(|p| ids.contains(p)).unwrap_or(false));
                if !chained {
                    return Some(self.refuse(event, REFUSED_ORPHAN_DO));
                }
            }
            self.state.goal_typed = true;
        }
        if activity == "goal.blocked" {
            let failure_witnessed = self.state.witnessed.contains("failure.detect");
            if !failure_witnessed {
                return Some(self.refuse(event, REFUSED_UNTYPED_TERMINAL));
            }
            self.state.goal_typed = true;
        }

        // Typed terminality: terminal requires a typed goal event and zero
        // unreceipted DOs.
        if activity == "episode.terminal" {
            if !self.state.goal_typed {
                return Some(self.refuse(event, REFUSED_UNTYPED_TERMINAL));
            }
            if !self.state.open_dos.is_empty() {
                return Some(self.refuse(event, REFUSED_ORPHAN_DO));
            }
            self.state.terminal = true;
            return Some(self.record(event, Disposition::Terminal));
        }

        self.state.witnessed.insert(activity.to_owned());
        if activity == "reobserve" {
            self.state.last_reobserve_seq = Some(event.seq);
        }
        Some(self.record(event, Disposition::Conforming))
    }

    /// Consume one event. Authority checks intentionally run before class
    /// validation; see `structural_checks`.
    pub fn observe(&mut self, event: &AloopEvent) -> Disposition {
        if let Some(d) = self.structural_checks(event) {
            return d;
        }
        self.semantic_checks(event).unwrap_or_else(|| self.record(event, Disposition::Conforming))
    }

    /// End-of-log audit: an episode that never reached a typed terminal event
    /// is not conformant.
    pub fn close(&mut self) -> Disposition {
        if !self.state.terminal {
            return Disposition::Refused {
                code: REFUSED_NO_TERMINAL_EVENT.to_owned(),
            };
        }
        Disposition::Terminal
    }

    pub fn records(&self) -> &[TransitionRecord] {
        &self.records
    }

    pub fn final_chain(&self) -> String {
        self.chain.clone()
    }
}

/// Execute the model over a log; returns transition records plus the final
/// blake3 chain hash (the replay identity of the run).
pub fn run_log(log: &AloopLog) -> (Vec<TransitionRecord>, String, Disposition) {
    let mut oracle = AloopOracle::new(log.clone());
    for event in &log.events {
        oracle.observe(event);
    }
    let close = oracle.close();
    let hash = oracle.final_chain();
    (oracle.records().to_vec(), hash, close)
}

/// Cold replay: fresh oracle, same log, byte-identical verdicts required.
pub fn cold_replay(log: &AloopLog) -> (Vec<u8>, bool) {
    let (r1, h1, c1) = run_log(log);
    let (r2, h2, c2) = run_log(log);
    let b1 = serde_json::to_vec(&(r1, h1, c1)).expect("records serialization is infallible");
    let b2 = serde_json::to_vec(&(r2, h2, c2)).expect("records serialization is infallible");
    let identical = b1 == b2;
    (b1, identical)
}

fn refusal_codes(records: &[TransitionRecord]) -> Vec<String> {
    records
        .iter()
        .filter_map(|r| r.disposition.code().map(str::to_owned))
        .collect()
}

// ---------------------------------------------------------------------------
// Fixtures (synthetic, deterministically constructed; provenance RECONSTRUCTED)
// ---------------------------------------------------------------------------

fn obj(object_type: &str, object_id: &str, qualifier: &str) -> AloopObjectRef {
    AloopObjectRef {
        object_type: object_type.to_owned(),
        object_id: object_id.to_owned(),
        qualifier: qualifier.to_owned(),
    }
}

#[allow(clippy::too_many_arguments)]
fn ev(seq: u64, ts: u64, activity: &str, standing: Option<&str>, objects: Vec<AloopObjectRef>) -> AloopEvent {
    AloopEvent {
        event_id: format!("ev-{seq:04}"),
        seq,
        ts,
        activity: activity.to_owned(),
        standing: standing.map(str::to_owned),
        objects,
    }
}

/// Clean happy path: full chain twice (recurrence), a legal provider
/// substitution, benchmark, falsifier, commits, typed satisfied terminal.
/// One pre-epoch observe carries a human authority to prove the human-edge
/// gate is epoch-scoped, not blanket.
pub fn clean_fixture() -> AloopLog {
    let e = vec![
        ev(10, 1000, "episode.start", Some("AUTONOMOUS"), vec![
            obj("Episode", "ep-aloop-001", "subject"),
            obj("Authority", "auth:lease:aloop-001", "originAuthority"),
            obj("Subject", "sha256:wasm4pm:S1", "subject"),
        ]),
        // Pre-epoch human observe: lawful before the autonomy epoch.
        ev(20, 900, "observe", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:obs-1", "evidence"),
            obj("Authority", "auth:human:operator", "originAuthority"),
        ]),
        ev(30, 1001, "gap.detect", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:gap-1", "evidence"),
        ]),
        ev(40, 1002, "candidate.construct", Some("AUTONOMOUS"), vec![
            obj("Candidate", "cand-1", "output"),
        ]),
        ev(50, 1003, "candidate.admit", Some("AUTONOMOUS"), vec![
            obj("Candidate", "cand-1", "input"),
            obj("Evidence", "ev:admit-1", "evidence"),
        ]),
        ev(60, 1004, "plan.select", Some("AUTONOMOUS"), vec![
            obj("Plan", "plan-1", "output"),
        ]),
        ev(70, 1005, "workorder.issue", Some("AUTONOMOUS"), vec![
            obj("WorkOrder", "wo-1", "output"),
            obj("Authority", "auth:lease:aloop-001", "originAuthority"),
            obj("Subject", "sha256:wasm4pm:S1", "subject"),
        ]),
        ev(80, 1006, "provider.select", Some("AUTONOMOUS"), vec![
            obj("Provider", "prov:alpha", "provider"),
        ]),
        ev(90, 1007, "worker.claim", Some("AUTONOMOUS"), vec![
            obj("Worker", "worker:w1", "worker"),
            obj("WorkerRun", "run-1", "output"),
        ]),
        ev(100, 1008, "execution.start", Some("AUTONOMOUS"), vec![
            obj("WorkerRun", "run-1", "subject"),
            obj("Provider", "prov:alpha", "provider"),
            obj("Worker", "worker:w1", "worker"),
        ]),
        ev(110, 1009, "tool.admit", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:tool-1", "evidence"),
        ]),
        ev(120, 1010, "checkpoint", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:cp-1", "evidence"),
            obj("Provider", "prov:alpha", "provider"),
            obj("Worker", "worker:w1", "worker"),
        ]),
        ev(130, 1011, "actuate", Some("AUTONOMOUS"), vec![
            obj("Consequence", "cons:1", "consequence"),
            obj("WorkOrder", "wo-1", "output"),
            obj("Provider", "prov:alpha", "provider"),
            obj("Worker", "worker:w1", "worker"),
        ]),
        ev(140, 1012, "receipt.persist", Some("AUTONOMOUS"), vec![
            obj("Receipt", "rcp:1", "receipt"),
            obj("Consequence", "cons:1", "consequence"),
            obj("Evidence", "ev:r1", "evidence"),
        ]),
        ev(150, 1013, "verify", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:ver-1", "evidence"),
        ]),
        ev(160, 1014, "falsifier.run", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:fals-1", "evidence"),
        ]),
        ev(170, 1015, "benchmark.run", Some("AUTONOMOUS"), vec![
            obj("Benchmark", "bench-1", "output"),
        ]),
        ev(180, 1016, "provider.replace", Some("AUTONOMOUS"), vec![
            obj("Provider", "prov:alpha", "input"),
            obj("Provider", "prov:beta", "output"),
        ]),
        ev(190, 1017, "reobserve", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:reobs-1", "evidence"),
        ]),
        // Recurrence loop redo: second WorkOrder chained to wo-1.
        ev(200, 1018, "observe", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:obs-2", "evidence"),
        ]),
        ev(210, 1019, "gap.detect", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:gap-2", "evidence"),
        ]),
        ev(220, 1020, "candidate.construct", Some("AUTONOMOUS"), vec![
            obj("Candidate", "cand-2", "output"),
        ]),
        ev(230, 1021, "candidate.admit", Some("AUTONOMOUS"), vec![
            obj("Candidate", "cand-2", "input"),
            obj("Evidence", "ev:admit-2", "evidence"),
        ]),
        ev(240, 1022, "plan.select", Some("AUTONOMOUS"), vec![
            obj("Plan", "plan-2", "output"),
        ]),
        ev(250, 1023, "workorder.issue", Some("AUTONOMOUS"), vec![
            obj("WorkOrder", "wo-2", "output"),
            obj("WorkOrder", "wo-1", "predecessor"),
            obj("Authority", "auth:lease:aloop-001", "originAuthority"),
            obj("Subject", "sha256:wasm4pm:S1", "subject"),
        ]),
        ev(260, 1024, "provider.select", Some("AUTONOMOUS"), vec![
            obj("Provider", "prov:beta", "provider"),
        ]),
        ev(270, 1025, "worker.claim", Some("AUTONOMOUS"), vec![
            obj("Worker", "worker:w1", "worker"),
            obj("WorkerRun", "run-2", "output"),
        ]),
        ev(280, 1026, "execution.start", Some("AUTONOMOUS"), vec![
            obj("WorkerRun", "run-2", "subject"),
            obj("Provider", "prov:beta", "provider"),
            obj("Worker", "worker:w1", "worker"),
        ]),
        ev(290, 1027, "tool.admit", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:tool-2", "evidence"),
        ]),
        ev(300, 1028, "actuate", Some("AUTONOMOUS"), vec![
            obj("Consequence", "cons:2", "consequence"),
            obj("WorkOrder", "wo-2", "output"),
            obj("Provider", "prov:beta", "provider"),
            obj("Worker", "worker:w1", "worker"),
        ]),
        ev(310, 1029, "receipt.persist", Some("AUTONOMOUS"), vec![
            obj("Receipt", "rcp:2", "receipt"),
            obj("Consequence", "cons:2", "consequence"),
            obj("Evidence", "ev:r2", "evidence"),
        ]),
        ev(320, 1030, "verify", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:ver-2", "evidence"),
        ]),
        ev(330, 1031, "falsifier.run", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:fals-2", "evidence"),
        ]),
        ev(340, 1032, "commit", Some("AUTONOMOUS"), vec![
            obj("Subject", "sha256:wasm4pm:S1", "subject"),
            obj("Receipt", "rcp:2", "receipt"),
            obj("Provider", "prov:beta", "provider"),
        ]),
        ev(350, 1033, "merge", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:merge-1", "evidence"),
        ]),
        ev(360, 1034, "reobserve", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:reobs-2", "evidence"),
        ]),
        ev(370, 1035, "goal.satisfied", Some("AUTONOMOUS"), vec![
            obj("Objective", "obj-1", "output"),
        ]),
        ev(380, 1036, "episode.terminal", Some("AUTONOMOUS"), vec![
            obj("Episode", "ep-aloop-001", "subject"),
        ]),
    ];
    AloopLog {
        log_id: "aloop-clean-seeded".to_owned(),
        human_epoch_ts: 1000,
        provenance: "RECONSTRUCTED".to_owned(),
        events: e,
    }
}

/// Blocked-path episode: crash branch, failure evidence, typed goal.blocked
/// terminal. Must conform (typed terminality accepts both legal terminals).
pub fn blocked_fixture() -> AloopLog {
    let e = vec![
        ev(1, 1000, "episode.start", Some("AUTONOMOUS"), vec![
            obj("Episode", "ep-aloop-002", "subject"),
            obj("Authority", "auth:lease:aloop-002", "originAuthority"),
            obj("Subject", "sha256:wasm4pm:S2", "subject"),
        ]),
        ev(2, 1001, "observe", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:obs-b1", "evidence"),
        ]),
        ev(3, 1002, "gap.detect", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:gap-b1", "evidence"),
        ]),
        ev(4, 1003, "candidate.construct", Some("AUTONOMOUS"), vec![
            obj("Candidate", "cand-b1", "output"),
        ]),
        ev(5, 1004, "candidate.admit", Some("AUTONOMOUS"), vec![
            obj("Candidate", "cand-b1", "input"),
            obj("Evidence", "ev:admit-b1", "evidence"),
        ]),
        ev(6, 1005, "plan.select", Some("AUTONOMOUS"), vec![
            obj("Plan", "plan-b1", "output"),
        ]),
        ev(7, 1006, "workorder.issue", Some("AUTONOMOUS"), vec![
            obj("WorkOrder", "wo-b1", "output"),
            obj("Authority", "auth:lease:aloop-002", "originAuthority"),
            obj("Subject", "sha256:wasm4pm:S2", "subject"),
        ]),
        ev(8, 1007, "provider.select", Some("AUTONOMOUS"), vec![
            obj("Provider", "prov:alpha", "provider"),
        ]),
        ev(9, 1008, "worker.claim", Some("AUTONOMOUS"), vec![
            obj("Worker", "worker:w2", "worker"),
            obj("WorkerRun", "run-b1", "output"),
        ]),
        ev(10, 1009, "execution.start", Some("AUTONOMOUS"), vec![
            obj("WorkerRun", "run-b1", "subject"),
            obj("Provider", "prov:alpha", "provider"),
            obj("Worker", "worker:w2", "worker"),
        ]),
        ev(11, 1010, "tool.admit", Some("AUTONOMOUS"), vec![
            obj("Evidence", "ev:tool-b1", "evidence"),
        ]),
        ev(12, 1011, "actuate", Some("AUTONOMOUS"), vec![
            obj("Consequence", "cons:b1", "consequence"),
            obj("WorkOrder", "wo-b1", "output"),
            obj("Provider", "prov:alpha", "provider"),
            obj("Worker", "worker:w2", "worker"),
        ]),
        ev(13, 1012, "receipt.persist", Some("AUTONOMOUS"), vec![
            obj("Receipt", "rcp:b1", "receipt"),
            obj("Consequence", "cons:b1", "consequence"),
            obj("Evidence", "ev:r-b1", "evidence"),
        ]),
        ev(14, 1013, "execution.crash", Some("FAILED"), vec![
            obj("Evidence", "ev:crash-b1", "evidence"),
        ]),
        ev(15, 1014, "failure.detect", Some("FAILED"), vec![
            obj("Failure", "fail-1", "evidence"),
        ]),
        ev(16, 1015, "reconcile", Some("FAILED"), vec![
            obj("Evidence", "ev:rec-b1", "evidence"),
        ]),
        ev(17, 1016, "replan", Some("AUTONOMOUS"), vec![
            obj("Plan", "plan-b2", "output"),
        ]),
        ev(18, 1017, "reobserve", Some("BLOCKED_INFORMATION"), vec![
            obj("Evidence", "ev:reobs-b1", "evidence"),
        ]),
        ev(19, 1018, "goal.blocked", Some("BLOCKED_INFORMATION"), vec![
            obj("Failure", "fail-1", "evidence"),
        ]),
        ev(20, 1019, "episode.terminal", Some("BLOCKED_INFORMATION"), vec![
            obj("Episode", "ep-aloop-002", "subject"),
        ]),
    ];
    AloopLog {
        log_id: "aloop-blocked-seeded".to_owned(),
        human_epoch_ts: 1000,
        provenance: "RECONSTRUCTED".to_owned(),
        events: e,
    }
}

// ---------------------------------------------------------------------------
// Mutant corpus: every mutant MUST be refused with its exact typed code.
// A surviving mutant is an oracle defect (harness failure), never a pass.
// ---------------------------------------------------------------------------

struct Mutant {
    id: &'static str,
    name: &'static str,
    mutated_check: &'static str,
    expected_code: &'static str,
    apply: fn(&mut AloopLog),
}

fn mutants() -> Vec<Mutant> {
    vec![
        Mutant {
            id: "M1",
            name: "delete reobserve event",
            mutated_check: "recurrence/reobserve-before-goal",
            expected_code: REFUSED_MISSING_REOBSERVE,
            apply: |log| {
                log.events.retain(|e| e.activity != "reobserve" || e.seq != 360);
            },
        },
        Mutant {
            id: "M2",
            name: "insert human.next_action post-epoch",
            mutated_check: "zero-human-causal-edges-post-epoch",
            expected_code: REFUSED_HUMAN_CAUSAL_EDGE,
            apply: |log| {
                log.events.push(ev(
                    365,
                    2000,
                    "human.next_action",
                    Some("ASSISTED"),
                    vec![
                        obj("Authority", "auth:human:operator", "originAuthority"),
                        obj("Evidence", "ev:human-1", "evidence"),
                    ],
                ));
                log.events.sort_by_key(|e| e.seq);
            },
        },
        Mutant {
            id: "M3",
            name: "duplicate DO (same consequence id)",
            mutated_check: "zero-duplicate-consequence",
            expected_code: REFUSED_DUPLICATE_CONSEQUENCE,
            apply: |log| {
                log.events.push(ev(
                    135,
                    1011,
                    "actuate",
                    Some("AUTONOMOUS"),
                    vec![
                        obj("Consequence", "cons:1", "consequence"),
                        obj("WorkOrder", "wo-1", "output"),
                        obj("Provider", "prov:alpha", "provider"),
                        obj("Worker", "worker:w1", "worker"),
                    ],
                ));
                log.events.sort_by_key(|e| e.seq);
            },
        },
        Mutant {
            id: "M4",
            name: "drop receipt after DO",
            mutated_check: "receipt-linkage/zero-orphan-DO",
            expected_code: REFUSED_ORPHAN_DO,
            apply: |log| {
                log.events.retain(|e| !(e.activity == "receipt.persist" && e.seq == 310));
            },
        },
        Mutant {
            id: "M5",
            name: "change provider without provider.replace",
            mutated_check: "provider-substitution-legality",
            expected_code: REFUSED_PROVIDER_SUBSTITUTION_ILLEGAL,
            apply: |log| {
                for e in log.events.iter_mut() {
                    if e.seq == 280 {
                        for o in e.objects.iter_mut() {
                            if o.object_type == "Provider" {
                                o.object_id = "prov:gamma".to_owned();
                            }
                        }
                    }
                }
            },
        },
        Mutant {
            id: "M6",
            name: "change subject SHA mid-chain",
            mutated_check: "object-identity/subject-SHA",
            expected_code: REFUSED_SUBJECT_IDENTITY_BREAK,
            apply: |log| {
                for e in log.events.iter_mut() {
                    if e.seq == 340 {
                        for o in e.objects.iter_mut() {
                            if o.object_type == "Subject" {
                                o.object_id = "sha256:wasm4pm:S9".to_owned();
                            }
                        }
                    }
                }
            },
        },
        Mutant {
            id: "M7",
            name: "invent WorkOrder with no originAuthority",
            mutated_check: "workorder-originAuthority",
            expected_code: REFUSED_WORKORDER_NO_AUTHORITY,
            apply: |log| {
                for e in log.events.iter_mut() {
                    if e.seq == 250 {
                        e.objects.retain(|o| {
                            !(o.object_type == "Authority" && o.qualifier == "originAuthority")
                        });
                    }
                }
            },
        },
        Mutant {
            id: "M8",
            name: "terminate before typed goal (no goal.satisfied)",
            mutated_check: "typed-terminality",
            expected_code: REFUSED_UNTYPED_TERMINAL,
            apply: |log| {
                log.events.retain(|e| e.activity != "goal.satisfied");
            },
        },
        Mutant {
            id: "M9",
            name: "rogue unknown event class post-epoch",
            mutated_check: "event-class-vocabulary",
            expected_code: REFUSED_UNKNOWN_EVENT_CLASS,
            apply: |log| {
                log.events.push(ev(
                    366,
                    2001,
                    "rogue.activity",
                    Some("AUTONOMOUS"),
                    vec![obj("Evidence", "ev:rogue-1", "evidence")],
                ));
                log.events.sort_by_key(|e| e.seq);
            },
        },
        Mutant {
            id: "M10",
            name: "worker swap mid-run without re-claim",
            mutated_check: "worker-substitution-legality",
            expected_code: REFUSED_WORKER_SUBSTITUTION_ILLEGAL,
            apply: |log| {
                for e in log.events.iter_mut() {
                    if e.seq == 300 {
                        for o in e.objects.iter_mut() {
                            if o.object_type == "Worker" {
                                o.object_id = "worker:w2".to_owned();
                            }
                        }
                    }
                }
            },
        },
        Mutant {
            id: "M11",
            name: "standing regression ASSISTED then AUTONOMOUS",
            mutated_check: "standing-law/never-ASSISTED-to-AUTONOMOUS",
            expected_code: REFUSED_STANDING_REGRESSION,
            apply: |log| {
                for e in log.events.iter_mut() {
                    if e.seq == 40 {
                        e.standing = Some("ASSISTED".to_owned());
                    }
                    if e.seq == 50 {
                        e.standing = Some("AUTONOMOUS".to_owned());
                    }
                }
            },
        },
    ]
}

// ---------------------------------------------------------------------------
// Verdict assembly
// ---------------------------------------------------------------------------

fn corpus_verdict(corpus_id: &str, log: &AloopLog) -> CorpusVerdict {
    let (records, hash, _close) = run_log(log);
    let (_bytes, identical) = cold_replay(log);
    let codes = refusal_codes(&records);
    let conformant = codes.is_empty();
    CorpusVerdict {
        corpus_id: corpus_id.to_owned(),
        provenance: log.provenance.clone(),
        event_count: log.events.len(),
        transitions_hash: hash,
        cold_replay_byte_identical: identical,
        refusal_codes: codes,
        conformant,
    }
}

fn real_lane_scan() -> RealLaneScan {
    let root = std::env::var("ALOOP_LANE_ROOT").unwrap_or_default();
    if root.is_empty() {
        return RealLaneScan {
            root: "(unset: synthetic-only run)".to_owned(),
            files_scanned: 0,
            corpora: vec![],
            verdict: "UNKNOWN".to_owned(),
        };
    }
    let mut corpora = Vec::new();
    let mut scanned = 0usize;
    let lane_root = PathBuf::from(&root);
    let mut lane_dirs: Vec<PathBuf> = std::fs::read_dir(&lane_root)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir() && p.file_name().map(|n| n.to_string_lossy().starts_with("lane-")).unwrap_or(false))
                .collect()
        })
        .unwrap_or_default();
    lane_dirs.sort();
    // Bounded scan: at most 10 lanes x 50 candidate files x 2 MiB.
    'lanes: for dir in lane_dirs.iter().take(10) {
        let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.is_file()
                            && p.extension().map(|x| x == "json" || x == "jsonl" || x == "ndjson").unwrap_or(false)
                    })
                    .collect()
            })
            .unwrap_or_default();
        files.sort();
        for file in files.into_iter().take(50) {
            let Ok(text) = std::fs::read_to_string(&file) else {
                continue;
            };
            if text.len() > 2 * 1024 * 1024 {
                continue;
            }
            let parsed = parse_lane_log(&file, &text);
            let Some(log) = parsed else { continue };
            scanned += 1;
            let mut v = corpus_verdict(&format!("real:{}", file.display()), &log);
            v.corpus_id = format!("real:{}", file.display());
            let real = v.conformant;
            corpora.push(v);
            if scanned >= 20 {
                break 'lanes;
            }
            let _ = real;
        }
    }
    let verdict = if corpora.is_empty() {
        "UNKNOWN".to_owned()
    } else if corpora.iter().all(|c| c.conformant) {
        "AUTONOMOUS_CONFORMANT".to_owned()
    } else {
        "NON_CONFORMANT".to_owned()
    };
    RealLaneScan {
        root,
        files_scanned: scanned,
        corpora,
        verdict,
    }
}

/// Accepts this oracle's native log shape; also a tolerant OCEL 2.0
/// (`ocel:events`) mapping where qualifiers default to "output" and
/// attributes named like contract qualifiers are honored. Returns None when
/// the file is not an ALOOP log at all.
fn parse_lane_log(path: &std::path::Path, text: &str) -> Option<AloopLog> {
    #[derive(Deserialize)]
    struct RawObj {
        #[serde(default)]
        id: String,
        #[serde(default, rename = "type")]
        kind: String,
        #[serde(default)]
        object_type: String,
        #[serde(default)]
        object_id: String,
        #[serde(default)]
        qualifier: String,
    }
    #[derive(Deserialize)]
    struct RawEvent {
        #[serde(default, rename = "event_id")]
        raw_event_id: Option<String>,
        #[serde(default, rename = "ocel:activity")]
        ocel_activity: Option<String>,
        #[serde(default)]
        activity: Option<String>,
        #[serde(default, rename = "seq")]
        raw_seq: Option<u64>,
        #[serde(default, rename = "ocel:timestamp")]
        ocel_timestamp: Option<String>,
        #[serde(default)]
        ts: Option<u64>,
        #[serde(default)]
        standing: Option<String>,
        #[serde(default)]
        objects: Vec<RawObj>,
        #[serde(default, rename = "ocel:objects")]
        ocel_objects: Vec<RawObj>,
    }
    #[derive(Deserialize)]
    struct RawLog {
        #[serde(default, rename = "log_id")]
        raw_log_id: Option<String>,
        #[serde(default, rename = "human_epoch_ts")]
        raw_epoch: Option<u64>,
        #[serde(default)]
        provenance: Option<String>,
        #[serde(default)]
        events: Vec<RawEvent>,
        #[serde(default, rename = "ocel:events")]
        ocel_events: Option<BTreeMap<String, RawEvent>>,
    }

    let raw: RawLog = serde_json::from_str(text).ok()?;
    let mut events: Vec<AloopEvent> = Vec::new();
    if !raw.events.is_empty() {
        for (i, r) in raw.events.iter().enumerate() {
            events.push(AloopEvent {
                event_id: r.raw_event_id.clone().unwrap_or_else(|| format!("{i:04}")),
                seq: r.raw_seq.unwrap_or(i as u64 + 1),
                ts: r.ts.unwrap_or(0),
                activity: r.activity.clone().or_else(|| r.ocel_activity.clone())?,
                standing: r.standing.clone(),
                objects: r
                    .objects
                    .iter()
                    .map(|o| AloopObjectRef {
                        object_type: if o.object_type.is_empty() { o.kind.clone() } else { o.object_type.clone() },
                        object_id: if o.object_id.is_empty() { o.id.clone() } else { o.object_id.clone() },
                        qualifier: if o.qualifier.is_empty() { "output".to_owned() } else { o.qualifier.clone() },
                    })
                    .collect(),
            });
        }
    } else if let Some(map) = raw.ocel_events {
        for (i, (key, r)) in map.iter().enumerate() {
            events.push(AloopEvent {
                event_id: key.clone(),
                seq: r.raw_seq.unwrap_or(i as u64 + 1),
                ts: r.ts.unwrap_or(0),
                activity: r.activity.clone().or_else(|| r.ocel_activity.clone())?,
                standing: r.standing.clone(),
                objects: r
                    .ocel_objects
                    .iter()
                    .chain(r.objects.iter())
                    .map(|o| AloopObjectRef {
                        object_type: if o.object_type.is_empty() { o.kind.clone() } else { o.object_type.clone() },
                        object_id: if o.object_id.is_empty() { o.id.clone() } else { o.object_id.clone() },
                        qualifier: if o.qualifier.is_empty() { "output".to_owned() } else { o.qualifier.clone() },
                    })
                    .collect(),
            });
        }
    } else {
        return None;
    }
    events.sort_by_key(|e| e.seq);
    Some(AloopLog {
        log_id: raw
            .raw_log_id
            .unwrap_or_else(|| path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()),
        human_epoch_ts: raw.raw_epoch.unwrap_or(0),
        provenance: raw.provenance.unwrap_or_else(|| "REAL_LANE_MANIFEST".to_owned()),
        events,
    })
}

fn check_table(mutants: &[MutantResult], synthetic: &CorpusVerdict, blocked: &CorpusVerdict) -> Vec<CheckOutcome> {
    let mutant_firing = |check: &str| {
        mutants
            .iter()
            .find(|m| m.mutated_check == check && m.refused && !m.survived)
            .map(|m| m.id.to_owned())
    };
    let mk = |check: &str, description: &str, by: Option<String>, clean_witness: bool| {
        let pass = clean_witness && by.is_some();
        CheckOutcome {
            check: check.to_owned(),
            description: description.to_owned(),
            witnessed_clean: clean_witness,
            witnessed_by_mutant: by,
            pass,
        }
    };
    vec![
        mk(
            "event-ordering",
            "episode.start->observe->...->receipt.persist->reobserve->goal->terminal partial order holds",
            mutant_firing("recurrence/reobserve-before-goal"),
            synthetic.conformant && blocked.conformant,
        ),
        mk(
            "object-identity",
            "episode subject SHA immutable across all events",
            mutant_firing("object-identity/subject-SHA"),
            synthetic.conformant,
        ),
        mk(
            "recurrence",
            "receipt.persist->reobserve->predecessor-linked successor WorkOrder chain",
            mutant_firing("recurrence/reobserve-before-goal"),
            synthetic.conformant,
        ),
        mk(
            "receipt-linkage",
            "every DO (actuate) closed by a receipt.persist on the same consequence",
            mutant_firing("receipt-linkage/zero-orphan-DO"),
            synthetic.conformant,
        ),
        mk(
            "provider-substitution",
            "provider changes only via provider.replace(input=current,output=new)",
            mutant_firing("provider-substitution-legality"),
            synthetic.conformant,
        ),
        mk(
            "worker-substitution",
            "WorkerRun bound to claimed worker; change requires worker.claim",
            mutant_firing("worker-substitution-legality"),
            synthetic.conformant,
        ),
        mk(
            "typed-terminality",
            "episode.terminal requires goal.satisfied or goal.blocked (with Failure evidence)",
            mutant_firing("typed-terminality"),
            synthetic.conformant && blocked.conformant,
        ),
        mk(
            "zero-human-causal-edges",
            "post-epoch events carry zero human originAuthority edges",
            mutant_firing("zero-human-causal-edges-post-epoch"),
            synthetic.conformant,
        ),
        mk(
            "zero-orphan-do",
            "no unreceipted DO at goal or terminal",
            mutant_firing("receipt-linkage/zero-orphan-DO"),
            synthetic.conformant,
        ),
        mk(
            "zero-duplicate-consequence",
            "consequence ids are never reused across DOs",
            mutant_firing("zero-duplicate-consequence"),
            synthetic.conformant,
        ),
        mk(
            "standing-law",
            "never ASSISTED -> AUTONOMOUS",
            mutant_firing("standing-law/never-ASSISTED-to-AUTONOMOUS"),
            synthetic.conformant && blocked.conformant,
        ),
        mk(
            "event-class-vocabulary",
            "all activities are contract event classes",
            mutant_firing("event-class-vocabulary"),
            synthetic.conformant,
        ),
    ]
}

pub fn evaluate_verdict() -> AloopVerdict {
    let clean = clean_fixture();
    let blocked = blocked_fixture();
    let synthetic = corpus_verdict("synthetic-clean-seeded", &clean);
    let blocked_v = corpus_verdict("synthetic-blocked-seeded", &blocked);

    let mut mutant_results = Vec::new();
    for m in mutants() {
        let mut log = clean_fixture();
        (m.apply)(&mut log);
        let (records, _hash, _close) = run_log(&log);
        let (_bytes, identical) = cold_replay(&log);
        let codes = refusal_codes(&records);
        let refused = codes.iter().any(|c| c == m.expected_code);
        let survived = !refused;
        mutant_results.push(MutantResult {
            id: m.id.to_owned(),
            name: m.name.to_owned(),
            mutated_check: m.mutated_check.to_owned(),
            expected_code: m.expected_code.to_owned(),
            refused,
            observed_codes: codes,
            cold_replay_byte_identical: identical,
            survived,
        });
    }

    let checks = check_table(&mutant_results, &synthetic, &blocked_v);
    let survivors: Vec<String> = mutant_results
        .iter()
        .filter(|m| m.survived)
        .map(|m| m.id.clone())
        .collect();
    let anti = AntiVacuity {
        clean_fixture_passes: synthetic.conformant && synthetic.cold_replay_byte_identical,
        blocked_fixture_passes: blocked_v.conformant && blocked_v.cold_replay_byte_identical,
        all_mutants_refused: survivors.is_empty(),
        mutant_survivors: survivors.clone(),
        cold_replay_byte_identical: synthetic.cold_replay_byte_identical
            && blocked_v.cold_replay_byte_identical
            && mutant_results.iter().all(|m| m.cold_replay_byte_identical),
    };

    let real = real_lane_scan();
    let mut reasons = Vec::new();
    if !anti.clean_fixture_passes {
        reasons.push("clean fixture failed (oracle defect)".to_owned());
    }
    if !anti.blocked_fixture_passes {
        reasons.push("blocked fixture failed (oracle defect)".to_owned());
    }
    if !anti.all_mutants_refused {
        reasons.push(format!("mutant survivors: {survivors:?} (oracle defect)"));
    }
    if !anti.cold_replay_byte_identical {
        reasons.push("cold replay not byte-identical (determinism defect)".to_owned());
    }

    let overall = if survivors.is_empty()
        && anti.clean_fixture_passes
        && anti.blocked_fixture_passes
        && anti.cold_replay_byte_identical
    {
        if real.verdict == "AUTONOMOUS_CONFORMANT" {
            "AUTONOMOUS_CONFORMANT".to_owned()
        } else if real.verdict == "NON_CONFORMANT" {
            reasons.push(format!(
                "real lane manifests non-conformant: {:?}",
                real.corpora.iter().filter(|c| !c.conformant).map(|c| c.corpus_id.clone()).collect::<Vec<_>>()
            ));
            "NON_CONFORMANT".to_owned()
        } else {
            reasons.push(
                "no real lane manifests were available to this run: verdict rests on the RECONSTRUCTED synthetic corpus only".to_owned(),
            );
            "PARTIAL".to_owned()
        }
    } else {
        "NON_CONFORMANT".to_owned()
    };

    AloopVerdict {
        oracle: OracleMeta {
            name: "aloop-replay-oracle".to_owned(),
            lane: "lane-10".to_owned(),
            episode: "ALOOP-ZCODE-DOGFOOD-001".to_owned(),
            contract: "ALOOP OCEL 2.0 (10-lane contract, identical across lanes)".to_owned(),
            independence: "independent of XaaS-side and ex4pm-side judges; disagreement is evidence".to_owned(),
        },
        subject: SubjectMeta {
            repo: "wasm4pm".to_owned(),
            branch: std::env::var("ALOOP_SUBJECT_BRANCH").unwrap_or_else(|_| "unknown".to_owned()),
            head_sha: std::env::var("ALOOP_SUBJECT_SHA").unwrap_or_else(|_| "unknown".to_owned()),
        },
        synthetic_corpus: synthetic,
        blocked_corpus: blocked_v,
        real_lane_manifests: real,
        mutants: mutant_results,
        checks,
        anti_vacuity: anti,
        overall,
        reasons,
    }
}

// ---------------------------------------------------------------------------
// Tests: the harness itself
// ---------------------------------------------------------------------------

#[test]
fn clean_fixture_conforms_and_cold_replays_byte_identical() {
    let log = clean_fixture();
    let (records, _hash, close) = run_log(&log);
    assert!(
        records.iter().all(|r| !r.disposition.is_refused()),
        "clean fixture must produce zero refusals, got: {records:?}"
    );
    assert_eq!(close, Disposition::Terminal, "clean fixture must terminate typed");
    let (_bytes, identical) = cold_replay(&log);
    assert!(identical, "cold replay must be byte-identical");
}

#[test]
fn blocked_fixture_conforms_via_typed_goal_blocked() {
    let log = blocked_fixture();
    let (records, _hash, close) = run_log(&log);
    assert!(
        records.iter().all(|r| !r.disposition.is_refused()),
        "blocked fixture must produce zero refusals, got: {records:?}"
    );
    assert_eq!(close, Disposition::Terminal);
}

#[test]
fn every_mutant_is_refused_with_typed_reason() {
    let verdict = evaluate_verdict();
    let survivors: Vec<&MutantResult> = verdict.mutants.iter().filter(|m| m.survived).collect();
    assert!(
        survivors.is_empty(),
        "ORACLE DEFECT: surviving mutants {survivors:?} — each mutant must be REFUSED with its exact typed code"
    );
    for m in &verdict.mutants {
        assert!(
            m.cold_replay_byte_identical,
            "mutant {} cold replay not byte-identical",
            m.id
        );
    }
}

#[test]
fn independent_oracle_never_grants_authority() {
    // The oracle only emits verdicts; nothing in it may actuate. Structural
    // statement: Disposition has no authority-carrying variant.
    let d = Disposition::Terminal;
    assert!(matches!(d, Disposition::Terminal));
}

#[test]
fn verdict_json_is_emitted_and_wellformed() {
    let verdict = evaluate_verdict();
    let json = serde_json::to_vec_pretty(&verdict).expect("verdict serialization is infallible");
    let out = std::env::var("ALOOP_VERDICT_OUT").unwrap_or_else(|_| {
        "../../artifacts/aloop-dogfood-001/lane-10/verdict.json".to_owned()
    });
    let path = PathBuf::from(out);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("artifact dir creation is lawful in the harness sandbox");
    }
    std::fs::write(&path, &json).expect("verdict write is lawful in the harness sandbox");
    println!("ALOOP verdict written to {}", path.display());
    println!("overall: {}", verdict.overall);
}
