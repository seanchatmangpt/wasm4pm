//! ex4pm -> wasm4pm GALL portable-process bridge.
//!
//! The bridge verifies ex4pm's RFC 8785 restricted-JCS envelope before it
//! constructs any wasm4pm process subject. It reuses GALL-021/022 qualification
//! machinery; it does not implement a second process language or actuator.

use crate::gall_process_portability::{
    powl_preservation_witness, PortableProcessSubject, PortabilityRefusal, PowlNode,
    PowlPreservationWitness,
};
use serde_json::Value;
use sha2::{Digest, Sha256};

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

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn valid_digest(value: &str) -> bool {
    value
        .strip_prefix("sha256:")
        .is_some_and(|hex| {
            hex.len() == 64
                && hex
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
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

            let pairs = keys
                .into_iter()
                .map(|key| {
                    let key = serde_json::to_string(key)
                        .map_err(|error| Ex4pmBridgeRefusal::InvalidJson(error.to_string()))?;
                    let value = canonical_jcs_subset(&values[&key[1..key.len() - 1]])?;
                    Ok(format!("{key}:{value}"))
                })
                .collect::<Result<Vec<_>, Ex4pmBridgeRefusal>>()?;

            Ok(format!("{{{}}}", pairs.join(",")))
        }
    }
}

fn canonical_object(value: &Value) -> Result<String, Ex4pmBridgeRefusal> {
    validate_jcs_subset(value)?;

    if let Value::Object(values) = value {
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
    } else {
        canonical_jcs_subset(value)
    }
}

fn digest_value(value: &Value) -> Result<String, Ex4pmBridgeRefusal> {
    Ok(sha256(canonical_object(value)?.as_bytes()))
}

fn required_string<'a>(
    value: &'a Value,
    field: &str,
) -> Result<&'a str, Ex4pmBridgeRefusal> {
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
        return Err(Ex4pmBridgeRefusal::InvalidProducerSha(
            producer_sha.into(),
        ));
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

fn powl_from_ex4pm(value: &Value) -> Result<PowlNode, Ex4pmBridgeRefusal> {
    if let Some(id) = value.as_str() {
        return Ok(PowlNode::Task { id: id.into() });
    }

    let object = value
        .as_object()
        .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("node_not_object_or_string".into()))?;
    let kind = object
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("missing_type".into()))?;

    let children = |field: &str| -> Result<Vec<PowlNode>, Ex4pmBridgeRefusal> {
        object
            .get(field)
            .and_then(Value::as_array)
            .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl(format!("missing_{field}")))?
            .iter()
            .map(powl_from_ex4pm)
            .collect()
    };

    match kind {
        "task" => Ok(PowlNode::Task {
            id: object
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("task_missing_id".into()))?
                .into(),
        }),
        "sequence" => Ok(PowlNode::Sequence {
            children: children("children")?,
        }),
        "choice" => Ok(PowlNode::Choice {
            children: children("children")?,
        }),
        "loop" => Ok(PowlNode::Loop {
            body: Box::new(powl_from_ex4pm(
                object
                    .get("body")
                    .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("loop_missing_body".into()))?,
            )?),
            redo: Box::new(powl_from_ex4pm(
                object
                    .get("redo")
                    .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("loop_missing_redo".into()))?,
            )?),
        }),
        "hierarchy" => Ok(PowlNode::Hierarchy {
            id: object
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("hierarchy_missing_id".into()))?
                .into(),
            child: Box::new(powl_from_ex4pm(
                object
                    .get("child")
                    .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("hierarchy_missing_child".into()))?,
            )?),
        }),
        "partial_order" => {
            let edges = object
                .get("order")
                .and_then(Value::as_array)
                .ok_or_else(|| Ex4pmBridgeRefusal::InvalidPowl("partial_order_missing_order".into()))?
                .iter()
                .map(|edge| {
                    let pair = edge
                        .as_array()
                        .filter(|pair| pair.len() == 2)
                        .ok_or_else(|| {
                            Ex4pmBridgeRefusal::InvalidPowl(
                                "partial_order_edge_must_have_two_endpoints".into(),
                            )
                        })?;
                    let left = pair[0].as_str().ok_or_else(|| {
                        Ex4pmBridgeRefusal::InvalidPowl(
                            "partial_order_source_must_be_string".into(),
                        )
                    })?;
                    let right = pair[1].as_str().ok_or_else(|| {
                        Ex4pmBridgeRefusal::InvalidPowl(
                            "partial_order_target_must_be_string".into(),
                        )
                    })?;
                    Ok((left.into(), right.into()))
                })
                .collect::<Result<Vec<_>, Ex4pmBridgeRefusal>>()?;

            Ok(PowlNode::PartialOrder {
                children: children("children")?,
                edges,
            })
        }
        other => Ok(PowlNode::Unsupported {
            construct: other.into(),
        }),
    }
}

pub fn portable_subject_from_ex4pm(
    input: &str,
    module_digest: &str,
    parameters_digest: &str,
) -> Result<PortableProcessSubject, Ex4pmBridgeRefusal> {
    let artifact = verify_ex4pm_artifact(input)?;
    let subject = PortableProcessSubject {
        source_digest: required_string(&artifact, "artifact_digest")?.into(),
        process_digest: required_string(&artifact, "payload_digest")?.into(),
        module_digest: module_digest.into(),
        parameters_digest: parameters_digest.into(),
    };
    subject.validate()?;
    Ok(subject)
}

pub fn qualify_ex4pm_powl(
    input: &str,
    compiler_digest: &str,
    module_digest: &str,
) -> Result<PowlPreservationWitness, Ex4pmBridgeRefusal> {
    let artifact = verify_ex4pm_artifact(input)?;
    let kind = required_string(&artifact, "kind")?;
    if kind != "powl" {
        return Err(Ex4pmBridgeRefusal::KindMismatch(kind.into()));
    }

    let payload = artifact
        .get("payload")
        .ok_or_else(|| Ex4pmBridgeRefusal::MissingField("payload".into()))?;
    let model = payload.get("model").unwrap_or(payload);
    let powl = powl_from_ex4pm(model)?;

    powl_preservation_witness(
        required_string(&artifact, "artifact_digest")?,
        compiler_digest,
        module_digest,
        &powl,
    )
    .map_err(Into::into)
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

        let subject =
            portable_subject_from_ex4pm(&input, &digest('b'), &digest('c')).unwrap();
        let artifact = verify_ex4pm_artifact(&input).unwrap();

        assert_eq!(
            subject.source_digest,
            artifact["artifact_digest"].as_str().unwrap()
        );
        assert_eq!(
            subject.process_digest,
            artifact["payload_digest"].as_str().unwrap()
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
    fn powl_bridge_reuses_existing_preservation_court() {
        let input = artifact(json!({
            "type": "hierarchy",
            "id": "order",
            "child": {
                "type": "partial_order",
                "children": ["a", "b"],
                "order": [["a", "b"]]
            }
        }));

        let witness = qualify_ex4pm_powl(&input, &digest('b'), &digest('c')).unwrap();

        assert!(witness.construct_families.contains("hierarchy"));
        assert!(witness.construct_families.contains("partial_order"));
        assert!(witness.hierarchy_ids.contains("order"));
        assert!(witness
            .partial_order_edges
            .contains(&("a".into(), "b".into())));
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
