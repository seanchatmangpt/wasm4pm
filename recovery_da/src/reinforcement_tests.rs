#[cfg(test)]
mod tests {
    use crate::reinforcement::{
        Agent, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent,
        SARSAAgent,
    };
    use crate::{RlAction, RlState};

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

    fn run_corridor<T: Agent<RlState, RlAction>>(agent: &mut T, episodes: usize, goal_state: i32) -> f32 {
        let mut total_reward = 0.0;
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
                total_reward += reward;
            }
        }
        total_reward / episodes as f32
    }

    #[test]
    fn test_q_learning_convergence() {
        let mut agent = QLearning::with_hyperparams(0.1, 0.9, 0.1);
        let avg_reward = run_corridor(&mut agent, 1000, 5);
        assert!(avg_reward > 0.5, "Q-Learning should learn to reach the goal (avg_reward: {})", avg_reward);
    }

    #[test]
    fn test_sarsa_convergence() {
        let mut agent = SARSAAgent::new();
        agent.set_exploration_rate(0.8);
        for ep in 0..20000 {
            run_corridor(&mut agent, 1, 5);
            if ep % 2000 == 0 { agent.decay_exploration(); }
        }
        agent.set_exploration_rate(0.0);
        let avg_reward = run_corridor(&mut agent, 100, 5);
        assert!(avg_reward > 0.1, "SARSA should learn to reach the goal (avg_reward: {})", avg_reward);
    }

    #[test]
    fn test_double_q_learning_convergence() {
        let mut agent = DoubleQLearning::with_hyperparams(0.1, 0.9, 0.5);
        for ep in 0..20000 {
            run_corridor(&mut agent, 1, 5);
            if ep % 2000 == 0 { agent.decay_exploration(); }
        }
        agent.set_exploration_rate(0.0);
        let avg_reward = run_corridor(&mut agent, 100, 5);
        assert!(avg_reward > 0.5, "Double Q-Learning should learn to reach the goal (avg_reward: {})", avg_reward);
    }

    #[test]
    fn test_expected_sarsa_convergence() {
        let mut agent = ExpectedSARSAAgent::with_hyperparams(0.1, 0.9, 0.5);
        let avg_reward = run_corridor(&mut agent, 1000, 5);
        assert!(avg_reward > 0.5, "Expected SARSA should learn to reach the goal (avg_reward: {})", avg_reward);
    }

    #[test]
    fn test_reinforce_convergence() {
        let mut agent = ReinforceAgent::with_hyperparams(0.1, 0.9);
        let avg_reward = run_corridor(&mut agent, 1000, 3);
        assert!(avg_reward > 0.5, "REINFORCE should learn to reach the goal (avg_reward: {})", avg_reward);
    }

    #[test]
    fn test_negative_reward_avoidance() {
        let mut agent = QLearning::with_hyperparams(0.1, 0.9, 0.1);
        for _ in 0..200 {
            let state = create_state(0);
            agent.update(&state, &RlAction::Optimize, -10.0, &create_state(1), true);
            agent.update(&state, &RlAction::Idle, -1.0, &create_state(2), true);
        }
        let q_bad = agent.get_q_value(&create_state(0), &RlAction::Optimize);
        let q_good = agent.get_q_value(&create_state(0), &RlAction::Idle);
        assert!(q_good > q_bad, "Agent should prefer -1 reward over -10 reward (good: {}, bad: {})", q_good, q_bad);
    }

    #[test]
    fn test_double_q_serialization_roundtrip() {
        let mut agent = DoubleQLearning::<RlState, RlAction>::new();
        let state = create_state(42);
        for _ in 0..100 {
            agent.update(&state, &RlAction::Optimize, 100.0, &create_state(43), true);
        }
        let serialized = agent.export_as_serialized(3);
        let mut new_agent = DoubleQLearning::<RlState, RlAction>::new();
        new_agent.restore_from_serialized(serialized);
        new_agent.set_exploration_rate(0.0);
        let selected = new_agent.select_action(&state);
        assert_eq!(selected, RlAction::Optimize);
    }
}
