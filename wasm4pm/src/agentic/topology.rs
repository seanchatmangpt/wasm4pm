use crate::agentic::types::*;

/// Helper for topology-specific policies.
///
/// Encodes:
/// - topology legality by risk + phase
/// - topology candidate ordering
/// - fallback topology chains
#[derive(Debug, Default)]
pub struct TopologyPolicy;

impl TopologyPolicy {
    pub fn allowed_topologies(
        &self,
        task: &TaskContext,
    ) -> Result<Vec<SwarmTopology>, AgenticError> {
        // Risk level drives primary candidate set
        let mut topologies = match task.risk_level {
            RiskLevel::Critical => vec![SwarmTopology::Debate, SwarmTopology::ReviewLoop],
            RiskLevel::High => vec![
                SwarmTopology::ReviewLoop,
                SwarmTopology::Pipeline,
                SwarmTopology::Debate,
            ],
            RiskLevel::Medium => vec![
                SwarmTopology::Pipeline,
                SwarmTopology::ReviewLoop,
                SwarmTopology::Single,
            ],
            RiskLevel::Low => vec![SwarmTopology::Single, SwarmTopology::Pipeline],
        };

        // Phase-based filter: ensure ReviewLoop for Validate, Debate for Escalate
        match &task.phase {
            WorkflowPhase::Validate => {
                if !topologies.contains(&SwarmTopology::ReviewLoop) {
                    topologies.insert(0, SwarmTopology::ReviewLoop);
                }
            }
            WorkflowPhase::Escalate => {
                if !topologies.contains(&SwarmTopology::Debate) {
                    topologies.insert(0, SwarmTopology::Debate);
                }
            }
            _ => {}
        }

        // Remove duplicates (sort/dedup is simple for the small set)
        topologies.sort_unstable();
        topologies.dedup();

        Ok(topologies)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::types::{RiskLevel, TaskContext, WorkflowPhase};

    #[test]
    fn test_topology_policy_critical_validate() {
        let policy = TopologyPolicy;
        let task = TaskContext {
            risk_level: RiskLevel::Critical,
            phase: WorkflowPhase::Validate,
            ..Default::default()
        };
        let topologies = policy.allowed_topologies(&task).unwrap();
        // Critical: Debate, ReviewLoop
        // Validate: Ensure ReviewLoop is present
        assert!(topologies.contains(&SwarmTopology::ReviewLoop));
        assert!(topologies.contains(&SwarmTopology::Debate));
    }

    #[test]
    fn test_topology_policy_low_intake() {
        let policy = TopologyPolicy;
        let task = TaskContext {
            risk_level: RiskLevel::Low,
            phase: WorkflowPhase::Intake,
            ..Default::default()
        };
        let topologies = policy.allowed_topologies(&task).unwrap();
        // Low: Single, Pipeline
        assert!(topologies.contains(&SwarmTopology::Single));
        assert!(topologies.contains(&SwarmTopology::Pipeline));
    }
}
