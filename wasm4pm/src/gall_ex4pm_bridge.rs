//! ex4pm -> wasm4pm GALL portable-process bridge.
//!
//! The bridge verifies ex4pm's RFC 8785 restricted-JCS envelope before it
//! constructs any wasm4pm process subject. It reuses GALL-021/022 qualification
//! machinery; it does not implement a second process language or actuator.

use crate::gall_process_portability::{
    sha256, valid_digest, verify_powl_preservation, PortabilityRefusal, PortableProcessSubject,
    PowlPreservationReceipt, RuntimeWitness,
};
use crate::gall_wasm_lowering::{lower_powl, LanguageProbe, PortableModule, PowlSubject};
use serde_json::Value;

const EX4PM_SCHEMA: &str = "ex4pm.gall.portable/v26.9.19";
const CANONICALIZATION: &str = "RFC8785/JCS-IJSON-ASCII-INTEGER-SUBSET";
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ex4pmBridgeRefusal {
    InvalidJson(String),
    MissingField(String),
    SchemaMismatch(String),
    AuthorityExpanded(String),
    CanonicalizationMismatch(String),
    NonPortableJcs(String),
    InvalidRepository(String),
    InvalidProducerSha(String),
    InvalidDigest(String),
    PayloadDigestMismatch,
    ArtifactDigestMismatch,
    KindMismatch(String),
    InvalidPowl(String),
    Portability(PortabilityRefusal),
}

impl From<PortabilityRefusal> for Ex4pmBridgeRefusal {
    fn from(value: PortabilityRefusal) -> Self {
        Self::Portability(value)
    }
}

fn ascii(value: &str) -> bool {
    value.is_ascii()
}

fn validate_jcs_subset(value: &Value) -> Result<(), Ex4pmBridgeRefusal> {
    match value {
        Value::Null | Value::Bool(_) => Ok(()),
        Value::String(value) if ascii(value) => Ok(()),
        Value::String(value) => Err(Ex4pmBridgeRefusal::NonPortableJcs(format!(
            "non_ascii_string:{value:?}"
        ))),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                if value.unsigned_abs() <= MAX_SAFE_INTEGER {
                    Ok(())
                } else {
                    Err(Ex4pmBridgeRefusal::NonPortableJcs(
                        "integer_outside_ijson_exact_range".into(),
                    ))
                }
            } else if let Some(value) = number.as_u64() {
                if value <= MAX_SAFE_INTEGER {
                    Ok(())
                } else {
                    Err(Ex4pmBridgeRefusal::NonPortableJcs(
                        "integer_outside_ijson_exact_range".into(),
                    ))
                }
            } else {
                Err(Ex4pmBridgeRefusal::NonPortableJcs(
                    "float_not_in_portable_subset".into(),
                ))
            }
        }
        Value::Array(values) => {
            for value in values {
                validate_jcs_subset(value)?;
            }
            Ok(())
        }
        Value::Object(values) => {
            for (key, value) in values {
                if !ascii(key) {
                    return Err(Ex4pmBridgeRefusal::NonPortableJcs(
                        "non_ascii_object_key".into(),
                    ));
                }
                validate_jcs_subset(value)?;
            }
            Ok(())
        }
    }
}

fn canonical_jcs_subset(value: &Value) -> Result<String, Ex4pmBridgeRefusal> {
    validate_jcs_subset(value)?;

    match value {
        Value::Null => Ok("null".into()),
        Value::Bool(value) => Ok(value.to_string()),
        Value::String(value) => serde_json::to_string(value)
            .map_err(|error| Ex4pmBridgeRefusal::InvalidJson(error.to_string())),
        Value::Number(number) => Ok(number.to_string()),
        Value::Array(values) => {
            let canonical = values
                .iter()
                .map(canonical_jcs_subset)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", canonical.join(",")))
        }
        Value::Object(values) => {
            let mut keys: Vec<&String> = values.keys().collect();
            keys.sort();
            let mut pairs = Vec::with_capacity(keys.len());

            for key in keys {
                let encoded_key = serde_json::to_string(key)
                    .map_err(|error| Ex4pmBridgeRefusal::InvalidJson(error.to_string()))?;
                let encoded_value = canonical_jcs_subset(&values[key])?;
                pairs.push(format!("{encoded_key}:{encoded_value}"));
            }

            Ok(format!("{{{}}}", pairs.join(",")))
        }
    }
}

