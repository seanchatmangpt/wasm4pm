//! Breed: prolog (Agent A responsibility)

use crate::breeds::{BreedId, BreedInput, BreedOutput, CognitionBreed, BreedError, Receipt};

/// Breed stub for prolog
pub struct Stub;

impl CognitionBreed for Stub {
    fn id(&self) -> BreedId {
        BreedId::Prolog
    }

    fn capabilities(&self) -> Vec<String> {
        vec![]
    }

    fn preconditions(&self, _: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        Ok(BreedOutput {
            breed: BreedId::Prolog,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation: "prolog stub".to_string(),
            inference_trace: vec![],
        })
    }

    fn postconditions(&self, _: &BreedOutput) -> Result<(), String> {
        Ok(())
    }

    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        crate::breeds::compute_receipt(self.id(), input, output)
    }
}
