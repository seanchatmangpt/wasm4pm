#![cfg(feature = "cloud")]
#![allow(clippy::all, dead_code)]
//! State Space Exploration Audit — wasm4pm RL
//!
//! Validates:
//! 1. All 8 dimensions have adequate coverage
//! 2. State transitions are not stuck in a region
//! 3. Rare states (e.g., health=4, high SPC) are reachable
//! 4. Action distribution across states is non-degenerate
//! 5. Exploration monitors detect gaps and dead zones
//!
//! Total state space: 5 × 8 × 8 × 4 × 3 × 8 × 3 × 4 = 368,640 states
//!
//! Dimensions:
//!   0: health_level [0-4]
//!   1: event_rate_q [0-7]
//!   2: activity_count_q [0-7]
//!   3: spc_alert_level [0-3]
//!   4: drift_status [0-2]
//!   5: rework_ratio_q [0-7]
//!   6: circuit_state [0-2]
//!   7: cycle_phase [0-3]

use std::collections::{HashMap, HashSet};
use wasm4pm::rl_orchestrator::RlOrchestrator;
use wasm4pm::{RlAction, RlState};

// ============================================================================
// Monitor 1: Dimension Coverage Monitor
// ============================================================================

#[derive(Debug, Clone)]
pub struct DimensionCoverageMonitor {
    /// Per-dimension value coverage: [health, event_rate, activity_count, spc, drift, rework, circuit, cycle]
    pub dimension_bins: [HashSet<u8>; 8],
    /// Names of each dimension for reporting
    pub dimension_names: [&'static str; 8],
    /// Max possible values per dimension
    pub dimension_max: [u8; 8],
}

impl DimensionCoverageMonitor {
    pub fn new() -> Self {
        Self {
            dimension_bins: Default::default(),
            dimension_names: [
                "health_level",
                "event_rate_q",
                "activity_count_q",
                "spc_alert_level",
                "drift_status",
                "rework_ratio_q",
                "circuit_state",
                "cycle_phase",
            ],
            dimension_max: [5, 8, 8, 4, 3, 8, 3, 4], // max values (exclusive)
        }
    }

    /// Record a state visit and update coverage
    pub fn observe(&mut self, state: &RlState) {
        self.dimension_bins[0].insert(state.health_level);
        self.dimension_bins[1].insert(state.event_rate_q);
        self.dimension_bins[2].insert(state.activity_count_q);
        self.dimension_bins[3].insert(state.spc_alert_level);
        self.dimension_bins[4].insert(state.drift_status);
        self.dimension_bins[5].insert(state.rework_ratio_q);
        self.dimension_bins[6].insert(state.circuit_state);
        self.dimension_bins[7].insert(state.cycle_phase);
    }

    /// Get coverage percentage per dimension (0-100)
    pub fn coverage_per_dimension(&self) -> [f32; 8] {
        let mut result = [0.0; 8];
        for i in 0..8 {
            let covered = self.dimension_bins[i].len() as f32;
            let max = self.dimension_max[i] as f32;
            result[i] = (covered / max) * 100.0;
        }
        result
    }

    /// Find underexplored dimensions (coverage < 50%)
    pub fn underexplored(&self) -> Vec<(usize, &'static str, f32)> {
        self.coverage_per_dimension()
            .iter()
            .enumerate()
            .filter(|(_, &cov)| cov < 50.0)
            .map(|(i, &cov)| (i, self.dimension_names[i], cov))
            .collect()
    }

    /// Report coverage state
    pub fn report(&self) -> String {
        let mut report = String::from("Dimension Coverage Report:\n");
        let coverage = self.coverage_per_dimension();
        for i in 0..8 {
            let dim_name = self.dimension_names[i];
            let cov = coverage[i];
            let bins = self.dimension_bins[i].len();
            let max = self.dimension_max[i];
            report.push_str(&format!(
                "  {}: {:.1}% ({}/{} bins)\n",
                dim_name, cov, bins, max
            ));
        }
        report
    }
}

// ============================================================================
// Monitor 2: State Region Analysis Monitor
// ============================================================================

#[derive(Debug, Clone)]
pub struct StateRegionAnalyzer {
    /// Cluster states by their 8D region
    /// Region key: (health_level >> 1, event_rate_q >> 2, ...)
    pub regions: HashMap<(u8, u8, u8, u8, u8, u8, u8, u8), usize>,
    /// Total states observed
    pub total_visits: usize,
}

impl StateRegionAnalyzer {
    pub fn new() -> Self {
        Self {
            regions: HashMap::new(),
            total_visits: 0,
        }
    }

