//! Breed: production_rules (Agent A responsibility)

use crate::breeds::{BreedId, BreedInput, BreedOutput, CognitionBreed, BreedError, Receipt};

/// Breed stub for production_rules
pub struct Stub;

impl CognitionBreed for Stub {
    fn id(&self) -> BreedId {
        BreedId::Mycin
    }

    fn capabilities(&self) -> Vec<String> {
        vec![]
    }

    fn preconditions(&self, _: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        Ok(BreedOutput {
            breed: BreedId::Mycin,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation: "production_rules stub".to_string(),
        })
    }

    fn postconditions(&self, _: &BreedOutput) -> Result<(), String> {
        Ok(())
    }

    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        crate::breeds::compute_receipt(self.id(), input, output)
    }
}
