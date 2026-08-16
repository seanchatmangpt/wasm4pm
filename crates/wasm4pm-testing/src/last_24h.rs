//! Executable model of the cross-repository architecture that emerged during
//! the 2026-08-07 -> 2026-08-08 integration window.
//!
//! This module is deliberately a test court, not a production runtime. It
//! captures topology, authority, evidence, manufacture, process, Crown, and
//! standing laws so later GymAct/wasm4pm/AutoFDE integrations have a small
//! falsifier-first reference model.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

pub const REFUSED_TOPOLOGY_VIOLATION: &str = "REFUSED:TOPOLOGY_VIOLATION";
pub const REFUSED_WHOLESALE_LAB_COPY: &str = "REFUSED:WHOLESALE_LAB_COPY";
pub const REFUSED_BUNDLE_IDENTITY_INCOMPLETE: &str = "REFUSED:BUNDLE_IDENTITY_INCOMPLETE";
pub const REFUSED_BRCE_EXECUTION_GRANT_REQUIRED: &str =
    "REFUSED:BRCE_EXECUTION_GRANT_REQUIRED";
pub const REFUSED_PROCESS_EVIDENCE_AS_AUTHORITY: &str =
    "REFUSED:PROCESS_EVIDENCE_AS_AUTHORITY";
pub const REFUSED_HOT_PATH_NOT_EMPIRICAL: &str = "REFUSED:HOT_PATH_NOT_EMPIRICAL";
pub const REFUSED_HOT_PATH_IDENTITY_INCOMPLETE: &str =
    "REFUSED:HOT_PATH_IDENTITY_INCOMPLETE";
pub const REFUSED_HOT_PATH_AUTHORITY_ESCALATION: &str =
    "REFUSED:HOT_PATH_AUTHORITY_ESCALATION";
