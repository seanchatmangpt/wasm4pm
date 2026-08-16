//! Evidence-bounded test primitives for GymAct -> OCEL -> wasm4pm integration.
//!
//! This crate is deliberately non-production and carries no actuation authority.
//! It models the contracts that integrations must preserve so richer wasm4pm
//! implementations can be tested against a small Gall-style oracle.

pub mod last_24h;

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

pub const REFUSED_PROCESS_SEMANTIC_DIVERGENCE: &str = "REFUSED:PROCESS_SEMANTIC_DIVERGENCE";
pub const REFUSED_INVALID_RECEIPT_CHAIN: &str = "REFUSED:INVALID_RECEIPT_CHAIN";
pub const REFUSED_INVALID_LIFECYCLE: &str = "REFUSED:INVALID_LIFECYCLE";
pub const REFUSED_DISCOVER_IN_EPISODE: &str = "REFUSED:DISCOVER_IN_EPISODE";
pub const REFUSED_POST_CLOSE_EVENT: &str = "REFUSED:POST_CLOSE_EVENT";

/// The evidence-backed GymAct lifecycle vocabulary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Discover,
    Materialize,
    Observe,
    Act,
    Verify,
    Checkpoint,
    Restore,
    Teardown,
}

/// Public object-centric relation carried into an OCEL projection.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ObjectRef {
    pub object_type: String,
    pub object_id: String,
    pub qualifier: String,
}

/// Minimal receipt subject consumed by process oracles.
///
/// A process oracle can inspect this evidence but cannot turn it into authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    pub episode_id: String,
    pub ordinal: u64,
    pub operation: Operation,
    pub subject_digest: String,
    pub predecessor_digest: Option<String>,
    pub consequence_observed: bool,
    pub verification_passed: Option<bool>,
    pub objects: Vec<ObjectRef>,
}

impl Receipt {
    #[must_use]
    pub fn digest(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("Receipt serialization is infallible");
        blake3::hash(&bytes).to_hex().to_string()
    }
}

/// Process-side evidence only. No variant grants actuation permission.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProcessDisposition {
    Conforming,
    Terminal,
    Dead { reason: String },
    Blocked { reason: String },
    Refused { code: String },
}

impl ProcessDisposition {
    #[must_use]
    pub fn grants_authority(&self) -> bool {
        false
    }
}

/// Small replaceable contract implemented by local lifecycle and wasm4pm-backed oracles.
pub trait ProcessOracle {
    fn observe(&mut self, receipt: &Receipt) -> ProcessDisposition;

