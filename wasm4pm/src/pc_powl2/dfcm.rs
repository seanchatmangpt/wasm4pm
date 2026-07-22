//! Executable 8^4 PC-POWL2 conformance matrix.
//!
//! This is deliberately not a symbolic "operator word" classifier. Each of the
//! 4,096 coordinates constructs a concrete certificate, applies a concrete
//! mutation, chooses a concrete execution policy and initial state, then invokes
//! the real checker and, where applicable, the real broker and replay verifier.

use super::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use wasm4pm_compat::powl::{ChoiceGraphEdge, PowlNode, PowlNodeKind};
use wasm4pm_compat::prelude::{
    CommutationWitness, VerificationBounds, PC_POWL2_SCHEMA, PC_POWL2_VERSION,
};

pub const DFCM_LEVELS: usize = 8;
pub const DFCM_DIMENSIONS: usize = 4;
pub const DFCM_CASES: usize = 4096;
pub const DFCM_SCHEMA: &str = "urn:mfw:pc-powl2:dfcm-conformance:8pow4:v2";

macro_rules! eight_level_enum {
    ($name:ident { $($variant:ident = $value:expr),+ $(,)? }) => {
        #[repr(u8)]
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name { $($variant = $value),+ }

        impl $name {
            pub const ALL: [Self; DFCM_LEVELS] = [$(Self::$variant),+];
            pub const fn index(self) -> usize { self as usize }
            pub const fn from_index(index: usize) -> Option<Self> {
                match index { $($value => Some(Self::$variant),)+ _ => None }
            }
        }
    };
}

eight_level_enum!(Scenario {
    ValidAtom = 0,
    PartialAction = 1,
    VacuousAtom = 2,
    InvalidPost = 3,
    ValidConsequence = 4,
    ValidPartialOrder = 5,
    NoncommutingPartialOrder = 6,
    ValidChoiceGraph = 7,
});

eight_level_enum!(CertificateMutation {
    Intact = 0,
    DomainDigest = 1,
    ModelDigest = 2,
    ProofDigest = 3,
    Schema = 4,
    Version = 5,
    Subject = 6,
    Bounds = 7,
});

eight_level_enum!(ExecutionPolicy {
    VerifyOnly = 0,
    ExecuteCanonical = 1,
    ExecuteAlternate = 2,
    ExpiredAuthorization = 3,
    ForgedAuthorization = 4,
    TamperedAuthorization = 5,
    ReusedAuthorization = 6,
    ReceiptChain = 7,
});

eight_level_enum!(InitialStateVariant {
    S000 = 0,
    S001 = 1,
    S010 = 2,
    S011 = 3,
    S100 = 4,
    S101 = 5,
    S110 = 6,
    S111 = 7,
});

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct CaseCoordinate {
    pub scenario: Scenario,
    pub mutation: CertificateMutation,
    pub policy: ExecutionPolicy,
    pub initial: InitialStateVariant,
}

impl CaseCoordinate {
    pub fn from_ordinal(mut ordinal: usize) -> Option<Self> {
        if ordinal >= DFCM_CASES {
            return None;
        }
        let initial = InitialStateVariant::from_index(ordinal % DFCM_LEVELS)?;
        ordinal /= DFCM_LEVELS;
        let policy = ExecutionPolicy::from_index(ordinal % DFCM_LEVELS)?;
        ordinal /= DFCM_LEVELS;
        let mutation = CertificateMutation::from_index(ordinal % DFCM_LEVELS)?;
        ordinal /= DFCM_LEVELS;
        let scenario = Scenario::from_index(ordinal % DFCM_LEVELS)?;
        Some(Self {
            scenario,
            mutation,
            policy,
            initial,
        })
    }