pub const REFUSED_BLIND_RETRY: &str = "REFUSED:BLIND_RETRY";
pub const REFUSED_PROVIDER_CAPABILITY_ESCAPE: &str = "REFUSED:PROVIDER_CAPABILITY_ESCAPE";
pub const REFUSED_ENTERPRISE_EVIDENCE_INCOMPLETE: &str =
    "REFUSED:ENTERPRISE_EVIDENCE_INCOMPLETE";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum RepositoryRole {
    ExploreAdmit,
    Manufacture,
    ProductionRuntime,
    WorldExecution,
    ProcessEvidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepositoryNode {
    pub repository: String,
    pub role: RepositoryRole,
}

#[must_use]
pub fn canonical_topology() -> Vec<RepositoryNode> {
    vec![
        RepositoryNode {
            repository: "seanchatmangpt/autofde-lab".to_owned(),
            role: RepositoryRole::ExploreAdmit,
        },
        RepositoryNode {
            repository: "seanchatmangpt/ggen".to_owned(),
            role: RepositoryRole::Manufacture,
        },
        RepositoryNode {
            repository: "seanchatmangpt/autofde".to_owned(),
            role: RepositoryRole::ProductionRuntime,
        },
        RepositoryNode {
            repository: "seanchatmangpt/gymact".to_owned(),
            role: RepositoryRole::WorldExecution,
        },
        RepositoryNode {
            repository: "seanchatmangpt/wasm4pm".to_owned(),
            role: RepositoryRole::ProcessEvidence,
        },
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransitionKind {
    AdmitCapability,
    ManufactureBundle,
    PromoteBundle,
    ObserveWorld,
    AnalyzeProcess,
}

#[must_use]
pub fn transition_is_lawful(
    from: RepositoryRole,
    to: RepositoryRole,
    transition: TransitionKind,
) -> bool {
    matches!(
        (from, to, transition),
        (
            RepositoryRole::ExploreAdmit,
            RepositoryRole::Manufacture,
            TransitionKind::AdmitCapability
        ) | (
            RepositoryRole::Manufacture,
            RepositoryRole::ProductionRuntime,
            TransitionKind::ManufactureBundle | TransitionKind::PromoteBundle
        ) | (
            RepositoryRole::WorldExecution,
            RepositoryRole::ExploreAdmit,
            TransitionKind::ObserveWorld
        ) | (
            RepositoryRole::WorldExecution,
            RepositoryRole::ProcessEvidence,
            TransitionKind::AnalyzeProcess
        ) | (
            RepositoryRole::ProcessEvidence,
            RepositoryRole::ExploreAdmit,
            TransitionKind::AnalyzeProcess
        )
    )
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityBundlePromotion {
    pub capability_id: String,
    pub lab_subject_sha: String,
    pub ggen_subject_sha: String,
    pub bundle_digest: String,
    pub handwritten_runtime_files: usize,
    pub generated_surface_files: usize,
    pub copied_lab_wholesale: bool,
}

impl CapabilityBundlePromotion {
    #[must_use]
    pub fn disposition(&self) -> Result<(), &'static str> {
        if self.copied_lab_wholesale {
            return Err(REFUSED_WHOLESALE_LAB_COPY);
        }
        if self.capability_id.is_empty()
            || !is_sha40(&self.lab_subject_sha)
            || !is_sha40(&self.ggen_subject_sha)
            || self.bundle_digest.is_empty()
        {
            return Err(REFUSED_BUNDLE_IDENTITY_INCOMPLETE);
        }
        if self.handwritten_runtime_files == 0 || self.generated_surface_files == 0 {
            return Err(REFUSED_BUNDLE_IDENTITY_INCOMPLETE);
        }
        Ok(())
    }
}

#[must_use]
pub fn is_sha40(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ActionLane {
    Select,
    Construct,
    Do,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionAttempt {
    pub lane: ActionLane,
    pub through_brce: bool,
    pub execution_grant: bool,
    pub process_evidence_present: bool,
}

impl ExecutionAttempt {
    #[must_use]
    pub fn can_execute(&self) -> Result<bool, &'static str> {
        match self.lane {
            ActionLane::Select | ActionLane::Construct => Ok(false),
            ActionLane::Do => {
                if self.process_evidence_present && !self.execution_grant {
                    return Err(REFUSED_PROCESS_EVIDENCE_AS_AUTHORITY);
                }
                if !self.through_brce || !self.execution_grant {
                    return Err(REFUSED_BRCE_EXECUTION_GRANT_REQUIRED);
                }
                Ok(true)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConsequenceState {
    Known,
    Uncertain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RecoveryStep {
    Reconcile,
    Observe,
    Decide,
    Retry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryTrace {
    pub consequence_state: ConsequenceState,
    pub steps: Vec<RecoveryStep>,
}

impl RecoveryTrace {
    #[must_use]
    pub fn allows_retry(&self) -> Result<bool, &'static str> {
        if self.consequence_state == ConsequenceState::Known {
            return Ok(self.steps.contains(&RecoveryStep::Retry));
        }
        let required = [
            RecoveryStep::Reconcile,
            RecoveryStep::Observe,
            RecoveryStep::Decide,
        ];
        let retry_position = self
            .steps
            .iter()
            .position(|step| *step == RecoveryStep::Retry);
        let Some(retry_position) = retry_position else {
            return Ok(false);
        };
        let prefix = &self.steps[..retry_position];
        if required
            .iter()
            .all(|required_step| prefix.contains(required_step))
        {
            Ok(true)
        } else {
            Err(REFUSED_BLIND_RETRY)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CognitionRegime {
    Cold,
    Warm,
    Hot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HotPathCandidate {
    pub regime: CognitionRegime,
    pub empirical_competitor_closure: bool,
    pub problem_signature: String,
    pub planner_identity: String,
    pub objective_identity: String,
    pub environment_identity: String,
    pub hardware_identity: String,
    pub capability_digest: String,
    pub policy_digest: String,
    pub selector_revision: String,
    pub candidate_only: bool,
    pub carries_authority: bool,
}

impl HotPathCandidate {
    #[must_use]
    pub fn compile(&self) -> Result<String, &'static str> {
        if self.regime != CognitionRegime::Hot || !self.empirical_competitor_closure {
            return Err(REFUSED_HOT_PATH_NOT_EMPIRICAL);
        }
        if [
            &self.problem_signature,
            &self.planner_identity,
            &self.objective_identity,
            &self.environment_identity,
            &self.hardware_identity,
            &self.capability_digest,
            &self.policy_digest,
            &self.selector_revision,
        ]
        .iter()
        .any(|value| value.is_empty())
        {
            return Err(REFUSED_HOT_PATH_IDENTITY_INCOMPLETE);
        }
        if !self.candidate_only || self.carries_authority {
            return Err(REFUSED_HOT_PATH_AUTHORITY_ESCALATION);
        }
        let bytes =
            serde_json::to_vec(self).expect("HotPathCandidate serialization is infallible");
        Ok(blake3::hash(&bytes).to_hex().to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CrownGate {
    ProductionKernelBootstrap,
    LabCapabilityAdmission,
    GgenBundleManufacture,
    BundleDigestPromotion,
    AzureSubscriptionApproved,
    AzureCliAvailable,
    TerraformApplyDestroy,
    SentinelOrIncidentIngress,
    LogicAppTrigger,
    ManagedIdentityRbac,
    ConfidentialEvidenceSink,
    KnowledgeHookRdfDelta,
    AgentSessionPowlExecution,
    AuthorityEnvelope,
    IndependentPostconditionVerification,
    OcelEvidence,
    PreservationAwareReplay,
    DeterministicCleanupOrphanSweep,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CrownEvidence {
    pub satisfied: BTreeSet<CrownGate>,
    pub blocked: BTreeMap<CrownGate, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CrownStanding {
    Alive,
    Partial,
    Blocked { gate: CrownGate, reason: String },
}

impl CrownEvidence {
    #[must_use]
    pub fn standing(&self) -> CrownStanding {
        for gate in all_crown_gates() {
            if let Some(reason) = self.blocked.get(&gate) {
                return CrownStanding::Blocked {
                    gate,
                    reason: reason.clone(),
                };
            }
        }
        if all_crown_gates()
            .iter()
            .all(|gate| self.satisfied.contains(gate))
        {
            CrownStanding::Alive
        } else {
            CrownStanding::Partial
        }
    }
}

#[must_use]
pub fn all_crown_gates() -> Vec<CrownGate> {
    vec![
        CrownGate::ProductionKernelBootstrap,
        CrownGate::LabCapabilityAdmission,
        CrownGate::GgenBundleManufacture,
        CrownGate::BundleDigestPromotion,
        CrownGate::AzureSubscriptionApproved,
        CrownGate::AzureCliAvailable,
        CrownGate::TerraformApplyDestroy,
        CrownGate::SentinelOrIncidentIngress,
        CrownGate::LogicAppTrigger,
        CrownGate::ManagedIdentityRbac,
        CrownGate::ConfidentialEvidenceSink,
        CrownGate::KnowledgeHookRdfDelta,
        CrownGate::AgentSessionPowlExecution,
        CrownGate::AuthorityEnvelope,
        CrownGate::IndependentPostconditionVerification,
        CrownGate::OcelEvidence,
        CrownGate::PreservationAwareReplay,
        CrownGate::DeterministicCleanupOrphanSweep,
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SemanticSourceKind {
    Ontology,
    Schema,
    KnowledgeCatalog,
    Protocol,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SemanticSourceRecord {
    pub identity: String,
    pub kind: SemanticSourceKind,
    pub registered: bool,
    pub source_bytes_pinned: bool,
    pub source_digest: Option<String>,
    pub validation_executed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SourceStanding {
    Unknown,
    PartialAlive,
    Alive,
}

impl SemanticSourceRecord {
    #[must_use]
    pub fn standing(&self) -> SourceStanding {
        if !self.registered {
            SourceStanding::Unknown
        } else if self.source_bytes_pinned
            && self
                .source_digest
                .as_ref()
                .is_some_and(|digest| !digest.is_empty())
            && self.validation_executed
        {
            SourceStanding::Alive
        } else {
            SourceStanding::PartialAlive
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ProviderCapability {
    Observe,
    Plan,
    Apply,
    Destroy,
    CallTool,
    Navigate,
    Verify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderProfile {
    TerraformPlanOnly,
    TerraformLocalDockerApply,
    KubernetesReconciliation,
    McpClientSession,
    BrowserGym,
    VendorNative,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderContract {
    pub profile: ProviderProfile,
    pub exact_subject_revision: Option<String>,
    pub capabilities: BTreeSet<ProviderCapability>,
    pub independent_verification: bool,
    pub cloud_credentials_required: bool,
}

impl ProviderContract {
    #[must_use]
    pub fn validate(&self) -> Result<(), &'static str> {
        match self.profile {
            ProviderProfile::TerraformPlanOnly => {
                if self.capabilities.contains(&ProviderCapability::Apply)
                    || self.capabilities.contains(&ProviderCapability::Destroy)
                {
                    return Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE);
                }
            }
            ProviderProfile::TerraformLocalDockerApply => {
                if self.cloud_credentials_required {
                    return Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE);
                }
            }
            ProviderProfile::VendorNative => {
                if !self
                    .exact_subject_revision
                    .as_ref()
                    .is_some_and(|revision| is_sha40(revision))
                {
                    return Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE);
                }
            }
            ProviderProfile::KubernetesReconciliation
            | ProviderProfile::McpClientSession
            | ProviderProfile::BrowserGym => {}
        }
        if self.capabilities.contains(&ProviderCapability::Apply)
            && !self.independent_verification
        {
            return Err(REFUSED_PROVIDER_CAPABILITY_ESCAPE);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProcessAnalytics {
    pub fitness: Option<f64>,
    pub precision: Option<f64>,
    pub generalization: Option<f64>,
    pub drift_points: usize,
    pub remaining_time_ms: Option<f64>,
    pub resource_handover_edges: usize,
    pub decision_stability_measured: bool,
}

impl ProcessAnalytics {
    #[must_use]
    pub fn grants_authority(&self) -> bool {
        false
    }

    #[must_use]
    pub fn quality_dimensions_present(&self) -> usize {
        [self.fitness, self.precision, self.generalization]
            .iter()
            .filter(|value| value.is_some())
            .count()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceCheckpointClaim {
    pub receipt_chain_verified: bool,
    pub checkpoint_authenticated: bool,
    pub customer_adoption: bool,
}

impl EvidenceCheckpointClaim {
    #[must_use]
    pub fn proves_adoption(&self) -> bool {
        self.receipt_chain_verified && self.checkpoint_authenticated && self.customer_adoption
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifierVerdict {
    pub verifier_id: String,
    pub consequence_id: String,
    pub passed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnterpriseAdmission {
    pub technical_alive: bool,
    pub adopted_decisions: usize,
    pub required_verifiers: BTreeSet<String>,
    pub consequence_id: String,
    pub verdicts: Vec<VerifierVerdict>,
}

impl EnterpriseAdmission {
    #[must_use]
    pub fn enterprise_alive(&self) -> Result<bool, &'static str> {
        if !self.technical_alive || self.adopted_decisions != 1 {
            return Err(REFUSED_ENTERPRISE_EVIDENCE_INCOMPLETE);
        }
        let passing: BTreeSet<&str> = self
            .verdicts
            .iter()
            .filter(|verdict| verdict.passed && verdict.consequence_id == self.consequence_id)
            .map(|verdict| verdict.verifier_id.as_str())
            .collect();
        if self
            .required_verifiers
            .iter()
            .all(|required| passing.contains(required.as_str()))
        {
            Ok(true)
        } else {
            Err(REFUSED_ENTERPRISE_EVIDENCE_INCOMPLETE)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicationEvidence {
    pub draft_pr_exists: bool,
    pub head_sha: String,
    pub workflow_subject_sha: Option<String>,
    pub required_command_executed: bool,
    pub required_command_passed: bool,
}

impl PublicationEvidence {
    #[must_use]
    pub fn subject_alive(&self) -> bool {
        self.draft_pr_exists
            && is_sha40(&self.head_sha)
            && self.workflow_subject_sha.as_deref() == Some(self.head_sha.as_str())
            && self.required_command_executed
            && self.required_command_passed
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InteractionModel {
    EpisodicStep,
    TaskHarness,
    ToolSession,
    Reconciliation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InnovationRecord {
    pub repository: String,
    pub pull_request: Option<u64>,
    pub theme: String,
    pub interaction_model: Option<InteractionModel>,
    pub evidence_only: bool,
}

/// Observed architecture subjects from the integration window. These records
/// are provenance/index facts only; inclusion does not promote their runtime
/// standing.
#[must_use]
pub fn last_24h_innovation_index() -> Vec<InnovationRecord> {
    vec![
        InnovationRecord {
            repository: "seanchatmangpt/autofde-lab".to_owned(),
            pull_request: Some(25),
            theme: "ForwardBench exact-pinned corpus and generated SELECT substrate".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/autofde-lab".to_owned(),
            pull_request: Some(26),
            theme: "GymAct semantic ABI manufactured through ggen".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/autofde-lab".to_owned(),
            pull_request: Some(27),
            theme: "technical standing separated from customer adoption".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/autofde-lab".to_owned(),
            pull_request: Some(29),
            theme: "fitness precision generalization drift remaining-time and resource mining"
                .to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/autofde-lab".to_owned(),
            pull_request: Some(31),
            theme: "Crown evidence court and empirical HOT compilation".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(3),
            theme: "RFC8785 BLAKE3 receipts bounded authority and manufacturing bundle".to_owned(),
            interaction_model: None,
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(4),
            theme: "real BrowserGym authority-gated world".to_owned(),
            interaction_model: Some(InteractionModel::EpisodicStep),
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(5),
            theme: "authenticated receipt-chain checkpoints".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(6),
            theme: "real MCP client session provider".to_owned(),
            interaction_model: Some(InteractionModel::ToolSession),
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(7),
            theme: "real Kubernetes reconciliation with independent cluster observation".to_owned(),
            interaction_model: Some(InteractionModel::Reconciliation),
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(8),
            theme: "Terraform plan-only provider".to_owned(),
            interaction_model: Some(InteractionModel::Reconciliation),
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(9),
            theme: "bounded local Terraform apply destroy with orphan verification".to_owned(),
            interaction_model: Some(InteractionModel::Reconciliation),
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(10),
            theme: "exact-pinned vendor provider coverage".to_owned(),
            interaction_model: Some(InteractionModel::TaskHarness),
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/gymact".to_owned(),
            pull_request: Some(13),
            theme: "ProductionGymAct BRCE execution grants reconciliation and HOT recipes"
                .to_owned(),
            interaction_model: None,
            evidence_only: false,
        },
        InnovationRecord {
            repository: "seanchatmangpt/ggen".to_owned(),
            pull_request: Some(585),
            theme: "ontology-driven Typer FastMCP and DSPy manufacture packs".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/ggen".to_owned(),
            pull_request: Some(586),
            theme: "federated semantic registry preserving ontology schema catalog protocol kinds"
                .to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/wasm4pm".to_owned(),
            pull_request: Some(552),
            theme: "deterministic POWL evidence-session replay".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/wasm4pm".to_owned(),
            pull_request: Some(556),
            theme: "tenant-partitioned bounded online prefix conformance".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
        InnovationRecord {
            repository: "seanchatmangpt/wasm4pm".to_owned(),
            pull_request: Some(557),
            theme: "GymAct OCEL process-oracle differential test court".to_owned(),
            interaction_model: None,
            evidence_only: true,
        },
    ]
}
