# State Space Exploration Audit — wasm4pm RL

**Status:** COMPLETE | **File:** `wasm4pm/tests/state_exploration_audit.rs` | **Tests:** 11 passing  
**Date:** 2026-05-18

## Overview

Comprehensive audit of RL state space exploration coverage. Detects:
1. **Dimension coverage gaps** — which 8D components are underexplored
2. **Stuck regions** — agent concentrated in <30% of state space
3. **Rare state reachability** — can agent reach health=4, high SPC, max rework states
4. **Action distribution uniformity** — whether policy is degenerate
5. **Dead zones** — theoretically reachable but never visited states

## State Space

**Total:** 5 × 8 × 8 × 4 × 3 × 8 × 3 × 4 = **368,640 states**

**Dimensions (8D):**
| Index | Name | Levels | Meaning |
|-------|------|--------|---------|
| 0 | health_level | 5 | Normal(0) → Failed(4) |
| 1 | event_rate_q | 8 | Event throughput quantization |
| 2 | activity_count_q | 8 | Unique activities quantization |
| 3 | spc_alert_level | 4 | SPC special cause signals |
| 4 | drift_status | 3 | No/Low/High drift detection |
| 5 | rework_ratio_q | 8 | Cycle rework quantization |
| 6 | circuit_state | 3 | Closed/HalfOpen/Open |
| 7 | cycle_phase | 4 | Time-based phase bucketing |

## Exploration Monitors (5 Total)

### 1. Dimension Coverage Monitor
```rust
pub struct DimensionCoverageMonitor {
    pub dimension_bins: [HashSet<u8>; 8],
    pub dimension_names: [&'static str; 8],
    pub dimension_max: [u8; 8],
}
```

**Methods:**
- `observe(state)` — Record a state visit and update per-dimension bins
- `coverage_per_dimension() -> [f32; 8]` — Coverage % per dimension
- `underexplored() -> Vec<(idx, name, cov%)>` — Dimensions with <50% coverage
- `report() -> String` — Human-readable coverage breakdown

**Detects:** If agent never enters high event_rate bins, or skips all medium activity levels

---

### 2. State Region Analyzer
```rust
pub struct StateRegionAnalyzer {
    pub regions: HashMap<(u8, u8, u8, u8, u8, u8, u8, u8), usize>,
    pub total_visits: usize,
}
```

**Methods:**
- `observe(state)` — Cluster state into coarse 8D region
- `is_stuck() -> bool` — True if >70% of visits in one region
- `distribution() -> Vec<(count, region_key)>` — Sorted region visit counts
- `report() -> String` — Region clustering summary

**Detects:** Monotonic behavior (e.g., agent always in health=0 region despite varying SPC)

---

### 3. Rare State Reachability Monitor
```rust
pub struct RareStateMonitor {
    pub terminal_state_visited: bool,    // health == 4
    pub critical_state_visited: bool,    // health == 3
    pub high_spc_visited: bool,          // spc_alert_level == 3
    pub zero_drift_visited: bool,        // drift_status == 0
    pub max_rework_visited: bool,        // rework_ratio_q == 7
    pub circuit_open_visited: bool,      // circuit_state == 2
}
```

**Methods:**
- `observe(state)` — Update rare state visit flags
- `count_visited() -> usize` — How many rare states reached (0-6)
- `report() -> String` — Reachability summary

**Detects:** If agent never reaches terminal failure or extreme SPC conditions (limits policy learning)

---

### 4. Action Distribution Monitor
```rust
pub struct ActionDistributionMonitor {
    pub action_counts: HashMap<String, usize>,
    pub action_per_health: HashMap<(u8, String), usize>,
    pub total_actions: usize,
}
```

**Methods:**
- `observe(state, action)` — Record action taken and per-health distribution
- `is_degenerate() -> bool` — True if >80% single action
- `report() -> String` — Action frequency and per-health breakdown

**Detects:** Policy lock-in (agent stuck choosing "Continue" 90% of time regardless of state)

---

### 5. Dead Zone Detector
```rust
pub struct DeadZoneDetector {
    pub theoretical_states: HashSet<u32>,
    pub visited_bins: HashSet<u32>,
    pub dead_zone_threshold: f32,
}
```

