use crate::agentic::traits::EvidenceSufficiencyChecker;
use crate::agentic::types::*;

#[derive(Debug, Default)]
pub struct DefaultEvidenceSufficiencyChecker;

impl EvidenceSufficiencyChecker for DefaultEvidenceSufficiencyChecker {
    fn is_sufficient(&self, task: &TaskContext) -> Result<bool, AgenticError> {
        let mut span = tracing::debug_span!(
            "autonomic.evidence_sufficiency_check",
            task_id = %task.task_id,
            confidence = ?task.evidence.confidence_band,
            drift = ?task.evidence.drift_status,
        )
        .entered();

        let envelope = &task.evidence;

        // Check: all required evidence classes are available
        let check1_pass = envelope
            .required_evidence_classes
            .iter()
            .all(|c| envelope.available_evidence_classes.contains(c));

        // Check: confidence is at least Medium
        let check2_pass = matches!(
            envelope.confidence_band,
            ConfidenceBand::Medium | ConfidenceBand::High | ConfidenceBand::Certain
        );

        // Check: drift is not out of control
        let check3_pass = !matches!(envelope.drift_status, DriftStatus::OutOfControl);

        let is_sufficient = check1_pass && check2_pass && check3_pass;

        // Record OTEL fields per Cycle 40 spec
        span.record("is_sufficient", is_sufficient);
        span.record("check1_pass", check1_pass); // Evidence classes available
        span.record("check2_pass", check2_pass); // Confidence OK
        span.record("check3_pass", check3_pass); // Drift OK

        tracing::debug!(
            target: "autonomic.evidence_sufficiency_check",
            task_id = %task.task_id,
            is_sufficient,
            check1_pass,
            check2_pass,
            check3_pass,
            "evidence sufficiency evaluated"
        );
        Ok(is_sufficient)
    }

    fn summarize_gaps(&self, task: &TaskContext) -> Result<Vec<String>, AgenticError> {
        let mut span = tracing::debug_span!(
            "autonomic.evidence_sufficiency_gaps",
            task_id = %task.task_id,
        )
        .entered();
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

        // Record OTEL gap count
        span.record("gap_count", gaps.len());

        tracing::debug!(
            target: "autonomic.evidence_sufficiency_gaps",
            task_id = %task.task_id,
            gap_count = gaps.len(),
            "gaps summarized"
        );

        Ok(gaps)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn task_with_evidence(ev: EvidenceEnvelope) -> TaskContext {
        TaskContext {
            task_id: "t-ev".to_string(),
            evidence: ev,
            ..Default::default()
        }
    }

    #[test]
    fn sufficient_when_all_classes_available_and_confidence_high() {
        let mut req = BTreeSet::new();
        req.insert("otel_span".to_string());
        let mut avail = BTreeSet::new();
        avail.insert("otel_span".to_string());

        let ev = EvidenceEnvelope {
            required_evidence_classes: req,
            available_evidence_classes: avail,
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
            ..Default::default()
        };
        let checker = DefaultEvidenceSufficiencyChecker;
        assert!(checker.is_sufficient(&task_with_evidence(ev)).unwrap());
    }

    #[test]
    fn insufficient_when_required_class_missing() {
        let mut req = BTreeSet::new();
        req.insert("receipt".to_string());

        let ev = EvidenceEnvelope {
            required_evidence_classes: req,
            available_evidence_classes: BTreeSet::new(),
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::Stable,
            ..Default::default()
        };
        let checker = DefaultEvidenceSufficiencyChecker;
        assert!(!checker.is_sufficient(&task_with_evidence(ev)).unwrap());
    }

    #[test]
    fn insufficient_when_confidence_unknown() {
        let ev = EvidenceEnvelope {
            confidence_band: ConfidenceBand::Unknown,
            drift_status: DriftStatus::Stable,
            ..Default::default()
        };
        let checker = DefaultEvidenceSufficiencyChecker;
        assert!(!checker.is_sufficient(&task_with_evidence(ev)).unwrap());
    }

    #[test]
    fn insufficient_when_drift_out_of_control() {
        let ev = EvidenceEnvelope {
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::OutOfControl,
            ..Default::default()
        };
        let checker = DefaultEvidenceSufficiencyChecker;
        assert!(!checker.is_sufficient(&task_with_evidence(ev)).unwrap());
    }

    #[test]
    fn gaps_reports_missing_classes_and_drift() {
        let mut req = BTreeSet::new();
        req.insert("audit_log".to_string());
        let ev = EvidenceEnvelope {
            required_evidence_classes: req,
            available_evidence_classes: BTreeSet::new(),
            confidence_band: ConfidenceBand::High,
            drift_status: DriftStatus::OutOfControl,
            ..Default::default()
        };
        let checker = DefaultEvidenceSufficiencyChecker;
        let gaps = checker.summarize_gaps(&task_with_evidence(ev)).unwrap();
        assert!(gaps.iter().any(|g| g.contains("audit_log")));
        assert!(gaps.iter().any(|g| g.contains("drift")));
    }
}