fn digest_value(value: &Value) -> Result<String, Ex4pmBridgeRefusal> {
    Ok(sha256(canonical_jcs_subset(value)?.as_bytes()))
}

fn required_string<'a>(value: &'a Value, field: &str) -> Result<&'a str, Ex4pmBridgeRefusal> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| Ex4pmBridgeRefusal::MissingField(field.into()))
}

pub fn verify_ex4pm_artifact(input: &str) -> Result<Value, Ex4pmBridgeRefusal> {
    let artifact: Value = serde_json::from_str(input)
        .map_err(|error| Ex4pmBridgeRefusal::InvalidJson(error.to_string()))?;

    if required_string(&artifact, "schema")? != EX4PM_SCHEMA {
        return Err(Ex4pmBridgeRefusal::SchemaMismatch(
            required_string(&artifact, "schema")?.into(),
        ));
    }

    if required_string(&artifact, "canonicalization")? != CANONICALIZATION {
        return Err(Ex4pmBridgeRefusal::CanonicalizationMismatch(
            required_string(&artifact, "canonicalization")?.into(),
        ));
    }

    if required_string(&artifact, "authority")? != "NONE" {
        return Err(Ex4pmBridgeRefusal::AuthorityExpanded(
            required_string(&artifact, "authority")?.into(),
        ));
    }

    let producer = artifact
        .get("producer")
        .ok_or_else(|| Ex4pmBridgeRefusal::MissingField("producer".into()))?;
    let repository = required_string(producer, "repository")?;
    let parts: Vec<&str> = repository.split('/').collect();
    if parts.len() != 2 || parts.iter().any(|part| part.is_empty()) {
        return Err(Ex4pmBridgeRefusal::InvalidRepository(repository.into()));
    }

    let producer_sha = required_string(producer, "sha")?;
    if producer_sha.len() != 40
        || !producer_sha
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(Ex4pmBridgeRefusal::InvalidProducerSha(producer_sha.into()));
    }

    for field in ["corpus_digest", "payload_digest", "artifact_digest"] {
        if !valid_digest(required_string(&artifact, field)?) {
            return Err(Ex4pmBridgeRefusal::InvalidDigest(field.into()));
        }
    }

    let payload = artifact
        .get("payload")
        .ok_or_else(|| Ex4pmBridgeRefusal::MissingField("payload".into()))?;
    if digest_value(payload)? != required_string(&artifact, "payload_digest")? {
        return Err(Ex4pmBridgeRefusal::PayloadDigestMismatch);
    }

    let mut body = artifact.clone();
    body.as_object_mut()
        .ok_or_else(|| Ex4pmBridgeRefusal::InvalidJson("root_not_object".into()))?
        .remove("artifact_digest");

    if digest_value(&body)? != required_string(&artifact, "artifact_digest")? {
        return Err(Ex4pmBridgeRefusal::ArtifactDigestMismatch);
    }

    Ok(artifact)
}

/// A verified ex4pm artifact bound to the GALL-021 process subject.
///
/// [`PortableProcessSubject`] carries no artifact identity of its own, so the
/// ex4pm `artifact_digest` (the envelope identity) travels beside it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ex4pmPortableSubject {
    pub artifact_digest: String,
    pub subject: PortableProcessSubject,
}

/// Verify the ex4pm envelope, then build the GALL-021 subject. `process_digest`
/// is the verified ex4pm payload digest; `input` is the exact byte input the
/// module will be executed on.
pub fn portable_subject_from_ex4pm(
    artifact_json: &str,
    module: &PortableModule,
    input: &[u8],
    parameters_digest: &str,
) -> Result<Ex4pmPortableSubject, Ex4pmBridgeRefusal> {
    let artifact = verify_ex4pm_artifact(artifact_json)?;
    let subject = PortableProcessSubject::new(
        required_string(&artifact, "payload_digest")?,
        module,
        input,
        parameters_digest,
    );
    subject.validate()?;
    Ok(Ex4pmPortableSubject {
        artifact_digest: required_string(&artifact, "artifact_digest")?.into(),
        subject,
    })
}