    pub const fn ordinal(self) -> usize {
        (((self.scenario.index() * DFCM_LEVELS + self.mutation.index()) * DFCM_LEVELS
            + self.policy.index())
            * DFCM_LEVELS)
            + self.initial.index()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct AuditState {
    x: u8,
    y: u8,
    z: u8,
}

impl InitialStateVariant {
    const fn state(self) -> AuditState {
        let bits = self as u8;
        AuditState {
            x: (bits >> 2) & 1,
            y: (bits >> 1) & 1,
            z: bits & 1,
        }
    }
}

struct AuditDomain;

impl FiniteStateDomain for AuditDomain {
    type State = AuditState;

    fn domain_digest(&self) -> String {
        "pc-powl2-dfcm-domain:v2:set-bits+partial-zero+copy-x-y".to_string()
    }

    fn states(&self) -> Vec<Self::State> {
        InitialStateVariant::ALL
            .into_iter()
            .map(InitialStateVariant::state)
            .collect()
    }

    fn holds(&self, assertion: &AssertionRef, state: &Self::State) -> PcpResult<bool> {
        match assertion.0.as_str() {
            "true" => Ok(true),
            "false" => Ok(false),
            "zero" => Ok(state.x == 0 && state.y == 0 && state.z == 0),
            "x_zero" => Ok(state.x == 0),
            "x_one" => Ok(state.x == 1),
            "y_one" => Ok(state.y == 1),
            "xy_one" => Ok(state.x == 1 && state.y == 1),
            "y_eq_x" => Ok(state.y == state.x),
            other => Err(PcpRefusal::AssertionRefused {
                assertion: other.to_string(),
            }),
        }
    }

    fn step(&self, action: &str, state: &Self::State) -> Result<Self::State, String> {
        match action {
            "set_x_one" => Ok(AuditState { x: 1, ..*state }),
            "set_y_one" => Ok(AuditState { y: 1, ..*state }),
            "only_zero_to_one" if state.x == 0 => Ok(AuditState { x: 1, ..*state }),
            "only_zero_to_one" => Err("precondition x_zero is false".to_string()),
            "copy_x_to_y" => Ok(AuditState {
                y: state.x,
                ..*state
            }),
            other => Err(format!("unknown action {other}")),
        }
    }

    fn variant(&self, variant: &VariantRef, state: &Self::State) -> PcpResult<u64> {
        match variant.0.as_str() {
            "zero_bits" => Ok(u64::from(3 - state.x - state.y - state.z)),
            other => Err(PcpRefusal::AssertionRefused {
                assertion: other.to_string(),
            }),
        }
    }
}

fn atom(id: usize, action: &str) -> PowlNode {
    PowlNode::new(PowlNodeId(id), PowlNodeKind::Atom(action.to_string()))
}

fn atom_proof(id: usize, pre: &str, post: &str) -> ProofTerm {
    ProofTerm::Atom {
        node: PowlNodeId(id),
        pre: AssertionRef::new(pre),
        post: AssertionRef::new(post),
    }
}

fn certificate(model: Powl, proof: ProofTerm, subject: &str) -> CertifiedPowl {
    CertifiedPowl {
        schema: PC_POWL2_SCHEMA.to_string(),
        version: PC_POWL2_VERSION.to_string(),
        subject: subject.to_string(),
        domain_digest: String::new(),
        model_digest: String::new(),
        proof_digest: String::new(),
        claim: CertificateClaim::FiniteTraceSafety,
        bounds: VerificationBounds {
            max_states: 8,
            max_proof_depth: 16,
            max_selection_depth: 16,
            max_trace_steps: 16,
            max_choice_visits: 64,
        },
        model,
        proof,
    }
}

impl Scenario {
    fn build(self) -> CertifiedPowl {
        match self {
            Self::ValidAtom => certificate(
                Powl {
                    nodes: vec![atom(0, "set_x_one")],
                    edges: vec![],
                    root: Some(PowlNodeId(0)),
                },
                atom_proof(0, "true", "x_one"),
                "dfcm-valid-atom",
            ),
            Self::PartialAction => certificate(
                Powl {
                    nodes: vec![atom(0, "only_zero_to_one")],
                    edges: vec![],
                    root: Some(PowlNodeId(0)),
                },
                atom_proof(0, "x_zero", "x_one"),
                "dfcm-partial-action",
            ),
            Self::VacuousAtom => certificate(
                Powl {
                    nodes: vec![atom(0, "set_x_one")],
                    edges: vec![],
                    root: Some(PowlNodeId(0)),
                },
                atom_proof(0, "false", "true"),
                "dfcm-vacuous-atom",
            ),
            Self::InvalidPost => certificate(
                Powl {
                    nodes: vec![atom(0, "set_x_one")],
                    edges: vec![],
                    root: Some(PowlNodeId(0)),
                },
                atom_proof(0, "true", "zero"),
                "dfcm-invalid-post",
            ),
            Self::ValidConsequence => certificate(
                Powl {
                    nodes: vec![atom(0, "set_x_one")],
                    edges: vec![],
                    root: Some(PowlNodeId(0)),
                },
                ProofTerm::Consequence {
                    node: PowlNodeId(0),
                    pre: AssertionRef::new("x_zero"),
                    post: AssertionRef::new("x_one"),
                    inner_pre: AssertionRef::new("true"),
                    inner_post: AssertionRef::new("x_one"),
                    inner: Box::new(atom_proof(0, "true", "x_one")),
                },
                "dfcm-valid-consequence",
            ),
            Self::ValidPartialOrder | Self::NoncommutingPartialOrder => {
                let noncommuting = self == Self::NoncommutingPartialOrder;
                let right_action = if noncommuting {
                    "copy_x_to_y"
                } else {
                    "set_y_one"
                };
                let right_post = if noncommuting { "y_eq_x" } else { "y_one" };
                certificate(
                    Powl {
                        nodes: vec![
                            atom(0, "set_x_one"),
                            atom(1, right_action),
                            PowlNode::new(
                                PowlNodeId(2),
                                PowlNodeKind::PartialOrder(vec![PowlNodeId(0), PowlNodeId(1)]),
                            ),
                        ],
                        edges: vec![],
                        root: Some(PowlNodeId(2)),
                    },
                    ProofTerm::PartialOrder {
                        node: PowlNodeId(2),
                        pre: AssertionRef::new(if noncommuting { "zero" } else { "true" }),
                        post: AssertionRef::new("xy_one"),
                        canonical: vec![PowlNodeId(0), PowlNodeId(1)],
                        children: vec![
                            atom_proof(0, "true", "x_one"),
                            atom_proof(1, "true", right_post),
                        ],
                        commutations: vec![CommutationWitness {
                            left: PowlNodeId(0),
                            right: PowlNodeId(1),
                        }],
                    },
                    if noncommuting {
                        "dfcm-noncommuting-partial-order"
                    } else {
                        "dfcm-valid-partial-order"
                    },
                )
            }
            Self::ValidChoiceGraph => certificate(
                Powl {
                    nodes: vec![
                        PowlNode::new(PowlNodeId(0), PowlNodeKind::Start),
                        atom(1, "set_x_one"),
                        PowlNode::new(PowlNodeId(2), PowlNodeKind::End),
                        PowlNode::new(
                            PowlNodeId(3),
                            PowlNodeKind::ChoiceGraph {
                                nodes: vec![PowlNodeId(0), PowlNodeId(1), PowlNodeId(2)],
                                edges: vec![
                                    ChoiceGraphEdge {
                                        from: PowlNodeId(0),
                                        to: PowlNodeId(1),
                                    },
                                    ChoiceGraphEdge {
                                        from: PowlNodeId(1),
                                        to: PowlNodeId(2),
                                    },
                                ],
                            },
                        ),
                    ],
                    edges: vec![],
                    root: Some(PowlNodeId(3)),
                },
                ProofTerm::ChoiceGraph {
                    node: PowlNodeId(3),
                    pre: AssertionRef::new("zero"),
                    post: AssertionRef::new("x_one"),
                    nodes: vec![
                        GraphNodeProof {
                            node: PowlNodeId(0),
                            before: AssertionRef::new("zero"),
                            after: AssertionRef::new("zero"),
                            proof: Box::new(ProofTerm::Boundary {
                                node: PowlNodeId(0),
                                assertion: AssertionRef::new("zero"),
                            }),
                        },
                        GraphNodeProof {
                            node: PowlNodeId(1),
                            before: AssertionRef::new("zero"),
                            after: AssertionRef::new("x_one"),
                            proof: Box::new(atom_proof(1, "zero", "x_one")),
                        },
                        GraphNodeProof {
                            node: PowlNodeId(2),
                            before: AssertionRef::new("x_one"),
                            after: AssertionRef::new("x_one"),
                            proof: Box::new(ProofTerm::Boundary {
                                node: PowlNodeId(2),
                                assertion: AssertionRef::new("x_one"),
                            }),
                        },
                    ],
                    edges: vec![
                        EdgeContract {
                            from: PowlNodeId(0),
                            to: PowlNodeId(1),
                        },
                        EdgeContract {
                            from: PowlNodeId(1),
                            to: PowlNodeId(2),
                        },
                    ],
                    cycle: CycleWitness::Acyclic,
                },
                "dfcm-valid-choice-graph",
            ),
        }
    }

    fn selection(self, alternate: bool) -> ExecutionSelection {
        match self {
            Self::ValidPartialOrder | Self::NoncommutingPartialOrder => {
                let mut children = vec![
                    ExecutionSelection::Atom {
                        node: PowlNodeId(0),
                    },
                    ExecutionSelection::Atom {
                        node: PowlNodeId(1),
                    },
                ];
                if alternate {
                    children.reverse();
                }
                ExecutionSelection::PartialOrder {
                    node: PowlNodeId(2),
                    children,
                }
            }
            Self::ValidChoiceGraph => ExecutionSelection::ChoicePath {
                node: PowlNodeId(3),
                path: vec![
                    ExecutionSelection::Boundary {
                        node: PowlNodeId(0),
                    },
                    ExecutionSelection::Atom {
                        node: PowlNodeId(1),
                    },
                    ExecutionSelection::Boundary {
                        node: PowlNodeId(2),
                    },
                ],
            },
            _ => ExecutionSelection::Atom {
                node: PowlNodeId(0),
            },
        }
    }
}

impl CertificateMutation {
    fn apply(self, certificate: &mut CertifiedPowl) {
        match self {
            Self::Intact => {}
            Self::DomainDigest => certificate.domain_digest.push_str(":tampered"),
            Self::ModelDigest => certificate.model_digest.push_str(":tampered"),
            Self::ProofDigest => certificate.proof_digest.push_str(":tampered"),
            Self::Schema => certificate.schema = "urn:invalid".to_string(),
            Self::Version => certificate.version = "0".to_string(),
            Self::Subject => certificate.subject.clear(),
            Self::Bounds => certificate.bounds.max_states = 1,
        }
    }
}

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailurePhase {
    Bind = 0,
    Verify = 1,
    Select = 2,
    Authorize = 3,
    Execute = 4,
    Replay = 5,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum CaseOutcome {
    Verified {
        standing: VerificationStanding,
    },
    ModelReceipted {
        receipt_digests: Vec<String>,
    },
    Refused {
        phase: FailurePhase,
        refusal: PcpRefusal,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CaseRecord {
    pub coordinate: CaseCoordinate,
    pub outcome: CaseOutcome,
}

fn refused(coordinate: CaseCoordinate, phase: FailurePhase, refusal: PcpRefusal) -> CaseRecord {
    CaseRecord {
        coordinate,
        outcome: CaseOutcome::Refused { phase, refusal },
    }
}

pub fn run_case(coordinate: CaseCoordinate) -> CaseRecord {
    let domain = AuditDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = coordinate.scenario.build();
    if let Err(refusal) = checker.bind_certificate(&mut certificate) {
        return refused(coordinate, FailurePhase::Bind, refusal);
    }
    coordinate.mutation.apply(&mut certificate);
    let report = match checker.verify(&certificate) {
        Ok(report) => report,
        Err(refusal) => return refused(coordinate, FailurePhase::Verify, refusal),
    };
    if coordinate.policy == ExecutionPolicy::VerifyOnly {
        return CaseRecord {
            coordinate,
            outcome: CaseOutcome::Verified {
                standing: report.standing,
            },
        };
    }

    let alternate = coordinate.policy == ExecutionPolicy::ExecuteAlternate;
    if alternate
        && !matches!(
            coordinate.scenario,
            Scenario::ValidPartialOrder | Scenario::NoncommutingPartialOrder
        )
    {
        return refused(
            coordinate,
            FailurePhase::Select,
            PcpRefusal::SelectionNotAdmitted {
                node: certificate.proof.node(),
            },
        );
    }
    let selection = coordinate.scenario.selection(alternate);
    let allowed = match checker.validate_selection(&certificate, &selection) {
        Ok(nodes) => nodes,
        Err(refusal) => return refused(coordinate, FailurePhase::Execute, refusal),
    };
    let initial = coordinate.initial.state();
    let mut broker = PcPowl2Broker::with_authority("dfcm-authority");

    if coordinate.policy == ExecutionPolicy::ForgedAuthorization {
        let forged = AuthorizationEnvelope {
            authorization_id: "forged".to_string(),
            subject: certificate.subject.clone(),
            domain_digest: certificate.domain_digest.clone(),
            model_digest: certificate.model_digest.clone(),
            proof_digest: certificate.proof_digest.clone(),
            allowed_nodes: allowed,
            challenge_nonce: "dfcm".to_string(),
            issued_unix_ms: 1,
            expires_unix_ms: 10,
            single_use: true,
        };
        return match broker.execute(&checker, &certificate, &forged, selection, initial, 5) {
            Ok(receipt) => CaseRecord {
                coordinate,
                outcome: CaseOutcome::ModelReceipted {
                    receipt_digests: vec![receipt.receipt_digest],
                },
            },
            Err(refusal) => refused(coordinate, FailurePhase::Execute, refusal),
        };
    }

    let expires = if coordinate.policy == ExecutionPolicy::ExpiredAuthorization {
        4
    } else {
        10
    };
    let mut authorization =
        match broker.authorize(&checker, &certificate, allowed, "dfcm", 1, expires, true) {
            Ok(authorization) => authorization,
            Err(refusal) => return refused(coordinate, FailurePhase::Authorize, refusal),
        };
    if coordinate.policy == ExecutionPolicy::TamperedAuthorization {
        authorization.challenge_nonce.push_str(":tampered");
    }
    let first = match broker.execute(
        &checker,
        &certificate,
        &authorization,
        selection.clone(),
        initial,
        5,
    ) {
        Ok(receipt) => receipt,
        Err(refusal) => return refused(coordinate, FailurePhase::Execute, refusal),
    };

    if coordinate.policy == ExecutionPolicy::ReusedAuthorization {
        return match broker.execute(
            &checker,
            &certificate,
            &authorization,
            selection,
            initial,
            5,
        ) {
            Ok(receipt) => CaseRecord {
                coordinate,
                outcome: CaseOutcome::ModelReceipted {
                    receipt_digests: vec![first.receipt_digest, receipt.receipt_digest],
                },
            },
            Err(refusal) => refused(coordinate, FailurePhase::Execute, refusal),
        };
    }

    if coordinate.policy == ExecutionPolicy::ReceiptChain {
        let allowed_nodes = match checker.validate_selection(&certificate, &selection) {
            Ok(nodes) => nodes,
            Err(refusal) => return refused(coordinate, FailurePhase::Select, refusal),
        };
        let second_authorization =
            match broker.authorize(&checker, &certificate, allowed_nodes, "dfcm-2", 1, 10, true) {
                Ok(authorization) => authorization,
                Err(refusal) => return refused(coordinate, FailurePhase::Authorize, refusal),
            };
        let chained_initial: AuditState = match serde_json::from_value(first.final_state.clone()) {
            Ok(state) => state,
            Err(error) => {
                return refused(
                    coordinate,
                    FailurePhase::Replay,
                    PcpRefusal::ReceiptSerializationFailed {
                        reason: error.to_string(),
                    },
                )
            }
        };
        let second = match broker.execute(
            &checker,
            &certificate,
            &second_authorization,
            selection,
            chained_initial,
            5,
        ) {
            Ok(receipt) => receipt,
            Err(refusal) => return refused(coordinate, FailurePhase::Execute, refusal),
        };
        let chain = vec![first, second];
        return match broker.verify_issued_receipt_chain(&checker, &certificate, &chain) {
            Ok(()) => CaseRecord {
                coordinate,
                outcome: CaseOutcome::ModelReceipted {
                    receipt_digests: chain
                        .iter()
                        .map(|receipt| receipt.receipt_digest.clone())
                        .collect(),
                },
            },
            Err(refusal) => refused(coordinate, FailurePhase::Replay, refusal),
        };
    }

    match broker.verify_issued_receipt(&checker, &certificate, &first) {
        Ok(()) => CaseRecord {
            coordinate,
            outcome: CaseOutcome::ModelReceipted {
                receipt_digests: vec![first.receipt_digest],
            },
        },
        Err(refusal) => refused(coordinate, FailurePhase::Replay, refusal),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct OutcomeSummary {
    pub verified: usize,
    pub model_receipted: usize,
    pub refused: usize,
    pub refused_by_phase: [usize; 6],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DfcmConformanceReceipt {
    pub schema: String,
    pub cases: usize,
    pub coverage_gaps: usize,
    pub dimension_histograms: [[usize; DFCM_LEVELS]; DFCM_DIMENSIONS],
    pub summary: OutcomeSummary,
    pub coordinate_digest: String,
    pub outcome_digest: String,
    pub receipt_digest: String,
}

impl DfcmConformanceReceipt {
    pub fn manufacture() -> PcpResult<Self> {
        let mut records = Vec::with_capacity(DFCM_CASES);
        for ordinal in 0..DFCM_CASES {
            let coordinate = CaseCoordinate::from_ordinal(ordinal).ok_or_else(|| {
                PcpRefusal::ReceiptSerializationFailed {
                    reason: format!("missing DfCM coordinate {ordinal}"),
                }
            })?;
            records.push(run_case(coordinate));
        }
        let coordinates: Vec<_> = records.iter().map(|record| record.coordinate).collect();
        let unique: BTreeSet<_> = coordinates.iter().copied().collect();
        let mut dimension_histograms = [[0usize; DFCM_LEVELS]; DFCM_DIMENSIONS];
        let mut summary = OutcomeSummary::default();
        for record in &records {
            dimension_histograms[0][record.coordinate.scenario.index()] += 1;
            dimension_histograms[1][record.coordinate.mutation.index()] += 1;
            dimension_histograms[2][record.coordinate.policy.index()] += 1;
            dimension_histograms[3][record.coordinate.initial.index()] += 1;
            match &record.outcome {
                CaseOutcome::Verified { .. } => summary.verified += 1,
                CaseOutcome::ModelReceipted { .. } => summary.model_receipted += 1,
                CaseOutcome::Refused { phase, .. } => {
                    summary.refused += 1;
                    summary.refused_by_phase[*phase as usize] += 1;
                }
            }
        }
        let mut receipt = Self {
            schema: DFCM_SCHEMA.to_string(),
            cases: records.len(),
            coverage_gaps: DFCM_CASES.saturating_sub(unique.len()),
            dimension_histograms,
            summary,
            coordinate_digest: canonical_digest(&coordinates)?,
            outcome_digest: canonical_digest(&records)?,
            receipt_digest: String::new(),
        };
        receipt.receipt_digest = receipt.expected_digest()?;
        Ok(receipt)
    }

    pub fn is_complete(&self) -> bool {
        self.schema == DFCM_SCHEMA
            && self.cases == DFCM_CASES
            && self.coverage_gaps == 0
            && self.dimension_histograms.iter().all(|histogram| {
                histogram
                    .iter()
                    .all(|count| *count == DFCM_CASES / DFCM_LEVELS)
            })
            && self.summary.verified + self.summary.model_receipted + self.summary.refused
                == DFCM_CASES
    }

    pub fn replay(&self) -> PcpResult<bool> {
        let replayed = Self::manufacture()?;
        Ok(self == &replayed && self.receipt_digest == self.expected_digest()?)
    }

    fn expected_digest(&self) -> PcpResult<String> {
        let mut material = self.clone();
        material.receipt_digest.clear();
        canonical_digest(&material)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn coordinate(
        scenario: Scenario,
        mutation: CertificateMutation,
        policy: ExecutionPolicy,
        initial: InitialStateVariant,
    ) -> CaseCoordinate {
        CaseCoordinate {
            scenario,
            mutation,
            policy,
            initial,
        }
    }

    #[test]
    fn exact_8pow4_coordinates_are_unique_and_reversible() {
        let coordinates: Vec<_> = (0..DFCM_CASES)
            .map(|ordinal| CaseCoordinate::from_ordinal(ordinal).unwrap())
            .collect();
        assert_eq!(coordinates.len(), DFCM_CASES);
        assert_eq!(
            coordinates.iter().copied().collect::<BTreeSet<_>>().len(),
            DFCM_CASES
        );
        for (ordinal, coordinate) in coordinates.into_iter().enumerate() {
            assert_eq!(coordinate.ordinal(), ordinal);
        }
    }

    #[test]
    fn partial_actions_are_checked_only_where_their_precondition_holds() {
        let record = run_case(coordinate(
            Scenario::PartialAction,
            CertificateMutation::Intact,
            ExecutionPolicy::VerifyOnly,
            InitialStateVariant::S000,
        ));
        assert!(matches!(record.outcome, CaseOutcome::Verified { .. }));
    }

    #[test]
    fn vacuous_atomic_contracts_are_refused() {
        let record = run_case(coordinate(
            Scenario::VacuousAtom,
            CertificateMutation::Intact,
            ExecutionPolicy::VerifyOnly,
            InitialStateVariant::S000,
        ));
        assert!(matches!(
            record.outcome,
            CaseOutcome::Refused {
                phase: FailurePhase::Verify,
                refusal: PcpRefusal::InitialEvidenceMissing,
            }
        ));
    }

    #[test]
    fn every_partial_order_linearization_is_checked() {
        let valid = run_case(coordinate(
            Scenario::ValidPartialOrder,
            CertificateMutation::Intact,
            ExecutionPolicy::VerifyOnly,
            InitialStateVariant::S000,
        ));
        assert!(matches!(valid.outcome, CaseOutcome::Verified { .. }));

        let invalid = run_case(coordinate(
            Scenario::NoncommutingPartialOrder,
            CertificateMutation::Intact,
            ExecutionPolicy::VerifyOnly,
            InitialStateVariant::S000,
        ));
        assert!(matches!(
            invalid.outcome,
            CaseOutcome::Refused {
                phase: FailurePhase::Verify,
                refusal: PcpRefusal::CanonicalContractFailed { .. },
            }
        ));
    }

    #[test]
    fn forged_authority_is_refused_by_broker_state() {
        let record = run_case(coordinate(
            Scenario::ValidAtom,
            CertificateMutation::Intact,
            ExecutionPolicy::ForgedAuthorization,
            InitialStateVariant::S000,
        ));
        assert!(matches!(
            record.outcome,
            CaseOutcome::Refused {
                phase: FailurePhase::Execute,
                refusal: PcpRefusal::AuthorizationMissing,
            }
        ));
    }

    #[test]
    fn digest_mutation_is_refused_before_execution() {
        let record = run_case(coordinate(
            Scenario::ValidAtom,
            CertificateMutation::DomainDigest,
            ExecutionPolicy::ExecuteCanonical,
            InitialStateVariant::S000,
        ));
        assert!(matches!(
            record.outcome,
            CaseOutcome::Refused {
                phase: FailurePhase::Verify,
                refusal: PcpRefusal::DomainDigestMismatch,
            }
        ));
    }

    #[test]
    fn receipt_tampering_is_detected() {
        let domain = AuditDomain;
        let checker = PcPowl2Checker::new(&domain);
        let mut certificate = Scenario::ValidAtom.build();
        checker.bind_certificate(&mut certificate).unwrap();
        let selection = Scenario::ValidAtom.selection(false);
        let allowed = checker
            .validate_selection(&certificate, &selection)
            .unwrap();
        let mut broker = PcPowl2Broker::with_authority("tamper-test");
        let authorization = broker
            .authorize(&checker, &certificate, allowed, "nonce", 1, 10, true)
            .unwrap();
        let mut receipt = broker
            .execute(
                &checker,
                &certificate,
                &authorization,
                selection,
                InitialStateVariant::S000.state(),
                5,
            )
            .unwrap();
        receipt.final_state_digest.push_str(":tampered");
        assert_eq!(
            replay_receipt(&checker, &certificate, &receipt),
            Err(PcpRefusal::ReceiptDigestMismatch)
        );
    }

    #[test]
    fn complete_matrix_is_generated_by_real_checker_and_replays() {
        let receipt = DfcmConformanceReceipt::manufacture().unwrap();
        assert!(receipt.is_complete());
        assert!(receipt.summary.verified > 0);
        assert!(receipt.summary.model_receipted > 0);
        assert!(receipt.summary.refused > 0);
        assert!(receipt.replay().unwrap());
    }
}
