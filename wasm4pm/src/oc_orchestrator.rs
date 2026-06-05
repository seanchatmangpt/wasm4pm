use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm4pm_types::ocel::OCEL;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OntologyDiscoveryAgent {
    pub object_type_density: HashMap<String, f64>,
    pub learned_relationships: Vec<(String, String, String)>, // (from, to, qualifier)
}

impl OntologyDiscoveryAgent {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn analyze_ocel(&mut self, ocel: &OCEL) {
        for obj in &ocel.objects {
            let density = obj.relationships.len() as f64;
            *self
                .object_type_density
                .entry(obj.object_type.clone())
                .or_insert(0.0) += density;

            for rel in &obj.relationships {
                let entry = (obj.id.clone(), rel.object_id.clone(), rel.qualifier.clone());
                if !self.learned_relationships.contains(&entry) {
                    self.learned_relationships.push(entry);
                }
            }
        }
    }

    pub fn reward_subgraph_density(&mut self, _ocel: &OCEL) -> f64 {
        // Simple heuristic reward
        let total_objects = self.object_type_density.len() as f64;
        if total_objects == 0.0 {
            return 0.0;
        }

        let avg_density = self.object_type_density.values().sum::<f64>() / total_objects;
        if avg_density > 2.0 {
            1.0
        } else {
            0.1
        }
    }
}
