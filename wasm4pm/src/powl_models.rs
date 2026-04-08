//! POWL model types: PowlModel wrapper, PetriNet, ProcessTree.
//!
//! These types are used by POWL conversion, conformance, and analysis modules.
//! The PetriNet and ProcessTree types here are the POWL-specific versions
//! (with richer fields than the base types in models.rs).

use crate::powl_arena::PowlArena;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── PowlModel wrapper ──────────────────────────────────────────────────────

/// Top-level POWL model: an arena of nodes plus a root index.
#[derive(Clone, Debug)]
pub struct PowlModel {
    pub arena: PowlArena,
    pub root: u32,
}

impl PowlModel {
    pub fn new(arena: PowlArena, root: u32) -> Self {
        PowlModel { arena, root }
    }

    pub fn root(&self) -> u32 {
        self.root
    }

    pub fn len(&self) -> usize {
        self.arena.len()
    }

    pub fn is_empty(&self) -> bool {
        self.arena.is_empty()
    }

    pub fn to_string_repr(&self) -> String {
        self.arena.to_repr(self.root)
    }
}

// ─── Petri Net (POWL-specific) ──────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PowlPlace {
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PowlTransition {
    pub name: String,
    pub label: Option<String>,
    pub properties: HashMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PowlArc {
    pub source: String,
    pub target: String,
    pub weight: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PowlPetriNet {
    pub name: String,
    pub places: Vec<PowlPlace>,
    pub transitions: Vec<PowlTransition>,
    pub arcs: Vec<PowlArc>,
}

pub type PowlMarking = HashMap<String, u32>;

#[derive(Default)]
pub struct PowlCounts {
    pub num_places: u32,
    pub num_hidden: u32,
    pub num_visible: u32,
}

impl PowlCounts {
    pub fn inc_places(&mut self) -> u32 {
        self.num_places += 1;
        self.num_places
    }
    pub fn inc_hidden(&mut self) -> u32 {
        self.num_hidden += 1;
        self.num_hidden
    }
    pub fn inc_visible(&mut self) -> u32 {
        self.num_visible += 1;
        self.num_visible
    }
}

impl PowlPetriNet {
    pub fn new(name: &str) -> Self {
        PowlPetriNet {
            name: name.to_string(),
            places: Vec::new(),
            transitions: Vec::new(),
            arcs: Vec::new(),
        }
    }

    pub fn add_place(&mut self, name: &str) -> String {
        self.places.push(PowlPlace {
            name: name.to_string(),
        });
        name.to_string()
    }

    pub fn add_transition(&mut self, name: &str, label: Option<String>) -> String {
        self.transitions.push(PowlTransition {
            name: name.to_string(),
            label,
            properties: HashMap::new(),
        });
        name.to_string()
    }

    pub fn add_transition_with_props(
        &mut self,
        name: &str,
        label: Option<String>,
        props: HashMap<String, serde_json::Value>,
    ) -> String {
        self.transitions.push(PowlTransition {
            name: name.to_string(),
            label,
            properties: props,
        });
        name.to_string()
    }

    pub fn add_arc(&mut self, source: &str, target: &str) {
        self.arcs.push(PowlArc {
            source: source.to_string(),
            target: target.to_string(),
            weight: 1,
        });
    }

    pub fn remove_place(&mut self, name: &str) {
        self.places.retain(|p| p.name != name);
        self.arcs.retain(|a| a.source != name && a.target != name);
    }

    pub fn remove_transition(&mut self, name: &str) {
        self.transitions.retain(|t| t.name != name);
        self.arcs.retain(|a| a.source != name && a.target != name);
    }

    /// Apply simple structural reduction: remove pass-through places.
    pub fn apply_simple_reduction(&mut self) {
        loop {
            let mut reduced = false;
            let place_names: Vec<String> = self.places.iter().map(|p| p.name.clone()).collect();
            for p_name in &place_names {
                let in_trans: Vec<String> = self
                    .arcs
                    .iter()
                    .filter(|a| &a.target == p_name)
                    .map(|a| a.source.clone())
                    .collect();
                let out_trans: Vec<String> = self
                    .arcs
                    .iter()
                    .filter(|a| &a.source == p_name)
                    .map(|a| a.target.clone())
                    .collect();

                if in_trans.len() == 1 && out_trans.len() == 1 {
                    let in_t = &in_trans[0];
                    let out_t = &out_trans[0];
                    let in_silent = self
                        .transitions
                        .iter()
                        .find(|t| &t.name == in_t)
                        .map(|t| t.label.is_none())
                        .unwrap_or(false);
                    let out_silent = self
                        .transitions
                        .iter()
                        .find(|t| &t.name == out_t)
                        .map(|t| t.label.is_none())
                        .unwrap_or(false);

                    if in_silent && out_silent && in_t != out_t {
                        let old_out_t = out_t.clone();
                        let old_in_t = in_t.clone();
                        let targets_of_out_t: Vec<String> = self
                            .arcs
                            .iter()
                            .filter(|a| a.source == old_out_t)
                            .map(|a| a.target.clone())
                            .collect();
                        self.remove_place(p_name);
                        self.remove_transition(&old_out_t);
                        for tgt in targets_of_out_t {
                            if tgt != *p_name {
                                self.add_arc(&old_in_t, &tgt);
                            }
                        }
                        reduced = true;
                        break;
                    }
                }
            }
            if !reduced {
                break;
            }
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PowlPetriNetResult {
    pub net: PowlPetriNet,
    pub initial_marking: PowlMarking,
    pub final_marking: PowlMarking,
}

// ─── Process Tree (POWL-specific) ───────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PtOperator {
    Sequence,
    Xor,
    Parallel,
    Loop,
}

impl PtOperator {
    pub fn as_str(self) -> &'static str {
        match self {
            PtOperator::Sequence => "->",
            PtOperator::Xor => "X",
            PtOperator::Parallel => "+",
            PtOperator::Loop => "*",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PowlProcessTree {
    pub label: Option<String>,
    pub operator: Option<PtOperator>,
    pub children: Vec<PowlProcessTree>,
}

impl PowlProcessTree {
    pub fn leaf(label: Option<String>) -> Self {
        PowlProcessTree {
            label,
            operator: None,
            children: Vec::new(),
        }
    }

    pub fn internal(operator: PtOperator, children: Vec<PowlProcessTree>) -> Self {
        PowlProcessTree {
            label: None,
            operator: Some(operator),
            children,
        }
    }

    pub fn to_repr(&self) -> String {
        match (&self.operator, &self.label) {
            (None, None) => "tau".to_string(),
            (None, Some(l)) => l.clone(),
            (Some(op), _) => {
                let children: Vec<String> = self.children.iter().map(|c| c.to_repr()).collect();
                format!("{} ( {} )", op.as_str(), children.join(", "))
            }
        }
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn powl_model_to_string() {
        use crate::powl_arena::{Operator, PowlArena};
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let root = arena.add_operator(Operator::Xor, vec![a, b]);
        let model = PowlModel::new(arena, root);
        assert_eq!(model.to_string_repr(), "X ( A, B )");
    }

    #[test]
    fn petri_net_builder() {
        let mut net = PowlPetriNet::new("test");
        net.add_place("p1");
        net.add_transition("t1", Some("A".to_string()));
        net.add_arc("p1", "t1");
        assert_eq!(net.places.len(), 1);
        assert_eq!(net.transitions.len(), 1);
        assert_eq!(net.arcs.len(), 1);
    }

    #[test]
    fn process_tree_to_repr() {
        let tree = PowlProcessTree::internal(
            PtOperator::Sequence,
            vec![
                PowlProcessTree::leaf(Some("A".to_string())),
                PowlProcessTree::leaf(Some("B".to_string())),
            ],
        );
        assert_eq!(tree.to_repr(), "-> ( A, B )");
    }
}
