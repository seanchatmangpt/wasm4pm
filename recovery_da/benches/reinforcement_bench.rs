use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm::reinforcement::{
    Agent, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent,
    SARSAAgent,
};
use wasm4pm::{RlAction, RlState};

fn create_state(h: i32) -> RlState {
    RlState {
        health_level: h,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
        marking_vec: Vec::new(),
        recent_activities: Vec::new(),
    }
}

fn run_corridor_silent<T: Agent<RlState, RlAction>>(agent: &T, episodes: usize, goal_state: i32) {
    for _ in 0..episodes {
        agent.reset();
        let mut state = create_state(0);
        let mut steps = 0;
        while state.health_level < goal_state && steps < 100 {
            let action = agent.select_action(&state);
            let next_h = match action {
                RlAction::Idle => state.health_level,
                RlAction::Optimize => state.health_level + 1,
                RlAction::Rework => (state.health_level - 1).max(0),
                _ => state.health_level,
            };
            let next_state = create_state(next_h);
            let done = next_h >= goal_state;
            let reward = if done { 1.0 } else { 0.0 };
            agent.update(&state, &action, reward, &next_state, done);
            state = next_state;
            steps += 1;
        }
    }
}

fn bench_agents_step(c: &mut Criterion) {
    let q = QLearning::<RlState, RlAction>::new();
    let sarsa = SARSAAgent::<RlState, RlAction>::new();
    let d_q = DoubleQLearning::<RlState, RlAction>::new();
    let e_sarsa = ExpectedSARSAAgent::<RlState, RlAction>::new();
    let reinforce = ReinforceAgent::<RlState, RlAction>::new();
    
    let state = create_state(0);
    let action = RlAction::Optimize;
    let next_state = create_state(1);

    c.bench_function("QLearning select_action", |b| b.iter(|| q.select_action(black_box(&state))));
    c.bench_function("QLearning update", |b| b.iter(|| q.update(black_box(&state), black_box(&action), 1.0, black_box(&next_state), true)));

    c.bench_function("SARSA select_action", |b| b.iter(|| sarsa.select_action(black_box(&state))));
    c.bench_function("SARSA update", |b| b.iter(|| sarsa.update(black_box(&state), black_box(&action), 1.0, black_box(&next_state), true)));

    c.bench_function("DoubleQLearning select_action", |b| b.iter(|| d_q.select_action(black_box(&state))));
    c.bench_function("DoubleQLearning update", |b| b.iter(|| d_q.update(black_box(&state), black_box(&action), 1.0, black_box(&next_state), true)));

    c.bench_function("ExpectedSARSA select_action", |b| b.iter(|| e_sarsa.select_action(black_box(&state))));
    c.bench_function("ExpectedSARSA update", |b| b.iter(|| e_sarsa.update(black_box(&state), black_box(&action), 1.0, black_box(&next_state), true)));

    c.bench_function("ReinforceAgent select_action", |b| b.iter(|| reinforce.select_action(black_box(&state))));
    c.bench_function("ReinforceAgent update", |b| b.iter(|| reinforce.update(black_box(&state), black_box(&action), 1.0, black_box(&next_state), true)));
}

fn bench_convergence(c: &mut Criterion) {
    let mut group = c.benchmark_group("Convergence");
    group.sample_size(10); // Convergence benchmarks are slower
    
    group.bench_function("QLearning Corridor (500 ep)", |b| b.iter(|| {
        let agent = QLearning::with_hyperparams(0.1, 0.9, 0.5);
        run_corridor_silent(&agent, 500, 5);
    }));

    group.bench_function("SARSA Corridor (500 ep)", |b| b.iter(|| {
        let mut agent = SARSAAgent::new();
        agent.set_exploration_rate(0.5);
        run_corridor_silent(&agent, 500, 5);
    }));

    group.bench_function("Reinforce Corridor (500 ep)", |b| b.iter(|| {
        let agent = ReinforceAgent::with_hyperparams(0.1, 0.9);
        run_corridor_silent(&agent, 500, 3);
    }));

    group.finish();
}

criterion_group!(benches, bench_agents_step, bench_convergence);
criterion_main!(benches);