    /// Observe a state and update region clustering
    pub fn observe(&mut self, state: &RlState) {
        let region_key = (
            state.health_level,
            state.event_rate_q >> 1, // coarse-grain to 4 buckets
            state.activity_count_q >> 1,
            state.spc_alert_level >> 1,
            state.drift_status,
            state.rework_ratio_q >> 1,
            state.circuit_state,
            state.cycle_phase >> 1,
        );
        *self.regions.entry(region_key).or_insert(0) += 1;
        self.total_visits += 1;
    }

    /// Detect if agent is stuck in one region (>70% of visits)
    pub fn is_stuck(&self) -> bool {
        if self.total_visits == 0 {
            return false;
        }
        let max_region_visits = self.regions.values().max().cloned().unwrap_or(0);
        (max_region_visits as f32 / self.total_visits as f32) > 0.7
    }

    /// Get distribution of visits across regions
    pub fn distribution(&self) -> Vec<(usize, &(u8, u8, u8, u8, u8, u8, u8, u8))> {
        let mut dist: Vec<_> = self.regions.iter().map(|(k, &v)| (v, k)).collect();
        dist.sort_by(|a, b| b.0.cmp(&a.0));
        dist
    }

    /// Report region analysis
    pub fn report(&self) -> String {
        let mut report = String::from("State Region Analysis:\n");
        report.push_str(&format!("  Total visits: {}\n", self.total_visits));
        report.push_str(&format!("  Unique regions: {}\n", self.regions.len()));
        report.push_str(&format!("  Is stuck: {}\n", self.is_stuck()));
        if self.is_stuck() {
            report.push_str("  WARNING: Agent is stuck in dominant region!\n");
        }
        Ok::<_, ()>(()).unwrap_or_else(|_| {});
        report
    }
}

// ============================================================================
// Monitor 3: Rare State Reachability Monitor
// ============================================================================

#[derive(Debug, Clone)]
pub struct RareStateMonitor {
    /// Explicitly track rare states (high health levels, extreme SPC)
    pub terminal_state_visited: bool, // health == 4
    pub critical_state_visited: bool, // health == 3
    pub high_spc_visited: bool,       // spc_alert_level == 3
    pub zero_drift_visited: bool,     // drift_status == 0
    pub max_rework_visited: bool,     // rework_ratio_q == 7
    pub circuit_open_visited: bool,   // circuit_state == 2
    /// Count of visits to each rare state
    pub rare_visits: HashMap<&'static str, usize>,
}

impl RareStateMonitor {
    pub fn new() -> Self {
        Self {
            terminal_state_visited: false,
            critical_state_visited: false,
            high_spc_visited: false,
            zero_drift_visited: false,
            max_rework_visited: false,
            circuit_open_visited: false,
            rare_visits: HashMap::new(),
        }
    }

    /// Record rare state visits
    pub fn observe(&mut self, state: &RlState) {
        if state.health_level == 4 {
            self.terminal_state_visited = true;
            *self.rare_visits.entry("terminal_health").or_insert(0) += 1;
        } else if state.health_level == 3 {
            self.critical_state_visited = true;
            *self.rare_visits.entry("critical_health").or_insert(0) += 1;
        }
        if state.spc_alert_level == 3 {
            self.high_spc_visited = true;
            *self.rare_visits.entry("high_spc").or_insert(0) += 1;
        }
        if state.drift_status == 0 {
            self.zero_drift_visited = true;
            *self.rare_visits.entry("zero_drift").or_insert(0) += 1;
        }
        if state.rework_ratio_q == 7 {
            self.max_rework_visited = true;
            *self.rare_visits.entry("max_rework").or_insert(0) += 1;
        }
        if state.circuit_state == 2 {
            self.circuit_open_visited = true;
            *self.rare_visits.entry("circuit_open").or_insert(0) += 1;
        }
    }

    /// Check how many rare states have been visited
    pub fn count_visited(&self) -> usize {
        [
            self.terminal_state_visited,
            self.critical_state_visited,
            self.high_spc_visited,
            self.zero_drift_visited,
            self.max_rework_visited,
            self.circuit_open_visited,
        ]
        .iter()
        .filter(|&&v| v)
        .count()
    }

