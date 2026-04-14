use crate::agentic::traits::TaskDecomposer;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultTaskDecomposer;

impl TaskDecomposer for DefaultTaskDecomposer {
    fn choose_topology(&self, task: &TaskContext) -> Result<TopologyDecision, AgenticError> {
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

        Ok(TopologyDecision {
            topology,
            candidate_topologies,
            reason_codes,
        })
    }
}
