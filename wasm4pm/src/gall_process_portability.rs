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
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    })
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

impl PortableExecutionReceipt {
    /// Replay check: recompute the digest over every field except
    /// `receipt_digest` and refuse on mismatch.
    pub fn verify_digest(&self) -> Result<(), PortabilityRefusal> {
        let mut unsigned = self.clone();
        unsigned.receipt_digest = String::new();
        if digest_json(&unsigned) != self.receipt_digest {
            return Err(PortabilityRefusal::ReceiptDigestMismatch);
        }
        Ok(())
    }
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
    /// Runtime identity carries surrounding whitespace or control characters,
    /// so two "independent" runtimes could be the same host spelled twice.
    NonCanonicalRuntimeIdentity(String),
    /// Source and lowered witnesses name different admitted POWL subjects
    /// (GALL-022 ARD: source POWL digest mismatch => REFUSED).
    SourceDigestMismatch,
    /// Canonical semantic probes of source and lowered POWL diverge
    /// (GALL-022 ARD: semantic probe divergence => FAIL).
    SemanticProbeDivergence,
    /// A partial-order edge names an endpoint absent from its subtree, is a
    /// self-loop, or the declared edges contain a cycle.
    MalformedPartialOrder(String),
    /// POWL nesting exceeds [`MAX_POWL_DEPTH`]; refused before recursion can
    /// exhaust the stack.
    PowlDepthExceeded,
    /// A receipt's `receipt_digest` does not match the recomputed digest of its
    /// own fields (replay mismatch / tampering).
    ReceiptDigestMismatch,
}

/// Maximum admitted POWL nesting depth. Deeper models are refused, never
/// walked, so adversarial input cannot overflow the stack.
pub const MAX_POWL_DEPTH: usize = 256;

