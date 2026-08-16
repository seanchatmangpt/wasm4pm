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

/// External actuation and observation boundary for one verified atomic step.
///
/// The checker supplies the pure model's expected successor. Implementations
/// must perform the real effect (or query an already-performed effect) and
/// return the observed successor state. The checker refuses any divergence.
/// Internal refinement adapter used only to falsify divergence between a pure
/// transition and an adapter-returned successor. This is not public host
/// actuation authority: the v1 receipt schema carries no independently
/// verifiable external evidence or transactional commit witness.
pub(crate) trait PcPowl2Actuator<D: FiniteStateDomain> {
    fn actuate(
        &mut self,
        action: &str,
        before: &D::State,
        expected_after: &D::State,
    ) -> Result<D::State, String>;
}

/// Explicit pure-model executor. Receipts produced with this actuator prove
/// model execution and replay, not external host actuation.
pub(crate) struct ModelActuator;

impl<D: FiniteStateDomain> PcPowl2Actuator<D> for ModelActuator {
    fn actuate(
        &mut self,
        _action: &str,
        _before: &D::State,
        expected_after: &D::State,
    ) -> Result<D::State, String> {
        Ok(expected_after.clone())
    }
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
mod commutation;
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
    let fallback = graph_nodes
        .first()
        .copied()
        .ok_or(PcpRefusal::MissingModelRoot)?;
    let graph_set: HashSet<_> = graph_nodes.iter().copied().collect();
    if graph_set.len() != graph_nodes.len() {
        return Err(PcpRefusal::GraphContractCoverageMismatch { node: fallback });
    }

    let mut starts = Vec::new();
    let mut finishes = Vec::new();
    for node_id in graph_nodes {
        match &model_node(model, *node_id)?.kind {
            PowlNodeKind::Start => starts.push(*node_id),
            PowlNodeKind::End => finishes.push(*node_id),
            _ => {}
        }
    }
    if starts.len() != 1 || finishes.len() != 1 {
        return Err(PcpRefusal::GraphContractCoverageMismatch { node: fallback });
    }
    let start = starts[0];
    let finish = finishes[0];

    let mut matching_graphs = model.nodes.iter().filter_map(|node| match &node.kind {
        PowlNodeKind::ChoiceGraph { nodes, edges } if nodes.as_slice() == graph_nodes => {
            Some(edges.as_slice())
        }
        _ => None,
    });
    let graph_edges = matching_graphs
        .next()
        .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: fallback })?;
    if matching_graphs.next().is_some() {
        return Err(PcpRefusal::GraphContractCoverageMismatch { node: fallback });
    }

    for edge in graph_edges {
        if !graph_set.contains(&edge.from) || !graph_set.contains(&edge.to) {
            return Err(PcpRefusal::GraphContractCoverageMismatch { node: edge.from });
        }
        if edge.to == start || edge.from == finish {
            return Err(PcpRefusal::GraphContractCoverageMismatch {
                node: if edge.to == start { start } else { finish },
            });
        }
    }
    for node_id in graph_nodes {
        if !reachable_choice(start, *node_id, graph_edges)
            || !reachable_choice(*node_id, finish, graph_edges)
        {
            return Err(PcpRefusal::GraphContractCoverageMismatch { node: *node_id });
        }
    }

    Ok((start, finish))
}

#[cfg(test)]
mod choice_shape_falsifiers {
    use super::*;

    fn graph_model(graph_nodes: Vec<PowlNodeId>, edges: Vec<ChoiceGraphEdge>) -> Powl {
        Powl {
            nodes: vec![
                PowlNode::new(PowlNodeId(0), PowlNodeKind::Start),
                PowlNode::new(PowlNodeId(1), PowlNodeKind::Atom("step".to_string())),
                PowlNode::new(PowlNodeId(2), PowlNodeKind::End),
                PowlNode::new(
                    PowlNodeId(3),
                    PowlNodeKind::ChoiceGraph {
                        nodes: graph_nodes,
                        edges,
                    },
                ),
                PowlNode::new(PowlNodeId(4), PowlNodeKind::Atom("dead".to_string())),
            ],
            edges: vec![],
            root: Some(PowlNodeId(3)),
        }
    }

    #[test]
    fn terminals_are_derived_from_node_kind_not_vector_position() {
        let graph_nodes = vec![PowlNodeId(1), PowlNodeId(2), PowlNodeId(0)];
        let model = graph_model(
            graph_nodes.clone(),
            vec![
                ChoiceGraphEdge {
                    from: PowlNodeId(0),
                    to: PowlNodeId(1),
                },
                ChoiceGraphEdge {
                    from: PowlNodeId(1),
                    to: PowlNodeId(2),
                },
            ],
        );
        assert_eq!(
            choice_terminals(&model, &graph_nodes),
            Ok((PowlNodeId(0), PowlNodeId(2)))
        );
    }

    #[test]
    fn unreachable_or_dead_end_graph_nodes_are_refused() {
        let graph_nodes = vec![PowlNodeId(0), PowlNodeId(1), PowlNodeId(4), PowlNodeId(2)];
        let model = graph_model(
            graph_nodes.clone(),
            vec![
                ChoiceGraphEdge {
                    from: PowlNodeId(0),
                    to: PowlNodeId(1),
                },
                ChoiceGraphEdge {
                    from: PowlNodeId(1),
                    to: PowlNodeId(2),
                },
            ],
        );
        assert_eq!(
            choice_terminals(&model, &graph_nodes),
            Err(PcpRefusal::GraphContractCoverageMismatch {
                node: PowlNodeId(4)
            })
        );
    }
}

#[cfg(test)]
mod tests;