**Methods:**
- `init_theoretical_space()` — Sample 10% of state space (36,864 theoretical states)
- `observe(state)` — Mark state as visited
- `dead_zones() -> Vec<u32>` — Unreached theoretical states
- `report() -> String` — Dead zone analysis with coverage %

**Detects:** Unexplored regions in the 8D state lattice

---

## Test Suite (11 Tests)

### Basic Functionality
- ✅ `test_dimension_coverage_monitor_basic` — Single observation updates coverage
- ✅ `test_dimension_coverage_full_range` — All 5 health levels = 100% coverage
- ✅ `test_region_analyzer_not_stuck` — Diverse regions not marked stuck
- ✅ `test_region_analyzer_stuck_detection` — Monotonic state detected as stuck
- ✅ `test_dead_zone_detector_initialization` — Theoretical space initialized
- ✅ `test_dead_zone_detector_coverage` — Dead zones detected when limited exploration

### Monitor Integration
- ✅ `test_rare_state_monitor_reachability` — Rare states detected correctly
- ✅ `test_action_distribution_monitor` — Diverse actions not degenerate
- ✅ `test_action_distribution_degenerate` — Single action 100% marked degenerate
- ✅ `test_orchestrator_integration_with_monitors` — All monitors work with RlOrchestrator
- ✅ `test_comprehensive_exploration_audit` — Full 500-cycle simulation with all monitors

---

## Usage Example

```rust
// Create monitors
let mut dim_monitor = DimensionCoverageMonitor::new();
let mut region_analyzer = StateRegionAnalyzer::new();
let mut rare_monitor = RareStateMonitor::new();
let mut action_monitor = ActionDistributionMonitor::new();
let mut dead_zone = DeadZoneDetector::new();
dead_zone.init_theoretical_space();

// Simulate autonomic loop
let mut orch = RlOrchestrator::new();
for cycle in 0..N_CYCLES {
    let state = compute_state_from_perception();
    let action = orch.select_action(&state);
    orch.update(&state, &action, reward, &next_state, done);

    // Observe with all monitors
    dim_monitor.observe(&state);
    region_analyzer.observe(&state);
    rare_monitor.observe(&state);
    action_monitor.observe(&state, &action);
    dead_zone.observe(&state);
}

// Analyze results
if dim_monitor.coverage_per_dimension()[0] < 50.0 {
    eprintln!("WARNING: Health dimension coverage <50%");
}
if region_analyzer.is_stuck() {
    eprintln!("WARNING: Agent stuck in single region");
}
if rare_monitor.count_visited() < 3 {
    eprintln!("WARNING: <3 rare states reached; policy learning may be incomplete");
}
if action_monitor.is_degenerate() {
    eprintln!("WARNING: Action distribution degenerate; policy may be locked");
}

println!("{}", dim_monitor.report());
println!("{}", region_analyzer.report());
println!("{}", rare_monitor.report());
println!("{}", action_monitor.report());
println!("{}", dead_zone.report());
```

---

## Key Findings from Baseline Run (500 cycles)

From `test_comprehensive_exploration_audit`:
- ✅ All 8 dimensions have >10% coverage (no dimension completely skipped)
- ✅ Agent not stuck in single region (distribution across regions)
- ✅ Some rare states visited (terminal, critical, high_spc)
- ✅ Action distribution diverse (all 5 actions executed)
- ✅ Dead zones exist but coverage is reasonable for 500 cycles

---

## Integration with CI/CD

To audit RL on every build:

```bash
# Run audit tests
cargo test --test state_exploration_audit -- --nocapture

# Collect reports and verify no warnings
cargo test --test comprehensive_exploration_audit -- --nocapture 2>&1 | tee audit.log
grep -c "WARNING" audit.log || echo "AUDIT PASSED (0 warnings)"
```

---

## Future Extensions

1. **Convergence tracking** — Monitor if coverage stabilizes or continues growing
2. **Adaptive exploration** — Use monitor feedback to inject exploration bonus
3. **State sequence analysis** — Detect loops/cycles in transition sequences
4. **Reward correlation** — Map which state regions yield highest rewards
5. **Agent comparison** — Run audit on all 5 RL agents, compare coverage profiles

---

## Exit Code Contract

- **0** if all monitors pass thresholds (coverage >10%, not stuck, rare states visited)
- **Non-zero** if any monitor indicates exploration gap

Implemented as assertions in `test_comprehensive_exploration_audit`.
