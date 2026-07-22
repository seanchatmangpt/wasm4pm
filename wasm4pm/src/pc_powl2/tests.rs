use super::*;
use wasm4pm_compat::powl::{OrderEdge, PowlNode, PowlNodeKind};
use wasm4pm_compat::prelude::{
    CommutationWitness, VerificationBounds, PC_POWL2_SCHEMA, PC_POWL2_VERSION,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct ToyState {
    x: u8,
    y: u8,
}

struct ToyDomain;

impl FiniteStateDomain for ToyDomain {
    type State = ToyState;

    fn domain_digest(&self) -> String {
        "toy-domain:v2:set+partial+copy".to_string()
    }

    fn states(&self) -> Vec<Self::State> {
        (0..=1)
            .flat_map(|x| (0..=1).map(move |y| ToyState { x, y }))
            .collect()
    }

    fn holds(&self, assertion: &AssertionRef, state: &Self::State) -> PcpResult<bool> {
        match assertion.0.as_str() {
            "true" => Ok(true),
            "false" => Ok(false),
            "zero" => Ok(state.x == 0 && state.y == 0),
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
            "set_x_one" => Ok(ToyState { x: 1, ..*state }),
            "set_y_one" => Ok(ToyState { y: 1, ..*state }),
            "only_zero_to_one" if state.x == 0 => Ok(ToyState { x: 1, ..*state }),
            "only_zero_to_one" => Err("x_zero precondition is false".to_string()),
            "copy_x_to_y" => Ok(ToyState {
                y: state.x,
                ..*state
            }),
            other => Err(format!("unknown action {other}")),
        }
    }

    fn variant(&self, variant: &VariantRef, state: &Self::State) -> PcpResult<u64> {
        match variant.0.as_str() {
            "zero_bits" => Ok(u64::from(2 - state.x - state.y)),
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
            max_states: 4,
            max_proof_depth: 16,
            max_selection_depth: 16,
            max_trace_steps: 16,
            max_choice_visits: 64,
        },
        model,
        proof,
    }
}

fn atom_certificate(action: &str, pre: &str, post: &str) -> CertifiedPowl {
    certificate(
        Powl {
            nodes: vec![atom(0, action)],
            edges: vec![],
            root: Some(PowlNodeId(0)),
        },
        atom_proof(0, pre, post),
        "toy-atom",
    )
}

fn partial_order_certificate(noncommuting: bool) -> CertifiedPowl {
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
            "toy-noncommuting"
        } else {
            "toy-commuting"
        },
    )
}

fn atom_selection() -> ExecutionSelection {
    ExecutionSelection::Atom {
        node: PowlNodeId(0),
    }
}

#[test]
fn partial_action_is_checked_only_where_precondition_holds() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("only_zero_to_one", "x_zero", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    assert!(checker.verify(&certificate).is_ok());
}

#[test]
fn vacuous_root_contract_is_refused() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "false", "true");
    checker.bind_certificate(&mut certificate).unwrap();
    assert_eq!(
        checker.verify(&certificate),
        Err(PcpRefusal::InitialEvidenceMissing)
    );
}

#[test]
fn every_linearization_is_checked_not_only_the_canonical_one() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);

    let mut commuting = partial_order_certificate(false);
    checker.bind_certificate(&mut commuting).unwrap();
    assert!(checker.verify(&commuting).is_ok());

    let mut noncommuting = partial_order_certificate(true);
    checker.bind_certificate(&mut noncommuting).unwrap();
    assert_eq!(
        checker.verify(&noncommuting),
        Err(PcpRefusal::IndependentActionsDoNotCommute {
            left: PowlNodeId(0),
            right: PowlNodeId(1),
        })
    );
}

#[test]
fn precedence_restricts_the_enumerated_linearizations() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = partial_order_certificate(true);
    certificate.model.edges = vec![OrderEdge {
        from: PowlNodeId(0),
        to: PowlNodeId(1),
    }];
    if let ProofTerm::PartialOrder { commutations, .. } = &mut certificate.proof {
        commutations.clear();
    }
    checker.bind_certificate(&mut certificate).unwrap();
    assert!(checker.verify(&certificate).is_ok());
}

#[test]
fn forged_authorization_is_not_authority() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "true", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    let forged = AuthorizationEnvelope {
        authorization_id: "forged".to_string(),
        subject: certificate.subject.clone(),
        domain_digest: certificate.domain_digest.clone(),
        model_digest: certificate.model_digest.clone(),
        proof_digest: certificate.proof_digest.clone(),
        allowed_nodes: vec![PowlNodeId(0)],
        challenge_nonce: "nonce".to_string(),
        issued_unix_ms: 1,
        expires_unix_ms: 10,
        single_use: true,
    };
    let mut broker = PcPowl2Broker::new();
    assert_eq!(
        broker.execute(
            &checker,
            &certificate,
            &forged,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
        ),
        Err(PcpRefusal::AuthorizationMissing)
    );
}

#[test]
fn broker_mints_single_use_authority_and_receipt_replays() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "true", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    let mut broker = PcPowl2Broker::with_authority("toy-authority");
    let authorization = broker
        .authorize(
            &checker,
            &certificate,
            vec![PowlNodeId(0)],
            "nonce",
            1,
            10,
            true,
        )
        .unwrap();
    let receipt = broker
        .execute(
            &checker,
            &certificate,
            &authorization,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
        )
        .unwrap();
    broker
        .verify_issued_receipt(&checker, &certificate, &receipt)
        .unwrap();
    assert_eq!(
        broker.execute(
            &checker,
            &certificate,
            &authorization,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
        ),
        Err(PcpRefusal::AuthorizationAlreadyConsumed)
    );
}

