//! GALL-021..023 portable process execution correspondence court.
//!
//! This module certifies observations from two already-executed runtimes. It
//! does not execute POWL, select work, or grant authority. Portable standing
//! is earned only when exact semantic/process/binding/input identities match
//! and the independently observed output digest is identical.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SemanticAuthority {
    None,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GallPortableIdentity {
    pub work_order_iri: String,
    pub checkpoint_iri: String,
    pub graph_digest: String,
    pub repository_identity: String,
    pub base_sha: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableExecutionObservation {
    pub identity: GallPortableIdentity,
    pub runtime_identity: String,
    pub process_digest: String,
    pub powl_language_digest: String,
    pub ocpq_binding_digest: String,
    pub input_digest: String,
    pub output_digest: String,
    pub authority: SemanticAuthority,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableExecutionReceipt {
    pub schema: String,
    pub identity: GallPortableIdentity,
    pub source_runtime: String,
    pub target_runtime: String,
    pub process_digest: String,
    pub powl_language_digest: String,
    pub ocpq_binding_digest: String,
    pub input_digest: String,
    pub output_digest: String,
    pub authority: SemanticAuthority,
    pub receipt_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PortableExecutionRefusal {
    InvalidWorkOrderIri,
    InvalidCheckpointIri,
    InvalidGraphDigest,
    InvalidRepositoryIdentity,
    InvalidBaseSha,
    InvalidDigest(&'static str),
    SameRuntime,
    SubjectMismatch,
    ProcessMismatch,
    PowlLanguageMismatch,
    OcpqBindingMismatch,
    InputMismatch,
    OutputMismatch,
}

fn absolute_iri(value: &str) -> bool {
    !value.is_empty() && value.contains(':')
}

fn sha256_digest(value: &str) -> bool {
    let Some(("sha256", hex)) = value.split_once(':') else {
        return false;
    };
    hex.len() == 64 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn git_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn repository_identity(value: &str) -> bool {
    let mut parts = value.split('/');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(owner), Some(repo), None) if !owner.is_empty() && !repo.is_empty()
    )
}

fn validate_identity(identity: &GallPortableIdentity) -> Result<(), PortableExecutionRefusal> {
    if !absolute_iri(&identity.work_order_iri) {
        return Err(PortableExecutionRefusal::InvalidWorkOrderIri);
    }
    if !absolute_iri(&identity.checkpoint_iri) {
        return Err(PortableExecutionRefusal::InvalidCheckpointIri);
    }
    if !sha256_digest(&identity.graph_digest) {
        return Err(PortableExecutionRefusal::InvalidGraphDigest);
    }
    if !repository_identity(&identity.repository_identity) {
        return Err(PortableExecutionRefusal::InvalidRepositoryIdentity);
    }
    if !git_sha(&identity.base_sha) {
        return Err(PortableExecutionRefusal::InvalidBaseSha);
    }
    Ok(())
}

fn validate_observation(
    observation: &PortableExecutionObservation,
) -> Result<(), PortableExecutionRefusal> {
    validate_identity(&observation.identity)?;

    for (field, digest) in [
        ("process_digest", observation.process_digest.as_str()),
        ("powl_language_digest", observation.powl_language_digest.as_str()),
        ("ocpq_binding_digest", observation.ocpq_binding_digest.as_str()),
        ("input_digest", observation.input_digest.as_str()),
        ("output_digest", observation.output_digest.as_str()),
    ] {
        if !sha256_digest(digest) {
            return Err(PortableExecutionRefusal::InvalidDigest(field));
        }
    }

    Ok(())
}

fn canonical_digest<T: Serialize>(value: &T) -> String {
    let bytes = serde_json::to_vec(value).expect("portable receipt is serializable");
    let digest = Sha256::digest(bytes);
    format!("sha256:{digest:x}")
}

/// Certify cross-runtime deterministic equivalence for one exact WorkOrder.
///
/// GALL-021: same admitted inputs/process produce the same output across two
/// distinct runtime identities.
/// GALL-022: the exact POWL language digest is preserved.
/// GALL-023: the exact OCPQ binding digest is preserved.
///
/// Success is a portability receipt only; it is not BRCE/DO standing.
pub fn certify_portable_execution(
    source: &PortableExecutionObservation,
    target: &PortableExecutionObservation,
) -> Result<PortableExecutionReceipt, PortableExecutionRefusal> {
    validate_observation(source)?;
    validate_observation(target)?;

    if source.runtime_identity == target.runtime_identity {
        return Err(PortableExecutionRefusal::SameRuntime);
    }
    if source.identity != target.identity {
        return Err(PortableExecutionRefusal::SubjectMismatch);
    }
    if source.process_digest != target.process_digest {
        return Err(PortableExecutionRefusal::ProcessMismatch);
    }
    if source.powl_language_digest != target.powl_language_digest {
        return Err(PortableExecutionRefusal::PowlLanguageMismatch);
    }
    if source.ocpq_binding_digest != target.ocpq_binding_digest {
        return Err(PortableExecutionRefusal::OcpqBindingMismatch);
    }
    if source.input_digest != target.input_digest {
        return Err(PortableExecutionRefusal::InputMismatch);
    }
    if source.output_digest != target.output_digest {
        return Err(PortableExecutionRefusal::OutputMismatch);
    }

    let mut receipt = PortableExecutionReceipt {
        schema: "wasm4pm.gall.portable-execution/v26.9.19".to_string(),
        identity: source.identity.clone(),
        source_runtime: source.runtime_identity.clone(),
        target_runtime: target.runtime_identity.clone(),
        process_digest: source.process_digest.clone(),
        powl_language_digest: source.powl_language_digest.clone(),
        ocpq_binding_digest: source.ocpq_binding_digest.clone(),
        input_digest: source.input_digest.clone(),
        output_digest: source.output_digest.clone(),
        authority: SemanticAuthority::None,
        receipt_digest: String::new(),
    };

    receipt.receipt_digest = canonical_digest(&receipt);
    Ok(receipt)
}
