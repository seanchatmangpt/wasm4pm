use super::*;
use wasm4pm_compat::powl::{PowlNode, PowlNodeKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct ToyState {
    x: u8,
    y: u8,
}

struct ToyDomain;

impl FiniteStateDomain for ToyDomain {
    type State = ToyState;

    fn domain_digest(&self) -> String {
        "blake3:toy-domain".to_string()
    }

    fn states(&self) -> Vec<Self::State> {
        (0..=2)
            .flat_map(|x| (0..=2).map(move |y| ToyState { x, y }))
            .collect()
    }

    fn holds(&self, assertion: &AssertionRef, state: &Self::State) -> PcpResult<bool> {
        match assertion.0.as_str() {
            "true" => Ok(true),
            "zero" => Ok(state.x == 0 && state.y == 0),
            "both_one" => Ok(state.x == 1 && state.y == 1),
            _ => Err(PcpRefusal::AssertionRefused {
                assertion: assertion.0.clone(),
            }),
        }
    }

    fn step(&self, action: &str, state: &Self::State) -> Result<Self::State, String> {
        match action {
            "inc_x" => Ok(ToyState {
                x: state.x.saturating_add(1).min(2),
                ..*state
            }),
            "inc_y" => Ok(ToyState {
                y: state.y.saturating_add(1).min(2),
                ..*state
            }),
            "copy_x_to_y" => Ok(ToyState {
                y: state.x,
                ..*state
            }),
            other => Err(format!("unknown action {other}")),
        }
    }

    fn variant(&self, _variant: &VariantRef, state: &Self::State) -> PcpResult<u64> {
        Ok(u64::from(4_u8.saturating_sub(state.x + state.y)))
    }
}

fn atom(id: usize, action: &str) -> PowlNode {
    PowlNode::new(PowlNodeId(id), PowlNodeKind::Atom(action.to_string()))
}

fn proof_atom(id: usize) -> ProofTerm {
    ProofTerm::Atom {
        node: PowlNodeId(id),
        pre: AssertionRef::new("true"),
        post: AssertionRef::new("true"),
    }
}

fn commuting_certificate() -> CertifiedPowl {
    let model = Powl {
        nodes: vec![
            atom(0, "inc_x"),
            atom(1, "inc_y"),
            PowlNode::new(
                PowlNodeId(2),
                PowlNodeKind::PartialOrder(vec![PowlNodeId(0), PowlNodeId(1)]),
            ),
        ],
        edges: vec![],
        root: Some(PowlNodeId(2)),
    };
    CertifiedPowl {
        schema: wasm4pm_compat::prelude::PC_POWL2_SCHEMA.to_string(),
        version: wasm4pm_compat::prelude::PC_POWL2_VERSION.to_string(),
        subject: "commuting increments".to_string(),
        domain_digest: String::new(),
        model_digest: String::new(),
        proof_digest: String::new(),
        claim: CertificateClaim::FiniteTraceSafety,
        bounds: Default::default(),
        model,
        proof: ProofTerm::PartialOrder {
            node: PowlNodeId(2),
            pre: AssertionRef::new("zero"),
            post: AssertionRef::new("both_one"),
            canonical: vec![PowlNodeId(0), PowlNodeId(1)],
            children: vec![proof_atom(0), proof_atom(1)],
            commutations: vec![wasm4pm_compat::prelude::CommutationWitness {
                left: PowlNodeId(0),
                right: PowlNodeId(1),
            }],
        },
    }
}

#[test]
fn verifies_every_linearization_by_commutation() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = commuting_certificate();
    checker.bind_certificate(&mut certificate).unwrap();
    assert!(checker.verify(&certificate).is_ok());
}

#[test]
fn refuses_false_commutation() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = commuting_certificate();
    certificate.model.nodes[1] = atom(1, "copy_x_to_y");
    checker.bind_certificate(&mut certificate).unwrap();
    assert!(matches!(
        checker.verify(&certificate),
        Err(PcpRefusal::IndependentActionsDoNotCommute { .. })
    ));
}

#[test]
fn broker_is_single_use_and_receipt_replays() {
    let domain = ToyDomain;
    let checker = PcPowl2Checker::new(&domain);
    let mut certificate = commuting_certificate();
    checker.bind_certificate(&mut certificate).unwrap();
    let selection = ExecutionSelection::PartialOrder {
        node: PowlNodeId(2),
        children: vec![
            ExecutionSelection::Atom { node: PowlNodeId(1) },
            ExecutionSelection::Atom { node: PowlNodeId(0) },
        ],
    };
    let authorization = AuthorizationEnvelope {
        authorization_id: "auth-1".to_string(),
        subject: certificate.subject.clone(),
        domain_digest: certificate.domain_digest.clone(),
        model_digest: certificate.model_digest.clone(),
        proof_digest: certificate.proof_digest.clone(),
        allowed_nodes: vec![PowlNodeId(0), PowlNodeId(1)],
        challenge_nonce: "nonce-1".to_string(),
        issued_unix_ms: 1,
        expires_unix_ms: 10,
        single_use: true,
    };
    let mut broker = PcPowl2Broker::new();
    let receipt = broker
        .execute(
            &checker,
            &certificate,
            &authorization,
            selection.clone(),
            ToyState { x: 0, y: 0 },
            5,
        )
        .unwrap();
    replay_receipt(&checker, &certificate, &receipt).unwrap();
    assert_eq!(
        broker.execute(
            &checker,
            &certificate,
            &authorization,
            selection,
            ToyState { x: 0, y: 0 },
            5,
        ),
        Err(PcpRefusal::AuthorizationAlreadyConsumed)
    );
}
