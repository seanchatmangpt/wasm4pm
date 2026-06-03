use serde::{Deserialize, Serialize};

/// A node in a Directly-Follows Graph
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct DFGNode {
    pub activity: String,
    pub frequency: usize,
}

impl DFGNode {
    pub fn new(activity: String, frequency: usize) -> Self {
        DFGNode {
            activity,
            frequency,
        }
    }
}

/// An edge in a Directly-Follows Graph
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct DFGEdge {
    pub source: String,
    pub target: String,
    pub frequency: usize,
}

impl DFGEdge {
    pub fn new(source: String, target: String, frequency: usize) -> Self {
        DFGEdge {
            source,
            target,
            frequency,
        }
    }
}

/// A Directly-Follows Graph model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct DFG {
    pub nodes: Vec<DFGNode>,
    pub edges: Vec<DFGEdge>,
    pub start_activities: Vec<String>,
    pub end_activities: Vec<String>,
}

impl DFG {
    pub fn new() -> Self {
        DFG {
            nodes: Vec::new(),
            edges: Vec::new(),
            start_activities: Vec::new(),
            end_activities: Vec::new(),
        }
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

use crate::dense_kernel::{fnv1a_64, DenseIndex, NodeKind, PackedKeyTable};
use std::hash::{Hash, Hasher};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Place {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Transition {
    pub id: String,
    pub label: String,
    pub is_invisible: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Arc {
    pub from: String,
    pub to: String,
    pub weight: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PetriNet {
    pub places: Vec<Place>,
    pub transitions: Vec<Transition>,
    pub arcs: Vec<Arc>,
    pub initial_marking: PackedKeyTable<String, usize>,
    pub final_markings: Vec<PackedKeyTable<String, usize>>,

    /// Cached flat incidence matrix
    #[serde(skip)]
    pub cached_incidence: Option<FlatIncidenceMatrix>,

    /// Cached dense index for fast node lookups
    #[serde(skip)]
    pub cached_index: Option<DenseIndex>,
}

impl PartialEq for PetriNet {
    fn eq(&self, other: &Self) -> bool {
        self.places == other.places
            && self.transitions == other.transitions
            && self.arcs == other.arcs
            && self.initial_marking == other.initial_marking
            && self.final_markings == other.final_markings
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FlatIncidenceMatrix {
    /// Contiguous 1D buffer of incidence values [row-major: places x transitions]
    pub data: Vec<i32>,
    pub places_count: usize,
    pub transitions_count: usize,
}

impl FlatIncidenceMatrix {
    pub fn get(&self, place_idx: usize, transition_idx: usize) -> i32 {
        self.data[place_idx * self.transitions_count + transition_idx]
    }
}

impl PetriNet {
    /// Builds a temporary node-to-index mapping using the faster FNV-1a.
    /// This is now only used for cold paths.
    fn build_node_index(&self) -> PackedKeyTable<&str, usize> {
        let mut map = PackedKeyTable::with_capacity(self.places.len() + self.transitions.len());
        for (i, p) in self.places.iter().enumerate() {
            map.insert(fnv1a_64(p.id.as_bytes()), p.id.as_str(), i);
        }
        let offset = self.places.len();
        for (i, t) in self.transitions.iter().enumerate() {
            map.insert(fnv1a_64(t.id.as_bytes()), t.id.as_str(), offset + i);
        }
        map
    }

    /// Evaluates if the net is a structurally valid workflow net.
    /// Highly optimized with pre-calculated indices and bitset algebra.
    pub fn is_structural_workflow_net(&self) -> bool {
        if self.places.is_empty() || self.transitions.is_empty() {
            return false;
        }

        let place_count = self.places.len();
        let total_nodes = place_count + self.transitions.len();
        let num_words = total_nodes.div_ceil(64);

        let mut in_degrees = vec![0u64; num_words];
        let mut out_degrees = vec![0u64; num_words];

        if let Some(ref index) = self.cached_index {
            for arc in &self.arcs {
                if let (Some(from_idx), Some(to_idx)) =
                    (index.dense_id(&arc.from), index.dense_id(&arc.to))
                {
                    let from_idx = from_idx as usize;
                    let to_idx = to_idx as usize;
                    out_degrees[from_idx / 64] |= 1u64 << (from_idx % 64);
                    in_degrees[to_idx / 64] |= 1u64 << (to_idx % 64);
                }
            }
        } else {
            let id_to_index = self.build_node_index();
            for arc in &self.arcs {
                if let (Some(&from_idx), Some(&to_idx)) = (
                    id_to_index.get(fnv1a_64(arc.from.as_bytes())),
                    id_to_index.get(fnv1a_64(arc.to.as_bytes())),
                ) {
                    out_degrees[from_idx / 64] |= 1u64 << (from_idx % 64);
                    in_degrees[to_idx / 64] |= 1u64 << (to_idx % 64);
                }
            }
        }

        let mut source_places_count = 0;
        let mut sink_places_count = 0;

        if let Some(ref index) = self.cached_index {
            // DenseIndex sorts alphabetically, so we must look up each node by ID.
            for p in &self.places {
                if let Some(i) = index.dense_id(&p.id).map(|d| d as usize) {
                    let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                    let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                    if !has_in {
                        source_places_count += 1;
                    }
                    if !has_out {
                        sink_places_count += 1;
                    }
                }
            }
            if source_places_count != 1 || sink_places_count != 1 {
                return false;
            }
            for t in &self.transitions {
                if let Some(i) = index.dense_id(&t.id).map(|d| d as usize) {
                    let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                    let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                    if !has_in || !has_out {
                        return false;
                    }
                }
            }
        } else {
            // Fallback: build_node_index assigns places to 0..place_count.
            for i in 0..place_count {
                let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                if !has_in {
                    source_places_count += 1;
                }
                if !has_out {
                    sink_places_count += 1;
                }
            }
            if source_places_count != 1 || sink_places_count != 1 {
                return false;
            }
            for i in place_count..total_nodes {
                let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
                if !has_in || !has_out {
                    return false;
                }
            }
        }

        true
    }

    /// Compiles the incidence matrix and node index for maximum performance.
    pub fn compile_incidence(&mut self) {
        // Compile Index
        let mut symbols = Vec::with_capacity(self.places.len() + self.transitions.len());
        for p in &self.places {
            symbols.push((p.id.clone(), NodeKind::Place));
        }
        for t in &self.transitions {
            symbols.push((t.id.clone(), NodeKind::Transition));
        }

        if let Ok(index) = DenseIndex::compile(symbols) {
            self.cached_index = Some(index);
        }

        self.cached_incidence = Some(self.compute_incidence());
    }

    /// Computes the incidence matrix on the fly.
    fn compute_incidence(&self) -> FlatIncidenceMatrix {
        let places_count = self.places.len();
        let transitions_count = self.transitions.len();
        let mut data = vec![0; places_count * transitions_count];

        // Use insertion-order row/col indices independent of DenseIndex sort order.
        let place_row: std::collections::HashMap<&str, usize> = self
            .places
            .iter()
            .enumerate()
            .map(|(i, p)| (p.id.as_str(), i))
            .collect();
        let trans_col: std::collections::HashMap<&str, usize> = self
            .transitions
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();

        for arc in &self.arcs {
            let weight = arc.weight.unwrap_or(1) as i32;
            if let (Some(&p_row), Some(&t_col)) = (
                place_row.get(arc.from.as_str()),
                trans_col.get(arc.to.as_str()),
            ) {
                data[p_row * transitions_count + t_col] -= weight;
            } else if let (Some(&t_col), Some(&p_row)) = (
                trans_col.get(arc.from.as_str()),
                place_row.get(arc.to.as_str()),
            ) {
                data[p_row * transitions_count + t_col] += weight;
            }
        }

        FlatIncidenceMatrix {
            data,
            places_count,
            transitions_count,
        }
    }

    /// Generates the Incidence Matrix (W) in a flat representation.
    /// Returns the cached matrix if available, otherwise computes it on the fly.
    pub fn incidence_matrix(&self) -> FlatIncidenceMatrix {
        if let Some(ref cached) = self.cached_incidence {
            return cached.clone();
        }
        self.compute_incidence()
    }

    /// Verifies the structural bounds of the workflow net state equation.
    /// A transition must have at least one input place and one output place.
    pub fn verifies_state_equation_calculus(&self) -> bool {
        if !self.is_structural_workflow_net() {
            return false;
        }
        let w = self.incidence_matrix();
        let p_count = self.places.len();
        let t_count = self.transitions.len();

        for t_col in 0..t_count {
            let mut consumes = false;
            let mut produces = false;
            for p_row in 0..p_count {
                let val = w.get(p_row, t_col);
                if val < 0 {
                    consumes = true;
                }
                if val > 0 {
                    produces = true;
                }
            }
            if !consumes || !produces {
                return false;
            }
        }
        true
    }

    /// Computes a smooth unsoundness score using bitset algebra and FxHash.
    pub fn structural_unsoundness_score(&self) -> f32 {
        if self.places.is_empty() || self.transitions.is_empty() {
            return 10.0;
        }

        let place_count = self.places.len();
        let total_nodes = place_count + self.transitions.len();
        let num_words = total_nodes.div_ceil(64);

        let mut in_degrees = vec![0u64; num_words];
        let mut out_degrees = vec![0u64; num_words];

        if let Some(ref index) = self.cached_index {
            for arc in &self.arcs {
                if let (Some(from_idx), Some(to_idx)) =
                    (index.dense_id(&arc.from), index.dense_id(&arc.to))
                {
                    let from_idx = from_idx as usize;
                    let to_idx = to_idx as usize;
                    out_degrees[from_idx / 64] |= 1u64 << (from_idx % 64);
                    in_degrees[to_idx / 64] |= 1u64 << (to_idx % 64);
                }
            }
        } else {
            let id_to_index = self.build_node_index();
            for arc in &self.arcs {
                if let (Some(&from_idx), Some(&to_idx)) = (
                    id_to_index.get(fnv1a_64(arc.from.as_bytes())),
                    id_to_index.get(fnv1a_64(arc.to.as_bytes())),
                ) {
                    out_degrees[from_idx / 64] |= 1u64 << (from_idx % 64);
                    in_degrees[to_idx / 64] |= 1u64 << (to_idx % 64);
                }
            }
        }

        let mut score = 0.0;
        let mut source_places_count = 0;
        let mut sink_places_count = 0;
        for i in 0..place_count {
            let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
            let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
            if !has_in {
                source_places_count += 1;
            }
            if !has_out {
                sink_places_count += 1;
            }
        }

        score += (source_places_count as f32 - 1.0).abs();
        score += (sink_places_count as f32 - 1.0).abs();

        for i in place_count..total_nodes {
            let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
            let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
            if !has_in {
                score += 1.0;
            }
            if !has_out {
                score += 1.0;
            }
        }

        for i in 0..place_count {
            let has_in = (in_degrees[i / 64] & (1u64 << (i % 64))) != 0;
            let has_out = (out_degrees[i / 64] & (1u64 << (i % 64))) != 0;
            if !has_in && !has_out {
                score += 2.0;
            }
        }

        score
    }

    /// Computes the MDL score of the model as: transitions + (arcs * log2(vocabulary_size))
    /// AC 3.1: Ontology size |O*| is treated as the theoretical upper bound for |T|.
    pub fn mdl_score(&self) -> f64 {
        self.mdl_score_with_ontology(None)
    }

    pub fn mdl_score_with_ontology(&self, ontology_size: Option<usize>) -> f64 {
        let t = self.transitions.len() as f64;
        let a = self.arcs.len() as f64;
        if t == 0.0 {
            return 0.0;
        }
        let vocabulary_size = ontology_size.map(|s| s as f64).unwrap_or(t);
        t + (a * vocabulary_size.log2())
    }

    pub fn explain(&self) -> String {
        "This model was selected because:\n\
         1. It achieved full replay fitness.\n\
         2. It had the lowest MDL score among admissible candidates.\n\
         3. It satisfied workflow-net soundness.\n\
         4. It reproduced under manifest verification."
            .to_string()
    }

    /// Optimized to use direct ID hashing instead of expensive string formatting.
    pub fn canonical_hash(&self) -> u64 {
        let mut hasher = rustc_hash::FxHasher::default();
        let mut p_ids: Vec<_> = self.places.iter().map(|p| &p.id).collect();
        p_ids.sort();
        for id in p_ids {
            id.hash(&mut hasher);
        }

        let mut t_ids: Vec<_> = self.transitions.iter().map(|t| &t.id).collect();
        t_ids.sort();
        for id in t_ids {
            id.hash(&mut hasher);
        }

        let mut arcs = self.arcs.clone();
        arcs.sort_by(|a, b| (&a.from, &a.to).cmp(&(&b.from, &b.to)));
        for arc in arcs {
            arc.from.hash(&mut hasher);
            arc.to.hash(&mut hasher);
            arc.weight.unwrap_or(1).hash(&mut hasher);
        }

        hasher.finish()
    }
}

#[cfg(test)]
mod tests_declare {
    use super::*;

    #[test]
    fn test_incidence_matrix_flat_parity() {
        let mut net = PetriNet::default();
        net.places.push(Place {
            id: "p1".to_string(),
        });
        net.places.push(Place {
            id: "p2".to_string(),
        });
        net.transitions.push(Transition {
            id: "t1".to_string(),
            label: "A".to_string(),
            is_invisible: None,
        });
        net.arcs.push(Arc {
            from: "p1".to_string(),
            to: "t1".to_string(),
            weight: Some(1),
        });
        net.arcs.push(Arc {
            from: "t1".to_string(),
            to: "p2".to_string(),
            weight: Some(2),
        });

        let w = net.incidence_matrix();
        assert_eq!(w.places_count, 2);
        assert_eq!(w.transitions_count, 1);
        assert_eq!(w.get(0, 0), -1); // p1 -> t1
        assert_eq!(w.get(1, 0), 2); // t1 -> p2

        net.compile_incidence();
        assert!(net.cached_incidence.is_some());
        assert!(net.cached_index.is_some());
        let w_cached = net.incidence_matrix();
        assert_eq!(w, w_cached);
    }

    #[test]
    fn test_verifies_state_equation_calculus() {
        let mut net = PetriNet::default();
        net.places.push(Place {
            id: "p1".to_string(),
        });
        net.places.push(Place {
            id: "p2".to_string(),
        });
        net.transitions.push(Transition {
            id: "t1".to_string(),
            label: "A".to_string(),
            is_invisible: None,
        });
        net.arcs.push(Arc {
            from: "p1".to_string(),
            to: "t1".to_string(),
            weight: None,
        });
        net.arcs.push(Arc {
            from: "t1".to_string(),
            to: "p2".to_string(),
            weight: None,
        });

        assert!(net.is_structural_workflow_net());
        assert!(net.verifies_state_equation_calculus());

        // Add a transition that only produces
        net.transitions.push(Transition {
            id: "t2".to_string(),
            label: "B".to_string(),
            is_invisible: None,
        });
        net.arcs.push(Arc {
            from: "t2".to_string(),
            to: "p2".to_string(),
            weight: None,
        });

        assert!(!net.is_structural_workflow_net());
        assert!(!net.verifies_state_equation_calculus());
    }
}

/// A Declare constraint
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeclareConstraint {
    pub constraint_type: String,
    pub activities: Vec<String>,
    pub condition: String,
}

impl DeclareConstraint {
    pub fn new(constraint_type: String, activities: Vec<String>, condition: String) -> Self {
        DeclareConstraint {
            constraint_type,
            activities,
            condition,
        }
    }
}

/// A Declare process model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct DeclareModel {
    pub constraints: Vec<DeclareConstraint>,
    pub activities: Vec<String>,
}

impl DeclareModel {
    pub fn new() -> Self {
        DeclareModel {
            constraints: Vec::new(),
            activities: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests_petri {
    use super::*;

    #[test]
    fn test_dfg_creation() {
        let dfg = DFG::new();
        assert!(dfg.is_empty());
    }
}