/// Admit the POWL model of a verified ex4pm `kind: "powl"` artifact through
/// the existing GALL-016 dialect ingestion. Unsupported constructs and unknown
/// fields are typed refusals from that court, not silently dropped.
pub fn powl_subject_from_ex4pm(artifact_json: &str) -> Result<PowlSubject, Ex4pmBridgeRefusal> {
    let artifact = verify_ex4pm_artifact(artifact_json)?;
    let kind = required_string(&artifact, "kind")?;
    if kind != "powl" {
        return Err(Ex4pmBridgeRefusal::KindMismatch(kind.into()));
    }
    let payload = artifact
        .get("payload")
        .ok_or_else(|| Ex4pmBridgeRefusal::MissingField("payload".into()))?;
    let model = payload
        .get("model")
        .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("payload_missing_model".into()))?;
    let bytes = canonical_jcs_subset(model)?;
    Ok(PowlSubject::from_gall016_json(bytes.as_bytes())?)
}

/// Lower a verified ex4pm POWL artifact to its portable module and the
/// generative language probe used to judge it.
pub fn lower_ex4pm_powl(
    artifact_json: &str,
) -> Result<(PowlSubject, PortableModule, LanguageProbe), Ex4pmBridgeRefusal> {
    let subject = powl_subject_from_ex4pm(artifact_json)?;
    let module = lower_powl(&subject)?;
    let probe = LanguageProbe::for_subject(&subject);
    Ok((subject, module, probe))
}

