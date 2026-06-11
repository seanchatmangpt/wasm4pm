// Breed stub: eliza — generated skeleton, implement and remove this comment.
// Citation: See src/breeds/frame.rs
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed};
use crate::breeds::support::tracer::Tracer;

pub struct Eliza;

impl CognitionBreed for Eliza {
    fn id(&self) -> BreedId {
        BreedId::Eliza
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Tracer::new();
        trace.push(0, "stub", "NOT YET IMPLEMENTED", 0, vec![]);
        Err(self.error("breed not yet implemented".to_string()))
    }
}
