use std::collections::BTreeSet;

use wasm4pm_cognition::gmrw::{
    diagnose_requirements, select_operators, CandidateKind, CandidateStatement,
    CapabilityDescriptor, ExecutionClass, GmrwGraph, GraphAdmissionOutcome, GraphAdmissionPolicy,
    GraphAdmissionRefusal, ObligationKind, OntologyStatement, OperatorDescriptor, OperatorRegistry,
    Polarity, ReasoningBudget, ReasoningClock, Requirement, RequirementMode, SemanticStatus,
};

fn statement(
    subject: &str,
    predicate: &str,
    object: &str,
    polarity: Polarity,
) -> OntologyStatement {
    OntologyStatement {
        subject: subject.to_string(),
        predicate: predicate.to_string(),
        object: object.to_string(),
        polarity,
    }
}

fn policy() -> GraphAdmissionPolicy {
    GraphAdmissionPolicy::default_deny()
        .allow_namespace("https://example.org/")
        .allow_namespace("https://www.w3.org/")
}

fn receipt(byte: char) -> String {
    std::iter::repeat_n(byte, 64).collect()
}

#[test]
fn graph_is_default_deny_and_requires_receipts() {
    let mut graph = GmrwGraph::new();
    let candidate = CandidateStatement {
        source: "sensor-7".to_string(),
        statement: statement(
            "https://unknown.example/device",
            "https://www.w3.org/ns/sosa/observes",
            "https://example.org/temperature",
            Polarity::Positive,
        ),
        evidence_receipt: Some(receipt('a')),
    };

    assert_eq!(
        graph.admit(&policy(), candidate),
        Err(GraphAdmissionRefusal::NamespaceNotAdmitted)
    );

    let missing_receipt = CandidateStatement {
        source: "sensor-7".to_string(),
        statement: statement(
            "https://example.org/device/7",
            "https://www.w3.org/ns/sosa/observes",
            "https://example.org/temperature",
            Polarity::Positive,
        ),
        evidence_receipt: None,
    };
    assert_eq!(
        graph.admit(&policy(), missing_receipt),
        Err(GraphAdmissionRefusal::MissingEvidenceReceipt)
    );
}

#[test]
fn exact_statement_is_idempotent_and_generates_no_work() {
    let mut graph = GmrwGraph::new();
    let required = statement(
        "https://example.org/order/1",
        "https://example.org/status",
        "https://example.org/approved",
        Polarity::Positive,
    );
    let candidate = CandidateStatement {
        source: "approval-service".to_string(),
        statement: required.clone(),
        evidence_receipt: Some(receipt('b')),
    };

    assert!(matches!(
        graph.admit(&policy(), candidate.clone()),
        Ok(GraphAdmissionOutcome::Inserted(_))
    ));
    assert!(matches!(
        graph.admit(&policy(), candidate),
        Ok(GraphAdmissionOutcome::AlreadyAdmitted(_))
    ));
    assert_eq!(graph.len(), 1);

    let residues = diagnose_requirements(
        &graph,
        &[Requirement {
            statement: required,
            mode: RequirementMode::ClosedWorld,
        }],
        &[],
    );
    assert_eq!(residues[0].status, SemanticStatus::Satisfied);
    assert_eq!(residues[0].obligation, ObligationKind::None);
}

#[test]
fn missing_state_binds_across_human_iot_and_atomvm_capabilities() {
    let graph = GmrwGraph::new();
    let required = statement(
        "https://example.org/freezer/7",
        "https://example.org/hasState",
        "https://example.org/safe",
        Polarity::Positive,
    );
    let effects = BTreeSet::from([required.clone()]);
    let capabilities = vec![
        CapabilityDescriptor {
            id: "human-inspection".to_string(),
            execution_class: ExecutionClass::Human,
            effects: effects.clone(),
            authorized: true,
        },
        CapabilityDescriptor {
            id: "iot-adjust-setpoint".to_string(),
            execution_class: ExecutionClass::Iot,
            effects: effects.clone(),
            authorized: true,
        },
        CapabilityDescriptor {
            id: "atomvm-edge-control".to_string(),
            execution_class: ExecutionClass::AtomVm,
            effects,
            authorized: true,
        },
    ];

    let residues = diagnose_requirements(
        &graph,
        &[Requirement {
            statement: required,
            mode: RequirementMode::ClosedWorld,
        }],
        &capabilities,
    );

    assert_eq!(residues[0].status, SemanticStatus::Missing);
    assert_eq!(residues[0].obligation, ObligationKind::ExecuteCapability);
    assert_eq!(
        residues[0].capability_ids,
        vec![
            "atomvm-edge-control".to_string(),
            "human-inspection".to_string(),
            "iot-adjust-setpoint".to_string(),
        ]
    );
}

