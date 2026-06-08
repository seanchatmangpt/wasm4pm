use crate::agentic::traits::JtbdRunner;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultJtbdRunner;

impl DefaultJtbdRunner {
    fn check_role_assertion(case: &JtbdCase, expected_role: &AgentRole) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        let selector = DefaultRoleSelector;
        let result = selector.select_role(&case.task);

        let passed = result
            .as_ref()
            .map(|d| &d.selected_role == expected_role)
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_role".to_string(),
            passed,
            details: result.ok().map(|d| format!("got {:?}", d.selected_role)),
        }
    }

    fn check_topology_assertion(
        case: &JtbdCase,
        expected_topology: &SwarmTopology,
    ) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        let decomposer = DefaultTaskDecomposer;
        let result = decomposer.choose_topology(&case.task);

        let passed = result
            .as_ref()
            .map(|d| &d.topology == expected_topology)
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_topology".to_string(),
            passed,
            details: result.ok().map(|d| format!("got {:?}", d.topology)),
        }
    }

    fn check_disposition_assertion(
        case: &JtbdCase,
        expected_disposition: &DecisionDisposition,
    ) -> JtbdAssertion {
        use crate::agentic::prelude::*;

        // Construct a synthetic handoff request to check disposition
        let to_role = case.expected_role.clone().unwrap_or(AgentRole::Explorer);
        let handoff_req = HandoffRequest {
            from_agent: "test-agent".to_string(),
            to_role,
            task: case.task.clone(),
            attached_evidence: case.task.evidence.clone(),
            metadata: Default::default(),
        };

        let validator = DefaultHandoffValidator;
        let result = validator.validate_handoff(&handoff_req);

        let passed = result
            .as_ref()
            .map(|d| &d.disposition == expected_disposition)
            .unwrap_or(false);

        JtbdAssertion {
            name: "expected_disposition".to_string(),
            passed,
            details: result.ok().map(|d| format!("got {:?}", d.disposition)),
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

        let dispatcher = DefaultArtifactDispatcher;
        let result = dispatcher.plan_artifacts(&request);

        // Check: all expected artifacts are in the result
        let passed = result
            .as_ref()
            .map(|plan| {
                expected_artifacts
                    .iter()
                    .all(|exp| plan.artifact_families.contains(exp))
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
        let _span = tracing::debug_span!(
            "agentic.run_case",
            case_id = %case.case_id,
        )
        .entered();

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
            assertions.push(Self::check_disposition_assertion(
                case,
                expected_disposition,
            ));
        }

        // Check artifacts assertion if expected
        if !case.expected_artifacts.is_empty() {
            assertions.push(Self::check_artifacts_assertion(
                case,
                &case.expected_artifacts,
            ));
        }

        let all_passed = assertions.iter().all(|a| a.passed);
        let passed_count = assertions.iter().filter(|a| a.passed).count();
        let success_rate = if assertions.is_empty() {
            1.0_f32
        } else {
            (passed_count as f32) / (assertions.len() as f32)
        };

        // Determine JTBD type from job statement (heuristic)
        let jtbd_type = if case.job_statement.to_lowercase().contains("outcome") {
            "outcome"
        } else if case.job_statement.to_lowercase().contains("progress") {
            "progress"
        } else if case.job_statement.to_lowercase().contains("emotional") {
            "emotional"
        } else {
            "unclassified"
        };

        // Emit enriched OTEL span
        tracing::debug!(
            target: "agentic.run_case",
            case_id = %case.case_id,
            passed = all_passed,
            assertion_count = assertions.len(),
            jtbd_id = %case.case_id,
            jtbd_type = jtbd_type,
            task_count = assertions.len(),
            success_rate = success_rate,
            "JTBD execution"
        );

        Ok(JtbdResult {
            case_id: case.case_id.clone(),
            passed: all_passed,
            assertions,
        })
    }

    fn run_suite(&self, cases: &[JtbdCase]) -> Result<Vec<JtbdResult>, AgenticError> {
        let _span = tracing::debug_span!("agentic.run_suite", case_count = cases.len(),).entered();

        let t0 = std::time::Instant::now();
        let results: Result<Vec<JtbdResult>, AgenticError> =
            cases.iter().map(|c| self.run_case(c)).collect();

        if let Ok(ref rs) = results {
            let passed_count = rs.iter().filter(|r| r.passed).count();
            let total_assertions: usize = rs.iter().map(|r| r.assertions.len()).sum();
            let total_passed: usize = rs
                .iter()
                .map(|r| r.assertions.iter().filter(|a| a.passed).count())
                .sum();

            let suite_success_rate = if total_assertions == 0 {
                1.0_f32
            } else {
                (total_passed as f32) / (total_assertions as f32)
            };

            let duration_ms = t0.elapsed().as_millis() as u64;

            // Emit enriched OTEL span
            tracing::debug!(
                target: "agentic.run_suite",
                total = rs.len(),
                passed = passed_count,
                jtbd_id = "suite",
                jtbd_type = "suite",
                task_count = total_assertions,
                success_rate = suite_success_rate,
                duration_ms = duration_ms,
                "JTBD suite execution"
            );
        }

        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_case(
        case_id: &str,
        phase: WorkflowPhase,
        risk: RiskLevel,
        expected_role: Option<AgentRole>,
        expected_topology: Option<SwarmTopology>,
    ) -> JtbdCase {
        JtbdCase {
            case_id: case_id.to_string(),
            job_statement: format!("test case {case_id}"),
            task: TaskContext {
                task_id: format!("task-{case_id}"),
                phase,
                risk_level: risk,
                ..Default::default()
            },
            expected_role,
            expected_topology,
            expected_disposition: None,
            expected_artifacts: vec![],
            notes: vec![],
        }
    }

    #[test]
    fn run_case_passes_when_role_matches() {
        let runner = DefaultJtbdRunner;
        let case = simple_case(
            "pass-role",
            WorkflowPhase::Intake,
            RiskLevel::Low,
            Some(AgentRole::Explorer),
            None,
        );
        let result = runner.run_case(&case).unwrap();
        assert!(result.passed, "case must pass when expected_role matches");
        assert_eq!(result.case_id, "pass-role");
    }

    #[test]
    fn run_case_fails_when_role_does_not_match() {
        let runner = DefaultJtbdRunner;
        // Intake/Low → Explorer, but we assert Planner (wrong)
        let case = simple_case(
            "fail-role",
            WorkflowPhase::Intake,
            RiskLevel::Low,
            Some(AgentRole::Planner),
            None,
        );
        let result = runner.run_case(&case).unwrap();
        assert!(
            !result.passed,
            "case must fail when expected_role does not match"
        );
    }

    #[test]
    fn run_case_passes_when_topology_matches() {
        let runner = DefaultJtbdRunner;
        // Validate phase → ReviewLoop
        let case = simple_case(
            "pass-topo",
            WorkflowPhase::Validate,
            RiskLevel::Low,
            None,
            Some(SwarmTopology::ReviewLoop),
        );
        let result = runner.run_case(&case).unwrap();
        assert!(
            result.passed,
            "case must pass when expected_topology matches"
        );
    }

    #[test]
    fn run_case_with_no_assertions_passes() {
        let runner = DefaultJtbdRunner;
        // No expected role/topology/disposition/artifacts → trivially passes
        let case = JtbdCase {
            case_id: "empty".to_string(),
            job_statement: "no assertions".to_string(),
            task: TaskContext::default(),
            expected_role: None,
            expected_topology: None,
            expected_disposition: None,
            expected_artifacts: vec![],
            notes: vec![],
        };
        let result = runner.run_case(&case).unwrap();
        assert!(result.passed);
        assert!(result.assertions.is_empty());
    }

    #[test]
    fn run_suite_empty_input_returns_empty_without_panic() {
        // Property: empty suite must never panic
        let runner = DefaultJtbdRunner;
        let results = runner.run_suite(&[]).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn run_suite_aggregates_results() {
        let runner = DefaultJtbdRunner;
        let cases = vec![
            simple_case(
                "s1",
                WorkflowPhase::Intake,
                RiskLevel::Low,
                Some(AgentRole::Explorer),
                None,
            ),
            simple_case(
                "s2",
                WorkflowPhase::Plan,
                RiskLevel::Medium,
                Some(AgentRole::Planner),
                None,
            ),
            // Deliberate failure: wrong topology
            simple_case(
                "s3",
                WorkflowPhase::Execute,
                RiskLevel::Low,
                None,
                Some(SwarmTopology::Debate),
            ),
        ];
        let results = runner.run_suite(&cases).unwrap();
        assert_eq!(results.len(), 3);
        let passed: Vec<_> = results.iter().filter(|r| r.passed).collect();
        let failed: Vec<_> = results.iter().filter(|r| !r.passed).collect();
        assert_eq!(passed.len(), 2, "s1 and s2 should pass");
        assert_eq!(failed.len(), 1, "s3 should fail (wrong topology)");
        assert_eq!(failed[0].case_id, "s3");
    }
}
