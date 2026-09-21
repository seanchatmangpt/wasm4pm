//! GALL-021..023 portable process qualification courts.
//!
//! COMPUTE-only: these functions canonicalize evidence and refuse unbound host
//! capabilities. They contain no filesystem/network/clock/random imports and no
//! external DO surface.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableSubject {
    pub source_digest: String,
    pub process_digest: String,
    pub module_digest: String,
    pub runtime_id: String,
    pub parameters: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableReceipt {
    pub schema: String,
    pub checkpoint: String,
    pub subject_digest: String,
    pub result_digest: String,
    pub evidence_ceiling: String,
    pub falsifiers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CourtRefusal {
    UnboundHostCapability(String),
    UnsupportedPowlConstruct(String),
    UnsupportedOcpqOperator(String),
    MissingRelation(String),
    InvalidUpstreamArtifact(String),
    UpstreamDigestMismatch(String),
    UpstreamAuthorityExpanded,
}

const FORBIDDEN_IMPORTS: &[&str] = &["clock", "time", "random", "filesystem", "network"];


pub fn admit_ex4pm_portable_artifact(
    artifact: &Value,
    module_digest: &str,
    runtime_id: &str,
    mut parameters: BTreeMap<String, String>,
) -> Result<PortableSubject, CourtRefusal> {
    let object = artifact.as_object().ok_or_else(|| {
        CourtRefusal::InvalidUpstreamArtifact("artifact must be an object".into())
    })?;

    require_string(object, "schema", Some("ex4pm.gall.portable/v26.9.18"))?;
    require_string(object, "authority", Some("NONE"))
        .map_err(|_| CourtRefusal::UpstreamAuthorityExpanded)?;

    let producer = object
        .get("producer")
        .and_then(Value::as_object)
        .ok_or_else(|| CourtRefusal::InvalidUpstreamArtifact("producer missing".into()))?;
    let repository = require_string(producer, "repository", None)?;
    if repository.split('/').count() != 2 {
        return Err(CourtRefusal::InvalidUpstreamArtifact(
            "producer repository must be owner/name".into(),
        ));
    }
    let producer_sha = require_string(producer, "sha", None)?;
    if !is_hex_digest(producer_sha, 40) {
        return Err(CourtRefusal::InvalidUpstreamArtifact(
            "producer sha must be exact 40-hex".into(),
        ));
    }

    let corpus_digest = require_sha256(object, "corpus_digest")?;
    let payload_digest = require_sha256(object, "payload_digest")?;
    let artifact_digest = require_sha256(object, "artifact_digest")?;
    let payload = object
        .get("payload")
        .ok_or_else(|| CourtRefusal::InvalidUpstreamArtifact("payload missing".into()))?;

    let observed_payload = sha256_json(payload);
    if observed_payload != payload_digest {
        return Err(CourtRefusal::UpstreamDigestMismatch("payload_digest".into()));
    }

    let mut body = object.clone();
    body.remove("artifact_digest");
    let observed_artifact = sha256_json(&Value::Object(body));
    if observed_artifact != artifact_digest {
        return Err(CourtRefusal::UpstreamDigestMismatch("artifact_digest".into()));
    }

    if !is_content_digest(module_digest) {
        return Err(CourtRefusal::InvalidUpstreamArtifact(
            "module digest must be content-addressed".into(),
        ));
    }
    if runtime_id.is_empty() {
        return Err(CourtRefusal::InvalidUpstreamArtifact(
            "runtime id is required".into(),
        ));
    }

    parameters.insert("ex4pm_corpus_digest".into(), corpus_digest.into());
    parameters.insert("ex4pm_producer_repository".into(), repository.into());
    parameters.insert("ex4pm_producer_sha".into(), producer_sha.into());

    Ok(PortableSubject {
        source_digest: artifact_digest.into(),
        process_digest: payload_digest.into(),
        module_digest: module_digest.into(),
        runtime_id: runtime_id.into(),
        parameters,
    })
}

pub fn gall_021_portable_result(
    subject: &PortableSubject,
    semantic_result: &Value,
    declared_host_inputs: &[String],
) -> Result<PortableReceipt, CourtRefusal> {
    for capability in FORBIDDEN_IMPORTS {
        if subject.parameters.contains_key(*capability)
            && !declared_host_inputs.iter().any(|v| v == capability)
        {
            return Err(CourtRefusal::UnboundHostCapability((*capability).into()));
        }
    }

    Ok(receipt(
        "GALL-021",
        subject,
        semantic_result,
        vec!["input_order_permutation", "unbound_host_import", "module_mutation"],
    ))
}

pub fn gall_022_powl_preservation(
    subject: &PortableSubject,
    canonical_powl: &Value,
    supported_constructs: &[&str],
) -> Result<PortableReceipt, CourtRefusal> {
    let required = collect_powl_constructs(canonical_powl);
    for construct in required {
        if !supported_constructs.iter().any(|v| *v == construct) {
            return Err(CourtRefusal::UnsupportedPowlConstruct(construct));
        }
    }

    Ok(receipt(
        "GALL-022",
        subject,
        canonical_powl,
        vec!["partial_order_flattening", "hierarchy_flattening", "unsupported_construct"],
    ))
}

pub fn gall_023_ocpq_bindings(
    subject: &PortableSubject,
    bindings: &[Value],
    operator: &str,
    supported_operators: &[&str],
    required_relation_present: bool,
) -> Result<PortableReceipt, CourtRefusal> {
    if !supported_operators.iter().any(|v| *v == operator) {
        return Err(CourtRefusal::UnsupportedOcpqOperator(operator.into()));
    }
    if !required_relation_present {
        return Err(CourtRefusal::MissingRelation(operator.into()));
    }

    let mut canonical = bindings.to_vec();
    canonical.sort_by_key(canonical_json);

    Ok(receipt(
        "GALL-023",
        subject,
        &Value::Array(canonical),
        vec!["binding_order_permutation", "missing_relation", "unsupported_operator"],
    ))
}


fn require_string<'a>(
    object: &'a serde_json::Map<String, Value>,
    field: &str,
    expected: Option<&str>,
) -> Result<&'a str, CourtRefusal> {
    let value = object
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| CourtRefusal::InvalidUpstreamArtifact(format!("{field} missing")))?;
    if value.is_empty() {
        return Err(CourtRefusal::InvalidUpstreamArtifact(format!("{field} empty")));
    }
    if let Some(expected) = expected {
        if value != expected {
            return Err(CourtRefusal::InvalidUpstreamArtifact(format!(
                "{field} mismatch"
            )));
        }
    }
    Ok(value)
}

