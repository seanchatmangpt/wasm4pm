//! GALL-021..023 portable process qualification courts.
//!
//! These types qualify already-observed computation results. They do not
//! execute host I/O and expose no external consequence capability.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn digest_json<T: Serialize>(value: &T) -> String {
    sha256(&serde_json::to_vec(value).expect("serializable qualification subject"))
}

fn valid_digest(value: &str) -> bool {
    value
        .strip_prefix("sha256:")
        .is_some_and(|hex| hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableProcessSubject {
    pub source_digest: String,
    pub process_digest: String,
    pub module_digest: String,
    pub parameters_digest: String,
}

impl PortableProcessSubject {
    pub fn validate(&self) -> Result<(), PortabilityRefusal> {
        for (name, value) in [
            ("source_digest", &self.source_digest),
            ("process_digest", &self.process_digest),
            ("module_digest", &self.module_digest),
            ("parameters_digest", &self.parameters_digest),
        ] {
            if !valid_digest(value) {
                return Err(PortabilityRefusal::InvalidDigest(name.into()));
            }
        }
        Ok(())
    }

    pub fn digest(&self) -> String {
        digest_json(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct HostCapabilityFence {
    #[serde(default)]
    pub clock: bool,
    #[serde(default)]
    pub randomness: bool,
    #[serde(default)]
    pub filesystem: bool,
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub explicitly_bound: BTreeSet<String>,
}

impl HostCapabilityFence {
    pub fn validate(&self) -> Result<(), PortabilityRefusal> {
        for (name, present) in [
            ("clock", self.clock),
            ("randomness", self.randomness),
            ("filesystem", self.filesystem),
            ("network", self.network),
        ] {
            if present && !self.explicitly_bound.contains(name) {
                return Err(PortabilityRefusal::UnboundHostCapability(name.into()));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeWitness {
    pub runtime_id: String,
    pub semantic_result_digest: String,
    pub performance_measurement_digest: Option<String>,
    pub host_fence: HostCapabilityFence,
}

impl RuntimeWitness {
    fn validate(&self) -> Result<(), PortabilityRefusal> {
        if self.runtime_id.trim().is_empty() {
            return Err(PortabilityRefusal::MissingRuntimeIdentity);
        }
        if !valid_digest(&self.semantic_result_digest) {
            return Err(PortabilityRefusal::InvalidDigest(
                "semantic_result_digest".into(),
            ));
        }
        if let Some(perf) = &self.performance_measurement_digest {
            if !valid_digest(perf) {
                return Err(PortabilityRefusal::InvalidDigest(
                    "performance_measurement_digest".into(),
                ));
            }
        }
        self.host_fence.validate()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortableExecutionReceipt {
    pub schema: String,
    pub checkpoint: String,
    pub subject_digest: String,
    pub semantic_result_digest: String,
    pub runtimes: Vec<String>,
    pub falsifiers: Vec<String>,
    pub authority: String,
    pub evidence_ceiling: String,
    pub receipt_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PortabilityRefusal {
    InvalidDigest(String),
    MissingRuntimeIdentity,
    NeedTwoIndependentRuntimes,
    DuplicateRuntimeIdentity,
    UnboundHostCapability(String),
    SemanticResultMismatch,
    UnsupportedPowlConstruct(String),
    PowlPreservationMismatch,
    OcpqReferenceMismatch,
    MissingRelationBecamePass,
}

pub fn qualify_portable_execution(
    subject: &PortableProcessSubject,
    witnesses: &[RuntimeWitness],
) -> Result<PortableExecutionReceipt, PortabilityRefusal> {
    subject.validate()?;
    if witnesses.len() < 2 {
        return Err(PortabilityRefusal::NeedTwoIndependentRuntimes);
    }

    let mut runtimes = BTreeSet::new();
    for witness in witnesses {
        witness.validate()?;
        if !runtimes.insert(witness.runtime_id.clone()) {
            return Err(PortabilityRefusal::DuplicateRuntimeIdentity);
        }
    }

    let semantic = &witnesses[0].semantic_result_digest;
    if witnesses
        .iter()
        .any(|w| &w.semantic_result_digest != semantic)
    {
        return Err(PortabilityRefusal::SemanticResultMismatch);
    }

    let mut receipt = PortableExecutionReceipt {
        schema: "gall.portable-process-execution-receipt/1".into(),
        checkpoint: "GALL-021".into(),
        subject_digest: subject.digest(),
        semantic_result_digest: semantic.clone(),
        runtimes: runtimes.into_iter().collect(),
        falsifiers: vec![
            "cross-runtime-semantic-equality".into(),
            "unbound-host-capability-refused".into(),
            "performance-excluded-from-semantic-identity".into(),
        ],
        authority: "NONE".into(),
        evidence_ceiling: "COMPUTE only; no external DO".into(),
        receipt_digest: String::new(),
    };
    receipt.receipt_digest = digest_json(&receipt);
    Ok(receipt)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PowlNode {
    Task { id: String },
    Sequence { children: Vec<PowlNode> },
    PartialOrder {
        children: Vec<PowlNode>,
        edges: Vec<(String, String)>,
    },
    Choice { children: Vec<PowlNode> },
    Loop {
        body: Box<PowlNode>,
        redo: Box<PowlNode>,
    },
    Hierarchy {
        id: String,
        child: Box<PowlNode>,
    },
    Unsupported { construct: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PowlPreservationWitness {
    pub source_digest: String,
    pub compiler_digest: String,
    pub module_digest: String,
    pub semantic_probe_digest: String,
    pub construct_families: BTreeSet<String>,
    pub hierarchy_ids: BTreeSet<String>,
    pub partial_order_edges: BTreeSet<(String, String)>,
}

fn walk_powl(
    node: &PowlNode,
    constructs: &mut BTreeSet<String>,
    hierarchy: &mut BTreeSet<String>,
    edges: &mut BTreeSet<(String, String)>,
) -> Result<(), PortabilityRefusal> {
    match node {
        PowlNode::Task { .. } => {
            constructs.insert("task".into());
        }
        PowlNode::Sequence { children } => {
            constructs.insert("sequence".into());
            for child in children {
                walk_powl(child, constructs, hierarchy, edges)?;
            }
        }
        PowlNode::PartialOrder {
            children,
            edges: declared,
        } => {
            constructs.insert("partial_order".into());
            edges.extend(declared.iter().cloned());
            for child in children {
                walk_powl(child, constructs, hierarchy, edges)?;
            }
        }
        PowlNode::Choice { children } => {
            constructs.insert("choice".into());
            for child in children {
                walk_powl(child, constructs, hierarchy, edges)?;
            }
        }
        PowlNode::Loop { body, redo } => {
            constructs.insert("loop".into());
            walk_powl(body, constructs, hierarchy, edges)?;
            walk_powl(redo, constructs, hierarchy, edges)?;
        }
        PowlNode::Hierarchy { id, child } => {
            constructs.insert("hierarchy".into());
            hierarchy.insert(id.clone());
            walk_powl(child, constructs, hierarchy, edges)?;
        }
        PowlNode::Unsupported { construct } => {
            return Err(PortabilityRefusal::UnsupportedPowlConstruct(
                construct.clone(),
            ));
        }
    }
    Ok(())
}

pub fn powl_preservation_witness(
    source_digest: &str,
    compiler_digest: &str,
    module_digest: &str,
    root: &PowlNode,
) -> Result<PowlPreservationWitness, PortabilityRefusal> {
    for (name, value) in [
        ("source_digest", source_digest),
        ("compiler_digest", compiler_digest),
        ("module_digest", module_digest),
    ] {
        if !valid_digest(value) {
            return Err(PortabilityRefusal::InvalidDigest(name.into()));
        }
    }

    let mut construct_families = BTreeSet::new();
    let mut hierarchy_ids = BTreeSet::new();
    let mut partial_order_edges = BTreeSet::new();
    walk_powl(
        root,
        &mut construct_families,
        &mut hierarchy_ids,
        &mut partial_order_edges,
    )?;

    let probe_subject = (
        &construct_families,
        &hierarchy_ids,
        &partial_order_edges,
        root,
    );
    Ok(PowlPreservationWitness {
        source_digest: source_digest.into(),
        compiler_digest: compiler_digest.into(),
        module_digest: module_digest.into(),
        semantic_probe_digest: digest_json(&probe_subject),
        construct_families,
        hierarchy_ids,
        partial_order_edges,
    })
}

pub fn verify_powl_preservation(
    source: &PowlPreservationWitness,
    lowered: &PowlPreservationWitness,
) -> Result<String, PortabilityRefusal> {
    if source.construct_families != lowered.construct_families
        || source.hierarchy_ids != lowered.hierarchy_ids
        || source.partial_order_edges != lowered.partial_order_edges
    {
        return Err(PortabilityRefusal::PowlPreservationMismatch);
    }
    Ok(digest_json(&(source, lowered)))
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct OcpqViolation {
    pub class: String,
    pub subject: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct OcpqCanonicalResult {
    pub bindings: Vec<BTreeMap<String, String>>,
    pub violations: Vec<OcpqViolation>,
}

impl OcpqCanonicalResult {
    pub fn canonicalized(mut self) -> Self {
        self.bindings.sort_by_key(digest_json);
        self.bindings.dedup();
        self.violations.sort();
        self.violations.dedup();
        self
    }

    pub fn digest(&self) -> String {
        digest_json(&self.clone().canonicalized())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcpqQualificationReceipt {
    pub schema: String,
    pub checkpoint: String,
    pub query_digest: String,
    pub ocel_digest: String,
    pub reference_result_digest: String,
    pub portable_result_digest: String,
    pub authority: String,
    pub receipt_digest: String,
}

pub fn qualify_ocpq(
    query_digest: &str,
    ocel_digest: &str,
    reference: OcpqCanonicalResult,
    portable: OcpqCanonicalResult,
) -> Result<OcpqQualificationReceipt, PortabilityRefusal> {
    if !valid_digest(query_digest) {
        return Err(PortabilityRefusal::InvalidDigest("query_digest".into()));
    }
    if !valid_digest(ocel_digest) {
        return Err(PortabilityRefusal::InvalidDigest("ocel_digest".into()));
    }

    let reference = reference.canonicalized();
    let portable = portable.canonicalized();
    if !reference.violations.is_empty()
        && portable.violations.is_empty()
        && portable.bindings.is_empty()
    {
        return Err(PortabilityRefusal::MissingRelationBecamePass);
    }
    if reference != portable {
        return Err(PortabilityRefusal::OcpqReferenceMismatch);
    }

    let mut receipt = OcpqQualificationReceipt {
        schema: "gall.ocpq-portability-receipt/1".into(),
        checkpoint: "GALL-023".into(),
        query_digest: query_digest.into(),
        ocel_digest: ocel_digest.into(),
        reference_result_digest: reference.digest(),
        portable_result_digest: portable.digest(),
        authority: "NONE".into(),
        receipt_digest: String::new(),
    };
    receipt.receipt_digest = digest_json(&receipt);
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(seed: u8) -> String {
        format!("sha256:{}", std::iter::repeat(seed as char).take(64).collect::<String>())
    }

    #[test]
    fn gall_021_cross_runtime_identity_excludes_performance() {
        let subject = PortableProcessSubject {
            source_digest: d(b'a'),
            process_digest: d(b'b'),
            module_digest: d(b'c'),
            parameters_digest: d(b'd'),
        };
        let semantic = d(b'e');
        let a = RuntimeWitness {
            runtime_id: "wasmtime@1".into(),
            semantic_result_digest: semantic.clone(),
            performance_measurement_digest: Some(d(b'f')),
            host_fence: HostCapabilityFence::default(),
        };
        let b = RuntimeWitness {
            runtime_id: "browser-v8@1".into(),
            semantic_result_digest: semantic.clone(),
            performance_measurement_digest: Some(d(b'0')),
            host_fence: HostCapabilityFence::default(),
        };
        let receipt = qualify_portable_execution(&subject, &[a, b]).unwrap();
        assert_eq!(receipt.semantic_result_digest, semantic);
        assert_eq!(receipt.authority, "NONE");
    }

    #[test]
    fn gall_021_refuses_unbound_nondeterminism_and_semantic_drift() {
        let subject = PortableProcessSubject {
            source_digest: d(b'a'),
            process_digest: d(b'b'),
            module_digest: d(b'c'),
            parameters_digest: d(b'd'),
        };
        let bad = RuntimeWitness {
            runtime_id: "host-a".into(),
            semantic_result_digest: d(b'e'),
            performance_measurement_digest: None,
            host_fence: HostCapabilityFence {
                clock: true,
                ..Default::default()
            },
        };
        assert_eq!(
            qualify_portable_execution(&subject, &[bad.clone(), RuntimeWitness { runtime_id: "host-b".into(), ..bad.clone() }]),
            Err(PortabilityRefusal::UnboundHostCapability("clock".into()))
        );

        let clean = HostCapabilityFence::default();
        assert_eq!(
            qualify_portable_execution(
                &subject,
                &[
                    RuntimeWitness { runtime_id: "host-a".into(), semantic_result_digest: d(b'e'), performance_measurement_digest: None, host_fence: clean.clone() },
                    RuntimeWitness { runtime_id: "host-b".into(), semantic_result_digest: d(b'f'), performance_measurement_digest: None, host_fence: clean },
                ],
            ),
            Err(PortabilityRefusal::SemanticResultMismatch)
        );
    }

    #[test]
    fn gall_022_preserves_partial_order_hierarchy_choice_and_loop() {
        let model = PowlNode::Hierarchy {
            id: "order".into(),
            child: Box::new(PowlNode::PartialOrder {
                children: vec![
                    PowlNode::Task { id: "a".into() },
                    PowlNode::Choice {
                        children: vec![
                            PowlNode::Task { id: "b".into() },
                            PowlNode::Loop {
                                body: Box::new(PowlNode::Task { id: "c".into() }),
                                redo: Box::new(PowlNode::Task { id: "r".into() }),
                            },
                        ],
                    },
                ],
                edges: vec![("a".into(), "b".into())],
            }),
        };
        let witness = powl_preservation_witness(&d(b'a'), &d(b'b'), &d(b'c'), &model).unwrap();
        assert!(witness.construct_families.contains("partial_order"));
        assert!(witness.construct_families.contains("choice"));
        assert!(witness.construct_families.contains("loop"));
        assert!(witness.hierarchy_ids.contains("order"));
        assert!(witness.partial_order_edges.contains(&("a".into(), "b".into())));

        let flattened = PowlNode::Sequence {
            children: vec![
                PowlNode::Task { id: "a".into() },
                PowlNode::Task { id: "b".into() },
            ],
        };
        let changed = powl_preservation_witness(&d(b'a'), &d(b'b'), &d(b'c'), &flattened).unwrap();
        assert_eq!(
            verify_powl_preservation(&witness, &changed),
            Err(PortabilityRefusal::PowlPreservationMismatch)
        );
    }

    #[test]
    fn gall_022_refuses_unsupported_construct() {
        let result = powl_preservation_witness(
            &d(b'a'),
            &d(b'b'),
            &d(b'c'),
            &PowlNode::Unsupported {
                construct: "implicit-race".into(),
            },
        );
        assert_eq!(
            result,
            Err(PortabilityRefusal::UnsupportedPowlConstruct(
                "implicit-race".into()
            ))
        );
    }

    #[test]
    fn gall_023_canonicalizes_binding_order_and_preserves_violations() {
        let mut a = BTreeMap::new();
        a.insert("o".into(), "o1".into());
        let mut b = BTreeMap::new();
        b.insert("o".into(), "o2".into());

        let reference = OcpqCanonicalResult {
            bindings: vec![a.clone(), b.clone()],
            violations: vec![],
        };
        let portable = OcpqCanonicalResult {
            bindings: vec![b, a],
            violations: vec![],
        };
        let receipt = qualify_ocpq(&d(b'a'), &d(b'b'), reference, portable).unwrap();
        assert_eq!(receipt.reference_result_digest, receipt.portable_result_digest);

        let missing = OcpqCanonicalResult {
            bindings: vec![],
            violations: vec![OcpqViolation {
                class: "missing_relation".into(),
                subject: "o1".into(),
            }],
        };
        assert_eq!(
            qualify_ocpq(
                &d(b'a'),
                &d(b'b'),
                missing,
                OcpqCanonicalResult::default()
            ),
            Err(PortabilityRefusal::MissingRelationBecamePass)
        );
    }
}