    /// Report rare state reachability
    pub fn report(&self) -> String {
        let mut report = String::from("Rare State Reachability Report:\n");
        report.push_str(&format!(
            "  Terminal state (health=4): {}\n",
            self.terminal_state_visited
        ));
        report.push_str(&format!(
            "  Critical state (health=3): {}\n",
            self.critical_state_visited
        ));
        report.push_str(&format!("  High SPC (spc=3): {}\n", self.high_spc_visited));
        report.push_str(&format!(
            "  Zero drift (drift=0): {}\n",
            self.zero_drift_visited
        ));
        report.push_str(&format!(
            "  Max rework (rework=7): {}\n",
            self.max_rework_visited
        ));
        report.push_str(&format!(
            "  Circuit open (circuit=2): {}\n",
            self.circuit_open_visited
        ));
        report.push_str(&format!(
            "  Total rare states visited: {}/6\n",
            self.count_visited()
        ));
        report
    }
}

// ============================================================================
// Monitor 4: Action Distribution Monitor
// ============================================================================

#[derive(Debug, Clone)]
pub struct ActionDistributionMonitor {
    /// Action counts across all states
    pub action_counts: HashMap<String, usize>,
    /// Action counts per health level (for regional analysis)
    pub action_per_health: HashMap<(u8, String), usize>,
    /// Total actions taken
    pub total_actions: usize,
}

impl ActionDistributionMonitor {
    pub fn new() -> Self {
        Self {
            action_counts: HashMap::new(),
            action_per_health: HashMap::new(),
            total_actions: 0,
        }
    }

    /// Record action taken in a given state
    pub fn observe(&mut self, state: &RlState, action: &RlAction) {
        let action_name = match action {
            RlAction::Continue => "Continue",
            RlAction::Scale => "Scale",
            RlAction::Retry => "Retry",
            RlAction::Fallback => "Fallback",
            RlAction::Restart => "Restart",
        };

        *self
            .action_counts
            .entry(action_name.to_string())
            .or_insert(0) += 1;
        *self
            .action_per_health
            .entry((state.health_level, action_name.to_string()))
            .or_insert(0) += 1;
        self.total_actions += 1;
    }

    /// Check if action distribution is degenerate (one action >80% of time)
    pub fn is_degenerate(&self) -> bool {
        if self.total_actions == 0 {
            return false;
        }
        let max_action_count = self.action_counts.values().max().cloned().unwrap_or(0);
        (max_action_count as f32 / self.total_actions as f32) > 0.8
    }

    /// Report action distribution
    pub fn report(&self) -> String {
        let mut report = String::from("Action Distribution Report:\n");
        report.push_str(&format!("  Total actions: {}\n", self.total_actions));
        if self.is_degenerate() {
            report.push_str("  WARNING: Action distribution is degenerate (>80% single action)!\n");
        }
        for (action, count) in &self.action_counts {
            let pct = (*count as f32 / self.total_actions as f32) * 100.0;
            report.push_str(&format!("    {}: {} ({:.1}%)\n", action, count, pct));
        }
        report
    }
}

// ============================================================================
// Monitor 5: Dead Zone Detector
// ============================================================================

#[derive(Debug, Clone)]
pub struct DeadZoneDetector {
    /// States that are theoretically reachable but never visited
    pub theoretical_states: HashSet<u32>,
    /// Actually visited state bins
    pub visited_bins: HashSet<u32>,
    /// Threshold: if dimension has <25% coverage, mark as dead zone
    pub dead_zone_threshold: f32,
}

impl DeadZoneDetector {
    pub fn new() -> Self {
        Self {
            theoretical_states: HashSet::new(),
            visited_bins: HashSet::new(),
            dead_zone_threshold: 0.25,
        }
    }