fn require_sha256<'a>(
    object: &'a serde_json::Map<String, Value>,
    field: &str,
) -> Result<&'a str, CourtRefusal> {
    let value = require_string(object, field, None)?;
    if value
        .strip_prefix("sha256:")
        .is_some_and(|hex| is_hex_digest(hex, 64))
    {
        Ok(value)
    } else {
        Err(CourtRefusal::InvalidUpstreamArtifact(format!(
            "{field} must be sha256:<64hex>"
        )))
    }
}

fn is_content_digest(value: &str) -> bool {
    ["sha256:", "blake3:"].iter().any(|prefix| {
        value
            .strip_prefix(prefix)
            .is_some_and(|hex| is_hex_digest(hex, 64))
    })
}

fn is_hex_digest(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn sha256_json(value: &Value) -> String {
    let canonical = canonical_json(value);
    let digest = Sha256::digest(canonical.as_bytes());
    format!("sha256:{:x}", digest)
}

fn receipt(
    checkpoint: &str,
    subject: &PortableSubject,
    result: &Value,
    falsifiers: Vec<&str>,
) -> PortableReceipt {
    PortableReceipt {
        schema: "wasm4pm.gall.portable-process/v26.9.18".into(),
        checkpoint: checkpoint.into(),
        subject_digest: digest_json(&serde_json::to_value(subject).expect("serializable subject")),
        result_digest: digest_json(result),
        evidence_ceiling: "COMPUTE_ONLY".into(),
        falsifiers: falsifiers.into_iter().map(str::to_owned).collect(),
    }
}

fn collect_powl_constructs(value: &Value) -> Vec<String> {
    let mut out = Vec::new();
    collect_constructs(value, &mut out);
    out.sort();
    out.dedup();
    out
}

fn collect_constructs(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(kind)) = map.get("type").or_else(|| map.get("kind")) {
                out.push(kind.clone());
            }
            for child in map.values() {
                collect_constructs(child, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_constructs(item, out);
            }
        }
        _ => {}
    }
}

