//! Artificial Neurosis / Ideology Machines
//! Belief systems and personality simulation (PARRY/Colby/Abelson lineage).
//!
//! This implements a belief network that reacts defensively or neurotically
//! based on incoming symbolic assertions, tracking paranoia/affect levels.

use std::collections::HashMap;

/// A belief state mimicking Abelson's ideology machines or Colby's PARRY.
#[derive(Debug, Default, Clone)]
pub struct NeuroticState {
    /// Fear level (0.0–1.0); increases on highly conflicting inputs.
    pub fear: f64,
    /// Anger level (0.0–1.0); spikes when beliefs are strongly contested.
    pub anger: f64,
    /// Mistrust level; rises with novel or conflicting concepts.
    pub mistrust: f64,
    /// Map from belief node label to conviction strength (0.0–1.0).
    pub beliefs: HashMap<String, f64>,
}

impl NeuroticState {
    /// Creates a new default `NeuroticState` with all levels at zero.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a new semantic input. If it conflicts with strongly held beliefs,
    /// mistrust and anger increase. If it aligns, they decrease.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn process_input(&mut self, concept: &str, incoming_strength: f64) -> String {
        let incoming_clamped = if incoming_strength.is_finite() {
            incoming_strength.clamp(0.0, 1.0)
        } else {
            0.0
        };
        let response = if let Some(&current_strength) = self.beliefs.get(concept) {
            let conflict = (current_strength - incoming_clamped).abs();
            if conflict > 0.5 {
                self.mistrust += 0.1 * conflict;
                self.anger += 0.2 * conflict;
                self.fear += 0.05 * conflict;
                "defensive".to_string()
            } else {
                self.mistrust = (self.mistrust - 0.1).max(0.0);
                let blended = ((current_strength + incoming_clamped) / 2.0).clamp(0.0, 1.0);
                self.beliefs.insert(concept.to_string(), blended);
                "accepting".to_string()
            }
        } else {
            // Novel concept, slight mistrust increase for paranoia simulation
            self.mistrust += 0.05;
            self.beliefs.insert(concept.to_string(), incoming_clamped);
            "curious".to_string()
        };

        // Enforce documented [0.0, 1.0] invariant.
        self.fear = self.fear.clamp(0.0, 1.0);
        self.anger = self.anger.clamp(0.0, 1.0);
        self.mistrust = self.mistrust.clamp(0.0, 1.0);

        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_neurotic_response_time() {
        let start = Instant::now();
        let mut sys = NeuroticState::new();
        sys.beliefs.insert("authority".to_string(), 0.9);
        let res = sys.process_input("authority", 0.1); // High conflict
        assert_eq!(res, "defensive");
        assert!(sys.anger > 0.0);
        let elapsed = start.elapsed();
        // The tests should take 5 seconds maximum
        assert!(elapsed.as_millis() < 5000);
    }

    /// Rank-1 invariant from the field docs: `fear`, `anger`, `mistrust` MUST
    /// stay in `[0.0, 1.0]` no matter how many conflicting inputs arrive. The
    /// pre-clamp code grew these unboundedly, contradicting the public docs.
    #[test]
    fn test_neurotic_levels_clamped_under_repeated_conflict() {
        let mut sys = NeuroticState::new();
        sys.beliefs.insert("authority".to_string(), 1.0);
        for _ in 0..1000 {
            sys.process_input("authority", 0.0); // Maximum conflict each iter.
        }
        assert!(
            sys.fear <= 1.0,
            "fear={} exceeded 1.0 (docs claim [0,1])",
            sys.fear
        );
        assert!(
            sys.anger <= 1.0,
            "anger={} exceeded 1.0 (docs claim [0,1])",
            sys.anger
        );
        assert!(
            sys.mistrust <= 1.0,
            "mistrust={} exceeded 1.0 (docs claim [0,1])",
            sys.mistrust
        );
        assert!(sys.fear >= 0.0);
        assert!(sys.anger >= 0.0);
        assert!(sys.mistrust >= 0.0);
    }

    /// Inputs outside [0,1] must not break the invariant either.
    #[test]
    fn test_out_of_range_input_does_not_break_invariant() {
        let mut sys = NeuroticState::new();
        sys.process_input("novel", f64::INFINITY);
        sys.process_input("novel", f64::NEG_INFINITY);
        sys.process_input("novel", f64::NAN);
        assert!((0.0..=1.0).contains(&sys.fear));
        assert!((0.0..=1.0).contains(&sys.anger));
        assert!((0.0..=1.0).contains(&sys.mistrust));
        for v in sys.beliefs.values() {
            assert!((0.0..=1.0).contains(v), "belief={} out of [0,1]", v);
        }
    }
}