#[test]
fn contradictory_admitted_state_manufactures_conflict_resolution() {
    let mut graph = GmrwGraph::new();
    let required = statement(
        "https://example.org/person/1",
        "https://example.org/authorizedFor",
        "https://example.org/matter/9",
        Polarity::Positive,
    );
    for (source, candidate_statement, hash_byte) in [
        ("directory", required.clone(), 'c'),
        ("revocation-feed", required.inverse(), 'd'),
    ] {
        graph
            .admit(
                &policy(),
                CandidateStatement {
                    source: source.to_string(),
                    statement: candidate_statement,
                    evidence_receipt: Some(receipt(hash_byte)),
                },
            )
            .expect("both independently evidenced observations are admissible");
    }

    let residues = diagnose_requirements(
        &graph,
        &[Requirement {
            statement: required,
            mode: RequirementMode::ClosedWorld,
        }],
        &[],
    );
    assert_eq!(residues[0].status, SemanticStatus::Inconsistent);
    assert_eq!(residues[0].obligation, ObligationKind::ResolveConflict);
}

#[test]
fn closed_world_without_capability_refuses_instead_of_inventing_action() {
    let graph = GmrwGraph::new();
    let required = statement(
        "https://example.org/shipment/3",
        "https://example.org/hasState",
        "https://example.org/released",
        Polarity::Positive,
    );
    let residues = diagnose_requirements(
        &graph,
        &[Requirement {
            statement: required,
            mode: RequirementMode::ClosedWorld,
        }],
        &[],
    );
    assert_eq!(residues[0].status, SemanticStatus::Unsupported);
    assert_eq!(residues[0].obligation, ObligationKind::RegisterCapability);
}

#[test]
fn scheduler_admits_only_certified_triggered_operators_within_budget() {
    let mut registry = OperatorRegistry::new();
    for descriptor in [
        OperatorDescriptor {
            id: "streaming-dfg".to_string(),
            clock: ReasoningClock::HardRealtime,
            max_latency_micros: 20,
            max_input_statements: 10_000,
            candidate_kind: CandidateKind::ProcessModel,
            bvc_certified: true,
            trigger_predicates: BTreeSet::from(["https://example.org/event".to_string()]),
        },
        OperatorDescriptor {
            id: "event-calculus".to_string(),
            clock: ReasoningClock::SoftRealtime,
            max_latency_micros: 80,
            max_input_statements: 1_000,
            candidate_kind: CandidateKind::DerivedStatement,
            bvc_certified: true,
            trigger_predicates: BTreeSet::from(["https://example.org/event".to_string()]),
        },
        OperatorDescriptor {
            id: "uncertified-n3".to_string(),
            clock: ReasoningClock::SoftRealtime,
            max_latency_micros: 1,
            max_input_statements: 1_000,
            candidate_kind: CandidateKind::DerivedStatement,
            bvc_certified: false,
            trigger_predicates: BTreeSet::new(),
        },
        OperatorDescriptor {
            id: "ilp-discovery".to_string(),
            clock: ReasoningClock::Deliberative,
            max_latency_micros: 50_000,
            max_input_statements: 1_000_000,
            candidate_kind: CandidateKind::ProcessModel,
            bvc_certified: true,
            trigger_predicates: BTreeSet::new(),
        },
    ] {
        registry.register(descriptor);
    }

    let selected = select_operators(
        &registry,
        &BTreeSet::from(["https://example.org/event".to_string()]),
        500,
        &ReasoningBudget {
            allowed_clocks: BTreeSet::from([
                ReasoningClock::HardRealtime,
                ReasoningClock::SoftRealtime,
            ]),
            max_operators: 4,
            max_total_latency_micros: 100,
        },
    );

    assert_eq!(
        selected
            .iter()
            .map(|descriptor| descriptor.id.as_str())
            .collect::<Vec<_>>(),
        vec!["streaming-dfg", "event-calculus"]
    );
}