fn digest_json(value: &Value) -> String {
    let bytes = canonical_json(value);
    format!("blake3:{}", blake3::hash(bytes.as_bytes()).to_hex())
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => v.to_string(),
        Value::String(v) => serde_json::to_string(v).expect("string"),
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical_json).collect::<Vec<_>>().join(",")
        ),
        Value::Object(map) => {
            let mut entries = map.iter().collect::<Vec<_>>();
            entries.sort_by(|(a, _), (b, _)| a.cmp(b));
            format!(
                "{{{}}}",
                entries
                    .into_iter()
                    .map(|(k, v)| format!(
                        "{}:{}",
                        serde_json::to_string(k).expect("key"),
                        canonical_json(v)
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn subject() -> PortableSubject {
        PortableSubject {
            source_digest: "sha256:source".into(),
            process_digest: "sha256:process".into(),
            module_digest: "sha256:module".into(),
            runtime_id: "wasmtime:test".into(),
            parameters: BTreeMap::new(),
        }
    }

    fn ex4pm_artifact(payload: Value) -> Value {
        let payload_digest = sha256_json(&payload);
        let mut body = serde_json::json!({
            "schema": "ex4pm.gall.portable/v26.9.18",
            "kind": "powl",
            "producer": {
                "repository": "seanchatmangpt/ex4pm",
                "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "corpus_digest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            "payload": payload,
            "payload_digest": payload_digest,
            "evidence_class": "normative-process-law",
            "authority": "NONE"
        });
        let artifact_digest = sha256_json(&body);
        body.as_object_mut()
            .expect("object")
            .insert("artifact_digest".into(), Value::String(artifact_digest));
        body
    }

    #[test]
    fn ex4pm_portable_artifact_is_verified_before_gall_021_subject_construction() {
        let artifact = ex4pm_artifact(json!({
            "model": {"type": "partial_order", "children": ["a", "b"], "order": []}
        }));
        let subject = admit_ex4pm_portable_artifact(
            &artifact,
            "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
            "wasmtime:26.9.18",
            BTreeMap::new(),
        )
        .expect("admitted ex4pm artifact");

        assert_eq!(
            subject.source_digest,
            artifact["artifact_digest"].as_str().expect("artifact digest")
        );
        assert_eq!(
            subject.process_digest,
            artifact["payload_digest"].as_str().expect("payload digest")
        );
        assert_eq!(
            subject.parameters["ex4pm_corpus_digest"],
            artifact["corpus_digest"].as_str().expect("corpus digest")
        );
        assert_eq!(
            subject.parameters["ex4pm_producer_repository"],
            "seanchatmangpt/ex4pm"
        );

        let receipt = gall_021_portable_result(&subject, &artifact["payload"], &[])
            .expect("portable compute");
        assert_eq!(receipt.checkpoint, "GALL-021");
        assert_eq!(receipt.evidence_ceiling, "COMPUTE_ONLY");
    }

    #[test]
    fn ex4pm_portable_admission_refuses_tamper_and_authority_expansion() {
        let mut tampered = ex4pm_artifact(json!({"model": {"type": "sequence"}}));
        tampered["payload"]["model"]["type"] = json!("choice");
        assert_eq!(
            admit_ex4pm_portable_artifact(
                &tampered,
                "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                "wasmtime:26.9.18",
                BTreeMap::new(),
            ),
            Err(CourtRefusal::UpstreamDigestMismatch("payload_digest".into()))
        );

        let mut authority = ex4pm_artifact(json!({"model": {"type": "sequence"}}));
        authority["authority"] = json!("DO");
        assert_eq!(
            admit_ex4pm_portable_artifact(
                &authority,
                "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                "wasmtime:26.9.18",
                BTreeMap::new(),
            ),
            Err(CourtRefusal::UpstreamAuthorityExpanded)
        );
    }

    #[test]
    fn gall_021_result_identity_ignores_object_key_order() {
        let a = json!({"b": 2, "a": 1});
        let b = json!({"a": 1, "b": 2});
        assert_eq!(
            gall_021_portable_result(&subject(), &a, &[]).unwrap().result_digest,
            gall_021_portable_result(&subject(), &b, &[]).unwrap().result_digest
        );
    }

    #[test]
    fn gall_021_refuses_unbound_host_input() {
        let mut s = subject();
        s.parameters.insert("random".into(), "host".into());
        assert_eq!(
            gall_021_portable_result(&s, &json!({}), &[]),
            Err(CourtRefusal::UnboundHostCapability("random".into()))
        );
    }

    #[test]
    fn gall_022_refuses_language_loss() {
        let powl = json!({"type":"partial_order","children":[{"type":"activity"}]});
        assert!(matches!(
            gall_022_powl_preservation(&subject(), &powl, &["activity"]),
            Err(CourtRefusal::UnsupportedPowlConstruct(v)) if v == "partial_order"
        ));
    }

    #[test]
    fn gall_023_canonicalizes_binding_order_and_fails_closed_on_missing_relation() {
        let a = vec![json!({"o":"2"}), json!({"o":"1"})];
        let b = vec![json!({"o":"1"}), json!({"o":"2"})];
        let ra = gall_023_ocpq_bindings(&subject(), &a, "O2O", &["O2O"], true).unwrap();
        let rb = gall_023_ocpq_bindings(&subject(), &b, "O2O", &["O2O"], true).unwrap();
        assert_eq!(ra.result_digest, rb.result_digest);
        assert!(matches!(
            gall_023_ocpq_bindings(&subject(), &a, "O2O", &["O2O"], false),
            Err(CourtRefusal::MissingRelation(v)) if v == "O2O"
        ));
    }
}