#[test]
fn receipt_replay_refuses_initial_state_and_identifier_tampering() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "true", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    let mut broker = PcPowl2Broker::new();
    let authorization = broker
        .authorize(
            &checker,
            &certificate,
            vec![PowlNodeId(0)],
            "nonce",
            1,
            10,
            true,
        )
        .unwrap();
    let receipt = broker
        .execute(
            &checker,
            &certificate,
            &authorization,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
        )
        .unwrap();

    let mut state_tampered = receipt.clone();
    state_tampered.initial_state_digest.push_str(":tampered");
    assert_eq!(
        replay_receipt(&checker, &certificate, &state_tampered),
        Err(PcpRefusal::ReceiptDigestMismatch)
    );

    let mut id_tampered = receipt;
    id_tampered.receipt_id.push_str(":tampered");
    assert_eq!(
        replay_receipt(&checker, &certificate, &id_tampered),
        Err(PcpRefusal::ReceiptDigestMismatch)
    );
}

#[test]
fn receipt_chain_requires_state_continuity() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "true", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    let mut broker = PcPowl2Broker::new();

    let first_authorization = broker
        .authorize(
            &checker,
            &certificate,
            vec![PowlNodeId(0)],
            "first",
            1,
            10,
            true,
        )
        .unwrap();
    let first = broker
        .execute(
            &checker,
            &certificate,
            &first_authorization,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
        )
        .unwrap();

    let second_authorization = broker
        .authorize(
            &checker,
            &certificate,
            vec![PowlNodeId(0)],
            "second",
            1,
            10,
            true,
        )
        .unwrap();
    let second = broker
        .execute(
            &checker,
            &certificate,
            &second_authorization,
            atom_selection(),
            ToyState { x: 1, y: 0 },
            5,
        )
        .unwrap();

    broker
        .verify_issued_receipt_chain(&checker, &certificate, &[first.clone(), second.clone()])
        .unwrap();

    let mut broken = second;
    broken.initial_state = serde_json::to_value(ToyState { x: 0, y: 0 }).unwrap();
    broken.initial_state_digest = canonical_digest(&ToyState { x: 0, y: 0 }).unwrap();
    broken.receipt_id.clear();
    broken.receipt_digest.clear();
    let digest = receipt_digest(&broken).unwrap();
    broken.receipt_id = format!("pc-powl2:{digest}");
    broken.receipt_digest = digest;
    assert_eq!(
        replay_receipt_chain(&checker, &certificate, &[first, broken]),
        Err(PcpRefusal::ReplayStateMismatch)
    );
}

#[derive(Default)]
struct DivergentActuator;

impl PcPowl2Actuator<ToyDomain> for DivergentActuator {
    fn actuate(
        &mut self,
        _action: &str,
        before: &ToyState,
        _expected_after: &ToyState,
    ) -> Result<ToyState, String> {
        Ok(*before)
    }
}

#[test]
fn external_actuator_must_refine_the_verified_model() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "true", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    let mut broker = PcPowl2Broker::new();
    let authorization = broker
        .authorize(
            &checker,
            &certificate,
            vec![PowlNodeId(0)],
            "actuator",
            1,
            10,
            true,
        )
        .unwrap();
    let mut actuator = DivergentActuator;
    assert_eq!(
        broker.execute_with(
            &checker,
            &certificate,
            &authorization,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
            &mut actuator,
        ),
        Err(PcpRefusal::ActionRefused {
            node: PowlNodeId(0),
            reason: "ActuatorRefinementMismatch".to_string(),
        })
    );
}

#[test]
fn standalone_replay_does_not_launder_broker_provenance() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = atom_certificate("set_x_one", "true", "x_one");
    checker.bind_certificate(&mut certificate).unwrap();
    let mut issuing_broker = PcPowl2Broker::with_authority("issuer");
    let authorization = issuing_broker
        .authorize(
            &checker,
            &certificate,
            vec![PowlNodeId(0)],
            "nonce",
            1,
            10,
            true,
        )
        .unwrap();
    let receipt = issuing_broker
        .execute(
            &checker,
            &certificate,
            &authorization,
            atom_selection(),
            ToyState { x: 0, y: 0 },
            5,
        )
        .unwrap();
    replay_receipt(&checker, &certificate, &receipt).unwrap();
    let unrelated_broker = PcPowl2Broker::with_authority("other");
    assert_eq!(
        unrelated_broker.verify_issued_receipt(&checker, &certificate, &receipt),
        Err(PcpRefusal::ReceiptDigestMismatch)
    );
}

#[test]
fn selection_visit_bound_counts_every_selected_node() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = partial_order_certificate(false);
    certificate.bounds.max_choice_visits = 2;
    checker.bind_certificate(&mut certificate).unwrap();
    let selection = ExecutionSelection::PartialOrder {
        node: PowlNodeId(2),
        children: vec![
            ExecutionSelection::Atom {
                node: PowlNodeId(0),
            },
            ExecutionSelection::Atom {
                node: PowlNodeId(1),
            },
        ],
    };
    assert_eq!(
        checker.validate_selection(&certificate, &selection),
        Err(PcpRefusal::ChoiceVisitBoundExceeded {
            actual: 3,
            maximum: 2,
        })
    );
}
