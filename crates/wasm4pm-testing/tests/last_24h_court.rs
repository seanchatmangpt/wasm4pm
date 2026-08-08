use std::collections::{BTreeMap, BTreeSet};

use wasm4pm_testing::last_24h::{
    all_crown_gates, canonical_topology, last_24h_innovation_index, transition_is_lawful,
    ActionLane, CapabilityBundlePromotion, CognitionRegime, ConsequenceState, CrownEvidence,
    CrownGate, CrownStanding, EnterpriseAdmission, EvidenceCheckpointClaim, ExecutionAttempt,
    HotPathCandidate, InteractionModel, ProcessAnalytics, ProviderCapability, ProviderContract,
    ProviderProfile, PublicationEvidence, RecoveryStep, RecoveryTrace, RepositoryRole,
    SemanticSourceKind, SemanticSourceRecord, SourceStanding, TransitionKind, VerifierVerdict,
    REFUSED_BLIND_RETRY, REFUSED_BRCE_EXECUTION_GRANT_REQUIRED,
    REFUSED_BUNDLE_IDENTITY_INCOMPLETE, REFUSED_ENTERPRISE_EVIDENCE_INCOMPLETE,
    REFUSED_HOT_PATH_AUTHORITY_ESCALATION, REFUSED_HOT_PATH_NOT_EMPIRICAL,
    REFUSED_PROCESS_EVIDENCE_AS_AUTHORITY, REFUSED_PROVIDER_CAPABILITY_ESCAPE,
    REFUSED_WHOLESALE_LAB_COPY,
};

const LAB_SHA: &str = "1111111111111111111111111111111111111111";
const GGEN_SHA: &str = "2222222222222222222222222222222222222222";
const HEAD_SHA: &str = "3333333333333333333333333333333333333333";

#[test]
fn canonical_topology_preserves_explore_manufacture_runtime_world_and_process_roles() {
    let topology = canonical_topology();
    let roles = topology
        .iter()
        .map(|node| (node.repository.as_str(), node.role))
        .collect::<BTreeMap<_, _>>();

    assert_eq!(roles.len(), 5);
    assert_eq!(
        roles["seanchatmangpt/autofde-lab"],
        RepositoryRole::ExploreAdmit
    );
    assert_eq!(roles["seanchatmangpt/ggen"], RepositoryRole::Manufacture);
    assert_eq!(
        roles["seanchatmangpt/autofde"],
        RepositoryRole::ProductionRuntime
    );
    assert_eq!(
        roles["seanchatmangpt/gymact"],
        RepositoryRole::WorldExecution
    );
    assert_eq!(
        roles["seanchatmangpt/wasm4pm"],
        RepositoryRole::ProcessEvidence
    );

    assert!(transition_is_lawful(
        RepositoryRole::ExploreAdmit,
        RepositoryRole::Manufacture,
        TransitionKind::AdmitCapability
    ));
    assert!(transition_is_lawful(
        RepositoryRole::Manufacture,
        RepositoryRole::ProductionRuntime,
        TransitionKind::ManufactureBundle
    ));
    assert!(transition_is_lawful(
        RepositoryRole::WorldExecution,
        RepositoryRole::ProcessEvidence,
        TransitionKind::AnalyzeProcess
    ));
    assert!(!transition_is_lawful(
        RepositoryRole::ExploreAdmit,
        RepositoryRole::ProductionRuntime,
        TransitionKind::ManufactureBundle
    ));
}

#[test]
fn production_promotion_requires_extracted_digest_bound_bundle_not_lab_copy() {
    let valid = CapabilityBundlePromotion {
        capability_id: "gymact:reconciliation".to_owned(),
        lab_subject_sha: LAB_SHA.to_owned(),
        ggen_subject_sha: GGEN_SHA.to_owned(),
        bundle_digest: "blake3:bundle".to_owned(),
        handwritten_runtime_files: 3,
        generated_surface_files: 8,
        copied_lab_wholesale: false,
    };
    assert_eq!(valid.disposition(), Ok(()));

    let mut wholesale = valid.clone();
    wholesale.copied_lab_wholesale = true;
    assert_eq!(wholesale.disposition(), Err(REFUSED_WHOLESALE_LAB_COPY));

    let mut unbound = valid;
    unbound.lab_subject_sha = "main".to_owned();
    assert_eq!(
        unbound.disposition(),
        Err(REFUSED_BUNDLE_IDENTITY_INCOMPLETE)
    );
}

