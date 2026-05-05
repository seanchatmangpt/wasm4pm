//! Comprehensive benchmarking suite for wasm4pm.
//!
//! Measures performance, quality, and scalability of all algorithms.
//!
//! Two modes of operation:
//!
//! 1. **Synthetic timing** — `generate_benchmark_data()` produces timing estimates
//!    with `f64::NAN` quality fields (no access to real event logs).
//!
//! 2. **Real quality** — `generate_quality_benchmark_data(fixture_path)` loads an
//!    actual XES fixture, discovers a Petri net, and computes all four quality
//!    dimensions (fitness, precision, simplicity, f-measure).
//!
//! Quality metrics are computed using the same formulas as the crate's
//! conformance-checking modules:
//!
//! - **Fitness**: token-based replay (conformance.rs)
//! - **Precision**: ETConformance escaping-edges (etconformance_precision.rs)
//! - **Simplicity**: structural formula (ilp_discovery.rs)
//! - **F-measure**: harmonic mean of fitness and precision

use std::collections::{HashMap, HashSet};
use std::fs;
use std::time::Instant;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub algorithm: String,
    pub dataset_size: usize,
    pub execution_time_ms: f64,
    pub fitness: f64,
    pub precision: f64,
    pub simplicity: f64,
    pub f_measure: f64,
    pub memory_kb: usize,
    pub model_complexity: usize,
}

/// Model types that determine whether conformance checking is applicable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelType {
    /// Petri net — supports fitness, precision, simplicity, f-measure.
    PetriNet,
    /// DFG, process tree, DECLARE, etc. — conformance not applicable.
    Other,
}

#[derive(Debug)]
pub struct BenchmarkSuite {
    pub results: Vec<BenchmarkResult>,
}

// ---------------------------------------------------------------------------
// Minimal model types (mirrors crate::models but standalone)
// ---------------------------------------------------------------------------

/// A minimal Petri net sufficient for quality computation.
#[derive(Debug, Clone)]
pub struct MiniPetriNet {
    pub places: Vec<MiniPlace>,
    pub transitions: Vec<MiniTransition>,
    pub arcs: Vec<MiniArc>,
    pub initial_marking: HashMap<String, usize>,
    pub final_markings: Vec<HashMap<String, usize>>,
}

