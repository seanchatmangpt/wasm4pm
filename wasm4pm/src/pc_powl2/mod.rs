//! Executable PC-POWL2 checker, broker, receipt, replay, and conformance bridge.
//!
//! The Lean `mfw/pc-powl2` library remains the theorem authority. Rust checks a
//! bounded finite observation space directly. No source shape, claimed witness,
//! or locally generated digest receives standing without semantic verification.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::Hash;
use wasm4pm_compat::powl::{ChoiceGraphEdge, OrderEdge, Powl, PowlNode, PowlNodeId, PowlNodeKind};
use wasm4pm_compat::prelude::{
    AssertionRef, AuthorizationEnvelope, CertificateClaim, CertifiedPowl, CycleWitness,
    EdgeContract, ExecutionReceiptShape, ExecutionSelection, GraphNodeProof, ObservedStep,
    PcpRefusal, ProofTerm, VariantRef,
};

pub type PcpResult<T> = Result<T, PcpRefusal>;

/// A finite state domain admitted as O* for exhaustive checking.
///
/// `domain_digest` must identify the implementation of the state, assertion,
/// action, and variant interpreters. The checker additionally binds the digest
/// to the complete enumerated state space, so changing only the enumeration is
/// detected mechanically.
pub trait FiniteStateDomain {
    type State: Clone + Eq + Hash + Serialize + DeserializeOwned;

    fn domain_digest(&self) -> String;
    fn states(&self) -> Vec<Self::State>;
    fn holds(&self, assertion: &AssertionRef, state: &Self::State) -> PcpResult<bool>;
    fn step(&self, action: &str, state: &Self::State) -> Result<Self::State, String>;
    fn variant(&self, variant: &VariantRef, state: &Self::State) -> PcpResult<u64>;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStanding {
    FiniteTraceSafety,
    TotalCorrectness,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerificationReport {
    pub admitted: bool,
    pub standing: VerificationStanding,
    pub checked_states: usize,
    pub domain_digest: String,
    pub model_digest: String,
    pub proof_digest: String,
}

mod broker;
mod checker;
pub mod dfcm;

pub use broker::{replay_receipt, replay_receipt_chain, PcPowl2Broker};
pub use checker::PcPowl2Checker;

fn canonicalize_json(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize_json).collect()),
        Value::Object(values) => {
            let mut entries: Vec<_> = values.into_iter().collect();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut canonical = serde_json::Map::new();
            for (key, value) in entries {
                canonical.insert(key, canonicalize_json(value));
            }
            Value::Object(canonical)
        }
        scalar => scalar,
    }
}

/// BLAKE3 over recursively key-sorted JSON.
///
/// Plain `serde_json::to_vec` is not canonical for user-defined map-backed
/// states. Sorting recursively prevents insertion order from changing standing.
pub fn canonical_digest<T: Serialize>(value: &T) -> PcpResult<String> {
    let value =
        serde_json::to_value(value).map_err(|error| PcpRefusal::ReceiptSerializationFailed {
            reason: error.to_string(),
        })?;
    let bytes = serde_json::to_vec(&canonicalize_json(value)).map_err(|error| {
        PcpRefusal::ReceiptSerializationFailed {
            reason: error.to_string(),
        }
    })?;
    Ok(format!("blake3:{}", blake3::hash(&bytes).to_hex()))
}

fn receipt_digest(receipt: &ExecutionReceiptShape) -> PcpResult<String> {
    let mut material = receipt.clone();
    material.receipt_id.clear();
    material.receipt_digest.clear();
    canonical_digest(&material)
}

fn model_node(model: &Powl, id: PowlNodeId) -> PcpResult<&PowlNode> {
    model
        .nodes
        .iter()
        .find(|node| node.id == id)
        .ok_or(PcpRefusal::UnknownNode { node: id })
}

fn proof_map(proofs: &[ProofTerm]) -> HashMap<PowlNodeId, &ProofTerm> {
    proofs.iter().map(|proof| (proof.node(), proof)).collect()
}

fn collect_proofs<'a>(proof: &'a ProofTerm, proofs: &mut HashMap<PowlNodeId, &'a ProofTerm>) {
    proofs.entry(proof.node()).or_insert(proof);
    match proof {
        ProofTerm::Boundary { .. } | ProofTerm::Atom { .. } => {}
        ProofTerm::Consequence { inner, .. } => collect_proofs(inner, proofs),
        ProofTerm::PartialOrder { children, .. } => {
            for child in children {
                collect_proofs(child, proofs);
            }
        }
        ProofTerm::ChoiceGraph { nodes, .. } => {
            for node in nodes {
                collect_proofs(&node.proof, proofs);
            }
        }
    }
}