#[test]
fn select_and_construct_are_candidate_only_and_do_requires_brce_execution_grant() {
    for lane in [ActionLane::Select, ActionLane::Construct] {
        let attempt = ExecutionAttempt {
            lane,
            through_brce: false,
            execution_grant: false,
            process_evidence_present: false,
        };
        assert_eq!(attempt.can_execute(), Ok(false));
    }

    let direct_do = ExecutionAttempt {
        lane: ActionLane::Do,
        through_brce: false,
        execution_grant: false,
        process_evidence_present: false,
    };
    assert_eq!(
        direct_do.can_execute(),
        Err(REFUSED_BRCE_EXECUTION_GRANT_REQUIRED)
    );

    let process_smuggling = ExecutionAttempt {
        lane: ActionLane::Do,
        through_brce: true,
        execution_grant: false,
        process_evidence_present: true,
    };
    assert_eq!(
        process_smuggling.can_execute(),
        Err(REFUSED_PROCESS_EVIDENCE_AS_AUTHORITY)
    );

    let admitted_do = ExecutionAttempt {
        lane: ActionLane::Do,
        through_brce: true,
        execution_grant: true,
        process_evidence_present: true,
    };
    assert_eq!(admitted_do.can_execute(), Ok(true));
}

#[test]
fn uncertain_consequence_requires_reconcile_observe_decide_before_retry() {
    let blind = RecoveryTrace {
        consequence_state: ConsequenceState::Uncertain,
        steps: vec![RecoveryStep::Retry],
    };
    assert_eq!(blind.allows_retry(), Err(REFUSED_BLIND_RETRY));

    let reconciled = RecoveryTrace {
        consequence_state: ConsequenceState::Uncertain,
        steps: vec![
            RecoveryStep::Reconcile,
            RecoveryStep::Observe,
            RecoveryStep::Decide,
            RecoveryStep::Retry,
        ],
    };
    assert_eq!(reconciled.allows_retry(), Ok(true));
}

fn hot_candidate() -> HotPathCandidate {
    HotPathCandidate {
        regime: CognitionRegime::Hot,
        empirical_competitor_closure: true,
        problem_signature: "problem".to_owned(),
        planner_identity: "planner".to_owned(),
        objective_identity: "objective".to_owned(),
        environment_identity: "environment".to_owned(),
        hardware_identity: "hardware".to_owned(),
        capability_digest: "capability".to_owned(),
        policy_digest: "policy".to_owned(),
        selector_revision: "selector".to_owned(),
        candidate_only: true,
        carries_authority: false,
    }
}

#[test]
fn hot_path_compilation_requires_empirical_closure_and_never_compiles_authority() {
    let baseline = hot_candidate();
    let digest = baseline.compile().expect("empirical HOT route must compile");
    assert_eq!(digest.len(), 64);

    let mut warm = baseline.clone();
    warm.regime = CognitionRegime::Warm;
    assert_eq!(warm.compile(), Err(REFUSED_HOT_PATH_NOT_EMPIRICAL));

    let mut incomplete_tournament = baseline.clone();
    incomplete_tournament.empirical_competitor_closure = false;
    assert_eq!(
        incomplete_tournament.compile(),
        Err(REFUSED_HOT_PATH_NOT_EMPIRICAL)
    );

    let mut authority_escalation = baseline.clone();
    authority_escalation.carries_authority = true;
    assert_eq!(
        authority_escalation.compile(),
        Err(REFUSED_HOT_PATH_AUTHORITY_ESCALATION)
    );

    let mut changed_environment = baseline;
    changed_environment.environment_identity = "different-environment".to_owned();
    assert_ne!(
        digest,
        changed_environment
            .compile()
            .expect("identity-complete HOT route must compile")
    );
}

