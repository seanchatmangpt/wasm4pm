//! Case-Based Reasoning breed (Agent A responsibility)

use crate::breeds::{BreedId, BreedInput, BreedOutput, CognitionBreed, BreedError, Receipt};

/// CBR breed stub
pub struct Cbr;

impl CognitionBreed for Cbr {
    fn id(&self) -> BreedId {
        BreedId::Cbr
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["similarity_matching".to_string()]
    }

    fn preconditions(&self, _: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        Ok(BreedOutput {
            breed: BreedId::Cbr,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation: "cbr".to_string(),
        })
    }

    fn postconditions(&self, _: &BreedOutput) -> Result<(), String> {
        Ok(())
    }

    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        crate::breeds::compute_receipt(self.id(), input, output)
    }
}
