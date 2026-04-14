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
            RiskLevel::High => vec![SwarmTopology::ReviewLoop, SwarmTopology::Pipeline, SwarmTopology::Debate],
            RiskLevel::Medium => vec![SwarmTopology::Pipeline, SwarmTopology::ReviewLoop, SwarmTopology::Single],
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
        topologies.sort();
        topologies.dedup();

        Ok(topologies)
    }
}
