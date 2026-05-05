use crate::agentic::traits::CounterfactualEvaluator;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultCounterfactualEvaluator;

impl DefaultCounterfactualEvaluator {
    /// Map action class to health state delta and side effects
    fn action_to_delta(action: &ActionClass) -> (i32, bool, bool) {
        // (delta_health, guard_pass, circuit_allowed)
        match action {
            ActionClass::Execute => (-1, true, true), // Improves health
            ActionClass::Validate => (0, true, true), // Stable
            ActionClass::Delegate => (0, true, true), // Stable
            ActionClass::Escalate => (0, false, false), // Neither helps nor hurts
            ActionClass::Read => (0, true, true),     // No change
            ActionClass::Write => (-1, true, true),   // Improves (mutation)
            ActionClass::Summarize => (0, true, true), // No change
            ActionClass::GenerateArtifact => (0, true, true), // No change
            ActionClass::Notify => (0, true, true),   // No change
            ActionClass::Custom(_) => (0, false, false), // Unknown behavior
        }
    }

    /// Estimate current health from drift status
    fn drift_to_health(drift_status: &DriftStatus) -> u8 {
        match drift_status {
            DriftStatus::OutOfControl => 3,  // Critical
            DriftStatus::TrendDetected => 2, // Unhealthy
            DriftStatus::ShiftDetected => 2, // Unhealthy
            DriftStatus::Watch => 1,         // Degraded
            DriftStatus::Stable => 1,        // Degraded (baseline)
            DriftStatus::Unknown => 1,       // Degraded (assume worst)
        }
    }
}

impl CounterfactualEvaluator for DefaultCounterfactualEvaluator {
    fn evaluate_options(&self, task: &TaskContext) -> Result<CounterfactualResult, AgenticError> {
        let available_actions: Vec<ActionClass> =
            task.policy.allowed_actions.iter().cloned().collect();

        if available_actions.is_empty() {
            return Ok(CounterfactualResult {
                selected_option_id: None,
                options: vec![],
            });
        }

        // Current health estimate from drift
        let curr_health = Self::drift_to_health(&task.evidence.drift_status);

        // Evaluate each action
        let options: Vec<CounterfactualOption> = available_actions
            .iter()
            .map(|action| {
                let (delta, guard_pass, circuit_allowed) = Self::action_to_delta(action);
                let next_health = ((curr_health as i32 + delta).clamp(0, 4)) as u8;

                // Use rl_orchestrator::compute_reward to estimate value
                let estimated_reward = crate::rl_orchestrator::compute_reward(
                    curr_health,
                    next_health,
                    0,
                    guard_pass,
                    circuit_allowed,
                    false,
                );

                CounterfactualOption {
                    option_id: format!("{:?}", action),
                    action_class: action.clone(),
                    projected_disposition: match action {
                        ActionClass::Execute => DecisionDisposition::Allow,
                        ActionClass::Escalate => DecisionDisposition::Escalate,
                        _ => DecisionDisposition::Allow,
                    },
                    estimated_cost: Some(0.0),
                    estimated_reward: Some(estimated_reward),
                    reason_codes: vec![format!(
                        "health:{}->{},guard:{},circuit:{}",
                        curr_health, next_health, guard_pass, circuit_allowed
                    )],
                }
            })
            .collect();

        // Select option with highest reward
        let selected_option_id = options
            .iter()
            .max_by(|a, b| {
                a.estimated_reward
                    .unwrap_or(f32::NEG_INFINITY)
                    .partial_cmp(&b.estimated_reward.unwrap_or(f32::NEG_INFINITY))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|o| o.option_id.clone());

        Ok(CounterfactualResult {
            selected_option_id,
            options,
        })
    }
}
