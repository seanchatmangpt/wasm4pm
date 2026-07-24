//! Standalone parallel-hypothesis tracker (ARD §3.7 Hypothesis Manager).
//!
//! Independent of [`crate::session::model`]'s `TrackHypothesis` (which stays,
//! scoped to session-track scoring specifically). This is the ARD's
//! general-purpose component: weighted hypotheses, evidence in either
//! direction, hysteresis before committing, and explicit abstention when
//! nothing clears the confidence floor — first mile is exactly "no evidence
//! yet ⇒ abstain, never a fabricated leader."

use std::collections::BTreeMap;

/// The manager's read of current standing: either an undecided state, or a
/// committed leading hypothesis.
#[derive(Debug, Clone, PartialEq)]
pub enum HypothesisOutcome {
    /// No hypothesis clears the confidence floor, or the leader lacks
    /// sufficient margin over the runner-up (hysteresis) — abstain rather
    /// than fabricate a leader.
    Abstain,
    /// A hypothesis has cleared both the confidence floor and the margin
    /// requirement over its closest competitor.
    Committed {
        /// The committed hypothesis id.
        id: String,
        /// Its current score.
        score: f32,
    },
}

/// Weighted parallel-hypothesis tracker.
#[derive(Debug, Clone)]
pub struct HypothesisManager {
    scores: BTreeMap<String, f32>,
    confidence_floor: f32,
    margin: f32,
}

impl HypothesisManager {
    /// Construct a manager over the given hypothesis ids, all starting at
    /// score 0.0 (bootstrap: no evidence yet).
    pub fn new(ids: impl IntoIterator<Item = String>, confidence_floor: f32, margin: f32) -> Self {
        Self {
            scores: ids.into_iter().map(|id| (id, 0.0)).collect(),
            confidence_floor,
            margin,
        }
    }

    /// Current score for a hypothesis, if tracked.
    pub fn score(&self, id: &str) -> Option<f32> {
        self.scores.get(id).copied()
    }

    /// Add evidence weight to a hypothesis (clamped to `[0.0, 1.0]`).
    pub fn add_evidence(&mut self, id: &str, weight: f32) {
        if let Some(score) = self.scores.get_mut(id) {
            *score = (*score + weight).clamp(0.0, 1.0);
        }
    }

    /// Subtract evidence weight from a hypothesis (clamped to `[0.0, 1.0]`).
    pub fn subtract_evidence(&mut self, id: &str, weight: f32) {
        if let Some(score) = self.scores.get_mut(id) {
            *score = (*score - weight).clamp(0.0, 1.0);
        }
    }

    /// Evaluate current standing. First mile: with all scores at 0.0 (no
    /// evidence admitted yet), this always returns [`HypothesisOutcome::Abstain`].
    pub fn evaluate(&self) -> HypothesisOutcome {
        let mut ranked: Vec<(&String, f32)> = self.scores.iter().map(|(id, score)| (id, *score)).collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(b.0)));

        let Some((leader_id, leader_score)) = ranked.first().copied() else {
            return HypothesisOutcome::Abstain;
        };
        if leader_score < self.confidence_floor {
            return HypothesisOutcome::Abstain;
        }
        let runner_up_score = ranked.get(1).map(|(_, score)| *score).unwrap_or(0.0);
        if leader_score - runner_up_score < self.margin {
            return HypothesisOutcome::Abstain;
        }
        HypothesisOutcome::Committed {
            id: leader_id.clone(),
            score: leader_score,
        }
    }
}
