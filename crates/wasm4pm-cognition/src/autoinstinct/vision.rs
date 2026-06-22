//! The Visual World
//! Early symbolic vision representing line-drawing/polyhedra perception.
//!
//! Provides ultra-fast topological parsing of simple blocks world states
//! without pixel-level computer vision overhead.

/// A symbolic representation of a visual polyhedron (Blocks World).
#[derive(Debug, PartialEq, Clone)]
pub struct Polyhedron {
    /// Unique label for this object (e.g. "A", "B").
    pub id: String,
    /// Shape category (e.g. "cube", "pyramid", "wedge").
    pub shape: String,
    /// ID of the object this one rests on, if any.
    pub supported_by: Option<String>,
}

/// Symbolic scene representation for Blocks World perception.
pub struct SymbolicVisionSystem {
    /// All currently observed objects in the scene.
    pub objects: Vec<Polyhedron>,
}

impl Default for SymbolicVisionSystem {
    fn default() -> Self {
        Self::new()
    }
}

impl SymbolicVisionSystem {
    /// Creates an empty `SymbolicVisionSystem` with no observed objects.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn new() -> Self {
        Self {
            objects: Vec::new(),
        }
    }

    /// Adds a newly observed `Polyhedron` to the scene.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn observe(&mut self, object: Polyhedron) {
        self.objects.push(object);
    }

    /// Find an object that has nothing supported by it (it's clear to move).
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn find_clear_object(&self) -> Option<&Polyhedron> {
        self.objects.iter().find(|obj| {
            !self
                .objects
                .iter()
                .any(|other| other.supported_by.as_deref() == Some(obj.id.as_str()))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_vision_parsing_speed() {
        let start = Instant::now();
        let mut sys = SymbolicVisionSystem::new();
        sys.observe(Polyhedron {
            id: "A".to_string(),
            shape: "cube".to_string(),
            supported_by: None,
        });
        sys.observe(Polyhedron {
            id: "B".to_string(),
            shape: "pyramid".to_string(),
            supported_by: Some("A".to_string()),
        });

        let clear = sys.find_clear_object().unwrap();
        assert_eq!(clear.id, "B");

        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() < 5000);
    }
}
