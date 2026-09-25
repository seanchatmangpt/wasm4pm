pub mod models;
pub mod conformance;
pub mod io;
pub mod utils;
pub mod reinforcement;
pub mod discovery {
    pub mod alphappp {
        pub mod auto_parameters;
        pub mod candidate_building;
        pub mod candidate_pruning;
        pub mod full;
        pub mod log_repair;
    }
    pub mod case_centric;
}
pub mod automation;
pub mod benchmark;
pub mod utils_perturbation {
    pub use crate::utils::perturbation::*;
}

// Re-export models for easier access
pub use models::*;
pub use conformance::*;

pub trait StateFeatures {
    fn to_features(&self) -> Vec<f32>;
}

#[derive(Clone, Eq, Hash, PartialEq, Debug)]
pub struct RlState {
    pub marking_vec: Vec<(String, usize)>,
    pub recent_activities: Vec<String>,
    pub health_level: i32,
    pub event_rate_q: i32,
    pub activity_count_q: i32,
    pub spc_alert_level: i32,
    pub drift_status: i32,
    pub rework_ratio_q: i32,
    pub circuit_state: i32,
    pub cycle_phase: i32,
}

impl StateFeatures for RlState {
    fn to_features(&self) -> Vec<f32> {
        vec![self.health_level as f32]
    }
}

#[derive(Clone, Eq, Hash, PartialEq, Debug)]
pub enum RlAction {
    Idle,
    Optimize,
    Rework,
    FireTransition(String),
    Skip,
}

impl reinforcement::WorkflowAction for RlAction {
    const ACTION_COUNT: usize = 5;
    fn to_index(&self) -> usize {
        match self {
            RlAction::Idle => 0,
            RlAction::Optimize => 1,
            RlAction::Rework => 2,
            RlAction::FireTransition(_) => 3,
            RlAction::Skip => 4,
        }
    }
    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(RlAction::Idle),
            1 => Some(RlAction::Optimize),
            2 => Some(RlAction::Rework),
            3 => Some(RlAction::FireTransition("".to_string())),
            4 => Some(RlAction::Skip),
            _ => None,
        }
    }
}

impl reinforcement::WorkflowState for RlState {
    fn features(&self) -> Vec<f32> { self.to_features() }
    fn is_terminal(&self) -> bool { self.health_level < 0 || self.health_level >= 5 }
}

pub mod rl_state_serialization {
    use std::collections::HashMap;
    pub struct SerializedAgentQTable {
        pub agent_type: u8,
        pub state_values: HashMap<i64, Vec<f32>>,
    }
    pub fn encode_rl_state_key(h: i32, _e: i32, _a: i32, _s: i32, _d: i32, _r: i32, _c: i32, _p: i32) -> i64 { h as i64 }
    pub fn decode_rl_state_key(key: i64) -> (i32, i32, i32, i32, i32, i32, i32, i32) { (key as i32,0,0,0,0,0,0,0) }
}
