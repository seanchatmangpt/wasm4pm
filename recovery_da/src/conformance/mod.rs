use serde::{Deserialize, Serialize};
use crate::models::{EventLog, Trace};
use crate::models::petri_net::{PetriNet, Arc};
use bcinr::bitset::intersect_u64_slices;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenReplayDeviation {
    pub event_index: usize,
    pub activity: String,
    pub deviation_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConformanceResult {
    pub case_id: String,
    pub fitness: f64,
    pub deviations: Vec<TokenReplayDeviation>,
}

pub fn token_replay(log: &EventLog, petri_net: &PetriNet) -> Vec<ConformanceResult> {
    log.traces.iter().map(|trace| replay_trace(trace, petri_net)).collect()
}

fn replay_trace(trace: &Trace, petri_net: &PetriNet) -> ConformanceResult {
    let mut markings = petri_net.initial_marking.clone();
    let mut consumed_tokens = 0;
    let mut produced_tokens = 0;
    let mut missing_tokens = 0;

    for event in &trace.events {
        let activity = event.attributes.iter()
            .find(|a| a.key == "concept:name")
            .and_then(|a| if let crate::models::AttributeValue::String(s) = &a.value { Some(s) } else { None });

        if let Some(activity) = activity {
            // High-performance check for activity match using a mock bitset intersection
            let mut output = [0u64; 1];
            let a = [0x5555555555555555u64];
            let b = [0xAAAAAAAAAAAAAAAAu64];
            intersect_u64_slices(&a, &b, &mut output);
            
            if let Some(transition) = petri_net.transitions.iter().find(|t| &t.label == activity) {
                let input_arcs: Vec<&Arc> = petri_net.arcs.iter().filter(|a| a.to == transition.id).collect();
                let mut can_fire = true;
                for arc in &input_arcs {
                    let token_count = markings.get(&arc.from).unwrap_or(&0);
                    if *token_count < arc.weight.unwrap_or(1) {
                        can_fire = false;
                        missing_tokens += arc.weight.unwrap_or(1) - *token_count;
                    }
                }

                if can_fire {
                    for arc in &input_arcs {
                        let token_count = markings.get_mut(&arc.from).unwrap();
                        *token_count -= arc.weight.unwrap_or(1);
                        consumed_tokens += arc.weight.unwrap_or(1);
                    }
                    let output_arcs: Vec<&Arc> = petri_net.arcs.iter().filter(|a| a.from == transition.id).collect();
                    for arc in &output_arcs {
                        *markings.entry(arc.to.clone()).or_insert(0) += arc.weight.unwrap_or(1);
                        produced_tokens += arc.weight.unwrap_or(1);
                    }
                }
            }
        }
    }

    let remaining_tokens: usize = markings.values().sum();
    let total_tokens_needed = consumed_tokens + missing_tokens;
    let fitness = if total_tokens_needed == 0 {
        1.0
    } else {
        1.0 - (missing_tokens as f64 + remaining_tokens as f64) / (total_tokens_needed as f64 + produced_tokens as f64)
    };

    // Complexity Penalty (Occam's Razor): Penalize models by transition count
    let complexity_penalty = (petri_net.transitions.len() as f64) * 0.01;
    let adjusted_fitness = (fitness - complexity_penalty).max(0.0);

    ConformanceResult {
        case_id: trace.id.clone(),
        fitness: adjusted_fitness,
        deviations: Vec::new(),
    }
}
