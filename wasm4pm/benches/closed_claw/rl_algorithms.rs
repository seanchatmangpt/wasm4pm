//! RL Algorithm Comparison Benchmarks
//!
//! Head-to-head latency comparison of all 5 reinforcement learning agents:
//!   Q-Learning, SARSA, Double Q-Learning, Expected SARSA, REINFORCE
//!
//! Each benchmark isolates a single operation (select_action or update)
//! to measure the per-operation cost without noise from other modules.

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use std::time::Duration;

use pictl::reinforcement::{
    DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent,
    WorkflowAction, WorkflowState,
};

// ---------------------------------------------------------------------------
// Shared test types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
struct RlState(i32);

impl WorkflowState for RlState {
    fn features(&self) -> Vec<f32> {
        vec![self.0 as f32]
    }

    fn is_terminal(&self) -> bool {
        self.0 >= 100
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
enum RlAction {
    Left,
    Right,
}

impl WorkflowAction for RlAction {
    const ACTION_COUNT: usize = 2;

    fn to_index(&self) -> usize {
        match self {
            RlAction::Left => 0,
            RlAction::Right => 1,
        }
    }

    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(RlAction::Left),
            1 => Some(RlAction::Right),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Benchmarks: select_action latency (cold: empty Q-table)
// ---------------------------------------------------------------------------

fn bench_select_action_cold(c: &mut Criterion) {
    let mut group = c.benchmark_group("rl/select_action_cold");

    let ql: QLearning<RlState, RlAction> = QLearning::new();
    group.bench_function("q_learning", |b| {
        b.iter(|| black_box(ql.select_action(black_box(&RlState(0)))));
    });

    let dq: DoubleQLearning<RlState, RlAction> = DoubleQLearning::new();
    group.bench_function("double_q_learning", |b| {
        b.iter(|| black_box(dq.select_action(black_box(&RlState(0)))));
    });

    let es: ExpectedSARSAAgent<RlState, RlAction> = ExpectedSARSAAgent::new();
    group.bench_function("expected_sarsa", |b| {
        b.iter(|| black_box(es.select_action(black_box(&RlState(0)))));
    });

    let rf: ReinforceAgent<RlState, RlAction> = ReinforceAgent::new();
    group.bench_function("reinforce", |b| {
        b.iter(|| black_box(rf.select_action(black_box(&RlState(0)))));
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmarks: select_action latency (warm: populated Q-table)
// ---------------------------------------------------------------------------

fn bench_select_action_warm(c: &mut Criterion) {
    let mut group = c.benchmark_group("rl/select_action_warm");

    // Pre-populate Q-tables with 100 entries
    let mut ql: QLearning<RlState, RlAction> = QLearning::new();
    let dq: DoubleQLearning<RlState, RlAction> = DoubleQLearning::new();
    let es: ExpectedSARSAAgent<RlState, RlAction> = ExpectedSARSAAgent::new();
    let rf: ReinforceAgent<RlState, RlAction> = ReinforceAgent::new();

    for i in 0..100i32 {
        let state = RlState(i);
        let next = RlState(i + 1);
        ql.update(&state, &RlAction::Left, 1.0, &next, false);
        dq.update(&state, &RlAction::Left, 1.0, &next, false);
        es.update(&state, &RlAction::Left, 1.0, &next, false);
        rf.update_step(&state, &RlAction::Left, 1.0);
    }

    let warm_state = RlState(50);

    group.bench_function("q_learning", |b| {
        b.iter(|| black_box(ql.select_action(black_box(&warm_state))));
    });

    group.bench_function("double_q_learning", |b| {
        b.iter(|| black_box(dq.select_action(black_box(&warm_state))));
    });

    group.bench_function("expected_sarsa", |b| {
        b.iter(|| black_box(es.select_action(black_box(&warm_state))));
    });

    group.bench_function("reinforce", |b| {
        b.iter(|| black_box(rf.select_action(black_box(&warm_state))));
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmarks: update latency (single step)
// ---------------------------------------------------------------------------

fn bench_update_single(c: &mut Criterion) {
    let mut group = c.benchmark_group("rl/update_single");

    let ql: QLearning<RlState, RlAction> = QLearning::new();
    group.bench_function("q_learning", |b| {
        b.iter(|| {
            black_box(ql.update(
                black_box(&RlState(0)),
                black_box(&RlAction::Left),
                1.0,
                black_box(&RlState(1)),
                false,
            ));
        });
    });

    let dq: DoubleQLearning<RlState, RlAction> = DoubleQLearning::new();
    group.bench_function("double_q_learning", |b| {
        b.iter(|| {
            black_box(dq.update(
                black_box(&RlState(0)),
                black_box(&RlAction::Left),
                1.0,
                black_box(&RlState(1)),
                false,
            ));
        });
    });

    let es: ExpectedSARSAAgent<RlState, RlAction> = ExpectedSARSAAgent::new();
    group.bench_function("expected_sarsa", |b| {
        b.iter(|| {
            black_box(es.update(
                black_box(&RlState(0)),
                black_box(&RlAction::Left),
                1.0,
                black_box(&RlState(1)),
                false,
            ));
        });
    });

    // REINFORCE uses trajectory update, not single-step
    let rf: ReinforceAgent<RlState, RlAction> = ReinforceAgent::new();
    group.bench_function("reinforce_step", |b| {
        b.iter(|| {
            black_box(rf.update_step(
                black_box(&RlState(0)),
                black_box(&RlAction::Left),
                1.0,
            ));
        });
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmarks: REINFORCE trajectory update (variable length)
// ---------------------------------------------------------------------------

fn bench_reinforce_trajectory(c: &mut Criterion) {
    let mut group = c.benchmark_group("rl/reinforce_trajectory");

    for len in [5usize, 20, 50, 100].iter() {
        let trajectory: Vec<(RlState, RlAction, f32)> = (0..*len)
            .map(|i| {
                (
                    RlState(i as i32),
                    if i % 2 == 0 { RlAction::Left } else { RlAction::Right },
                    if i == *len - 1 { 1.0 } else { 0.0 },
                )
            })
            .collect();

        group.throughput(Throughput::Elements(*len as u64));
        group.bench_with_input(
            BenchmarkId::new("trajectory_update", len),
            len,
            |b, _| {
                let rf: ReinforceAgent<RlState, RlAction> = ReinforceAgent::new();
                b.iter(|| black_box(rf.update_from_trajectory(black_box(&trajectory))));
            },
        );
    }

    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmarks: multi-episode convergence (100 episodes each)
// ---------------------------------------------------------------------------

fn bench_convergence_100_episodes(c: &mut Criterion) {
    let mut group = c.benchmark_group("rl/convergence_100_episodes");
    group.throughput(Throughput::Elements(100));
    group.measurement_time(Duration::from_secs(15));

    group.bench_function("q_learning", |b| {
        b.iter(|| {
            let mut agent: QLearning<RlState, RlAction> = QLearning::new();
            for cycle in 0..100u64 {
                let state = RlState((cycle % 50) as i32);
                let action = agent.select_action(&state);
                let next = RlState((cycle % 50 + 1) as i32);
                let reward = if matches!(action, RlAction::Left) { 1.0 } else { -0.5 };
                agent.update(&state, &action, reward, &next, false);
                agent.decay_exploration();
            }
            black_box(agent.get_exploration_rate());
        });
    });

    group.bench_function("double_q_learning", |b| {
        b.iter(|| {
            let mut agent: DoubleQLearning<RlState, RlAction> = DoubleQLearning::new();
            for cycle in 0..100u64 {
                let state = RlState((cycle % 50) as i32);
                let action = agent.select_action(&state);
                let next = RlState((cycle % 50 + 1) as i32);
                let reward = if matches!(action, RlAction::Left) { 1.0 } else { -0.5 };
                agent.update(&state, &action, reward, &next, false);
                agent.decay_exploration();
            }
            black_box(agent.get_exploration_rate());
        });
    });

    group.bench_function("expected_sarsa", |b| {
        b.iter(|| {
            let mut agent: ExpectedSARSAAgent<RlState, RlAction> = ExpectedSARSAAgent::new();
            for cycle in 0..100u64 {
                let state = RlState((cycle % 50) as i32);
                let action = agent.select_action(&state);
                let next = RlState((cycle % 50 + 1) as i32);
                let reward = if matches!(action, RlAction::Left) { 1.0 } else { -0.5 };
                agent.update(&state, &action, reward, &next, false);
                agent.decay_exploration();
            }
            black_box(agent.get_exploration_rate());
        });
    });

    group.bench_function("reinforce", |b| {
        b.iter(|| {
            let agent: ReinforceAgent<RlState, RlAction> = ReinforceAgent::new();
            for cycle in 0..100u64 {
                let state = RlState((cycle % 10) as i32);
                let action = agent.select_action(&state);
                let reward = if matches!(action, RlAction::Left) { 1.0 } else { -0.5 };
                agent.update_step(&state, &action, reward);
            }
            black_box(agent.get_policy_weights(&RlState(5)));
        });
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub fn bench_rl_algorithms(c: &mut Criterion) {
    bench_select_action_cold(c);
    bench_select_action_warm(c);
    bench_update_single(c);
    bench_reinforce_trajectory(c);
    bench_convergence_100_episodes(c);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {

    #[test]
    fn test_all_agents_produce_valid_actions() {
        let state = RlState(0);

        let ql = QLearning::new();
        let dq = DoubleQLearning::new();
        let es = ExpectedSARSAAgent::new();
        let rf = ReinforceAgent::new();

        let a1 = ql.select_action(&state);
        let a2 = dq.select_action(&state);
        let a3 = es.select_action(&state);
        let a4 = rf.select_action(&state);

        // All actions should be Left or Right
        assert!(matches!(a1, RlAction::Left | RlAction::Right));
        assert!(matches!(a2, RlAction::Left | RlAction::Right));
        assert!(matches!(a3, RlAction::Left | RlAction::Right));
        assert!(matches!(a4, RlAction::Left | RlAction::Right));
    }

    #[test]
    fn test_convergence_reinforce_better_than_random() {
        let agent = ReinforceAgent::with_hyperparams(0.05, 0.99);

        // Train: Left always gets reward, Right always gets penalty
        for _ in 0..1000 {
            let state = RlState(0);
            let action = agent.select_action(&state);
            let reward = if matches!(action, RlAction::Left) { 1.0 } else { -1.0 };
            agent.update_step(&state, &action, reward);
        }

        let weights = agent.get_policy_weights(&RlState(0));
        assert!(
            weights[0] > weights[1],
            "REINFORCE should prefer Left after 1000 episodes: {} > {}",
            weights[0],
            weights[1]
        );
    }

    #[test]
    fn test_convergence_expected_sarsa_stable() {
        let mut agent = ExpectedSARSAAgent::with_hyperparams(0.1, 0.99, 0.0); // greedy

        for _ in 0..200 {
            let state = RlState(0);
            let next = RlState(1);
            agent.update(&state, &RlAction::Left, 1.0, &next, false);
        }

        // With greedy policy, should always select Left (rewarded action)
        for _ in 0..20 {
            let action = agent.select_action(&RlState(0));
            assert!(
                matches!(action, RlAction::Left),
                "Greedy Expected SARSA should deterministically select rewarded action"
            );
        }
    }
}