/// GALL-022 for an ex4pm artifact: re-admits the subject from the verified
/// envelope and delegates to the existing preservation court with executed
/// runtime witnesses.
pub fn qualify_ex4pm_powl(
    artifact_json: &str,
    module: &PortableModule,
    probe: &LanguageProbe,
    witnesses: &[RuntimeWitness],
) -> Result<PowlPreservationReceipt, Ex4pmBridgeRefusal> {
    let subject = powl_subject_from_ex4pm(artifact_json)?;
    Ok(verify_powl_preservation(
        &subject, module, probe, witnesses,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn digest(char: char) -> String {
        format!("sha256:{}", char.to_string().repeat(64))
    }

    fn artifact(model: Value) -> String {
        let payload = json!({
            "schema": "ex4pm.gall.powl/v26.9.18",
            "ingress": "semantic",
            "model": model,
            "model_digest": digest('9')
        });
        let payload_digest = digest_value(&payload).unwrap();

        let mut body = json!({
            "schema": EX4PM_SCHEMA,
            "kind": "powl",
            "producer": {
                "repository": "seanchatmangpt/ex4pm",
                "sha": "0123456789abcdef0123456789abcdef01234567"
            },
            "corpus_digest": digest('a'),
            "payload": payload,
            "payload_digest": payload_digest,
            "evidence_class": "normative-process-law",
            "canonicalization": CANONICALIZATION,
            "authority": "NONE"
        });

        let artifact_digest = digest_value(&body).unwrap();
        body.as_object_mut()
            .unwrap()
            .insert("artifact_digest".into(), Value::String(artifact_digest));

        serde_json::to_string(&body).unwrap()
    }

    #[test]
    fn verifies_ex4pm_identity_before_constructing_gall_subject() {
        let input = artifact(json!({
            "type": "partial_order",
            "children": ["a", "b"],
            "order": []
        }));
        let (_, module, _) = lower_ex4pm_powl(&input).unwrap();

        let bridged = portable_subject_from_ex4pm(&input, &module, b"probe", &digest('c')).unwrap();
        let artifact = verify_ex4pm_artifact(&input).unwrap();

        assert_eq!(
            bridged.artifact_digest,
            artifact["artifact_digest"].as_str().unwrap()
        );
        assert_eq!(
            bridged.subject.process_digest,
            artifact["payload_digest"].as_str().unwrap()
        );
        assert_eq!(bridged.subject.module_digest, module.digest());
        assert_eq!(bridged.subject.input_digest, sha256(b"probe"));
        assert!(bridged.subject.explicitly_bound.is_empty());
    }

    #[test]
    fn invalid_parameters_digest_is_a_typed_portability_refusal() {
        let input = artifact(json!({ "type": "task", "id": "a" }));
        let (_, module, _) = lower_ex4pm_powl(&input).unwrap();
        assert_eq!(
            portable_subject_from_ex4pm(&input, &module, b"", "not-a-digest"),
            Err(Ex4pmBridgeRefusal::Portability(
                PortabilityRefusal::InvalidDigest("parameters_digest".into())
            ))
        );
    }

    #[test]
    fn tamper_and_authority_expansion_fail_before_process_qualification() {
        let input = artifact(json!({
            "type": "sequence",
            "children": ["a", "b"]
        }));
        let mut tampered: Value = serde_json::from_str(&input).unwrap();
        tampered["payload"]["model"]["type"] = Value::String("choice".into());

        assert_eq!(
            verify_ex4pm_artifact(&serde_json::to_string(&tampered).unwrap()),
            Err(Ex4pmBridgeRefusal::PayloadDigestMismatch)
        );

        let mut expanded: Value = serde_json::from_str(&input).unwrap();
        expanded["authority"] = Value::String("DO".into());

        assert_eq!(
            verify_ex4pm_artifact(&serde_json::to_string(&expanded).unwrap()),
            Err(Ex4pmBridgeRefusal::AuthorityExpanded("DO".into()))
        );
    }

    #[test]
    fn powl_bridge_lowers_hierarchy_and_partial_order_through_existing_court() {
        let input = artifact(json!({
            "type": "hierarchy",
            "id": "order",
            "child": {
                "type": "partial_order",
                "children": ["a", "b"],
                "order": [["a", "b"]]
            }
        }));

        let (subject, module, probe) = lower_ex4pm_powl(&input).unwrap();
        assert_eq!(subject.alphabet(), ["a".to_string(), "b".to_string()]);
        assert!(matches!(
            subject.skeleton(),
            crate::gall_wasm_lowering::PowlSkeleton::Boundary { id, .. } if id == "order"
        ));
        assert_eq!(probe.subject_digest(), subject.source_digest());
        let inspection = crate::gall_wasm_lowering::inspect_module(&module).unwrap();
        assert_eq!(inspection.subject.source_digest, subject.source_digest());
    }

    #[test]
    fn unsupported_powl_construct_is_refused_not_dropped() {
        let input = artifact(json!({ "type": "interleave", "children": ["a", "b"] }));
        assert_eq!(
            powl_subject_from_ex4pm(&input).unwrap_err(),
            Ex4pmBridgeRefusal::Portability(PortabilityRefusal::UnsupportedPowlConstruct(
                "interleave".into()
            ))
        );
    }

    #[test]
    fn non_powl_kind_is_refused() {
        let mut value: Value =
            serde_json::from_str(&artifact(json!({ "type": "task", "id": "a" }))).unwrap();
        value["kind"] = Value::String("ocpq".into());
        // Re-seal so only the kind check can refuse.
        value.as_object_mut().unwrap().remove("artifact_digest");
        let d = digest_value(&value).unwrap();
        value["artifact_digest"] = Value::String(d);
        assert_eq!(
            powl_subject_from_ex4pm(&serde_json::to_string(&value).unwrap()).unwrap_err(),
            Ex4pmBridgeRefusal::KindMismatch("ocpq".into())
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn executed_preservation_court_accepts_bridged_powl() {
        use crate::gall_runtime_harness::{discover_runtimes, witness_powl_probe};
        let hosts = discover_runtimes();
        if hosts.len() < 2 {
            eprintln!(
                "SKIP executed_preservation_court_accepts_bridged_powl: {} WASM engine(s), need 2",
                hosts.len()
            );
            return;
        }
        let input = artifact(json!({
            "type": "sequence",
            "children": ["a", { "type": "choice", "children": ["b", "c"] }]
        }));
        let (_, module, probe) = lower_ex4pm_powl(&input).unwrap();
        let witnesses: Vec<_> = hosts
            .iter()
            .map(|h| witness_powl_probe(h, &module, &probe).unwrap())
            .collect();
        let receipt = qualify_ex4pm_powl(&input, &module, &probe, &witnesses).unwrap();
        assert_eq!(receipt.checkpoint, "GALL-022");
        assert_eq!(receipt.authority, "NONE");
        receipt.verify_digest().unwrap();
    }

    #[test]
    fn portable_jcs_subset_refuses_floats() {
        let mut value: Value = serde_json::from_str(&artifact(json!({
            "type": "task",
            "id": "a"
        })))
        .unwrap();
        value["payload"]["threshold"] = json!(0.5);

        assert!(matches!(
            verify_ex4pm_artifact(&serde_json::to_string(&value).unwrap()),
            Err(Ex4pmBridgeRefusal::NonPortableJcs(detail))
                if detail == "float_not_in_portable_subset"
        ));
    }
}
