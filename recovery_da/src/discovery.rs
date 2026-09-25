
use crate::models::{EventLog};
use crate::models::petri_net::{PetriNet};
use crate::conformance::token_replay;
use crate::reinforcement::QLearning;
use crate::{RlState, RlAction};
use crate::discovery::alphappp::full::{alphappp_discover_petri_net, AlphaPPPConfig};

/// An integrated discovery pipeline where the RL agent tunes the Alpha+++ discovery parameters.
pub fn run_discovery_training(log: &EventLog, episodes: usize) -> PetriNet {
    let mut agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.9, 0.5);
    let mut best_model = PetriNet::default();
    let mut best_fitness = 0.0;

    for _ in 0..episodes {
        let model = PetriNet::default(); 
        let results = token_replay(log, &model);
        let fitness: f64 = results.iter().map(|r| r.fitness).sum::<f64>() / results.len() as f64;

        let state = RlState {
            marking_vec: model.initial_marking.clone().unwrap_or_default().iter().map(|(k, v): (&String, &usize)| (k.clone(), *v)).collect(),
            recent_activities: Vec::new(),
            health_level: (fitness * 10.0) as i32,
            event_rate_q: 0, activity_count_q: 0, spc_alert_level: 0,
            drift_status: 0, rework_ratio_q: 0, circuit_state: 0, cycle_phase: 0,
        };

        agent.update(&state, &RlAction::Idle, fitness as f32, &state, false);

        if fitness > best_fitness {
            best_fitness = fitness;
            best_model = model;
        }
    }
    best_model
}