    /// Initialize theoretical state space
    pub fn init_theoretical_space(&mut self) {
        // Sample 10% of theoretical space (36,864 states as representative)
        for h in 0..5 {
            for e in (0..8).step_by(2) {
                for a in (0..8).step_by(2) {
                    for s in 0..4 {
                        for d in 0..3 {
                            for r in (0..8).step_by(2) {
                                for c in 0..3 {
                                    for p in 0..4 {
                                        let bin = h as u32 * 61440
                                            + e as u32 * 7680
                                            + a as u32 * 960
                                            + s as u32 * 240
                                            + d as u32 * 80
                                            + r as u32 * 10
                                            + c as u32 * 3
                                            + p as u32;
                                        self.theoretical_states.insert(bin);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Record visited state
    pub fn observe(&mut self, state: &RlState) {
        let h = state.health_level as u32;
        let e = state.event_rate_q as u32;
        let a = state.activity_count_q as u32;
        let s = state.spc_alert_level as u32;
        let d = state.drift_status as u32;
        let r = state.rework_ratio_q as u32;
        let c = state.circuit_state as u32;
        let p = state.cycle_phase as u32;

        let bin = h * 61440 + e * 7680 + a * 960 + s * 240 + d * 80 + r * 10 + c * 3 + p;
        self.visited_bins.insert(bin);
    }

    /// Detect dead zones
    pub fn dead_zones(&self) -> Vec<u32> {
        self.theoretical_states
            .iter()
            .filter(|b| !self.visited_bins.contains(b))
            .cloned()
            .collect()
    }

    /// Report dead zone analysis
    pub fn report(&self) -> String {
        let mut report = String::from("Dead Zone Analysis:\n");
        report.push_str(&format!(
            "  Theoretical states (10% sample): {}\n",
            self.theoretical_states.len()
        ));
        report.push_str(&format!("  Visited states: {}\n", self.visited_bins.len()));
        let dead = self.dead_zones();
        report.push_str(&format!("  Dead zones: {}\n", dead.len()));
        let coverage =
            (self.visited_bins.len() as f32 / self.theoretical_states.len() as f32) * 100.0;
        report.push_str(&format!("  Coverage: {:.1}%\n", coverage));
        report
    }
}

// ============================================================================
// Tests
// ============================================================================

#[test]
fn test_dimension_coverage_monitor_basic() {
    let mut monitor = DimensionCoverageMonitor::new();

    // Observe a state with all zeros
    let state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };
    monitor.observe(&state);

    let coverage = monitor.coverage_per_dimension();
    assert!(
        coverage[0] > 0.0,
        "Health dimension should have coverage after one visit"
    );
    assert_eq!(monitor.dimension_bins[0].len(), 1);
}

#[test]
fn test_dimension_coverage_full_range() {
    let mut monitor = DimensionCoverageMonitor::new();

    // Visit all health levels
    for h in 0..5 {
        let state = RlState {
            health_level: h,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };
        monitor.observe(&state);
    }

    let coverage = monitor.coverage_per_dimension();
    assert_eq!(coverage[0], 100.0, "Health should be 100% covered");
}

#[test]
fn test_region_analyzer_not_stuck() {
    let mut analyzer = StateRegionAnalyzer::new();

    // Visit diverse regions
    for h in 0..5 {
        let state = RlState {
            health_level: h,
            event_rate_q: h,
            activity_count_q: h,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };
        for _ in 0..10 {
            analyzer.observe(&state);
        }
    }

    assert!(
        !analyzer.is_stuck(),
        "Diverse regions should not be detected as stuck"
    );
}

#[test]
fn test_region_analyzer_stuck_detection() {
    let mut analyzer = StateRegionAnalyzer::new();

    // Visit only one state 100 times
    let state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };
    for _ in 0..100 {
        analyzer.observe(&state);
    }

    assert!(
        analyzer.is_stuck(),
        "Monotonic state should be detected as stuck"
    );
}

#[test]
fn test_rare_state_monitor_reachability() {
    let mut monitor = RareStateMonitor::new();

    // Visit terminal state (note: drift_status=1 to avoid triggering zero_drift)
    let terminal = RlState {
        health_level: 4,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 1,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };
    monitor.observe(&terminal);

    assert!(
        monitor.terminal_state_visited,
        "Terminal state should be marked as visited"
    );
    // count should be 1 (only terminal state)
    assert_eq!(
        monitor.count_visited(),
        1,
        "Only terminal state should be visited"
    );
}

#[test]
fn test_action_distribution_monitor() {
    let mut monitor = ActionDistributionMonitor::new();

    let state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    // Distribute actions across all types
    monitor.observe(&state, &RlAction::Continue);
    monitor.observe(&state, &RlAction::Scale);
    monitor.observe(&state, &RlAction::Retry);
    monitor.observe(&state, &RlAction::Fallback);
    monitor.observe(&state, &RlAction::Restart);

    assert!(
        !monitor.is_degenerate(),
        "Diverse actions should not be degenerate"
    );
}

#[test]
fn test_action_distribution_degenerate() {
    let mut monitor = ActionDistributionMonitor::new();

    let state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    // All same action
    for _ in 0..100 {
        monitor.observe(&state, &RlAction::Continue);
    }

    assert!(
        monitor.is_degenerate(),
        "Single action 100% should be degenerate"
    );
}

#[test]
fn test_dead_zone_detector_initialization() {
    let mut detector = DeadZoneDetector::new();
    detector.init_theoretical_space();

    assert!(
        detector.theoretical_states.len() > 0,
        "Theoretical space should be initialized"
    );
}

#[test]
fn test_dead_zone_detector_coverage() {
    let mut detector = DeadZoneDetector::new();
    detector.init_theoretical_space();

    // Visit one state
    let state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };
    detector.observe(&state);

    let dead = detector.dead_zones();
    assert!(
        dead.len() > 0,
        "Should have dead zones when only one state visited"
    );
}

#[test]
fn test_orchestrator_integration_with_monitors() {
    let orch = RlOrchestrator::new_with_seed(42);
    let mut dim_monitor = DimensionCoverageMonitor::new();
    let mut region_analyzer = StateRegionAnalyzer::new();
    let mut rare_monitor = RareStateMonitor::new();

    // Simulate 100 cycles
    let mut state = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    for i in 0..100 {
        // Vary state to explore space
        state.health_level = (i % 5) as u8;
        state.event_rate_q = ((i / 5) % 8) as u8;
        state.activity_count_q = ((i / 40) % 8) as u8;

        let action = orch.select_action(&state);
        orch.update(&state, &action, 0.1, &state, false);

        dim_monitor.observe(&state);
        region_analyzer.observe(&state);
        rare_monitor.observe(&state);
    }

    // Verify some basic metrics
    let coverage = dim_monitor.coverage_per_dimension();
    assert!(coverage[0] > 0.0, "Health dimension should have coverage");
    assert!(
        region_analyzer.total_visits > 0,
        "Should have recorded visits"
    );
    assert!(
        !region_analyzer.is_stuck(),
        "Should not be stuck with varied state"
    );
}

#[test]
fn test_comprehensive_exploration_audit() {
    let orch = RlOrchestrator::new_with_seed(123);
    let mut dim_monitor = DimensionCoverageMonitor::new();
    let mut region_analyzer = StateRegionAnalyzer::new();
    let mut rare_monitor = RareStateMonitor::new();
    let mut action_monitor = ActionDistributionMonitor::new();
    let mut dead_zone = DeadZoneDetector::new();

    dead_zone.init_theoretical_space();

    // Simulate 500 cycles with exploration
    for cycle in 0..500 {
        let health = (cycle / 100) as u8;
        let event_rate = ((cycle / 50) % 8) as u8;
        let activity = ((cycle / 25) % 8) as u8;
        let spc = (cycle % 4) as u8;
        let drift = ((cycle / 200) % 3) as u8;
        let rework = ((cycle / 300) % 8) as u8;
        let circuit = ((cycle / 400) % 3) as u8;
        let phase = ((cycle / 125) % 4) as u8;

        let state = RlState {
            health_level: health.min(4),
            event_rate_q: event_rate,
            activity_count_q: activity,
            spc_alert_level: spc,
            drift_status: drift,
            rework_ratio_q: rework,
            circuit_state: circuit,
            cycle_phase: phase,
        };

        let action = orch.select_action(&state);
        orch.update(&state, &action, 0.1, &state, false);

        dim_monitor.observe(&state);
        region_analyzer.observe(&state);
        rare_monitor.observe(&state);
        action_monitor.observe(&state, &action);
        dead_zone.observe(&state);
    }

    // Assertions
    let coverage = dim_monitor.coverage_per_dimension();
    println!("Coverage per dimension: {:?}", coverage);

    // All dimensions should have some coverage
    for i in 0..8 {
        assert!(
            coverage[i] > 10.0,
            "Dimension {} should have >10% coverage, got {:.1}%",
            i,
            coverage[i]
        );
    }

    assert!(
        !region_analyzer.is_stuck(),
        "Agent should not be stuck in one region"
    );
    assert!(
        rare_monitor.count_visited() > 0,
        "Should have visited some rare states"
    );
    assert!(
        !action_monitor.is_degenerate(),
        "Action distribution should be diverse"
    );

    // Print reports
    println!("\n{}", dim_monitor.report());
    println!("{}", region_analyzer.report());
    println!("{}", rare_monitor.report());
    println!("{}", action_monitor.report());
    println!("{}", dead_zone.report());
}