    fn close(&mut self) -> ProcessDisposition {
        ProcessDisposition::Terminal
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LifecycleState {
    New,
    Active,
    Verified,
    Closed,
}

/// Hand-checkable Gall oracle for the generic GymAct episode lifecycle.
#[derive(Debug, Clone)]
pub struct LifecycleOracle {
    state: LifecycleState,
    episode_id: Option<String>,
    next_ordinal: u64,
    previous_digest: Option<String>,
}

impl Default for LifecycleOracle {
    fn default() -> Self {
        Self {
            state: LifecycleState::New,
            episode_id: None,
            next_ordinal: 0,
            previous_digest: None,
        }
    }
}

impl LifecycleOracle {
    fn refuse(code: &str) -> ProcessDisposition {
        ProcessDisposition::Refused {
            code: code.to_owned(),
        }
    }

    fn receipt_chain_is_valid(&self, receipt: &Receipt) -> bool {
        if receipt.ordinal != self.next_ordinal {
            return false;
        }
        if let Some(episode_id) = &self.episode_id {
            if episode_id != &receipt.episode_id {
                return false;
            }
        }
        receipt.predecessor_digest == self.previous_digest
    }

    fn admit_receipt(&mut self, receipt: &Receipt) {
        self.episode_id
            .get_or_insert_with(|| receipt.episode_id.clone());
        self.next_ordinal += 1;
        self.previous_digest = Some(receipt.digest());
    }
}

impl ProcessOracle for LifecycleOracle {
    fn observe(&mut self, receipt: &Receipt) -> ProcessDisposition {
        if receipt.operation == Operation::Discover {
            return Self::refuse(REFUSED_DISCOVER_IN_EPISODE);
        }
        if self.state == LifecycleState::Closed {
            return Self::refuse(REFUSED_POST_CLOSE_EVENT);
        }
        if !self.receipt_chain_is_valid(receipt) {
            return Self::refuse(REFUSED_INVALID_RECEIPT_CHAIN);
        }

        let next = match (self.state, receipt.operation) {
            (LifecycleState::New, Operation::Materialize) => LifecycleState::Active,
            (LifecycleState::Active, Operation::Observe | Operation::Checkpoint) => {
                LifecycleState::Active
            }
            (LifecycleState::Active, Operation::Act) => LifecycleState::Active,
            (LifecycleState::Active, Operation::Restore) => LifecycleState::Active,
            (LifecycleState::Active, Operation::Verify) => {
                if receipt.verification_passed == Some(true) {
                    LifecycleState::Verified
                } else {
                    return ProcessDisposition::Dead {
                        reason: "verification did not pass".to_owned(),
                    };
                }
            }
            (LifecycleState::Active | LifecycleState::Verified, Operation::Teardown) => {
                LifecycleState::Closed
            }
            (LifecycleState::Verified, Operation::Observe | Operation::Checkpoint) => {
                LifecycleState::Verified
            }
            (LifecycleState::Verified, Operation::Restore | Operation::Act) => {
                LifecycleState::Active
            }
            (LifecycleState::Verified, Operation::Verify) => {
                if receipt.verification_passed == Some(true) {
                    LifecycleState::Verified
                } else {
                    return ProcessDisposition::Dead {
                        reason: "verification regressed".to_owned(),
                    };
                }
            }
            _ => return Self::refuse(REFUSED_INVALID_LIFECYCLE),
        };

        self.state = next;
        self.admit_receipt(receipt);
        if next == LifecycleState::Closed {
            ProcessDisposition::Terminal
        } else {
            ProcessDisposition::Conforming
        }
    }
}

/// Differential court: disagreement is evidence and fails closed.
pub struct DifferentialOracle<A, B> {
    pub left: A,
    pub right: B,
}

impl<A: ProcessOracle, B: ProcessOracle> ProcessOracle for DifferentialOracle<A, B> {
    fn observe(&mut self, receipt: &Receipt) -> ProcessDisposition {
        let left = self.left.observe(receipt);
        let right = self.right.observe(receipt);
        if left == right {
            left
        } else {
            ProcessDisposition::Refused {
                code: REFUSED_PROCESS_SEMANTIC_DIVERGENCE.to_owned(),
            }
        }
    }
}

/// Minimal object-centric event projection. It preserves object multiplicity and
/// qualifiers instead of flattening an episode to one case identifier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcelEvent {
    pub event_id: String,
    pub activity: Operation,
    pub objects: Vec<ObjectRef>,
}

#[must_use]
pub fn receipt_to_ocel_event(receipt: &Receipt) -> OcelEvent {
    OcelEvent {
        event_id: receipt.digest(),
        activity: receipt.operation,
        objects: receipt.objects.clone(),
    }
}

/// Small POWL-like partial-order test model. Step identity is explicit so
/// repeated operation labels cannot collapse into one node.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessStep {
    pub step_id: String,
    pub operation: Operation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExpectedProcess {
    pub steps: BTreeMap<String, ProcessStep>,
    pub precedes: BTreeSet<(String, String)>,
}

impl ExpectedProcess {
    #[must_use]
    pub fn check_observed(&self, observed_step_ids: &[String]) -> ProcessDisposition {
        if observed_step_ids.len() != self.steps.len() {
            return ProcessDisposition::Dead {
                reason: "observed step set differs from expected process".to_owned(),
            };
        }

        let positions: BTreeMap<&str, usize> = observed_step_ids
            .iter()
            .enumerate()
            .map(|(index, id)| (id.as_str(), index))
            .collect();
        if positions.len() != observed_step_ids.len()
            || self
                .steps
                .keys()
                .any(|step_id| !positions.contains_key(step_id.as_str()))
        {
            return ProcessDisposition::Dead {
                reason: "observed process contains unknown, missing, or duplicate steps".to_owned(),
            };
        }

        for (before, after) in &self.precedes {
            let Some(before_position) = positions.get(before.as_str()) else {
                return ProcessDisposition::Dead {
                    reason: "precedence source is absent".to_owned(),
                };
            };
            let Some(after_position) = positions.get(after.as_str()) else {
                return ProcessDisposition::Dead {
                    reason: "precedence target is absent".to_owned(),
                };
            };
            if before_position >= after_position {
                return ProcessDisposition::Dead {
                    reason: format!("precedence violated: {before} !< {after}"),
                };
            }
        }

        ProcessDisposition::Conforming
    }
}

/// Content-bound evidence returned to AutoFDE Lab. It contains process evidence,
/// not authorization and not a benchmark score.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessEvidenceBundle {
    pub subject_digest: String,
    pub engine_digest: String,
    pub model_digest: String,
    pub dispositions: Vec<ProcessDisposition>,
    pub replay_digest: String,
}

impl ProcessEvidenceBundle {
    #[must_use]
    pub fn digest(&self) -> String {
        let bytes =
            serde_json::to_vec(self).expect("ProcessEvidenceBundle serialization is infallible");
        blake3::hash(&bytes).to_hex().to_string()
    }
}
