//! Petri net data model for POWL conversions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Place {
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Transition {
    pub name: String,
    pub label: Option<String>,
    pub properties: HashMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Arc {
    pub source: String,
    pub target: String,
    pub weight: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PetriNet {
    pub name: String,
    pub places: Vec<Place>,
    pub transitions: Vec<Transition>,
    pub arcs: Vec<Arc>,
}

pub type Marking = HashMap<String, u32>;

#[derive(Default)]
pub struct Counts {
    pub num_places: u32,
    pub num_hidden: u32,
    pub num_visible: u32,
}

impl Counts {
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

impl PetriNet {
    pub fn new(name: &str) -> Self {
        PetriNet {
            name: name.to_string(),
            places: Vec::new(),
            transitions: Vec::new(),
            arcs: Vec::new(),
        }
    }

    pub fn add_place(&mut self, name: &str) -> String {
        self.places.push(Place {
            name: name.to_string(),
        });
        name.to_string()
    }

    pub fn add_transition(&mut self, name: &str, label: Option<String>) -> String {
        self.transitions.push(Transition {
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
        self.transitions.push(Transition {
            name: name.to_string(),
            label,
            properties: props,
        });
        name.to_string()
    }

    pub fn add_arc(&mut self, source: &str, target: &str) {
        self.arcs.push(Arc {
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
pub struct PetriNetResult {
    pub net: PetriNet,
    pub initial_marking: Marking,
    pub final_marking: Marking,
}