fn ordered_pair(left: PowlNodeId, right: PowlNodeId) -> (PowlNodeId, PowlNodeId) {
    if left <= right {
        (left, right)
    } else {
        (right, left)
    }
}

fn partial_edges(model: &Powl, children: &[PowlNodeId]) -> Vec<OrderEdge> {
    let set: HashSet<_> = children.iter().copied().collect();
    model
        .edges
        .iter()
        .copied()
        .filter(|edge| set.contains(&edge.from) && set.contains(&edge.to))
        .collect()
}

fn is_topological_order(model: &Powl, children: &[PowlNodeId], order: &[PowlNodeId]) -> bool {
    if order.len() != children.len() {
        return false;
    }
    let child_set: HashSet<_> = children.iter().copied().collect();
    let order_set: HashSet<_> = order.iter().copied().collect();
    if child_set != order_set || order_set.len() != order.len() {
        return false;
    }
    let positions: HashMap<_, _> = order
        .iter()
        .copied()
        .enumerate()
        .map(|(index, node)| (node, index))
        .collect();
    partial_edges(model, children).iter().all(|edge| {
        positions.get(&edge.from).copied().unwrap_or(usize::MAX)
            < positions.get(&edge.to).copied().unwrap_or(0)
    })
}

fn reachable_order(start: PowlNodeId, target: PowlNodeId, edges: &[OrderEdge]) -> bool {
    let mut stack = vec![start];
    let mut seen = HashSet::new();
    while let Some(node) = stack.pop() {
        if node == target {
            return true;
        }
        if !seen.insert(node) {
            continue;
        }
        stack.extend(
            edges
                .iter()
                .filter(|edge| edge.from == node)
                .map(|edge| edge.to),
        );
    }
    false
}

fn incomparable_pairs(model: &Powl, children: &[PowlNodeId]) -> Vec<(PowlNodeId, PowlNodeId)> {
    let edges = partial_edges(model, children);
    let mut pairs = Vec::new();
    for (index, left) in children.iter().copied().enumerate() {
        for right in children.iter().copied().skip(index + 1) {
            if !reachable_order(left, right, &edges) && !reachable_order(right, left, &edges) {
                pairs.push(ordered_pair(left, right));
            }
        }
    }
    pairs
}

fn graph_adjacency(edges: &[ChoiceGraphEdge]) -> HashMap<PowlNodeId, Vec<PowlNodeId>> {
    let mut adjacency: HashMap<PowlNodeId, Vec<PowlNodeId>> = HashMap::new();
    for edge in edges {
        adjacency.entry(edge.from).or_default().push(edge.to);
    }
    adjacency
}

fn reachable_choice(start: PowlNodeId, target: PowlNodeId, edges: &[ChoiceGraphEdge]) -> bool {
    let adjacency = graph_adjacency(edges);
    let mut stack = vec![start];
    let mut seen = HashSet::new();
    while let Some(node) = stack.pop() {
        if node == target {
            return true;
        }
        if !seen.insert(node) {
            continue;
        }
        if let Some(next) = adjacency.get(&node) {
            stack.extend(next.iter().copied());
        }
    }
    false
}

fn cyclic_edges(edges: &[ChoiceGraphEdge]) -> Vec<ChoiceGraphEdge> {
    edges
        .iter()
        .copied()
        .filter(|edge| reachable_choice(edge.to, edge.from, edges))
        .collect()
}

fn choice_terminals(
    model: &Powl,
    graph_nodes: &[PowlNodeId],
) -> PcpResult<(PowlNodeId, PowlNodeId)> {
    let start = *graph_nodes.first().ok_or(PcpRefusal::MissingModelRoot)?;
    let finish = *graph_nodes.last().ok_or(PcpRefusal::MissingModelRoot)?;
    if !matches!(&model_node(model, start)?.kind, PowlNodeKind::Start)
        || !matches!(&model_node(model, finish)?.kind, PowlNodeKind::End)
    {
        return Err(PcpRefusal::GraphContractCoverageMismatch { node: start });
    }
    Ok((start, finish))
}

#[cfg(test)]
mod tests;
