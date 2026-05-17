use crate::agentic::traits::TaskDecomposer;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultTaskDecomposer;

impl TaskDecomposer for DefaultTaskDecomposer {
    fn choose_topology(&self, task: &TaskContext) -> Result<TopologyDecision, AgenticError> {
        let _span = tracing::debug_span!(
            "agentic.choose_topology",
            task_id = %task.task_id,
            risk = ?task.risk_level,
            phase = ?task.phase,
        )
        .entered();

        // Risk level determines default topology
        let mut topology = match task.risk_level {
            RiskLevel::Low => SwarmTopology::Single,
            RiskLevel::Medium => SwarmTopology::Pipeline,
            RiskLevel::High => SwarmTopology::ReviewLoop,
            RiskLevel::Critical => SwarmTopology::Debate,
        };

        // Phase overrides
        topology = match &task.phase {
            WorkflowPhase::Validate => SwarmTopology::ReviewLoop,
            WorkflowPhase::Escalate => SwarmTopology::Debate,
            WorkflowPhase::Execute => {
                if matches!(task.risk_level, RiskLevel::High | RiskLevel::Critical) {
                    SwarmTopology::ReviewLoop
                } else {
                    topology
                }
            }
            _ => topology,
        };

        // Build candidate topologies
        let mut candidate_topologies = vec![topology.clone()];
        if !candidate_topologies.contains(&SwarmTopology::Pipeline) {
            candidate_topologies.push(SwarmTopology::Pipeline);
        }
        if !candidate_topologies.contains(&SwarmTopology::Single) {
            candidate_topologies.push(SwarmTopology::Single);
        }

        let reason_codes = vec![
            format!("risk:{:?}", task.risk_level),
            format!("phase:{:?}", task.phase),
        ];

        tracing::debug!(
            target: "agentic.choose_topology",
            task_id = %task.task_id,
            topology = ?topology,
            "topology selected"
        );

        Ok(TopologyDecision {
            topology,
            candidate_topologies,
            reason_codes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(phase: WorkflowPhase, risk: RiskLevel) -> TaskContext {
        TaskContext {
            task_id: "td-test".to_string(),
            phase,
            risk_level: risk,
            ..Default::default()
        }
    }

    #[test]
    fn low_risk_maps_to_single() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Intake, RiskLevel::Low)).unwrap();
        assert_eq!(t.topology, SwarmTopology::Single);
    }

    #[test]
    fn medium_risk_maps_to_pipeline() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Intake, RiskLevel::Medium)).unwrap();
        assert_eq!(t.topology, SwarmTopology::Pipeline);
    }

    #[test]
    fn high_risk_maps_to_reviewloop() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Intake, RiskLevel::High)).unwrap();
        assert_eq!(t.topology, SwarmTopology::ReviewLoop);
    }

    #[test]
    fn critical_risk_maps_to_debate() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Intake, RiskLevel::Critical)).unwrap();
        assert_eq!(t.topology, SwarmTopology::Debate);
    }

    #[test]
    fn validate_phase_overrides_to_reviewloop_regardless_of_risk() {
        let d = DefaultTaskDecomposer;
        // Even Low risk — Validate always forces ReviewLoop
        let t = d.choose_topology(&task(WorkflowPhase::Validate, RiskLevel::Low)).unwrap();
        assert_eq!(t.topology, SwarmTopology::ReviewLoop);
    }

    #[test]
    fn escalate_phase_overrides_to_debate() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Escalate, RiskLevel::Low)).unwrap();
        assert_eq!(t.topology, SwarmTopology::Debate);
    }

    #[test]
    fn execute_high_risk_uses_reviewloop() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Execute, RiskLevel::High)).unwrap();
        assert_eq!(t.topology, SwarmTopology::ReviewLoop);
    }

    #[test]
    fn execute_low_risk_uses_single() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Execute, RiskLevel::Low)).unwrap();
        assert_eq!(t.topology, SwarmTopology::Single);
    }

    #[test]
    fn candidate_topologies_always_lead_with_primary() {
        let d = DefaultTaskDecomposer;
        for (phase, risk) in [
            (WorkflowPhase::Plan, RiskLevel::Low),
            (WorkflowPhase::Validate, RiskLevel::High),
            (WorkflowPhase::Execute, RiskLevel::Critical),
        ] {
            let t = d.choose_topology(&task(phase, risk)).unwrap();
            assert_eq!(
                t.candidate_topologies.first(),
                Some(&t.topology),
                "primary topology must lead candidates"
            );
        }
    }

    #[test]
    fn reason_codes_include_risk_and_phase() {
        let d = DefaultTaskDecomposer;
        let t = d.choose_topology(&task(WorkflowPhase::Plan, RiskLevel::Medium)).unwrap();
        assert!(t.reason_codes.iter().any(|r| r.starts_with("risk:")));
        assert!(t.reason_codes.iter().any(|r| r.starts_with("phase:")));
    }

    #[test]
    fn default_task_context_does_not_panic() {
        // Property: empty/default input must never panic
        let d = DefaultTaskDecomposer;
        let result = d.choose_topology(&TaskContext::default());
        assert!(result.is_ok(), "default TaskContext must not panic: {result:?}");
    }
}
