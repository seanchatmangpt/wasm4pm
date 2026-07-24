//! Default constructors for public composition builders.

use super::composition::{CognitivePipelineBuilder, CompositionContext};

impl Default for CompositionContext {
    fn default() -> Self {
        Self::new(0.0)
    }
}

impl Default for CognitivePipelineBuilder {
    fn default() -> Self {
        Self::new(0.0)
    }
}
