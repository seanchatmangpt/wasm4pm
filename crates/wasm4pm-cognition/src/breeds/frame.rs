//! ELIZA-style pattern matching breed (Agent A responsibility)
//!
//! Real implementation pending.

use crate::breeds::{BreedId, BreedInput, BreedOutput, CognitionBreed, BreedError, Receipt};

/// ELIZA pattern-matching breed (stub for compilation)
pub struct Eliza;

impl CognitionBreed for Eliza {
    fn id(&self) -> BreedId {
        BreedId::Eliza
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["pattern_matching".to_string(), "slot_filling".to_string()]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        Ok(BreedOutput {
            breed: BreedId::Eliza,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation: "eliza stub".to_string(),
        })
    }

    fn postconditions(&self, _output: &BreedOutput) -> Result<(), String> {
        Ok(())
    }

    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        crate::breeds::compute_receipt(self.id(), input, output)
    }
}
