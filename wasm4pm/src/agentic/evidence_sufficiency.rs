use crate::agentic::traits::EvidenceSufficiencyChecker;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultEvidenceSufficiencyChecker;

impl EvidenceSufficiencyChecker for DefaultEvidenceSufficiencyChecker {
    fn is_sufficient(&self, task: &TaskContext) -> Result<bool, AgenticError> {
        let envelope = &task.evidence;

        // Check: all required evidence classes are available
        let classes_ok = envelope
            .required_evidence_classes
            .iter()
            .all(|c| envelope.available_evidence_classes.contains(c));

        // Check: confidence is at least Medium
        let confidence_ok = matches!(
            envelope.confidence_band,
            ConfidenceBand::Medium | ConfidenceBand::High | ConfidenceBand::Certain
        );

        // Check: drift is not out of control
        let drift_ok = !matches!(envelope.drift_status, DriftStatus::OutOfControl);

        Ok(classes_ok && confidence_ok && drift_ok)
    }

    fn summarize_gaps(&self, task: &TaskContext) -> Result<Vec<String>, AgenticError> {
        let envelope = &task.evidence;
        let mut gaps = vec![];

        // Missing required evidence classes
        for req in &envelope.required_evidence_classes {
            if !envelope.available_evidence_classes.contains(req) {
                gaps.push(format!("missing evidence class: {req}"));
            }
        }

        // Low or unknown confidence
        if matches!(
            envelope.confidence_band,
            ConfidenceBand::Unknown | ConfidenceBand::Low
        ) {
            gaps.push(format!(
                "confidence band insufficient: {:?}",
                envelope.confidence_band
            ));
        }

        // Out of control drift
        if matches!(envelope.drift_status, DriftStatus::OutOfControl) {
            gaps.push("drift out of control".to_string());
        }

        Ok(gaps)
    }
}