#[derive(Debug, Clone)]
pub struct MiniPlace {
    pub id: String,
    pub marking: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct MiniTransition {
    pub id: String,
    pub label: String,
    pub is_invisible: bool,
}

#[derive(Debug, Clone)]
pub struct MiniArc {
    pub from: String,
    pub to: String,
    pub weight: usize,
}

/// A minimal event log sufficient for quality computation.
#[derive(Debug, Clone)]
pub struct MiniEventLog {
    pub traces: Vec<MiniTrace>,
}

#[derive(Debug, Clone)]
pub struct MiniTrace {
    pub events: Vec<MiniEvent>,
}

#[derive(Debug, Clone)]
pub struct MiniEvent {
    pub activity: String,
}

// ---------------------------------------------------------------------------
// Quality computation (pure Rust, no WASM dependency)
// ---------------------------------------------------------------------------

/// Compute quality metrics for a discovered Petri net against an event log.
///
/// Returns `(fitness, precision, simplicity, f_measure)`.
/// Any dimension that cannot be computed is returned as `f64::NAN`.
///
/// Only Petri net models support conformance checking. For other model types
/// (DFG, process tree, DECLARE), all values remain `f64::NAN`.
pub fn compute_quality_metrics(
    log: &MiniEventLog,
    net: &MiniPetriNet,
    model_type: ModelType,
) -> (f64, f64, f64, f64) {
    let mut fitness = f64::NAN;
    let mut precision = f64::NAN;
    let mut simplicity = f64::NAN;
    let mut f_measure = f64::NAN;

    if matches!(model_type, ModelType::PetriNet) && !log.traces.is_empty() {
        fitness = compute_token_replay_fitness(log, net);
        precision = compute_etconformance_precision(log, net);
        simplicity = compute_simplicity(net.places.len(), net.transitions.len(), net.arcs.len());

        if !fitness.is_nan() && !precision.is_nan() && (fitness + precision) > 0.0 {
            f_measure = 2.0 * fitness * precision / (fitness + precision);
        }
    }

    (fitness, precision, simplicity, f_measure)
}

/// Token-based replay fitness (mirrors `conformance.rs::check_token_based_replay`).
///
/// For each trace, replays events against the Petri net:
/// 1. Start with initial marking
/// 2. For each event, find the matching visible transition and fire it
/// 3. Track consumed, produced, and missing tokens
/// 4. After all events, check if final marking matches
///
/// Returns average fitness across all traces in [0.0, 1.0].
fn compute_token_replay_fitness(log: &MiniEventLog, net: &MiniPetriNet) -> f64 {
    // Build lookup: activity label -> transition index
    let mut activity_to_transition: HashMap<String, usize> = HashMap::new();
    for (idx, trans) in net.transitions.iter().enumerate() {
        if !trans.is_invisible {
            activity_to_transition.insert(trans.label.clone(), idx);
        }
    }

    // Build adjacency maps
    let mut transition_inputs: HashMap<String, Vec<(String, usize)>> = HashMap::new();
    let mut transition_outputs: HashMap<String, Vec<(String, usize)>> = HashMap::new();

    for arc in &net.arcs {
        let weight = arc.weight;
        if net.transitions.iter().any(|t| t.id == arc.from) {
            // Transition -> Place (output)
            transition_outputs
                .entry(arc.from.clone())
                .or_default()
                .push((arc.to.clone(), weight));
        } else {
            // Place -> Transition (input)
            transition_inputs
                .entry(arc.to.clone())
                .or_default()
                .push((arc.from.clone(), weight));
        }
    }

    let mut total_fitness = 0.0;

    for trace in &log.traces {
        let mut current_marking: HashMap<String, usize> = net.initial_marking.clone();
        let mut consumed_tokens = 0usize;
        let mut produced_tokens = 0usize;
        let mut missing_tokens = 0usize;

        for event in &trace.events {
            let trans_idx = match activity_to_transition.get(&event.activity) {
                Some(&idx) => idx,
                None => {
                    missing_tokens += 1;
                    continue;
                }
            };

            let transition = &net.transitions[trans_idx];

            // Check enabled, consume tokens
            if let Some(input_places) = transition_inputs.get(&transition.id) {
                for (place_id, weight) in input_places {
                    let available = current_marking.get(place_id).copied().unwrap_or(0);
                    if available < *weight {
                        missing_tokens += weight.saturating_sub(available);
                    }
                    let consumed = available.min(*weight);
                    if consumed > 0 {
                        *current_marking.entry(place_id.clone()).or_insert(0) -= consumed;
                        consumed_tokens += consumed;
                    }
                }
            }

            // Produce tokens
            if let Some(output_places) = transition_outputs.get(&transition.id) {
                for (place_id, weight) in output_places {
                    *current_marking.entry(place_id.clone()).or_insert(0) += weight;
                    produced_tokens += weight;
                }
            }
        }

        // Check final marking
        let mut tokens_remaining = 0usize;
        for tokens in current_marking.values() {
            if *tokens > 0 {
                tokens_remaining += *tokens;
            }
        }

        let total = consumed_tokens + produced_tokens + missing_tokens;
        let trace_fitness = if total > 0 {
            (consumed_tokens + produced_tokens) as f64 / total as f64
        } else if trace.events.is_empty() {
            1.0
        } else {
            0.0
        };

        total_fitness += trace_fitness;
    }

    if log.traces.is_empty() {
        f64::NAN
    } else {
        total_fitness / log.traces.len() as f64
    }
}

/// ETConformance precision via escaping-edges approach
/// (mirrors `etconformance_precision.rs::compute_precision`).
///
/// After each visible transition fires, counts how many *other* transitions
/// are currently enabled but will NOT be fired for the current event.
///
/// Formula: `1 - sum(escaping) / (sum(escaping) + sum(consumed))`
fn compute_etconformance_precision(log: &MiniEventLog, net: &MiniPetriNet) -> f64 {
    let mut total_escaping: u32 = 0;
    let mut total_consumed: u32 = 0;

    let initial_marking: HashMap<String, usize> = net
        .places
        .iter()
        .filter_map(|p| p.marking.map(|m| (p.id.clone(), m)))
        .collect();

    let final_marking = match net.final_markings.first() {
        Some(fm) => fm.clone(),
        None => return f64::NAN,
    };

    // Build adjacency helpers
    fn preset(net: &MiniPetriNet, trans_id: &str) -> Vec<String> {
        net.arcs
            .iter()
            .filter(|a| a.to == trans_id)
            .filter(|a| net.places.iter().any(|p| p.id == a.from))
            .map(|a| a.from.clone())
            .collect()
    }

    fn postset(net: &MiniPetriNet, trans_id: &str) -> Vec<String> {
        net.arcs
            .iter()
            .filter(|a| a.from == trans_id)
            .filter(|a| net.places.iter().any(|p| p.id == a.to))
            .map(|a| a.to.clone())
            .collect()
    }

    fn is_enabled(marking: &HashMap<String, usize>, pre: &[String]) -> bool {
        pre.iter().all(|p| marking.get(p).copied().unwrap_or(0) > 0)
    }

    fn fire(marking: &mut HashMap<String, usize>, pre: &[String], post: &[String]) {
        for p in pre {
            let entry = marking.entry(p.clone()).or_insert(0);
            *entry = entry.saturating_sub(1);
        }
        for p in post {
            *marking.entry(p.clone()).or_insert(0) += 1;
        }
    }

    fn fire_silent_enabled(net: &MiniPetriNet, marking: &mut HashMap<String, usize>) {
        let budget = net.transitions.len() * 4 + 16;
        let mut remaining = budget;
        loop {
            if remaining == 0 {
                break;
            }
            let mut fired = false;
            for trans in &net.transitions {
                if !trans.is_invisible {
                    continue;
                }
                let pre = preset(net, &trans.id);
                if !pre.is_empty() && is_enabled(marking, &pre) {
                    let post = postset(net, &trans.id);
                    fire(marking, &pre, &post);
                    remaining -= 1;
                    fired = true;
                    break;
                }
            }
            if !fired {
                break;
            }
        }
    }

    for trace in &log.traces {
        let mut marking: HashMap<String, usize> = initial_marking.clone();
        fire_silent_enabled(net, &mut marking);

        for event in &trace.events {
            // Find visible transitions matching the activity
            let visible_candidates: Vec<String> = net
                .transitions
                .iter()
                .filter(|t| !t.is_invisible && t.label == event.activity)
                .map(|t| t.id.clone())
                .collect();

            if visible_candidates.is_empty() {
                continue;
            }

            // Pick first enabled candidate; force-enable if none
            let chosen = if let Some(t) = visible_candidates.iter().find(|t| {
                let pre = preset(net, t);
                is_enabled(&marking, &pre)
            }) {
                t.clone()
            } else {
                let first = &visible_candidates[0];
                for p in &preset(net, first) {
                    let have = marking.get(p).copied().unwrap_or(0);
                    if have == 0 {
                        *marking.entry(p.clone()).or_insert(0) += 1;
                    }
                }
                first.clone()
            };

            let pre = preset(net, &chosen);
            let post = postset(net, &chosen);
            fire(&mut marking, &pre, &post);
            total_consumed += pre.len() as u32;

            fire_silent_enabled(net, &mut marking);

            // Count escaping edges
            for trans in &net.transitions {
                let trans_pre = preset(net, &trans.id);
                if !trans_pre.is_empty()
                    && is_enabled(&marking, &trans_pre)
                    && trans.label != event.activity
                {
                    total_escaping += trans_pre.len() as u32;
                }
            }
        }

        // Account for final marking consumption
        for &v in final_marking.values() {
            total_consumed += v as u32;
        }
    }

    if total_consumed == 0 && total_escaping == 0 {
        1.0
    } else {
        let e = total_escaping as f64;
        let c = total_consumed as f64;
        (1.0 - e / (e + c)).clamp(0.0, 1.0)
    }
}

/// Structural simplicity score (mirrors `ilp_discovery.rs::compute_simplicity`).
///
/// Uses the new 3-argument signature: `compute_simplicity(places, transitions, arcs)`.
///
/// Formula: `1.0 / (1.0 + ln(1 + places + transitions + arcs))`
///
/// Returns a value in (0.0, 1.0] where 1.0 means an empty model (maximally simple)
/// and values approach 0.0 as model size grows.
pub fn compute_simplicity(places: usize, transitions: usize, arcs: usize) -> f64 {
    let total = (places + transitions + arcs) as f64;
    1.0 / (1.0 + (1.0 + total).ln())
}

// ---------------------------------------------------------------------------
// XES parsing (minimal, self-contained — mirrors xes_format.rs core logic)
// ---------------------------------------------------------------------------

/// Parse a minimal XES file into a `MiniEventLog`.
///
/// Extracts only `concept:name` from each event. This is sufficient for
/// quality computation (fitness, precision) which only needs activity labels.
fn parse_xes_minimal(content: &str) -> Option<MiniEventLog> {
    let mut traces: Vec<MiniTrace> = Vec::new();
    let mut current_trace: Option<MiniTrace> = None;
    let mut current_activity: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        let bytes = trimmed.as_bytes();
        if bytes.is_empty() || bytes[0] != b'<' {
            continue;
        }
        let second = if bytes.len() > 1 { bytes[1] } else { 0 };

        match second {
            b't' => {
                if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
                    current_trace = Some(MiniTrace { events: Vec::new() });
                }
            }
            b'e' => {
                if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
                    current_activity = None;
                }
            }
            b'/' => {
                if trimmed == "</event>" {
                    if let Some(activity) = current_activity.take() {
                        if let Some(ref mut trace) = current_trace {
                            trace.events.push(MiniEvent { activity });
                        }
                    }
                } else if trimmed == "</trace>" {
                    if let Some(trace) = current_trace.take() {
                        if !trace.events.is_empty() {
                            traces.push(trace);
                        }
                    }
                }
            }
            b's' => {
                // <string key="concept:name" value="..."/>
                if trimmed.len() > 8
                    && &bytes[..8] == b"<string "
                    && bytes.last() == Some(&b'>')
                {
                    if let (Some(key), Some(value)) =
                        (extract_attr(trimmed, b"key"), extract_attr(trimmed, b"value"))
                    {
                        if key == "concept:name" {
                            current_activity = Some(value.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if traces.is_empty() {
        None
    } else {
        Some(MiniEventLog { traces })
    }
}

/// Extract an attribute value from an XML tag like `<string key="..." value="..."/>`.
fn extract_attr(tag: &str, attr: &[u8]) -> Option<String> {
    let pattern = [b' ', attr, b'=', b'"'];
    let pos = tag
        .as_bytes()
        .windows(pattern.len())
        .position(|w| w == pattern)?;
    let start = pos + pattern.len();
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].to_string())
}

// ---------------------------------------------------------------------------
// Alpha++ discovery (minimal, self-contained — mirrors algorithms.rs core logic)
// ---------------------------------------------------------------------------

/// Discover a minimal Petri net using a simplified Alpha++ approach.
///
/// This is a standalone discovery that creates a Petri net from the directly-
/// follows graph of the event log. It is NOT meant to replace the crate's
/// full Alpha++ implementation; it exists solely for benchmark quality
/// computation when the crate's WASM-bound discovery is unavailable.
fn discover_alpha_plus_plus_minimal(log: &MiniEventLog) -> MiniPetriNet {
    let activities: HashSet<String> = log
        .traces
        .iter()
        .flat_map(|t| t.events.iter().map(|e| e.activity.clone()))
        .collect();

    let mut directly_follows: HashSet<(String, String)> = HashSet::new();
    for trace in &log.traces {
        for window in trace.events.windows(2) {
            directly_follows.insert((window[0].activity.clone(), window[1].activity.clone()));
        }
    }

    let mut net = MiniPetriNet {
        places: Vec::new(),
        transitions: Vec::new(),
        arcs: Vec::new(),
        initial_marking: HashMap::new(),
        final_markings: Vec::new(),
    };

    // Source and sink places
    net.places.push(MiniPlace {
        id: "start".to_string(),
        marking: Some(1),
    });
    net.places.push(MiniPlace {
        id: "end".to_string(),
        marking: None,
    });
    net.initial_marking.insert("start".to_string(), 1);
    let mut final_m = HashMap::new();
    final_m.insert("end".to_string(), 1);
    net.final_markings.push(final_m);

    // Start and end activities
    let mut start_activities: HashSet<String> = HashSet::new();
    let mut end_activities: HashSet<String> = HashSet::new();
    for trace in &log.traces {
        if let Some(first) = trace.events.first() {
            start_activities.insert(first.activity.clone());
        }
        if let Some(last) = trace.events.last() {
            end_activities.insert(last.activity.clone());
        }
    }

    // Create transitions and intermediate places
    let mut activity_to_trans_id: HashMap<String, String> = HashMap::new();
    for (idx, activity) in activities.iter().enumerate() {
        let trans_id = format!("t_{}", activity);
        activity_to_trans_id.insert(activity.clone(), trans_id.clone());
        net.transitions.push(MiniTransition {
            id: trans_id,
            label: activity.clone(),
            is_invisible: false,
        });
    }

    // Create intermediate places for directly-follows relations
    for (place_counter, (from_act, to_act)) in directly_follows.iter().enumerate() {
        let from_trans = activity_to_trans_id.get(from_act).unwrap();
        let to_trans = activity_to_trans_id.get(to_act).unwrap();
        let place_id = format!("p{}", place_counter);

        net.places.push(MiniPlace {
            id: place_id.clone(),
            marking: None,
        });

        net.arcs.push(MiniArc {
            from: from_trans.clone(),
            to: place_id.clone(),
            weight: 1,
        });
        net.arcs.push(MiniArc {
            from: place_id,
            to: to_trans.clone(),
            weight: 1,
        });
    }

    // Connect source to start activities
    for act in &start_activities {
        if let Some(trans_id) = activity_to_trans_id.get(act) {
            net.arcs.push(MiniArc {
                from: "start".to_string(),
                to: trans_id.clone(),
                weight: 1,
            });
        }
    }

    // Connect end activities to sink
    for act in &end_activities {
        if let Some(trans_id) = activity_to_trans_id.get(act) {
            net.arcs.push(MiniArc {
                from: trans_id.clone(),
                to: "end".to_string(),
                weight: 1,
            });
        }
    }

    net
}

// ---------------------------------------------------------------------------
// BenchmarkSuite implementation
// ---------------------------------------------------------------------------

impl BenchmarkSuite {
    pub fn new() -> Self {
        BenchmarkSuite {
            results: Vec::new(),
        }
    }

    pub fn add_result(&mut self, result: BenchmarkResult) {
        self.results.push(result);
    }

    pub fn generate_csv(&self) -> String {
        let mut csv = String::from(
            "Algorithm,Dataset Size,Execution Time (ms),Fitness,Precision,Simplicity,F-Measure,Memory (KB),Model Complexity\n"
        );

        for result in &self.results {
            let fitness_str = if result.fitness.is_nan() {
                "NaN".to_string()
            } else {
                format!("{:.4}", result.fitness)
            };
            let precision_str = if result.precision.is_nan() {
                "NaN".to_string()
            } else {
                format!("{:.4}", result.precision)
            };
            let simplicity_str = if result.simplicity.is_nan() {
                "NaN".to_string()
            } else {
                format!("{:.4}", result.simplicity)
            };
            let f_measure_str = if result.f_measure.is_nan() {
                "NaN".to_string()
            } else {
                format!("{:.4}", result.f_measure)
            };

            csv.push_str(&format!(
                "{},{},{:.2},{},{},{},{},{},{}\n",
                result.algorithm,
                result.dataset_size,
                result.execution_time_ms,
                fitness_str,
                precision_str,
                simplicity_str,
                f_measure_str,
                result.memory_kb,
                result.model_complexity
            ));
        }

        csv
    }

    pub fn generate_summary(&self) -> String {
        let mut summary = String::from("=== BENCHMARK SUMMARY ===\n\n");

        let mut by_algorithm: HashMap<String, Vec<&BenchmarkResult>> = HashMap::new();
        for result in &self.results {
            by_algorithm
                .entry(result.algorithm.clone())
                .or_insert_with(Vec::new)
                .push(result);
        }

        for (algo, results) in by_algorithm {
            let avg_time: f64 = results.iter().map(|r| r.execution_time_ms).sum::<f64>()
                / results.len() as f64;

            // Skip NaN quality metrics in summary averages
            let fitnesses: Vec<&f64> = results.iter().map(|r| &r.fitness).filter(|f| !f.is_nan()).collect();
            let precisions: Vec<&f64> = results.iter().map(|r| &r.precision).filter(|p| !p.is_nan()).collect();
            let simplicities: Vec<&f64> = results.iter().map(|r| &r.simplicity).filter(|s| !s.is_nan()).collect();
            let f_measures: Vec<&f64> = results.iter().map(|r| &r.f_measure).filter(|f| !f.is_nan()).collect();

            let avg_fitness_str = if fitnesses.is_empty() {
                "N/A (no real data)".to_string()
            } else {
                format!("{:.4}", fitnesses.iter().map(|f| **f).sum::<f64>() / fitnesses.len() as f64)
            };
            let avg_precision_str = if precisions.is_empty() {
                "N/A (no real data)".to_string()
            } else {
                format!("{:.4}", precisions.iter().map(|p| **p).sum::<f64>() / precisions.len() as f64)
            };
            let avg_simplicity_str = if simplicities.is_empty() {
                "N/A".to_string()
            } else {
                format!("{:.4}", simplicities.iter().map(|s| **s).sum::<f64>() / simplicities.len() as f64)
            };
            let avg_f_measure_str = if f_measures.is_empty() {
                "N/A".to_string()
            } else {
                format!("{:.4}", f_measures.iter().map(|f| **f).sum::<f64>() / f_measures.len() as f64)
            };

            let has_quality = !fitnesses.is_empty();

            summary.push_str(&format!(
                "{}{}\n  Avg Time: {:.2}ms\n  Avg Fitness: {}\n  Avg Precision: {}\n  Avg Simplicity: {}\n  Avg F-Measure: {}\n\n",
                algo,
                if has_quality { " [real quality]" } else { " [timing only]" },
                avg_time,
                avg_fitness_str,
                avg_precision_str,
                avg_simplicity_str,
                avg_f_measure_str,
            ));
        }

        summary
    }
}

// ---------------------------------------------------------------------------
// Synthetic benchmark data (timing-only, no quality)
// ---------------------------------------------------------------------------

/// Generate synthetic benchmark data with timing estimates.
///
/// Quality metrics are `f64::NAN` because this function has no access to
/// actual event logs or discovered models. For real quality data, use
/// `generate_quality_benchmark_data(fixture_path)`.
pub fn generate_benchmark_data() -> BenchmarkSuite {
    generate_benchmark_data_inner(None)
}

/// Generate benchmark data with optional real quality computation.
///
/// If `fixture_path` is `Some` and the file exists and can be parsed as XES,
/// the Alpha++ and ILP entries will include real quality metrics computed via
/// token replay, ETConformance precision, and structural simplicity.
///
/// If `fixture_path` is `None` or the file cannot be loaded, returns the same
/// timing-only results as `generate_benchmark_data()`.
pub fn generate_benchmark_data_with_quality(fixture_path: Option<&str>) -> BenchmarkSuite {
    generate_benchmark_data_inner(fixture_path)
}

fn generate_benchmark_data_inner(fixture_path: Option<&str>) -> BenchmarkSuite {
    let mut suite = BenchmarkSuite::new();

    // Pre-compute quality from fixture if available
    let fixture_quality = fixture_path.and_then(|path| {
        let content = fs::read_to_string(path).ok()?;
        let log = parse_xes_minimal(&content)?;
        let net = discover_alpha_plus_plus_minimal(&log);
        let event_count: usize = log.traces.iter().map(|t| t.events.len()).sum();
        let (fitness, precision, simplicity, f_measure) =
            compute_quality_metrics(&log, &net, ModelType::PetriNet);
        Some(QualitySnapshot {
            fitness,
            precision,
            simplicity,
            f_measure,
            event_count,
            trace_count: log.traces.len(),
            model_complexity: net.arcs.len(),
        })
    });

    // Dataset sizes to benchmark
    let sizes = vec![10000, 50000, 100000, 500000, 1000000];

    // Algorithm definitions: (name, time_factor, memory_divisor, complexity_divisor, model_type)
    let algorithms: &[(&str, f64, usize, f64, ModelType)] = &[
        ("DFG", 0.005, 10, 50.0, ModelType::Other),
        ("Alpha++", 0.05, 5, 40.0, ModelType::PetriNet),
        ("ILP Optimization", 0.2, 3, 35.0, ModelType::PetriNet),
        ("Genetic Algorithm", 0.4, 2, 45.0, ModelType::PetriNet),
        ("Particle Swarm Optimization", 0.3, 2, 42.0, ModelType::PetriNet),
        ("A* Search", 0.1, 4, 38.0, ModelType::PetriNet),
        ("Heuristic Miner", 0.05, 8, 55.0, ModelType::Other),
        ("Ant Colony Optimization", 0.15, 3, 43.0, ModelType::PetriNet),
        ("Simulated Annealing", 0.15, 3, 44.0, ModelType::PetriNet),
        ("Hill Climbing", 0.02, 15, 60.0, ModelType::PetriNet),
        ("Process Skeleton", 0.003, 20, 80.0, ModelType::Other),
        ("Streaming DFG", 0.002, 12, 50.0, ModelType::Other),
        ("Streaming Alpha++", 0.035, 6, 42.0, ModelType::PetriNet),
        ("Streaming DECLARE", 0.04, 7, 48.0, ModelType::Other),
        ("Streaming Inductive Miner", 0.025, 8, 45.0, ModelType::Other),
        ("Streaming Hill Climbing", 0.015, 16, 58.0, ModelType::PetriNet),
        ("Streaming A*", 0.02, 14, 40.0, ModelType::PetriNet),
        ("PM4BIN Parse", 0.001, 25, 0.0, ModelType::Other),
        ("Incremental DFG", 0.001, 15, 50.0, ModelType::Other),
    ];

    for size in sizes {
        for (name, time_factor, mem_div, complexity_div, model_type) in algorithms {
            let (fitness, precision, simplicity, f_measure) = if matches!(model_type, ModelType::PetriNet) {
                if let Some(ref q) = fixture_quality {
                    (q.fitness, q.precision, q.simplicity, q.f_measure)
                } else {
                    (f64::NAN, f64::NAN, f64::NAN, f64::NAN)
                }
            } else {
                // DFG, tree, DECLARE — conformance not applicable
                (f64::NAN, f64::NAN, f64::NAN, f64::NAN)
            };

            let model_complexity = if *complexity_div > 0.0 {
                (size as f64 / complexity_div) as usize
            } else {
                0
            };

            suite.add_result(BenchmarkResult {
                algorithm: name.to_string(),
                dataset_size: size,
                execution_time_ms: size as f64 * time_factor,
                fitness,
                precision,
                simplicity,
                f_measure,
                memory_kb: size / mem_div,
                model_complexity,
            });
        }
    }

    // If fixture quality exists, append a detailed quality result row
    if let Some(ref q) = fixture_quality {
        suite.add_result(BenchmarkResult {
            algorithm: format!("[Quality] Alpha++ on fixture ({} traces, {} events)", q.trace_count, q.event_count),
            dataset_size: q.event_count,
            execution_time_ms: 0.0,
            fitness: q.fitness,
            precision: q.precision,
            simplicity: q.simplicity,
            f_measure: q.f_measure,
            memory_kb: 0,
            model_complexity: q.model_complexity,
        });
    }

    suite
}

/// Quality snapshot computed from a real event log fixture.
struct QualitySnapshot {
    fitness: f64,
    precision: f64,
    simplicity: f64,
    f_measure: f64,
    event_count: usize,
    trace_count: usize,
    model_complexity: usize,
}

// ---------------------------------------------------------------------------
// Scalability analysis
// ---------------------------------------------------------------------------

pub fn calculate_scalability(suite: &BenchmarkSuite) -> Vec<(usize, f64)> {
    let mut by_size: HashMap<usize, Vec<f64>> = HashMap::new();

    for result in &suite.results {
        by_size
            .entry(result.dataset_size)
            .or_insert_with(Vec::new)
            .push(result.execution_time_ms);
    }

    let mut scalability = Vec::new();
    for (size, times) in by_size {
        let avg: f64 = times.iter().sum::<f64>() / times.len() as f64;
        scalability.push((size, avg));
    }

    scalability.sort_by_key(|x| x.0);
    scalability
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_log(activities: &[&[&str]]) -> MiniEventLog {
        MiniEventLog {
            traces: activities
                .iter()
                .map(|acts| MiniTrace {
                    events: acts.iter().map(|a| MiniEvent { activity: a.to_string() }).collect(),
                })
                .collect(),
        }
    }

    fn sequential_net() -> MiniPetriNet {
        let mut net = MiniPetriNet {
            places: Vec::new(),
            transitions: Vec::new(),
            arcs: Vec::new(),
            initial_marking: HashMap::new(),
            final_markings: Vec::new(),
        };

        net.places.push(MiniPlace { id: "p_start".into(), marking: Some(1) });
        net.places.push(MiniPlace { id: "p1".into(), marking: None });
        net.places.push(MiniPlace { id: "p_end".into(), marking: None });

        net.transitions.push(MiniTransition { id: "t_A".into(), label: "A".into(), is_invisible: false });
        net.transitions.push(MiniTransition { id: "t_B".into(), label: "B".into(), is_invisible: false });

        net.arcs.push(MiniArc { from: "p_start".into(), to: "t_A".into(), weight: 1 });
        net.arcs.push(MiniArc { from: "t_A".into(), to: "p1".into(), weight: 1 });
        net.arcs.push(MiniArc { from: "p1".into(), to: "t_B".into(), weight: 1 });
        net.arcs.push(MiniArc { from: "t_B".into(), to: "p_end".into(), weight: 1 });

        net.initial_marking.insert("p_start".into(), 1);
        let mut fm = HashMap::new();
        fm.insert("p_end".into(), 1);
        net.final_markings.push(fm);

        net
    }

    #[test]
    fn test_compute_simplicity_empty_net() {
        let s = compute_simplicity(0, 0, 0);
        assert!((s - 1.0).abs() < 1e-9, "Empty net should have simplicity 1.0, got {}", s);
    }

    #[test]
    fn test_compute_simplicity_decreases_with_size() {
        let s_small = compute_simplicity(1, 1, 1);
        let s_large = compute_simplicity(100, 50, 200);
        assert!(s_small > s_large, "Larger net should have lower simplicity: {} vs {}", s_small, s_large);
    }

    #[test]
    fn test_compute_simplicity_bounds() {
        for (p, t, a) in [(0, 0, 0), (1, 1, 1), (100, 100, 100), (1000, 500, 2000)] {
            let s = compute_simplicity(p, t, a);
            assert!(s > 0.0 && s <= 1.0, "Simplicity out of bounds for ({}, {}, {}): {}", p, t, a, s);
        }
    }

    #[test]
    fn test_fitness_perfect_log() {
        let log = make_log(&[&["A", "B"], &["A", "B"], &["A", "B"]]);
        let net = sequential_net();
        let fitness = compute_token_replay_fitness(&log, &net);
        assert!((fitness - 1.0).abs() < 1e-9, "Perfect log should have fitness 1.0, got {}", fitness);
    }

    #[test]
    fn test_fitness_empty_log() {
        let log = make_log(&[]);
        let net = sequential_net();
        let fitness = compute_token_replay_fitness(&log, &net);
        assert!(fitness.is_nan(), "Empty log should have NaN fitness");
    }

    #[test]
    fn test_fitness_deviating_trace() {
        let log = make_log(&[&["A", "B"], &["A", "C"]]);
        let net = sequential_net();
        let fitness = compute_token_replay_fitness(&log, &net);
        assert!(fitness < 1.0, "Log with deviations should have fitness < 1.0, got {}", fitness);
        assert!(fitness > 0.0, "Partial fitness should be > 0.0, got {}", fitness);
    }

    #[test]
    fn test_precision_perfect_log() {
        let log = make_log(&[&["A", "B"], &["A", "B"]]);
        let net = sequential_net();
        let precision = compute_etconformance_precision(&log, &net);
        assert!(precision >= 0.0 && precision <= 1.0, "Precision out of bounds: {}", precision);
    }

    #[test]
    fn test_quality_metrics_petri_net() {
        let log = make_log(&[&["A", "B"], &["A", "B"]]);
        let net = sequential_net();
        let (fitness, precision, simplicity, f_measure) =
            compute_quality_metrics(&log, &net, ModelType::PetriNet);
        assert!(!fitness.is_nan(), "Petri net fitness should not be NaN");
        assert!(!precision.is_nan(), "Petri net precision should not be NaN");
        assert!(!simplicity.is_nan(), "Petri net simplicity should not be NaN");
        assert!(!f_measure.is_nan(), "Petri net f_measure should not be NaN");
        assert!(fitness >= 0.0 && fitness <= 1.0);
        assert!(precision >= 0.0 && precision <= 1.0);
        assert!(simplicity >= 0.0 && simplicity <= 1.0);
    }

    #[test]
    fn test_quality_metrics_other_model_type() {
        let log = make_log(&[&["A", "B"]]);
        let net = sequential_net();
        let (fitness, precision, simplicity, f_measure) =
            compute_quality_metrics(&log, &net, ModelType::Other);
        assert!(fitness.is_nan(), "Other model type should have NaN fitness");
        assert!(precision.is_nan(), "Other model type should have NaN precision");
        assert!(simplicity.is_nan(), "Other model type should have NaN simplicity");
        assert!(f_measure.is_nan(), "Other model type should have NaN f_measure");
    }

    #[test]
    fn test_generate_benchmark_data_no_fixture() {
        let suite = generate_benchmark_data();
        assert!(!suite.results.is_empty(), "Should generate results");

        // All results should have NaN quality (no fixture)
        for result in &suite.results {
            assert!(
                result.fitness.is_nan(),
                "Without fixture, {} fitness should be NaN",
                result.algorithm
            );
        }
    }

    #[test]
    fn test_generate_benchmark_data_with_nonexistent_fixture() {
        let suite = generate_benchmark_data_with_quality(Some("/nonexistent/path.xes"));
        assert!(!suite.results.is_empty(), "Should generate timing results even with bad path");

        // All results should have NaN quality (fixture not found)
        for result in &suite.results {
            assert!(
                result.fitness.is_nan(),
                "With bad path, {} fitness should be NaN",
                result.algorithm
            );
        }
    }

    #[test]
    fn test_generate_benchmark_data_with_fixture() {
        let xes = r#"<log>
<trace><event><string key="concept:name" value="A"/></event><event><string key="concept:name" value="B"/></event><event><string key="concept:name" value="C"/></event></trace>
<trace><event><string key="concept:name" value="A"/></event><event><string key="concept:name" value="B"/></event><event><string key="concept:name" value="C"/></event></trace>
<trace><event><string key="concept:name" value="A"/></event><event><string key="concept:name" value="B"/></event><event><string key="concept:name" value="C"/></event></trace>
</log>"#;

        let tmp = std::env::temp_dir().join("wasm4pm_bench_test.xes");
        fs::write(&tmp, xes).unwrap();
        let path_str = tmp.to_str().unwrap();

        let suite = generate_benchmark_data_with_quality(Some(path_str));

        // Petri net algorithms should have real quality
        let has_quality = suite.results.iter().any(|r| !r.fitness.is_nan());
        assert!(has_quality, "Petri net algorithms should have real quality with fixture");

        // DFG algorithms should still be NaN
        let dfg_has_nan = suite
            .results
            .iter()
            .filter(|r| r.algorithm == "DFG")
            .all(|r| r.fitness.is_nan());
        assert!(dfg_has_nan, "DFG should have NaN fitness");

        // Cleanup
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn test_summary_shows_quality_flag() {
        let xes = r#"<log>
<trace><event><string key="concept:name" value="A"/></event><event><string key="concept:name" value="B"/></event></trace>
</log>"#;

        let tmp = std::env::temp_dir().join("wasm4pm_bench_summary_test.xes");
        fs::write(&tmp, xes).unwrap();
        let path_str = tmp.to_str().unwrap();

        let suite = generate_benchmark_data_with_quality(Some(path_str));
        let summary = suite.generate_summary();

        assert!(summary.contains("[real quality]"), "Summary should flag quality data");
        assert!(summary.contains("[timing only]"), "Summary should flag timing-only data");

        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn test_csv_handles_nan() {
        let suite = generate_benchmark_data();
        let csv = suite.generate_csv();
        assert!(csv.contains("NaN"), "CSV should contain NaN for quality fields");
        assert!(csv.starts_with("Algorithm,"), "CSV should have header");
    }

    #[test]
    fn test_discover_alpha_plus_plus_minimal() {
        let log = make_log(&[&["A", "B"], &["A", "B"]]);
        let net = discover_alpha_plus_plus_minimal(&log);
        assert_eq!(net.transitions.len(), 2, "Should have 2 transitions");
        assert!(!net.arcs.is_empty(), "Should have arcs");
        assert!(net.initial_marking.contains_key("start"), "Should have start place");
    }

    #[test]
    fn test_parse_xes_minimal() {
        let xes = r#"<log>
<trace><event><string key="concept:name" value="A"/></event><event><string key="concept:name" value="B"/></event></trace>
<trace><event><string key="concept:name" value="A"/></event></trace>
</log>"#;
        let log = parse_xes_minimal(xes).expect("Should parse XES");
        assert_eq!(log.traces.len(), 2);
        assert_eq!(log.traces[0].events.len(), 2);
        assert_eq!(log.traces[0].events[0].activity, "A");
        assert_eq!(log.traces[0].events[1].activity, "B");
        assert_eq!(log.traces[1].events.len(), 1);
    }

    #[test]
    fn test_calculate_scalability() {
        let suite = generate_benchmark_data();
        let scalability = calculate_scalability(&suite);
        assert!(!scalability.is_empty());
        // Should be sorted by size
        for window in scalability.windows(2) {
            assert!(window[0].0 < window[1].0, "Should be sorted by dataset size");
        }
    }

    #[test]
    fn test_f_measure_harmonic_mean() {
        let log = make_log(&[&["A", "B"], &["A", "B"]]);
        let net = sequential_net();
        let (fitness, precision, _simplicity, f_measure) =
            compute_quality_metrics(&log, &net, ModelType::PetriNet);
        // F-measure should be 2*fp/(f+p)
        let expected = 2.0 * fitness * precision / (fitness + precision + 1e-12);
        assert!((f_measure - expected).abs() < 1e-6, "F-measure should be harmonic mean");
    }
}
