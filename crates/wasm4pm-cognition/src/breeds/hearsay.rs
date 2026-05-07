//! Breed: hearsay (Agent A responsibility)

use crate::breeds::{BreedId, BreedInput, BreedOutput, CognitionBreed, BreedError, Receipt};

/// Breed stub for hearsay
pub struct Stub;

impl CognitionBreed for Stub {
    fn id(&self) -> BreedId {
        BreedId::Hearsay
    }

    fn capabilities(&self) -> Vec<String> {
        vec![]
    }

    fn preconditions(&self, _: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        Ok(BreedOutput {
            breed: BreedId::Hearsay,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation: "hearsay stub".to_string(),
        })
    }

    fn postconditions(&self, _: &BreedOutput) -> Result<(), String> {
        Ok(())
    }

    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        crate::breeds::compute_receipt(self.id(), input, output)
    }
}
