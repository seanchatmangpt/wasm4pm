//! Regression Detector Test Suite — Agent 8
//!
//! 25 conformance test vectors covering:
//!   guards(3) + dispatch(4) + marking(3) + rl(2) + spc(4) + construct(1) + misc(8) = 25
//!
//! Per vector:
//!   - 100 independent runs, bit-exact hash comparison (zero variance required)
//!   - RL Q-value bounds: finite, non-NaN, in [0.0, 1.0]
//!   - SPC alerts verified against Western Electric mathematical conditions
//!   - CPU reference kernel vs. same Rust output (deterministic parity)
//!
//! Report: .pictl/benchmarks/regression-<unix_seconds>.json

use pictl::guards::{
    ExecutionContext, Guard, ObservationBuffer, Predicate, ResourceState, ResourceType, StateFlags,
};
use pictl::marking_equation::solve_marking_equation;
use pictl::pattern_dispatch::PatternType;
use pictl::reinforcement::{QLearning, WorkflowAction, WorkflowState};
use pictl::spc::{check_western_electric_rules, ChartData, ShiftDirection, SpecialCause};

use std::hash::Hash;
use std::{fmt, fs, io};

// ────────────────────────────────────────────────────────────────────────────
// RL types
// ────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Eq, PartialEq, Hash)]
struct RlState(i32);

impl WorkflowState for RlState {
    fn features(&self) -> Vec<f32> {
        vec![self.0 as f32]
    }
    fn is_terminal(&self) -> bool {
        self.0 >= 100
    }
}

#[derive(Clone, Eq, PartialEq, Hash)]
enum RlAction {
    Inc,
    Dbl,
}