#[test]
fn azure_closed_vertical_crown_cannot_be_inferred_from_partial_local_evidence() {
    let mut evidence = CrownEvidence {
        satisfied: [
            CrownGate::ProductionKernelBootstrap,
            CrownGate::LabCapabilityAdmission,
            CrownGate::GgenBundleManufacture,
            CrownGate::BundleDigestPromotion,
        ]
        .into_iter()
        .collect(),
        blocked: BTreeMap::new(),
    };
    assert_eq!(evidence.standing(), CrownStanding::Partial);

    evidence.blocked.insert(
        CrownGate::AzureSubscriptionApproved,
        "BLOCKED:LIVE_CLOUD_AUTHORITY".to_owned(),
    );
    assert_eq!(
        evidence.standing(),
        CrownStanding::Blocked {
            gate: CrownGate::AzureSubscriptionApproved,
            reason: "BLOCKED:LIVE_CLOUD_AUTHORITY".to_owned()
        }
    );

    evidence.blocked.clear();
    evidence.satisfied = all_crown_gates().into_iter().collect();
    assert_eq!(evidence.standing(), CrownStanding::Alive);
    assert_eq!(evidence.satisfied.len(), 18);
}

#[test]
fn semantic_registry_presence_does_not_promote_external_source_materialization() {
    let registered = SemanticSourceRecord {
        identity: "ocel".to_owned(),
        kind: SemanticSourceKind::Schema,
        registered: true,
        source_bytes_pinned: false,
        source_digest: None,
        validation_executed: false,
    };
    assert_eq!(registered.standing(), SourceStanding::PartialAlive);

    let admitted = SemanticSourceRecord {
        source_bytes_pinned: true,
        source_digest: Some("sha256:source".to_owned()),
        validation_executed: true,
        ..registered
    };
    assert_eq!(admitted.standing(), SourceStanding::Alive);

    let kinds = [
        SemanticSourceKind::Ontology,
        SemanticSourceKind::Schema,
        SemanticSourceKind::KnowledgeCatalog,
        SemanticSourceKind::Protocol,
    ]
    .into_iter()
    .collect::<BTreeSet<_>>();
    assert_eq!(kinds.len(), 4);
}

#[test]
fn provider_profiles_preserve_real_blast_radius_and_independent_verification_laws() {
    let plan_only = ProviderContract {
        profile: ProviderProfile::TerraformPlanOnly,
        exact_subject_revision: None,
        capabilities: [ProviderCapability::Plan].into_iter().collect(),
        independent_verification: true,
        cloud_credentials_required: false,
    };
    assert_eq!(plan_only.validate(), Ok(()));

    let mut escaped_plan = plan_only;
    escaped_plan.capabilities.insert(ProviderCapability::Apply);
    assert_eq!(
        escaped_plan.validate(),
        Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE)
    );

    let local_apply = ProviderContract {
        profile: ProviderProfile::TerraformLocalDockerApply,
        exact_subject_revision: None,
        capabilities: [
            ProviderCapability::Plan,
            ProviderCapability::Apply,
            ProviderCapability::Destroy,
            ProviderCapability::Verify,
        ]
        .into_iter()
        .collect(),
        independent_verification: true,
        cloud_credentials_required: false,
    };
    assert_eq!(local_apply.validate(), Ok(()));

    let mut trusts_apply_exit = local_apply.clone();
    trusts_apply_exit.independent_verification = false;
    assert_eq!(
        trusts_apply_exit.validate(),
        Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE)
    );

    let mut cloud_blast_radius = local_apply;
    cloud_blast_radius.cloud_credentials_required = true;
    assert_eq!(
        cloud_blast_radius.validate(),
        Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE)
    );

    let vendor = ProviderContract {
        profile: ProviderProfile::VendorNative,
        exact_subject_revision: Some(LAB_SHA.to_owned()),
        capabilities: [ProviderCapability::Observe].into_iter().collect(),
        independent_verification: false,
        cloud_credentials_required: false,
    };
    assert_eq!(vendor.validate(), Ok(()));
}

#[test]
fn process_mining_quality_drift_prediction_and_handover_are_evidence_not_authority() {
    let analytics = ProcessAnalytics {
        fitness: Some(0.97),
        precision: Some(0.91),
        generalization: Some(0.88),
        drift_points: 2,
        remaining_time_ms: Some(1250.0),
        resource_handover_edges: 4,
        decision_stability_measured: true,
    };
    assert_eq!(analytics.quality_dimensions_present(), 3);
    assert!(!analytics.grants_authority());
}

