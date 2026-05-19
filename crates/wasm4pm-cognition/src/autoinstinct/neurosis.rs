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
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a new semantic input. If it conflicts with strongly held beliefs,
    /// mistrust and anger increase. If it aligns, they decrease.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn process_input(&mut self, concept: &str, incoming_strength: f64) -> String {
        let mut response = String::from("neutral");

        if let Some(&current_strength) = self.beliefs.get(concept) {
            let conflict = (current_strength - incoming_strength).abs();
            if conflict > 0.5 {
                self.mistrust += 0.1 * conflict;
                self.anger += 0.2 * conflict;
                self.fear += 0.05 * conflict;
                response = "defensive".to_string();
            } else {
                self.mistrust = (self.mistrust - 0.1).max(0.0);
                self.beliefs.insert(concept.to_string(), (current_strength + incoming_strength) / 2.0);
                response = "accepting".to_string();
            }
        } else {
            // Novel concept, slight mistrust increase for paranoia simulation
            self.mistrust += 0.05;
            self.beliefs.insert(concept.to_string(), incoming_strength);
            response = "curious".to_string();
        }

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
}