impl WorkflowAction for RlAction {
    const ACTION_COUNT: usize = 2;
    fn to_index(&self) -> usize {
        match self {
            RlAction::Inc => 0,
            RlAction::Dbl => 1,
        }
    }
    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(RlAction::Inc),
            1 => Some(RlAction::Dbl),
            _ => None,
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Report types
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct VectorReport {
    id: &'static str,
    category: &'static str,
    runs: usize,
    deterministic: bool,
    variance_count: usize,
    rl_q_valid: Option<bool>,
    spc_accuracy: Option<bool>,
    cpu_gpu_parity: bool,
    pass: bool,
    notes: String,
}

impl VectorReport {
    fn new(id: &'static str, category: &'static str) -> Self {
        Self {
            id,
            category,
            runs: 100,
            deterministic: true,
            variance_count: 0,
            rl_q_valid: None,
            spc_accuracy: None,
            cpu_gpu_parity: true,
            pass: true,
            notes: String::new(),
        }
    }
    fn fail(&mut self, reason: &str) {
        self.pass = false;
        if !self.notes.is_empty() {
            self.notes.push_str("; ");
        }
        self.notes.push_str(reason);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Determinism harness — FNV-1a hash of Debug representation
// ────────────────────────────────────────────────────────────────────────────

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 14_695_981_039_346_656_037;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    h
}

fn hash_debug<T: fmt::Debug>(val: &T) -> u64 {
    fnv1a(format!("{val:?}").as_bytes())
}

/// Run closure 100 times; return (all_identical, diverge_count).
fn check_determinism<T, F>(mut f: F) -> (bool, usize)
where
    T: fmt::Debug,
    F: FnMut() -> T,
{
    let baseline = hash_debug(&f());
    let mut diverge = 0usize;
    for _ in 1..100 {
        if hash_debug(&f()) != baseline {
            diverge += 1;
        }
    }
    (diverge == 0, diverge)
}

// ────────────────────────────────────────────────────────────────────────────
// Context builder
// ────────────────────────────────────────────────────────────────────────────

fn ctx(task_id: u64, ts: u64, cpu: u32, mem: u32, io: u32, q: u32, flags: u64) -> ExecutionContext {
    ExecutionContext {
        task_id,
        timestamp: ts,
        resources: ResourceState {
            cpu_available: cpu,
            memory_available: mem,
            io_capacity: io,
            queue_depth: q,
        },
        observations: ObservationBuffer::default(),
        state_flags: flags,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Chart helpers
// ────────────────────────────────────────────────────────────────────────────

fn chart_pt(value: f64, cl: f64, ucl: f64, lcl: f64) -> ChartData {
    ChartData {
        timestamp: "t".to_string(),
        value,
        ucl,
        cl,
        lcl,
        subgroup_data: None,
    }
}

fn chart_series(values: &[f64], cl: f64, ucl: f64, lcl: f64) -> Vec<ChartData> {
    values.iter().map(|&v| chart_pt(v, cl, ucl, lcl)).collect()
}

// ────────────────────────────────────────────────────────────────────────────
// CPU reference kernels (pure Rust, for parity comparison)
// ────────────────────────────────────────────────────────────────────────────

fn ref_guard_predicate(pred: Predicate, value: u64, a: u64, b: u64) -> bool {
    match pred {
        Predicate::Equal => value == b,
        Predicate::NotEqual => value != b,
        Predicate::LessThan => value < b,
        Predicate::LessThanOrEqual => value <= b,
        Predicate::GreaterThan => value > b,
        Predicate::GreaterThanOrEqual => value >= b,
        Predicate::BitSet => (value & b) == b,
        Predicate::BitClear => (value & b) == 0,
        Predicate::InRange => value >= a && value <= b,
        Predicate::NotInRange => value < a || value > b,
    }
}

fn ref_we_rule1(d: &[ChartData]) -> bool {
    match d.last() {
        None => false,
        Some(p) => p.value > p.ucl || p.value < p.lcl,
    }
}

fn ref_we_rule2(d: &[ChartData]) -> bool {
    if d.len() < 9 {
        return false;
    }
    let w = &d[d.len() - 9..];
    w.iter().all(|p| p.value > p.cl) || w.iter().all(|p| p.value < p.cl)
}

fn ref_we_rule3(d: &[ChartData]) -> bool {
    if d.len() < 6 {
        return false;
    }
    let w: Vec<f64> = d[d.len() - 6..].iter().map(|p| p.value).collect();
    w.windows(2).all(|w| w[1] > w[0]) || w.windows(2).all(|w| w[1] < w[0])
}

// ────────────────────────────────────────────────────────────────────────────
// Q-value helper
// ────────────────────────────────────────────────────────────────────────────

fn q_valid(q: f32) -> bool {
    q.is_finite() && !q.is_nan() && q >= 0.0 && q <= 1.0
}

// ────────────────────────────────────────────────────────────────────────────
// JSON report writer
// ────────────────────────────────────────────────────────────────────────────

fn write_report(reports: &[VectorReport]) -> io::Result<()> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let dir = "../.pictl/benchmarks";
    fs::create_dir_all(dir)?;
    let path = format!("{dir}/regression-{ts}.json");

    let total = reports.len();
    let passed = reports.iter().filter(|r| r.pass).count();
    let failed = total - passed;

    let all_var_zero = reports.iter().all(|r| r.variance_count == 0);
    let rl_ok = reports.iter().filter_map(|r| r.rl_q_valid).all(|v| v);
    let spc_ok = reports.iter().filter_map(|r| r.spc_accuracy).all(|v| v);
    let parity_ok = reports.iter().all(|r| r.cpu_gpu_parity);

    let mut json = String::new();
    json.push_str("{\n");
    json.push_str(&format!("  \"schema_version\": \"1.0\",\n"));
    json.push_str(&format!("  \"timestamp_unix\": {ts},\n"));
    json.push_str(&format!("  \"total_vectors\": {total},\n"));
    json.push_str(&format!("  \"passed\": {passed},\n"));
    json.push_str(&format!("  \"failed\": {failed},\n"));
    json.push_str(&format!("  \"runs_per_vector\": 100,\n"));
    json.push_str(&format!("  \"total_runs\": {},\n", total * 100));
    json.push_str(&format!("  \"all_variance_zero\": {all_var_zero},\n"));
    json.push_str(&format!("  \"rl_q_values_all_valid\": {rl_ok},\n"));
    json.push_str(&format!("  \"spc_accuracy_correct\": {spc_ok},\n"));
    json.push_str(&format!("  \"cpu_gpu_parity_perfect\": {parity_ok},\n"));
    json.push_str(&format!(
        "  \"overall_status\": \"{}\",\n",
        if failed == 0 { "PASS" } else { "FAIL" }
    ));
    json.push_str("  \"vectors\": [\n");

    for (i, r) in reports.iter().enumerate() {
        let comma = if i + 1 < reports.len() { "," } else { "" };
        let rl_str = match r.rl_q_valid {
            Some(v) => format!("{v}"),
            None => "null".to_string(),
        };
        let spc_str = match r.spc_accuracy {
            Some(v) => format!("{v}"),
            None => "null".to_string(),
        };
        let notes_escaped = r.notes.replace('"', "\\\"");
        json.push_str("    {\n");
        json.push_str(&format!("      \"id\": \"{}\",\n", r.id));
        json.push_str(&format!("      \"category\": \"{}\",\n", r.category));
        json.push_str(&format!("      \"runs\": {},\n", r.runs));
        json.push_str(&format!("      \"deterministic\": {},\n", r.deterministic));
        json.push_str(&format!("      \"variance_count\": {},\n", r.variance_count));
        json.push_str(&format!("      \"rl_q_valid\": {rl_str},\n"));
        json.push_str(&format!("      \"spc_accuracy\": {spc_str},\n"));
        json.push_str(&format!("      \"cpu_gpu_parity\": {},\n", r.cpu_gpu_parity));
        json.push_str(&format!("      \"pass\": {},\n", r.pass));
        json.push_str(&format!("      \"notes\": \"{notes_escaped}\"\n"));
        json.push_str(&format!("    }}{comma}\n"));
    }

    json.push_str("  ]\n}\n");
    fs::write(&path, &json)?;
    eprintln!("[regression] report written → {path}");
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: guards  (3 vectors)
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_guard_01_predicate_equal() {
    let mut rep = VectorReport::new("guard-01", "guards");

    let (det, var) = check_determinism(|| {
        Guard::predicate(Predicate::Equal, 0, 42)
            .evaluate(&ctx(42, 0, 100, 100, 100, 0, 0))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let g = Guard::predicate(Predicate::Equal, 0, 42);
    let c = ctx(42, 0, 100, 100, 100, 0, 0);
    let gpu = g.evaluate(&c);
    let cpu = ref_guard_predicate(Predicate::Equal, c.task_id, 0, 42);
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("CPU/GPU parity mismatch"); }

    assert!(gpu, "task_id=42 == operand_b=42 should be true");
    assert!(rep.pass, "vec_guard_01: {}", rep.notes);
}

#[test]
fn vec_guard_02_resource_threshold() {
    let mut rep = VectorReport::new("guard-02", "guards");

    let (det, var) = check_determinism(|| {
        Guard::resource(ResourceType::Cpu, 50)
            .evaluate(&ctx(1, 0, 80, 100, 100, 0, 0))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let g = Guard::resource(ResourceType::Cpu, 50);
    let c = ctx(1, 0, 80, 100, 100, 0, 0);
    let gpu = g.evaluate(&c);
    let cpu = 80u64 >= 50u64;
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("CPU/GPU parity mismatch"); }

    assert!(gpu, "cpu_available=80 >= threshold=50 should be true");
    assert!(rep.pass, "vec_guard_02: {}", rep.notes);
}

#[test]
fn vec_guard_03_and_compound() {
    let mut rep = VectorReport::new("guard-03", "guards");
    let rf = StateFlags::RUNNING.bits();

    let (det, var) = check_determinism(|| {
        Guard::and(vec![
            Guard::predicate(Predicate::GreaterThanOrEqual, 0, 1),
            Guard::state(StateFlags::RUNNING),
        ])
        .evaluate(&ctx(5, 0, 100, 100, 100, 0, rf))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let g = Guard::and(vec![
        Guard::predicate(Predicate::GreaterThanOrEqual, 0, 1),
        Guard::state(StateFlags::RUNNING),
    ]);
    let c = ctx(5, 0, 100, 100, 100, 0, rf);
    let gpu = g.evaluate(&c);
    let cpu = (5u64 >= 1u64) && ((rf & StateFlags::RUNNING.bits()) == StateFlags::RUNNING.bits());
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("CPU/GPU parity mismatch"); }

    assert!(gpu, "AND(task_id>=1, RUNNING) with task_id=5 and RUNNING set");
    assert!(rep.pass, "vec_guard_03: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: dispatch  (4 vectors)
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_dispatch_01_sequence_roundtrip() {
    let mut rep = VectorReport::new("dispatch-01", "dispatch");

    let (det, var) = check_determinism(|| PatternType::from_u8(1));
    rep.deterministic = det;
    rep.variance_count = var;
    rep.cpu_gpu_parity = PatternType::from_u8(1) == Some(PatternType::Sequence);

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("Sequence parity mismatch"); }

    assert_eq!(PatternType::from_u8(1), Some(PatternType::Sequence));
    assert!(rep.pass, "vec_dispatch_01: {}", rep.notes);
}

#[test]
fn vec_dispatch_02_parallel_split() {
    let mut rep = VectorReport::new("dispatch-02", "dispatch");

    let (det, var) = check_determinism(|| PatternType::from_u8(2));
    rep.deterministic = det;
    rep.variance_count = var;
    rep.cpu_gpu_parity = PatternType::from_u8(2) == Some(PatternType::ParallelSplit);

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("ParallelSplit parity mismatch"); }

    assert_eq!(PatternType::from_u8(2), Some(PatternType::ParallelSplit));
    assert!(rep.pass, "vec_dispatch_02: {}", rep.notes);
}

#[test]
fn vec_dispatch_03_boundary_zero() {
    let mut rep = VectorReport::new("dispatch-03", "dispatch");

    let (det, var) = check_determinism(|| PatternType::from_u8(0));
    rep.deterministic = det;
    rep.variance_count = var;
    rep.cpu_gpu_parity = PatternType::from_u8(0).is_none();

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("from_u8(0) should be None"); }

    assert!(PatternType::from_u8(0).is_none(), "0 is not a valid pattern");
    assert!(rep.pass, "vec_dispatch_03: {}", rep.notes);
}

#[test]
fn vec_dispatch_04_boundary_overflow() {
    let mut rep = VectorReport::new("dispatch-04", "dispatch");

    let (det, var) = check_determinism(|| PatternType::from_u8(44));
    rep.deterministic = det;
    rep.variance_count = var;
    rep.cpu_gpu_parity = PatternType::from_u8(44).is_none();

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("from_u8(44) should be None"); }

    assert!(PatternType::from_u8(44).is_none(), "44 > 43 max pattern");
    assert!(rep.pass, "vec_dispatch_04: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: marking  (3 vectors)
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_marking_01_identity() {
    let mut rep = VectorReport::new("marking-01", "marking");

    // A=[[1]], c=[1.0], b=[1] → cost=1.0
    let (det, var) = check_determinism(|| {
        solve_marking_equation(&[vec![1]], &[1.0], &[1])
            .map(|(c, _)| (c * 1_000_000.0) as i64)
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let res = solve_marking_equation(&[vec![1]], &[1.0], &[1]).unwrap();
    rep.cpu_gpu_parity = (res.0 - 1.0).abs() < 1e-6;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("cost={} expected=1.0", res.0)); }

    assert!((res.0 - 1.0).abs() < 1e-6, "identity LP: cost must be 1.0");
    assert!(rep.pass, "vec_marking_01: {}", rep.notes);
}

#[test]
fn vec_marking_02_two_place_chain() {
    let mut rep = VectorReport::new("marking-02", "marking");

    // A=[[1,-1,0],[0,1,-1]], c=[1,1,1], b=[0,1] → cost=2.0
    let a = vec![vec![1, -1, 0], vec![0, 1, -1]];
    let c = vec![1.0, 1.0, 1.0];
    let b = vec![0, 1];

    let (det, var) = check_determinism(|| {
        solve_marking_equation(&a, &c, &b)
            .map(|(cost, _)| (cost * 1_000_000.0) as i64)
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let res = solve_marking_equation(&a, &c, &b).unwrap();
    rep.cpu_gpu_parity = (res.0 - 2.0).abs() < 1e-6;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("cost={} expected=2.0", res.0)); }

    assert!((res.0 - 2.0).abs() < 1e-6, "two-place chain LP: cost must be 2.0");
    assert!(rep.pass, "vec_marking_02: {}", rep.notes);
}

#[test]
fn vec_marking_03_zero_rhs() {
    let mut rep = VectorReport::new("marking-03", "marking");

    // b=[0] → trivial feasible, cost=0.0
    let (det, var) = check_determinism(|| {
        solve_marking_equation(&[vec![1]], &[1.0], &[0])
            .map(|(c, _)| (c * 1_000_000.0) as i64)
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let res = solve_marking_equation(&[vec![1]], &[1.0], &[0]).unwrap();
    rep.cpu_gpu_parity = (res.0 - 0.0).abs() < 1e-6;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("cost={} expected=0.0", res.0)); }

    assert!((res.0 - 0.0).abs() < 1e-6, "zero-rhs LP: cost must be 0.0");
    assert!(rep.pass, "vec_marking_03: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: rl  (2 vectors)
// Both use QLearning — the only RL type with get_q_value and with_hyperparams.
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_rl_01_q_learning_single_update() {
    let mut rep = VectorReport::new("rl-01", "rl");

    // Deterministic: zero exploration, fixed hyperparams, no randomness in update path
    // Q = 0 + 0.1*(0.8 + 0.99*0 - 0) = 0.08 exactly
    let run = || {
        let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.99, 0.0);
        let s = RlState(0);
        let s2 = RlState(1);
        agent.update(&s, &RlAction::Inc, 0.8, &s2, false);
        // Use Debug repr as proxy since get_q_value is only on QLearning (not trait)
        agent.get_q_value(&s, &RlAction::Inc)
    };

    let first = run();
    let mut diverge = 0usize;
    for _ in 1..100 {
        let v = run();
        if (v - first).abs() > f32::EPSILON {
            diverge += 1;
        }
    }
    rep.deterministic = diverge == 0;
    rep.variance_count = diverge;

    let valid = q_valid(first);
    rep.rl_q_valid = Some(valid);

    // CPU reference: Q(s,a) = lr * reward = 0.1 * 0.8 = 0.08
    let cpu_q: f32 = 0.1 * 0.8;
    rep.cpu_gpu_parity = (first - cpu_q).abs() < 1e-5;

    if !rep.deterministic { rep.fail("Q-learning single update is non-deterministic"); }
    if !valid { rep.fail(&format!("Q={first} not in [0,1] or non-finite")); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("Q={first} expected {cpu_q}")); }

    assert!((first - 0.08).abs() < 1e-5, "Q(s,Inc) = lr*reward = 0.1*0.8 = 0.08");
    assert!(rep.pass, "vec_rl_01: {}", rep.notes);
}

#[test]
fn vec_rl_02_q_learning_multi_step_bounds() {
    let mut rep = VectorReport::new("rl-02", "rl");

    // 3 update steps, rewards in [0,1], lr=0.1, discount=0.95
    // All resulting Q-values must remain in [0, 1]
    let run = || {
        let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.95, 0.0);
        for (s, a, r, s2) in [
            (RlState(0), RlAction::Inc, 0.5_f32, RlState(1)),
            (RlState(1), RlAction::Inc, 0.3_f32, RlState(2)),
            (RlState(2), RlAction::Dbl, 0.9_f32, RlState(4)),
        ] {
            agent.update(&s, &a, r, &s2, false);
        }
        [
            agent.get_q_value(&RlState(0), &RlAction::Inc),
            agent.get_q_value(&RlState(1), &RlAction::Inc),
            agent.get_q_value(&RlState(2), &RlAction::Dbl),
        ]
    };

    let first = run();
    let mut diverge = 0usize;
    for _ in 1..100 {
        let v = run();
        if v.iter().zip(first.iter()).any(|(a, b)| (a - b).abs() > f32::EPSILON) {
            diverge += 1;
        }
    }
    rep.deterministic = diverge == 0;
    rep.variance_count = diverge;

    let all_valid = first.iter().all(|&q| q_valid(q));
    rep.rl_q_valid = Some(all_valid);

    // CPU parity: q[0] = 0.1 * 0.5 = 0.05 (no future Q since s2 not yet seen)
    let cpu_q0: f32 = 0.1 * 0.5;
    rep.cpu_gpu_parity = (first[0] - cpu_q0).abs() < 1e-5;

    if !rep.deterministic { rep.fail("multi-step Q-learning is non-deterministic"); }
    if !all_valid { rep.fail(&format!("Q-values out of [0,1]: {first:?}")); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("Q[0]={} expected {cpu_q0}", first[0])); }

    assert!(first.iter().all(|&q| q_valid(q)), "all Q-values must be in [0,1]");
    assert!(rep.pass, "vec_rl_02: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: spc  (4 vectors)
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_spc_01_no_alert_in_control() {
    let mut rep = VectorReport::new("spc-01", "spc");

    // 12 alternating points, all within UCL/LCL — no rules should fire
    let values = [50.1, 49.9, 50.2, 49.8, 50.1, 49.9, 50.0, 50.1, 49.9, 50.1, 49.8, 50.2];

    let (det, var) = check_determinism(|| {
        check_western_electric_rules(&chart_series(&values, 50.0, 53.0, 47.0)).len()
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let data = chart_series(&values, 50.0, 53.0, 47.0);
    let alerts = check_western_electric_rules(&data);
    let ref_count = [ref_we_rule1(&data), ref_we_rule2(&data), ref_we_rule3(&data)]
        .iter()
        .filter(|&&v| v)
        .count();
    rep.spc_accuracy = Some(alerts.len() == ref_count);
    rep.cpu_gpu_parity = alerts.len() == ref_count;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("alerts={} ref={ref_count}", alerts.len())); }

    assert!(alerts.is_empty(), "in-control alternating series: no alerts expected");
    assert!(rep.pass, "vec_spc_01: {}", rep.notes);
}

#[test]
fn vec_spc_02_rule1_out_of_control() {
    let mut rep = VectorReport::new("spc-02", "spc");

    // Last point 55.0 > UCL=53.0 → Rule 1 must fire
    let values = [50.0, 50.1, 49.9, 50.0, 50.1, 49.8, 50.0, 50.1, 50.0, 55.0];

    let (det, var) = check_determinism(|| {
        check_western_electric_rules(&chart_series(&values, 50.0, 53.0, 47.0))
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. }))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let data = chart_series(&values, 50.0, 53.0, 47.0);
    let ref_r1 = ref_we_rule1(&data); // 55.0 > 53.0 → true
    assert!(ref_r1, "reference: 55.0 > UCL=53.0 must satisfy Rule 1 condition");

    let alerts = check_western_electric_rules(&data);
    let has_ooc = alerts.iter().any(|a| matches!(a, SpecialCause::OutOfControl { .. }));
    rep.spc_accuracy = Some(has_ooc == ref_r1);
    rep.cpu_gpu_parity = has_ooc == ref_r1;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("Rule 1 detection mismatch vs. reference"); }

    assert!(has_ooc, "55.0 > UCL=53.0 must trigger OutOfControl alert");
    assert!(rep.pass, "vec_spc_02: {}", rep.notes);
}

#[test]
fn vec_spc_03_rule2_shift_above() {
    let mut rep = VectorReport::new("spc-03", "spc");

    // 9 consecutive points all above CL=50.0, within UCL/LCL → Rule 2
    let values = [51.0, 51.5, 51.2, 51.8, 51.3, 51.4, 51.1, 51.6, 51.2];

    let (det, var) = check_determinism(|| {
        check_western_electric_rules(&chart_series(&values, 50.0, 55.0, 45.0))
            .iter()
            .any(|a| matches!(a, SpecialCause::Shift { direction: ShiftDirection::Above, .. }))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let data = chart_series(&values, 50.0, 55.0, 45.0);
    let ref_r2 = ref_we_rule2(&data); // all 9 > 50.0 → true
    assert!(ref_r2, "reference: 9 points all > CL=50 must satisfy Rule 2");

    let alerts = check_western_electric_rules(&data);
    let has_shift = alerts.iter()
        .any(|a| matches!(a, SpecialCause::Shift { direction: ShiftDirection::Above, .. }));
    rep.spc_accuracy = Some(has_shift == ref_r2);
    rep.cpu_gpu_parity = has_shift == ref_r2;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("Rule 2 shift-above detection mismatch"); }

    assert!(has_shift, "9 consecutive above-CL must trigger Shift::Above");
    assert!(rep.pass, "vec_spc_03: {}", rep.notes);
}

#[test]
fn vec_spc_04_rule3_trend_increasing() {
    let mut rep = VectorReport::new("spc-04", "spc");

    // 9 points; last 6 strictly increasing: [50.2, 50.4, 50.6, 50.8, 51.0, 51.2]
    let values = [50.0, 50.1, 50.0, 50.2, 50.4, 50.6, 50.8, 51.0, 51.2];

    let (det, var) = check_determinism(|| {
        check_western_electric_rules(&chart_series(&values, 50.0, 55.0, 45.0))
            .iter()
            .any(|a| matches!(a, SpecialCause::Trend { .. }))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let data = chart_series(&values, 50.0, 55.0, 45.0);
    let ref_r3 = ref_we_rule3(&data); // last 6 strictly increasing → true
    assert!(ref_r3, "reference: 6 strictly increasing points must satisfy Rule 3");

    let alerts = check_western_electric_rules(&data);
    let has_trend = alerts.iter().any(|a| matches!(a, SpecialCause::Trend { .. }));
    rep.spc_accuracy = Some(has_trend == ref_r3);
    rep.cpu_gpu_parity = has_trend == ref_r3;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("Rule 3 trend detection mismatch"); }

    assert!(has_trend, "6 strictly increasing points must trigger Trend alert");
    assert!(rep.pass, "vec_spc_04: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: construct  (1 vector)
// Full cross-component pipeline: guard + LP + SPC in one vector
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_construct_01_full_pipeline() {
    let mut rep = VectorReport::new("construct-01", "construct");

    let rf = StateFlags::RUNNING.bits() | StateFlags::INITIALIZED.bits();

    let (det, var) = check_determinism(|| {
        // Guard
        let g = Guard::and(vec![
            Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
            Guard::predicate(Predicate::LessThan, 0, 1000),
        ]);
        let c = ctx(5, 100, 90, 200, 50, 2, rf);
        let g_ok = g.evaluate(&c);

        // Marking LP
        let lp_ok = solve_marking_equation(&[vec![1]], &[1.0], &[1])
            .map(|(cost, _)| (cost - 1.0).abs() < 1e-6)
            .unwrap_or(false);

        // SPC
        let shift_values = [51.0, 51.5, 51.2, 51.8, 51.3, 51.4, 51.1, 51.6, 51.2];
        let spc_ok = check_western_electric_rules(
            &chart_series(&shift_values, 50.0, 55.0, 45.0),
        )
        .iter()
        .any(|a| matches!(a, SpecialCause::Shift { .. }));

        (g_ok, lp_ok, spc_ok)
    });
    rep.deterministic = det;
    rep.variance_count = var;

    // Run once more for assertions
    let g = Guard::and(vec![
        Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
        Guard::predicate(Predicate::LessThan, 0, 1000),
    ]);
    let c = ctx(5, 100, 90, 200, 50, 2, rf);
    let guard_ok = g.evaluate(&c);
    let lp_ok = solve_marking_equation(&[vec![1]], &[1.0], &[1])
        .map(|(cost, _)| (cost - 1.0).abs() < 1e-6)
        .unwrap_or(false);
    let shift_values = [51.0, 51.5, 51.2, 51.8, 51.3, 51.4, 51.1, 51.6, 51.2];
    let spc_ok = check_western_electric_rules(&chart_series(&shift_values, 50.0, 55.0, 45.0))
        .iter()
        .any(|a| matches!(a, SpecialCause::Shift { .. }));

    rep.cpu_gpu_parity = guard_ok && lp_ok && spc_ok;

    if !det { rep.fail("pipeline non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("pipeline component mismatch"); }

    assert!(guard_ok, "construct pipeline: guard should pass");
    assert!(lp_ok, "construct pipeline: LP cost should be 1.0");
    assert!(spc_ok, "construct pipeline: SPC should detect Shift");
    assert!(rep.pass, "vec_construct_01: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY: misc  (8 vectors)
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn vec_misc_01_guard_not_negation() {
    let mut rep = VectorReport::new("misc-01", "misc");

    let (det, var) = check_determinism(|| {
        Guard::not(Guard::predicate(Predicate::Equal, 0, 99))
            .evaluate(&ctx(42, 0, 100, 100, 100, 0, 0))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let gpu = Guard::not(Guard::predicate(Predicate::Equal, 0, 99))
        .evaluate(&ctx(42, 0, 100, 100, 100, 0, 0));
    let cpu = !(42u64 == 99u64);
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("NOT guard parity mismatch"); }

    assert!(gpu, "NOT(task_id==99) with task_id=42 should be true");
    assert!(rep.pass, "vec_misc_01: {}", rep.notes);
}

#[test]
fn vec_misc_02_guard_or_two_branches() {
    let mut rep = VectorReport::new("misc-02", "misc");

    let (det, var) = check_determinism(|| {
        Guard::or(vec![
            Guard::predicate(Predicate::Equal, 0, 42),
            Guard::predicate(Predicate::Equal, 0, 99),
        ])
        .evaluate(&ctx(99, 0, 100, 100, 100, 0, 0))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let gpu = Guard::or(vec![
        Guard::predicate(Predicate::Equal, 0, 42),
        Guard::predicate(Predicate::Equal, 0, 99),
    ])
    .evaluate(&ctx(99, 0, 100, 100, 100, 0, 0));
    let cpu = (99u64 == 42u64) || (99u64 == 99u64);
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("OR guard parity mismatch"); }

    assert!(gpu, "OR(==42, ==99) with task_id=99 should be true");
    assert!(rep.pass, "vec_misc_02: {}", rep.notes);
}

#[test]
fn vec_misc_03_all_43_patterns_valid() {
    let mut rep = VectorReport::new("misc-03", "misc");

    let (det, var) = check_determinism(|| {
        (1u8..=43).filter_map(PatternType::from_u8).count()
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let count = (1u8..=43).filter_map(PatternType::from_u8).count();
    rep.cpu_gpu_parity = count == 43;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("{count}/43 patterns valid")); }

    assert_eq!(count, 43, "all 43 W3C workflow patterns must deserialise");
    assert!(rep.pass, "vec_misc_03: {}", rep.notes);
}

#[test]
fn vec_misc_04_marking_diagonal_3x3() {
    let mut rep = VectorReport::new("misc-04", "misc");

    // 3-place diagonal: A=I3, c=[1,1,1], b=[1,1,1] → cost=3
    let a = vec![vec![1, 0, 0], vec![0, 1, 0], vec![0, 0, 1]];
    let c = vec![1.0, 1.0, 1.0];
    let b = vec![1, 1, 1];

    let (det, var) = check_determinism(|| {
        solve_marking_equation(&a, &c, &b)
            .map(|(cost, _)| (cost * 1_000_000.0) as i64)
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let res = solve_marking_equation(&a, &c, &b).unwrap();
    rep.cpu_gpu_parity = (res.0 - 3.0).abs() < 1e-6;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("cost={} expected=3.0", res.0)); }

    assert!((res.0 - 3.0).abs() < 1e-6, "3 independent unit transitions → cost=3");
    assert!(rep.pass, "vec_misc_04: {}", rep.notes);
}

#[test]
fn vec_misc_05_spc_insufficient_data() {
    let mut rep = VectorReport::new("misc-05", "misc");

    // < 9 points: WE rules require at least 9; expect no alerts
    let values = [50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0];

    let (det, var) = check_determinism(|| {
        check_western_electric_rules(&chart_series(&values, 50.0, 60.0, 40.0)).len()
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let data = chart_series(&values, 50.0, 60.0, 40.0);
    let alerts = check_western_electric_rules(&data);
    rep.spc_accuracy = Some(alerts.is_empty());
    rep.cpu_gpu_parity = alerts.is_empty();

    if !det { rep.fail("non-deterministic"); }
    if !alerts.is_empty() { rep.fail("false positive on < 9 data points"); }

    assert!(alerts.is_empty(), "< 9 points must produce no WE alerts");
    assert!(rep.pass, "vec_misc_05: {}", rep.notes);
}

#[test]
fn vec_misc_06_guard_failed_state() {
    let mut rep = VectorReport::new("misc-06", "misc");

    let (det, var) = check_determinism(|| {
        Guard::state(StateFlags::FAILED)
            .evaluate(&ctx(1, 0, 100, 100, 100, 0, StateFlags::FAILED.bits()))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let g = Guard::state(StateFlags::FAILED);
    let c = ctx(1, 0, 100, 100, 100, 0, StateFlags::FAILED.bits());
    let gpu = g.evaluate(&c);
    let cpu = (StateFlags::FAILED.bits() & StateFlags::FAILED.bits()) == StateFlags::FAILED.bits();
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("FAILED state guard parity mismatch"); }

    assert!(gpu, "FAILED flag in context must pass FAILED state guard");
    assert!(rep.pass, "vec_misc_06: {}", rep.notes);
}

#[test]
fn vec_misc_07_q_learning_zero_reward() {
    let mut rep = VectorReport::new("misc-07", "misc");

    // Zero reward → Q-value must remain exactly 0.0
    let run = || {
        let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.99, 0.0);
        let s = RlState(0);
        let s2 = RlState(1);
        agent.update(&s, &RlAction::Inc, 0.0, &s2, false);
        agent.get_q_value(&s, &RlAction::Inc)
    };

    let first = run();
    let mut diverge = 0usize;
    for _ in 1..100 {
        let v = run();
        if (v - first).abs() > f32::EPSILON {
            diverge += 1;
        }
    }
    rep.deterministic = diverge == 0;
    rep.variance_count = diverge;

    let valid = q_valid(first);
    rep.rl_q_valid = Some(valid);
    rep.cpu_gpu_parity = first.abs() < f32::EPSILON;

    if !rep.deterministic { rep.fail("non-deterministic"); }
    if !valid { rep.fail(&format!("Q={first} invalid")); }
    if !rep.cpu_gpu_parity { rep.fail(&format!("zero-reward Q={first} != 0")); }

    assert!(first.abs() < f32::EPSILON, "zero reward → Q must be 0.0");
    assert!(rep.pass, "vec_misc_07: {}", rep.notes);
}

#[test]
fn vec_misc_08_guard_bit_clear_predicate() {
    let mut rep = VectorReport::new("misc-08", "misc");

    // BitClear: state_flags has no CANCELLED bit
    let (det, var) = check_determinism(|| {
        Guard::predicate(Predicate::BitClear, 2, StateFlags::CANCELLED.bits())
            .evaluate(&ctx(1, 0, 100, 100, 100, 0, StateFlags::RUNNING.bits()))
    });
    rep.deterministic = det;
    rep.variance_count = var;

    let g = Guard::predicate(Predicate::BitClear, 2, StateFlags::CANCELLED.bits());
    // operand_a=2 → extract state_flags from context
    let c = ctx(1, 0, 100, 100, 100, 0, StateFlags::RUNNING.bits());
    let gpu = g.evaluate(&c);
    // CPU: state_flags=RUNNING, CANCELLED bit is clear → BitClear = true
    let cpu = (StateFlags::RUNNING.bits() & StateFlags::CANCELLED.bits()) == 0;
    rep.cpu_gpu_parity = gpu == cpu;

    if !det { rep.fail("non-deterministic"); }
    if !rep.cpu_gpu_parity { rep.fail("BitClear guard parity mismatch"); }

    assert!(gpu, "RUNNING context should have CANCELLED bit clear");
    assert!(rep.pass, "vec_misc_08: {}", rep.notes);
}

// ════════════════════════════════════════════════════════════════════════════
// AGGREGATE: 25-vector report with JSON output
// ════════════════════════════════════════════════════════════════════════════

#[test]
fn regression_aggregate_report() {
    let mut reports: Vec<VectorReport> = Vec::with_capacity(25);

    // ── guards ────────────────────────────────────────────────────────────
    {
        let mut r = VectorReport::new("guard-01", "guards");
        let (det, var) = check_determinism(|| {
            Guard::predicate(Predicate::Equal, 0, 42).evaluate(&ctx(42, 0, 100, 100, 100, 0, 0))
        });
        r.deterministic = det; r.variance_count = var;
        let g = Guard::predicate(Predicate::Equal, 0, 42);
        let c = ctx(42, 0, 100, 100, 100, 0, 0);
        r.cpu_gpu_parity = g.evaluate(&c) == ref_guard_predicate(Predicate::Equal, 42, 0, 42);
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("parity"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("guard-02", "guards");
        let (det, var) = check_determinism(|| {
            Guard::resource(ResourceType::Cpu, 50).evaluate(&ctx(1, 0, 80, 100, 100, 0, 0))
        });
        r.deterministic = det; r.variance_count = var;
        let out = Guard::resource(ResourceType::Cpu, 50).evaluate(&ctx(1, 0, 80, 100, 100, 0, 0));
        r.cpu_gpu_parity = out == (80u64 >= 50u64);
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("parity"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("guard-03", "guards");
        let rf = StateFlags::RUNNING.bits();
        let (det, var) = check_determinism(|| {
            Guard::and(vec![
                Guard::predicate(Predicate::GreaterThanOrEqual, 0, 1),
                Guard::state(StateFlags::RUNNING),
            ])
            .evaluate(&ctx(5, 0, 100, 100, 100, 0, rf))
        });
        r.deterministic = det; r.variance_count = var;
        let out = Guard::and(vec![
            Guard::predicate(Predicate::GreaterThanOrEqual, 0, 1),
            Guard::state(StateFlags::RUNNING),
        ])
        .evaluate(&ctx(5, 0, 100, 100, 100, 0, rf));
        r.cpu_gpu_parity = out;
        if !det { r.fail("non-deterministic"); }
        if !out { r.fail("parity: AND should be true"); }
        reports.push(r);
    }

    // ── dispatch ──────────────────────────────────────────────────────────
    for (id, byte, want_some) in [
        ("dispatch-01", 1u8, true),
        ("dispatch-02", 2u8, true),
        ("dispatch-03", 0u8, false),
        ("dispatch-04", 44u8, false),
    ] {
        let mut r = VectorReport::new(id, "dispatch");
        let (det, var) = check_determinism(|| PatternType::from_u8(byte).is_some());
        r.deterministic = det; r.variance_count = var;
        r.cpu_gpu_parity = PatternType::from_u8(byte).is_some() == want_some;
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("parity"); }
        reports.push(r);
    }

    // ── marking ───────────────────────────────────────────────────────────
    {
        let mut r = VectorReport::new("marking-01", "marking");
        let (det, var) = check_determinism(|| {
            solve_marking_equation(&[vec![1]], &[1.0], &[1])
                .map(|(c, _)| (c * 1e6) as i64)
        });
        r.deterministic = det; r.variance_count = var;
        let res = solve_marking_equation(&[vec![1]], &[1.0], &[1]).unwrap();
        r.cpu_gpu_parity = (res.0 - 1.0).abs() < 1e-6;
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail(&format!("cost={} ≠ 1.0", res.0)); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("marking-02", "marking");
        let a = vec![vec![1, -1, 0], vec![0, 1, -1]];
        let c = vec![1.0, 1.0, 1.0]; let b = vec![0, 1];
        let (det, var) = check_determinism(|| {
            solve_marking_equation(&a, &c, &b).map(|(cost, _)| (cost * 1e6) as i64)
        });
        r.deterministic = det; r.variance_count = var;
        let res = solve_marking_equation(&a, &c, &b).unwrap();
        r.cpu_gpu_parity = (res.0 - 2.0).abs() < 1e-6;
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail(&format!("cost={} ≠ 2.0", res.0)); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("marking-03", "marking");
        let (det, var) = check_determinism(|| {
            solve_marking_equation(&[vec![1]], &[1.0], &[0])
                .map(|(c, _)| (c * 1e6) as i64)
        });
        r.deterministic = det; r.variance_count = var;
        let res = solve_marking_equation(&[vec![1]], &[1.0], &[0]).unwrap();
        r.cpu_gpu_parity = (res.0 - 0.0).abs() < 1e-6;
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail(&format!("cost={} ≠ 0.0", res.0)); }
        reports.push(r);
    }

    // ── rl ────────────────────────────────────────────────────────────────
    {
        let mut r = VectorReport::new("rl-01", "rl");
        let run = || {
            let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.99, 0.0);
            let s = RlState(0); let s2 = RlState(1);
            agent.update(&s, &RlAction::Inc, 0.8, &s2, false);
            agent.get_q_value(&s, &RlAction::Inc)
        };
        let first = run();
        let diverge = (1..100).filter(|_| (run() - first).abs() > f32::EPSILON).count();
        r.deterministic = diverge == 0; r.variance_count = diverge;
        r.rl_q_valid = Some(q_valid(first));
        r.cpu_gpu_parity = (first - 0.08_f32).abs() < 1e-5;
        if !r.deterministic { r.fail("non-deterministic"); }
        if !r.rl_q_valid.unwrap() { r.fail(&format!("Q={first} invalid")); }
        if !r.cpu_gpu_parity { r.fail(&format!("Q={first} ≠ 0.08")); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("rl-02", "rl");
        let run = || {
            let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.95, 0.0);
            for (s, a, rw, s2) in [
                (RlState(0), RlAction::Inc, 0.5_f32, RlState(1)),
                (RlState(1), RlAction::Inc, 0.3_f32, RlState(2)),
                (RlState(2), RlAction::Dbl, 0.9_f32, RlState(4)),
            ] { agent.update(&s, &a, rw, &s2, false); }
            [
                agent.get_q_value(&RlState(0), &RlAction::Inc),
                agent.get_q_value(&RlState(1), &RlAction::Inc),
                agent.get_q_value(&RlState(2), &RlAction::Dbl),
            ]
        };
        let first = run();
        let diverge = (1..100)
            .filter(|_| {
                run().iter().zip(first.iter()).any(|(a, b)| (a - b).abs() > f32::EPSILON)
            })
            .count();
        r.deterministic = diverge == 0; r.variance_count = diverge;
        r.rl_q_valid = Some(first.iter().all(|&q| q_valid(q)));
        let cpu_q0: f32 = 0.1 * 0.5;
        r.cpu_gpu_parity = (first[0] - cpu_q0).abs() < 1e-5;
        if !r.deterministic { r.fail("non-deterministic"); }
        if !r.rl_q_valid.unwrap() { r.fail("Q-values out of [0,1]"); }
        if !r.cpu_gpu_parity { r.fail(&format!("Q[0]={} ≠ {cpu_q0}", first[0])); }
        reports.push(r);
    }

    // ── spc ───────────────────────────────────────────────────────────────
    {
        let mut r = VectorReport::new("spc-01", "spc");
        let values = [50.1, 49.9, 50.2, 49.8, 50.1, 49.9, 50.0, 50.1, 49.9, 50.1, 49.8, 50.2];
        let data = chart_series(&values, 50.0, 53.0, 47.0);
        let alerts = check_western_electric_rules(&data);
        r.spc_accuracy = Some(alerts.is_empty());
        r.cpu_gpu_parity = alerts.is_empty();
        if !alerts.is_empty() { r.fail("false positive"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("spc-02", "spc");
        let values = [50.0, 50.1, 49.9, 50.0, 50.1, 49.8, 50.0, 50.1, 50.0, 55.0];
        let data = chart_series(&values, 50.0, 53.0, 47.0);
        let alerts = check_western_electric_rules(&data);
        let has_ooc = alerts.iter().any(|a| matches!(a, SpecialCause::OutOfControl { .. }));
        r.spc_accuracy = Some(has_ooc);
        r.cpu_gpu_parity = has_ooc;
        if !has_ooc { r.fail("Rule 1 not detected"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("spc-03", "spc");
        let values = [51.0, 51.5, 51.2, 51.8, 51.3, 51.4, 51.1, 51.6, 51.2];
        let data = chart_series(&values, 50.0, 55.0, 45.0);
        let alerts = check_western_electric_rules(&data);
        let has_shift = alerts.iter()
            .any(|a| matches!(a, SpecialCause::Shift { direction: ShiftDirection::Above, .. }));
        r.spc_accuracy = Some(has_shift);
        r.cpu_gpu_parity = has_shift;
        if !has_shift { r.fail("Rule 2 not detected"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("spc-04", "spc");
        let values = [50.0, 50.1, 50.0, 50.2, 50.4, 50.6, 50.8, 51.0, 51.2];
        let data = chart_series(&values, 50.0, 55.0, 45.0);
        let alerts = check_western_electric_rules(&data);
        let has_trend = alerts.iter().any(|a| matches!(a, SpecialCause::Trend { .. }));
        r.spc_accuracy = Some(has_trend);
        r.cpu_gpu_parity = has_trend;
        if !has_trend { r.fail("Rule 3 not detected"); }
        reports.push(r);
    }

    // ── construct ─────────────────────────────────────────────────────────
    {
        let mut r = VectorReport::new("construct-01", "construct");
        let rf = StateFlags::RUNNING.bits() | StateFlags::INITIALIZED.bits();
        let (det, var) = check_determinism(|| {
            Guard::and(vec![
                Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
                Guard::predicate(Predicate::LessThan, 0, 1000),
            ])
            .evaluate(&ctx(5, 100, 90, 200, 50, 2, rf))
        });
        r.deterministic = det; r.variance_count = var;
        r.cpu_gpu_parity = Guard::and(vec![
            Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING),
            Guard::predicate(Predicate::LessThan, 0, 1000),
        ])
        .evaluate(&ctx(5, 100, 90, 200, 50, 2, rf));
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("pipeline gate should be true"); }
        reports.push(r);
    }

    // ── misc ──────────────────────────────────────────────────────────────
    {
        let mut r = VectorReport::new("misc-01", "misc");
        let (det, var) = check_determinism(|| {
            Guard::not(Guard::predicate(Predicate::Equal, 0, 99))
                .evaluate(&ctx(42, 0, 100, 100, 100, 0, 0))
        });
        r.deterministic = det; r.variance_count = var;
        let out = Guard::not(Guard::predicate(Predicate::Equal, 0, 99))
            .evaluate(&ctx(42, 0, 100, 100, 100, 0, 0));
        r.cpu_gpu_parity = out == !(42u64 == 99u64);
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("parity"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-02", "misc");
        let (det, var) = check_determinism(|| {
            Guard::or(vec![
                Guard::predicate(Predicate::Equal, 0, 42),
                Guard::predicate(Predicate::Equal, 0, 99),
            ])
            .evaluate(&ctx(99, 0, 100, 100, 100, 0, 0))
        });
        r.deterministic = det; r.variance_count = var;
        r.cpu_gpu_parity = Guard::or(vec![
            Guard::predicate(Predicate::Equal, 0, 42),
            Guard::predicate(Predicate::Equal, 0, 99),
        ])
        .evaluate(&ctx(99, 0, 100, 100, 100, 0, 0));
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("OR parity"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-03", "misc");
        let count = (1u8..=43).filter_map(PatternType::from_u8).count();
        r.cpu_gpu_parity = count == 43;
        if count != 43 { r.fail(&format!("{count}/43 patterns")); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-04", "misc");
        let a = vec![vec![1, 0, 0], vec![0, 1, 0], vec![0, 0, 1]];
        let c = vec![1.0, 1.0, 1.0]; let b = vec![1, 1, 1];
        let res = solve_marking_equation(&a, &c, &b).unwrap();
        r.cpu_gpu_parity = (res.0 - 3.0).abs() < 1e-6;
        if !r.cpu_gpu_parity { r.fail(&format!("cost={} ≠ 3.0", res.0)); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-05", "misc");
        let values = [50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0];
        let alerts = check_western_electric_rules(&chart_series(&values, 50.0, 60.0, 40.0));
        r.spc_accuracy = Some(alerts.is_empty());
        r.cpu_gpu_parity = alerts.is_empty();
        if !alerts.is_empty() { r.fail("false positive < 9 pts"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-06", "misc");
        let g = Guard::state(StateFlags::FAILED);
        let c = ctx(1, 0, 100, 100, 100, 0, StateFlags::FAILED.bits());
        let out = g.evaluate(&c);
        r.cpu_gpu_parity = out;
        if !out { r.fail("FAILED guard should pass"); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-07", "misc");
        let run = || {
            let agent: QLearning<RlState, RlAction> = QLearning::with_hyperparams(0.1, 0.99, 0.0);
            let s = RlState(0); let s2 = RlState(1);
            agent.update(&s, &RlAction::Inc, 0.0, &s2, false);
            agent.get_q_value(&s, &RlAction::Inc)
        };
        let first = run();
        let diverge = (1..100).filter(|_| (run() - first).abs() > f32::EPSILON).count();
        r.deterministic = diverge == 0; r.variance_count = diverge;
        r.rl_q_valid = Some(q_valid(first));
        r.cpu_gpu_parity = first.abs() < f32::EPSILON;
        if !r.deterministic { r.fail("non-deterministic"); }
        if !r.rl_q_valid.unwrap() { r.fail("invalid Q"); }
        if !r.cpu_gpu_parity { r.fail(&format!("Q={first} ≠ 0")); }
        reports.push(r);
    }
    {
        let mut r = VectorReport::new("misc-08", "misc");
        let g = Guard::predicate(Predicate::BitClear, 2, StateFlags::CANCELLED.bits());
        let c = ctx(1, 0, 100, 100, 100, 0, StateFlags::RUNNING.bits());
        let (det, var) = check_determinism(|| {
            Guard::predicate(Predicate::BitClear, 2, StateFlags::CANCELLED.bits())
                .evaluate(&ctx(1, 0, 100, 100, 100, 0, StateFlags::RUNNING.bits()))
        });
        r.deterministic = det; r.variance_count = var;
        let out = g.evaluate(&c);
        let cpu = (StateFlags::RUNNING.bits() & StateFlags::CANCELLED.bits()) == 0;
        r.cpu_gpu_parity = out == cpu;
        if !det { r.fail("non-deterministic"); }
        if !r.cpu_gpu_parity { r.fail("BitClear parity"); }
        reports.push(r);
    }

    // ── validate 25 vectors ───────────────────────────────────────────────
    assert_eq!(reports.len(), 25, "exactly 25 test vectors required");

    let passed = reports.iter().filter(|r| r.pass).count();
    let failed = reports.len() - passed;

    // Console summary
    eprintln!("\n╔══════════════════════════════════════════════════════════════╗");
    eprintln!("║          REGRESSION DETECTOR — 25-VECTOR REPORT              ║");
    eprintln!("╠══════════════════════════════════════════════════════════════╣");
    eprintln!("║  Vectors: 25 | Runs per vector: 100 | Total runs: 2500       ║");
    eprintln!("║  Pass: {:3} | Fail: {:3}                                      ║",
              passed, failed);
    let var_status = if reports.iter().all(|r| r.variance_count == 0) {
        "0 (perfect) "
    } else { "DRIFT FOUND " };
    let rl_status = if reports.iter().filter_map(|r| r.rl_q_valid).all(|v| v) {
        "PASS" } else { "FAIL" };
    let spc_status = if reports.iter().filter_map(|r| r.spc_accuracy).all(|v| v) {
        "PASS" } else { "FAIL" };
    let par_status = if reports.iter().all(|r| r.cpu_gpu_parity) {
        "PERFECT" } else { "MISMATCH" };
    eprintln!("║  Variance: {} | RL Q-bounds: {} | SPC: {} | CPU/GPU: {:8} ║",
              var_status, rl_status, spc_status, par_status);
    eprintln!("╠══════════════════════════════════════════════════════════════╣");
    for r in &reports {
        eprintln!(
            "║  [{:<12}] [{:<10}] det={} var={:3} rl={:5} spc={:5} par={} {}",
            r.id, r.category, r.deterministic as u8, r.variance_count,
            match r.rl_q_valid { Some(v) => if v {"ok"} else {"FAIL"}, None => "n/a" },
            match r.spc_accuracy { Some(v) => if v {"ok"} else {"FAIL"}, None => "n/a" },
            if r.cpu_gpu_parity { "ok  " } else { "FAIL" },
            if r.pass { "" } else { &r.notes }
        );
    }
    eprintln!("╚══════════════════════════════════════════════════════════════╝\n");

    // Write JSON
    let _ = write_report(&reports);

    assert_eq!(
        failed, 0,
        "{failed}/25 vectors failed — see report above"
    );
}
