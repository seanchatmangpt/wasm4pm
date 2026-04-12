use crate::agentic::traits::JtbdRunner;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultJtbdRunner;

impl DefaultJtbdRunner {
    fn check_role_assertion(
        case: &JtbdCase,
        expected_role: &AgentRole,
    ) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        let selector = DefaultRoleSelector::default();
        let result = selector.select_role(&case.task);

        let passed = result
            .as_ref()
            .map(|d| &d.selected_role == expected_role)
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_role".to_string(),
            passed,
            details: result
                .ok()
                .map(|d| format!("got {:?}", d.selected_role)),
        }
    }

    fn check_topology_assertion(
        case: &JtbdCase,
        expected_topology: &SwarmTopology,
    ) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        let decomposer = DefaultTaskDecomposer::default();
        let result = decomposer.choose_topology(&case.task);

        let passed = result
            .as_ref()
            .map(|d| &d.topology == expected_topology)
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_topology".to_string(),
            passed,
            details: result
                .ok()
                .map(|d| format!("got {:?}", d.topology)),
        }
    }

    fn check_disposition_assertion(
        case: &JtbdCase,
        expected_disposition: &DecisionDisposition,
    ) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        // Construct a dummy handoff request to check disposition
        let to_role = case
            .expected_role
            .clone()
            .unwrap_or(AgentRole::Explorer);
        let handoff_req = HandoffRequest {
            from_agent: "test-agent".to_string(),
            to_role,
            task: case.task.clone(),
            attached_evidence: case.task.evidence.clone(),
            metadata: Default::default(),
        };

        let validator = DefaultHandoffValidator::default();
        let result = validator.validate_handoff(&handoff_req);

        let passed = result
            .as_ref()
            .map(|d| &d.disposition == expected_disposition)
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_disposition".to_string(),
            passed,
            details: result
                .ok()
                .map(|d| format!("got {:?}", d.disposition)),
        }
    }

    fn check_artifacts_assertion(
        case: &JtbdCase,
        expected_artifacts: &[ArtifactFamily],
    ) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        let request = ArtifactRequest {
            artifact_families: vec![],
            task: case.task.clone(),
            selected_role: case.expected_role.clone(),
            selected_topology: case.expected_topology.clone(),
        };

        let dispatcher = DefaultArtifactDispatcher::default();
        let result = dispatcher.plan_artifacts(&request);

        // Check: all expected artifacts are in the result
        let passed = result
            .as_ref()
            .map(|plan| {
                expected_artifacts.iter().all(|exp| {
                    plan.artifact_families.contains(exp)
                })
            })
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_artifacts".to_string(),
            passed,
            details: result
                .ok()
                .map(|plan| format!("got {:?}", plan.artifact_families)),
        }
    }
}

impl JtbdRunner for DefaultJtbdRunner {
    fn run_case(&self, case: &JtbdCase) -> Result<JtbdResult, AgenticError> {
        let mut assertions = vec![];

        // Check role assertion if expected
        if let Some(expected_role) = &case.expected_role {
            assertions.push(Self::check_role_assertion(case, expected_role));
        }

        // Check topology assertion if expected
        if let Some(expected_topology) = &case.expected_topology {
            assertions.push(Self::check_topology_assertion(case, expected_topology));
        }

        // Check disposition assertion if expected
        if let Some(expected_disposition) = &case.expected_disposition {
            assertions.push(Self::check_disposition_assertion(case, expected_disposition));
        }

        // Check artifacts assertion if expected
        if !case.expected_artifacts.is_empty() {
            assertions.push(Self::check_artifacts_assertion(case, &case.expected_artifacts));
        }

        let all_passed = assertions.iter().all(|a| a.passed);

        Ok(JtbdResult {
            case_id: case.case_id.clone(),
            passed: all_passed,
            assertions,
        })
    }

    fn run_suite(&self, cases: &[JtbdCase]) -> Result<Vec<JtbdResult>, AgenticError> {
        cases.iter().map(|c| self.run_case(c)).collect()
    }
}
