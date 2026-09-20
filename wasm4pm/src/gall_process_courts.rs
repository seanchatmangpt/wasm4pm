//! GALL-021..023 portable process qualification courts.
//!
//! COMPUTE-only: these functions canonicalize evidence and refuse unbound host
//! capabilities. They contain no filesystem/network/clock/random imports and no
//! external DO surface.

use serde::{Deserialize, Serialize};
use serde_json::Value;
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
}

const FORBIDDEN_IMPORTS: &[&str] = &["clock", "time", "random", "filesystem", "network"];

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