fn runtime_identity_key(id: &str) -> Result<String, PortabilityRefusal> {
    if id.trim().is_empty() {
        return Err(PortabilityRefusal::MissingRuntimeIdentity);
    }
    if id.trim() != id || id.chars().any(char::is_control) {
        return Err(PortabilityRefusal::NonCanonicalRuntimeIdentity(id.into()));
    }
    Ok(id.to_ascii_lowercase())
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
    let mut identity_keys = BTreeSet::new();
    for witness in witnesses {
        witness.validate()?;
        let key = runtime_identity_key(&witness.runtime_id)?;
        if !identity_keys.insert(key) {
            return Err(PortabilityRefusal::DuplicateRuntimeIdentity);
        }
        runtimes.insert(witness.runtime_id.clone());
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
    Task {
        id: String,
    },
    Sequence {
        children: Vec<PowlNode>,
    },
    PartialOrder {
        children: Vec<PowlNode>,
        edges: Vec<(String, String)>,
    },
    Choice {
        children: Vec<PowlNode>,
    },
    Loop {
        body: Box<PowlNode>,
        redo: Box<PowlNode>,
    },
    Hierarchy {
        id: String,
        child: Box<PowlNode>,
    },
    Unsupported {
        construct: String,
    },
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
    /// Every task/activity identity in the model; a lowering that renames or
    /// drops a task changes this set.
    #[serde(default)]
    pub task_ids: BTreeSet<String>,
}

fn subtree_ids(node: &PowlNode, out: &mut BTreeSet<String>) {
    match node {
        PowlNode::Task { id } => {
            out.insert(id.clone());
        }
        PowlNode::Hierarchy { id, child } => {
            out.insert(id.clone());
            subtree_ids(child, out);
        }
        PowlNode::Sequence { children }
        | PowlNode::Choice { children }
        | PowlNode::PartialOrder { children, .. } => {
            for child in children {
                subtree_ids(child, out);
            }
        }
        PowlNode::Loop { body, redo } => {
            subtree_ids(body, out);
            subtree_ids(redo, out);
        }
        PowlNode::Unsupported { .. } => {}
    }
}

fn validate_partial_order(
    children: &[PowlNode],
    edges: &[(String, String)],
) -> Result<(), PortabilityRefusal> {
    let mut ids = BTreeSet::new();
    for child in children {
        subtree_ids(child, &mut ids);
    }
    let mut adjacency: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (from, to) in edges {
        if from == to {
            return Err(PortabilityRefusal::MalformedPartialOrder(format!(
                "self-loop {from}"
            )));
        }
        for endpoint in [from, to] {
            if !ids.contains(endpoint) {
                return Err(PortabilityRefusal::MalformedPartialOrder(format!(
                    "unknown endpoint {endpoint}"
                )));
            }
        }
        adjacency
            .entry(from.as_str())
            .or_default()
            .push(to.as_str());
    }
    // Kahn's algorithm: a partial order's edge relation must be acyclic.
    let mut indegree: BTreeMap<&str, usize> = BTreeMap::new();
    for (from, to) in edges {
        indegree.entry(from.as_str()).or_insert(0);
        *indegree.entry(to.as_str()).or_insert(0) += 1;
    }
    let mut ready: Vec<&str> = indegree
        .iter()
        .filter(|(_, d)| **d == 0)
        .map(|(n, _)| *n)
        .collect();
    let mut seen = 0usize;
    while let Some(node) = ready.pop() {
        seen += 1;
        if let Some(next) = adjacency.get(node) {
            for target in next {
                let d = indegree.get_mut(target).expect("endpoint indexed");
                *d -= 1;
                if *d == 0 {
                    ready.push(target);
                }
            }
        }
    }
    if seen != indegree.len() {
        return Err(PortabilityRefusal::MalformedPartialOrder("cycle".into()));
    }
    Ok(())
}

/// Canonical semantic form: children of order-insensitive constructs
/// (choice, partial order) and partial-order edges are sorted; sequence and
/// loop structure is kept exactly.
fn canonical_powl(node: &PowlNode) -> PowlNode {
    fn sorted(children: &[PowlNode]) -> Vec<PowlNode> {
        let mut keyed: Vec<(String, PowlNode)> = children
            .iter()
            .map(|c| {
                let c = canonical_powl(c);
                (digest_json(&c), c)
            })
            .collect();
        keyed.sort_by(|a, b| a.0.cmp(&b.0));
        keyed.into_iter().map(|(_, c)| c).collect()
    }
    match node {
        PowlNode::Task { .. } | PowlNode::Unsupported { .. } => node.clone(),
        PowlNode::Sequence { children } => PowlNode::Sequence {
            children: children.iter().map(canonical_powl).collect(),
        },
        PowlNode::Choice { children } => PowlNode::Choice {
            children: sorted(children),
        },
        PowlNode::PartialOrder { children, edges } => {
            let mut edges = edges.clone();
            edges.sort();
            edges.dedup();
            PowlNode::PartialOrder {
                children: sorted(children),
                edges,
            }
        }
        PowlNode::Loop { body, redo } => PowlNode::Loop {
            body: Box::new(canonical_powl(body)),
            redo: Box::new(canonical_powl(redo)),
        },
        PowlNode::Hierarchy { id, child } => PowlNode::Hierarchy {
            id: id.clone(),
            child: Box::new(canonical_powl(child)),
        },
    }
}

fn powl_depth_within(node: &PowlNode, depth: usize) -> bool {
    // Iterative so the depth check itself cannot overflow the stack.
    let mut stack = vec![(node, depth)];
    while let Some((node, depth)) = stack.pop() {
        if depth > MAX_POWL_DEPTH {
            return false;
        }
        match node {
            PowlNode::Task { .. } | PowlNode::Unsupported { .. } => {}
            PowlNode::Sequence { children }
            | PowlNode::Choice { children }
            | PowlNode::PartialOrder { children, .. } => {
                stack.extend(children.iter().map(|c| (c, depth + 1)));
            }
            PowlNode::Loop { body, redo } => {
                stack.push((body, depth + 1));
                stack.push((redo, depth + 1));
            }
            PowlNode::Hierarchy { child, .. } => stack.push((child, depth + 1)),
        }
    }
    true
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
            validate_partial_order(children, declared)?;
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

    if !powl_depth_within(root, 1) {
        return Err(PortabilityRefusal::PowlDepthExceeded);
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

    let mut task_ids = BTreeSet::new();
    collect_task_ids(root, &mut task_ids);

    let canonical = canonical_powl(root);
    let probe_subject = (
        &construct_families,
        &hierarchy_ids,
        &partial_order_edges,
        &task_ids,
        &canonical,
    );
    Ok(PowlPreservationWitness {
        source_digest: source_digest.into(),
        compiler_digest: compiler_digest.into(),
        module_digest: module_digest.into(),
        semantic_probe_digest: digest_json(&probe_subject),
        construct_families,
        hierarchy_ids,
        partial_order_edges,
        task_ids,
    })
}

fn collect_task_ids(node: &PowlNode, out: &mut BTreeSet<String>) {
    let mut stack = vec![node];
    while let Some(node) = stack.pop() {
        match node {
            PowlNode::Task { id } => {
                out.insert(id.clone());
            }
            PowlNode::Unsupported { .. } => {}
            PowlNode::Sequence { children }
            | PowlNode::Choice { children }
            | PowlNode::PartialOrder { children, .. } => stack.extend(children.iter()),
            PowlNode::Loop { body, redo } => {
                stack.push(body);
                stack.push(redo);
            }
            PowlNode::Hierarchy { child, .. } => stack.push(child),
        }
    }
}

pub fn verify_powl_preservation(
    source: &PowlPreservationWitness,
    lowered: &PowlPreservationWitness,
) -> Result<String, PortabilityRefusal> {
    if source.source_digest != lowered.source_digest {
        return Err(PortabilityRefusal::SourceDigestMismatch);
    }
    if source.construct_families != lowered.construct_families
        || source.hierarchy_ids != lowered.hierarchy_ids
        || source.partial_order_edges != lowered.partial_order_edges
        || source.task_ids != lowered.task_ids
    {
        return Err(PortabilityRefusal::PowlPreservationMismatch);
    }
    if source.semantic_probe_digest != lowered.semantic_probe_digest {
        return Err(PortabilityRefusal::SemanticProbeDivergence);
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
        // BTreeMap<String, String> is totally ordered by its canonical
        // (sorted-key) content, so this order is host-independent without
        // hashing every binding on every comparison.
        self.bindings.sort();
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

impl OcpqQualificationReceipt {
    /// Replay check: recompute the digest over every field except
    /// `receipt_digest` and refuse on mismatch.
    pub fn verify_digest(&self) -> Result<(), PortabilityRefusal> {
        let mut unsigned = self.clone();
        unsigned.receipt_digest = String::new();
        if digest_json(&unsigned) != self.receipt_digest {
            return Err(PortabilityRefusal::ReceiptDigestMismatch);
        }
        Ok(())
    }
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
        format!(
            "sha256:{}",
            std::iter::repeat(seed as char).take(64).collect::<String>()
        )
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
            qualify_portable_execution(
                &subject,
                &[
                    bad.clone(),
                    RuntimeWitness {
                        runtime_id: "host-b".into(),
                        ..bad.clone()
                    }
                ]
            ),
            Err(PortabilityRefusal::UnboundHostCapability("clock".into()))
        );

        let clean = HostCapabilityFence::default();
        assert_eq!(
            qualify_portable_execution(
                &subject,
                &[
                    RuntimeWitness {
                        runtime_id: "host-a".into(),
                        semantic_result_digest: d(b'e'),
                        performance_measurement_digest: None,
                        host_fence: clean.clone()
                    },
                    RuntimeWitness {
                        runtime_id: "host-b".into(),
                        semantic_result_digest: d(b'f'),
                        performance_measurement_digest: None,
                        host_fence: clean
                    },
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
        assert!(witness
            .partial_order_edges
            .contains(&("a".into(), "b".into())));

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
        assert_eq!(
            receipt.reference_result_digest,
            receipt.portable_result_digest
        );

        let missing = OcpqCanonicalResult {
            bindings: vec![],
            violations: vec![OcpqViolation {
                class: "missing_relation".into(),
                subject: "o1".into(),
            }],
        };
        assert_eq!(
            qualify_ocpq(&d(b'a'), &d(b'b'), missing, OcpqCanonicalResult::default()),
            Err(PortabilityRefusal::MissingRelationBecamePass)
        );
    }

    // ---- Hardening: boundary / negative / adversarial falsifiers ----

    fn subject() -> PortableProcessSubject {
        PortableProcessSubject {
            source_digest: d(b'a'),
            process_digest: d(b'b'),
            module_digest: d(b'c'),
            parameters_digest: d(b'd'),
        }
    }

    fn witness(runtime: &str, semantic: &str) -> RuntimeWitness {
        RuntimeWitness {
            runtime_id: runtime.into(),
            semantic_result_digest: semantic.into(),
            performance_measurement_digest: None,
            host_fence: HostCapabilityFence::default(),
        }
    }

    #[test]
    fn hardening_021_malformed_digests_refused() {
        for bad in [
            String::new(),
            "sha256:".into(),
            format!("sha256:{}", "A".repeat(64)),
            format!("sha256:{}", "a".repeat(63)),
            format!("sha256:{}", "a".repeat(65)),
            format!("sha256:{}", "g".repeat(64)),
            format!("sha512:{}", "a".repeat(64)),
            format!(" sha256:{}", "a".repeat(64)),
        ] {
            let mut s = subject();
            s.module_digest = bad.clone();
            assert_eq!(
                qualify_portable_execution(&s, &[witness("a", &d(b'e')), witness("b", &d(b'e'))]),
                Err(PortabilityRefusal::InvalidDigest("module_digest".into())),
                "digest {bad:?} must be refused"
            );
            assert_eq!(
                qualify_portable_execution(&subject(), &[witness("a", &bad), witness("b", &bad)]),
                Err(PortabilityRefusal::InvalidDigest(
                    "semantic_result_digest".into()
                ))
            );
        }
    }

    #[test]
    fn hardening_021_single_or_zero_runtime_refused() {
        assert_eq!(
            qualify_portable_execution(&subject(), &[]),
            Err(PortabilityRefusal::NeedTwoIndependentRuntimes)
        );
        assert_eq!(
            qualify_portable_execution(&subject(), &[witness("a", &d(b'e'))]),
            Err(PortabilityRefusal::NeedTwoIndependentRuntimes)
        );
    }

    #[test]
    fn hardening_021_duplicate_delivery_and_spelling_variants_refused() {
        let w = witness("wasmtime@1", &d(b'e'));
        assert_eq!(
            qualify_portable_execution(&subject(), &[w.clone(), w.clone()]),
            Err(PortabilityRefusal::DuplicateRuntimeIdentity)
        );
        assert_eq!(
            qualify_portable_execution(&subject(), &[w.clone(), witness("WASMTIME@1", &d(b'e'))]),
            Err(PortabilityRefusal::DuplicateRuntimeIdentity)
        );
        assert_eq!(
            qualify_portable_execution(&subject(), &[w.clone(), witness("wasmtime@1 ", &d(b'e'))]),
            Err(PortabilityRefusal::NonCanonicalRuntimeIdentity(
                "wasmtime@1 ".into()
            ))
        );
        assert_eq!(
            qualify_portable_execution(&subject(), &[w, witness("wasm\ttime", &d(b'e'))]),
            Err(PortabilityRefusal::NonCanonicalRuntimeIdentity(
                "wasm\ttime".into()
            ))
        );
        assert_eq!(
            qualify_portable_execution(
                &subject(),
                &[witness("  ", &d(b'e')), witness("b", &d(b'e'))]
            ),
            Err(PortabilityRefusal::MissingRuntimeIdentity)
        );
    }

    #[test]
    fn hardening_021_every_host_capability_needs_explicit_binding() {
        for cap in ["clock", "randomness", "filesystem", "network"] {
            let mut fence = HostCapabilityFence::default();
            match cap {
                "clock" => fence.clock = true,
                "randomness" => fence.randomness = true,
                "filesystem" => fence.filesystem = true,
                _ => fence.network = true,
            }
            let mut a = witness("a", &d(b'e'));
            a.host_fence = fence.clone();
            assert_eq!(
                qualify_portable_execution(&subject(), &[a.clone(), witness("b", &d(b'e'))]),
                Err(PortabilityRefusal::UnboundHostCapability(cap.into()))
            );
            // Binding a *different* capability name does not admit this one.
            a.host_fence.explicitly_bound.insert("other".into());
            assert!(
                qualify_portable_execution(&subject(), &[a.clone(), witness("b", &d(b'e'))])
                    .is_err()
            );
            a.host_fence.explicitly_bound.insert(cap.into());
            assert!(qualify_portable_execution(&subject(), &[a, witness("b", &d(b'e'))]).is_ok());
        }
    }

    #[test]
    fn hardening_021_reordering_witnesses_yields_identical_receipt() {
        let a = witness("wasmtime@1", &d(b'e'));
        let b = witness("browser-v8@1", &d(b'e'));
        let c = witness("wasmer@4", &d(b'e'));
        let r1 =
            qualify_portable_execution(&subject(), &[a.clone(), b.clone(), c.clone()]).unwrap();
        let r2 = qualify_portable_execution(&subject(), &[c, a, b]).unwrap();
        assert_eq!(r1, r2);
        assert_eq!(r1.runtimes, vec!["browser-v8@1", "wasmer@4", "wasmtime@1"]);
    }

    #[test]
    fn hardening_021_stale_subject_changes_receipt_identity() {
        let ws = [witness("a", &d(b'e')), witness("b", &d(b'e'))];
        let fresh = qualify_portable_execution(&subject(), &ws).unwrap();
        let mut stale = subject();
        stale.module_digest = d(b'9');
        let other = qualify_portable_execution(&stale, &ws).unwrap();
        assert_ne!(fresh.subject_digest, other.subject_digest);
        assert_ne!(fresh.receipt_digest, other.receipt_digest);
    }

    #[test]
    fn hardening_021_receipt_replay_detects_tampering() {
        let receipt = qualify_portable_execution(
            &subject(),
            &[witness("a", &d(b'e')), witness("b", &d(b'e'))],
        )
        .unwrap();
        assert_eq!(receipt.verify_digest(), Ok(()));
        for tamper in 0..5 {
            let mut t = receipt.clone();
            match tamper {
                0 => t.authority = "DO".into(),
                1 => t.semantic_result_digest = d(b'f'),
                2 => t.runtimes.push("ghost".into()),
                3 => t.falsifiers.clear(),
                _ => t.subject_digest = d(b'0'),
            }
            assert_eq!(
                t.verify_digest(),
                Err(PortabilityRefusal::ReceiptDigestMismatch)
            );
        }
        // Replay over serialization round-trip is byte-stable.
        let json = serde_json::to_string(&receipt).unwrap();
        let back: PortableExecutionReceipt = serde_json::from_str(&json).unwrap();
        assert_eq!(back.verify_digest(), Ok(()));
        assert_eq!(serde_json::to_string(&back).unwrap(), json);
    }

    fn task(id: &str) -> PowlNode {
        PowlNode::Task { id: id.into() }
    }

    fn pw(root: &PowlNode) -> Result<PowlPreservationWitness, PortabilityRefusal> {
        powl_preservation_witness(&d(b'a'), &d(b'b'), &d(b'c'), root)
    }

    #[test]
    fn hardening_022_source_digest_mismatch_refused() {
        let model = PowlNode::Sequence {
            children: vec![task("a"), task("b")],
        };
        let src = pw(&model).unwrap();
        let other = powl_preservation_witness(&d(b'9'), &d(b'b'), &d(b'c'), &model).unwrap();
        assert_eq!(
            verify_powl_preservation(&src, &other),
            Err(PortabilityRefusal::SourceDigestMismatch)
        );
    }

    #[test]
    fn hardening_022_sequence_reorder_and_task_rename_are_divergence() {
        let ab = pw(&PowlNode::Sequence {
            children: vec![task("a"), task("b")],
        })
        .unwrap();
        let ba = pw(&PowlNode::Sequence {
            children: vec![task("b"), task("a")],
        })
        .unwrap();
        let xy = pw(&PowlNode::Sequence {
            children: vec![task("x"), task("y")],
        })
        .unwrap();
        assert_eq!(
            verify_powl_preservation(&ab, &ba),
            Err(PortabilityRefusal::SemanticProbeDivergence)
        );
        assert_eq!(
            verify_powl_preservation(&ab, &xy),
            Err(PortabilityRefusal::PowlPreservationMismatch)
        );
        assert!(verify_powl_preservation(&ab, &ab.clone()).is_ok());
    }

    #[test]
    fn hardening_022_order_insensitive_constructs_are_canonical() {
        let c1 = PowlNode::Choice {
            children: vec![task("a"), task("b")],
        };
        let c2 = PowlNode::Choice {
            children: vec![task("b"), task("a")],
        };
        assert!(verify_powl_preservation(&pw(&c1).unwrap(), &pw(&c2).unwrap()).is_ok());
        let p1 = PowlNode::PartialOrder {
            children: vec![task("a"), task("b"), task("c")],
            edges: vec![("a".into(), "b".into()), ("a".into(), "c".into())],
        };
        let p2 = PowlNode::PartialOrder {
            children: vec![task("c"), task("a"), task("b")],
            edges: vec![("a".into(), "c".into()), ("a".into(), "b".into())],
        };
        assert!(verify_powl_preservation(&pw(&p1).unwrap(), &pw(&p2).unwrap()).is_ok());
        // Loop body/redo are not interchangeable.
        let l1 = PowlNode::Loop {
            body: Box::new(task("a")),
            redo: Box::new(task("b")),
        };
        let l2 = PowlNode::Loop {
            body: Box::new(task("b")),
            redo: Box::new(task("a")),
        };
        assert!(verify_powl_preservation(&pw(&l1).unwrap(), &pw(&l2).unwrap()).is_err());
    }

    #[test]
    fn hardening_022_partial_order_collapse_to_sequence_refused() {
        let po = PowlNode::PartialOrder {
            children: vec![task("a"), task("b")],
            edges: vec![],
        };
        let seq = PowlNode::Sequence {
            children: vec![task("a"), task("b")],
        };
        assert_eq!(
            verify_powl_preservation(&pw(&po).unwrap(), &pw(&seq).unwrap()),
            Err(PortabilityRefusal::PowlPreservationMismatch)
        );
    }

    #[test]
    fn hardening_022_malformed_partial_orders_refused() {
        let cyc = PowlNode::PartialOrder {
            children: vec![task("a"), task("b"), task("c")],
            edges: vec![
                ("a".into(), "b".into()),
                ("b".into(), "c".into()),
                ("c".into(), "a".into()),
            ],
        };
        assert_eq!(
            pw(&cyc),
            Err(PortabilityRefusal::MalformedPartialOrder("cycle".into()))
        );
        let selfloop = PowlNode::PartialOrder {
            children: vec![task("a")],
            edges: vec![("a".into(), "a".into())],
        };
        assert_eq!(
            pw(&selfloop),
            Err(PortabilityRefusal::MalformedPartialOrder(
                "self-loop a".into()
            ))
        );
        let dangling = PowlNode::PartialOrder {
            children: vec![task("a")],
            edges: vec![("a".into(), "z".into())],
        };
        assert_eq!(
            pw(&dangling),
            Err(PortabilityRefusal::MalformedPartialOrder(
                "unknown endpoint z".into()
            ))
        );
    }

    #[test]
    fn hardening_022_nested_unsupported_construct_refused() {
        let model = PowlNode::Hierarchy {
            id: "h".into(),
            child: Box::new(PowlNode::Choice {
                children: vec![
                    task("a"),
                    PowlNode::Unsupported {
                        construct: "or-join".into(),
                    },
                ],
            }),
        };
        assert_eq!(
            pw(&model),
            Err(PortabilityRefusal::UnsupportedPowlConstruct(
                "or-join".into()
            ))
        );
    }

    #[test]
    fn hardening_022_adversarial_depth_refused_without_stack_overflow() {
        let mut node = task("leaf");
        for i in 0..100_000 {
            node = PowlNode::Hierarchy {
                id: format!("h{i}"),
                child: Box::new(node),
            };
        }
        assert_eq!(pw(&node), Err(PortabilityRefusal::PowlDepthExceeded));
        // Drop iteratively: the default recursive Drop of a 100k-deep Box chain
        // would itself overflow the test thread's stack.
        let mut cur = node;
        while let PowlNode::Hierarchy { child, .. } = cur {
            cur = *child;
        }
        let mut ok = task("leaf");
        for i in 0..(MAX_POWL_DEPTH - 1) {
            ok = PowlNode::Hierarchy {
                id: format!("h{i}"),
                child: Box::new(ok),
            };
        }
        assert!(pw(&ok).is_ok());
    }

    #[test]
    fn hardening_022_witness_is_deterministic_and_serde_roundtrips() {
        let model = PowlNode::Hierarchy {
            id: "order".into(),
            child: Box::new(PowlNode::PartialOrder {
                children: vec![task("a"), task("b")],
                edges: vec![("a".into(), "b".into())],
            }),
        };
        let a = pw(&model).unwrap();
        let b = pw(&model).unwrap();
        assert_eq!(a, b);
        let json = serde_json::to_string(&model).unwrap();
        let back: PowlNode = serde_json::from_str(&json).unwrap();
        assert_eq!(pw(&back).unwrap(), a);
        // Malformed JSON input (unknown kind) is refused at the parse boundary.
        assert!(serde_json::from_str::<PowlNode>(r#"{"kind":"race","id":"x"}"#).is_err());
    }

    fn binding(o: &str) -> BTreeMap<String, String> {
        let mut m = BTreeMap::new();
        m.insert("o".into(), o.into());
        m
    }

    #[test]
    fn hardening_023_malformed_query_or_ocel_digest_refused() {
        let r = OcpqCanonicalResult::default();
        assert_eq!(
            qualify_ocpq("sha256:x", &d(b'b'), r.clone(), r.clone()),
            Err(PortabilityRefusal::InvalidDigest("query_digest".into()))
        );
        assert_eq!(
            qualify_ocpq(&d(b'a'), "", r.clone(), r),
            Err(PortabilityRefusal::InvalidDigest("ocel_digest".into()))
        );
    }

    #[test]
    fn hardening_023_dropped_or_extra_binding_is_mismatch() {
        let reference = OcpqCanonicalResult {
            bindings: vec![binding("o1"), binding("o2")],
            violations: vec![],
        };
        let dropped = OcpqCanonicalResult {
            bindings: vec![binding("o1")],
            violations: vec![],
        };
        let extra = OcpqCanonicalResult {
            bindings: vec![binding("o1"), binding("o2"), binding("o3")],
            violations: vec![],
        };
        assert_eq!(
            qualify_ocpq(&d(b'a'), &d(b'b'), reference.clone(), dropped),
            Err(PortabilityRefusal::OcpqReferenceMismatch)
        );
        assert_eq!(
            qualify_ocpq(&d(b'a'), &d(b'b'), reference, extra),
            Err(PortabilityRefusal::OcpqReferenceMismatch)
        );
    }

    #[test]
    fn hardening_023_violation_class_change_is_mismatch() {
        let v = |class: &str| OcpqViolation {
            class: class.into(),
            subject: "o1".into(),
        };
        let reference = OcpqCanonicalResult {
            bindings: vec![],
            violations: vec![v("missing_relation")],
        };
        let portable = OcpqCanonicalResult {
            bindings: vec![],
            violations: vec![v("cardinality")],
        };
        assert_eq!(
            qualify_ocpq(&d(b'a'), &d(b'b'), reference, portable),
            Err(PortabilityRefusal::OcpqReferenceMismatch)
        );
    }

    #[test]
    fn hardening_023_duplicate_delivery_and_permutation_are_set_identical() {
        let v1 = OcpqViolation {
            class: "missing_relation".into(),
            subject: "o1".into(),
        };
        let v2 = OcpqViolation {
            class: "missing_relation".into(),
            subject: "o2".into(),
        };
        let reference = OcpqCanonicalResult {
            bindings: vec![binding("o1"), binding("o2")],
            violations: vec![v1.clone(), v2.clone()],
        };
        let portable = OcpqCanonicalResult {
            bindings: vec![binding("o2"), binding("o1"), binding("o2")],
            violations: vec![v2.clone(), v1.clone(), v2],
        };
        let r1 = qualify_ocpq(&d(b'a'), &d(b'b'), reference.clone(), portable.clone()).unwrap();
        let r2 = qualify_ocpq(&d(b'a'), &d(b'b'), portable, reference).unwrap();
        assert_eq!(r1.portable_result_digest, r2.portable_result_digest);
        assert_eq!(r1.receipt_digest, r2.receipt_digest);
    }

    #[test]
    fn hardening_023_receipt_replay_detects_tampering() {
        let r = OcpqCanonicalResult {
            bindings: vec![binding("o1")],
            violations: vec![],
        };
        let receipt = qualify_ocpq(&d(b'a'), &d(b'b'), r.clone(), r).unwrap();
        assert_eq!(receipt.verify_digest(), Ok(()));
        let mut t = receipt.clone();
        t.ocel_digest = d(b'9');
        assert_eq!(
            t.verify_digest(),
            Err(PortabilityRefusal::ReceiptDigestMismatch)
        );
        let mut t = receipt;
        t.authority = "DO".into();
        assert_eq!(
            t.verify_digest(),
            Err(PortabilityRefusal::ReceiptDigestMismatch)
        );
    }

    #[test]
    fn hardening_023_canonicalization_regression_bound() {
        // Regression bound for the canonical binding sort (see
        // benches/gall_process_portability.rs and receipts bench JSON). Debug
        // build, generous ceiling: 20k bindings must canonicalize well under 5s.
        let bindings: Vec<_> = (0..20_000u32)
            .rev()
            .map(|i| binding(&format!("o{i:06}")))
            .collect();
        let started = std::time::Instant::now();
        let canon = OcpqCanonicalResult {
            bindings,
            violations: vec![],
        }
        .canonicalized();
        let elapsed = started.elapsed();
        assert_eq!(canon.bindings.len(), 20_000);
        assert!(canon.bindings.windows(2).all(|w| w[0] < w[1]));
        assert!(
            elapsed.as_secs_f64() < 5.0,
            "canonicalization took {elapsed:?}"
        );
    }
}