#[test]
fn authenticated_receipts_are_not_customer_adoption() {
    let authenticated = EvidenceCheckpointClaim {
        receipt_chain_verified: true,
        checkpoint_authenticated: true,
        customer_adoption: false,
    };
    assert!(!authenticated.proves_adoption());

    let adopted = EvidenceCheckpointClaim {
        customer_adoption: true,
        ..authenticated
    };
    assert!(adopted.proves_adoption());
}

#[test]
fn enterprise_alive_requires_exactly_one_adoption_and_every_required_verifier_on_same_consequence() {
    let required = ["security", "operations"]
        .into_iter()
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    let admitted = EnterpriseAdmission {
        technical_alive: true,
        adopted_decisions: 1,
        required_verifiers: required.clone(),
        consequence_id: "consequence-1".to_owned(),
        verdicts: vec![
            VerifierVerdict {
                verifier_id: "security".to_owned(),
                consequence_id: "consequence-1".to_owned(),
                passed: true,
            },
            VerifierVerdict {
                verifier_id: "operations".to_owned(),
                consequence_id: "consequence-1".to_owned(),
                passed: true,
            },
        ],
    };
    assert_eq!(admitted.enterprise_alive(), Ok(true));

    let mut ambiguous_adoption = admitted.clone();
    ambiguous_adoption.adopted_decisions = 2;
    assert_eq!(
        ambiguous_adoption.enterprise_alive(),
        Err(REFUSED_ENTERPRISE_EVIDENCE_INCOMPLETE)
    );

    let mut unbound_verifier = admitted;
    unbound_verifier.verdicts[1].consequence_id = "different-consequence".to_owned();
    assert_eq!(
        unbound_verifier.enterprise_alive(),
        Err(REFUSED_ENTERPRISE_EVIDENCE_INCOMPLETE)
    );
}

#[test]
fn draft_pr_and_queued_workflow_are_publication_not_subject_alive_evidence() {
    let queued = PublicationEvidence {
        draft_pr_exists: true,
        head_sha: HEAD_SHA.to_owned(),
        workflow_subject_sha: Some(HEAD_SHA.to_owned()),
        required_command_executed: false,
        required_command_passed: false,
    };
    assert!(!queued.subject_alive());

    let wrong_head = PublicationEvidence {
        required_command_executed: true,
        required_command_passed: true,
        workflow_subject_sha: Some(LAB_SHA.to_owned()),
        ..queued.clone()
    };
    assert!(!wrong_head.subject_alive());

    let exact_executed = PublicationEvidence {
        required_command_executed: true,
        required_command_passed: true,
        ..queued
    };
    assert!(exact_executed.subject_alive());
}

#[test]
fn innovation_index_represents_cross_repo_24h_without_promoting_index_rows_to_standing() {
    let records = last_24h_innovation_index();
    let repositories = records
        .iter()
        .map(|record| record.repository.as_str())
        .collect::<BTreeSet<_>>();
    assert_eq!(
        repositories,
        [
            "seanchatmangpt/autofde-lab",
            "seanchatmangpt/ggen",
            "seanchatmangpt/gymact",
            "seanchatmangpt/wasm4pm",
        ]
        .into_iter()
        .collect()
    );

    let models = records
        .iter()
        .filter_map(|record| record.interaction_model)
        .collect::<BTreeSet<_>>();
    assert_eq!(
        models,
        [
            InteractionModel::EpisodicStep,
            InteractionModel::TaskHarness,
            InteractionModel::ToolSession,
            InteractionModel::Reconciliation,
        ]
        .into_iter()
        .collect()
    );

    assert!(records.iter().any(|record| {
        record.repository == "seanchatmangpt/autofde-lab" && record.pull_request == Some(31)
    }));
    assert!(records.iter().any(|record| {
        record.repository == "seanchatmangpt/gymact" && record.pull_request == Some(13)
    }));
    assert!(records.iter().any(|record| {
        record.repository == "seanchatmangpt/ggen" && record.pull_request == Some(586)
    }));
    assert!(records.iter().any(|record| {
        record.repository == "seanchatmangpt/wasm4pm" && record.pull_request == Some(556)
    }));
    assert!(records.iter().any(|record| record.evidence_only));
    assert!(records.iter().any(|record| !record.evidence_only));
}
