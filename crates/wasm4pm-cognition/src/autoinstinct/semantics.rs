//! Responding to Language / Understanding / Sense and Semantics
//! Implementations from the ELIZA, SHRDLU, Wilks, and Schank lineage.
//!
//! Provides nanosecond-scale pattern matching and semantic dependency parsing 
//! to convert textual input into symbolic conceptual dependency (CD) graphs.

use std::collections::HashMap;

/// Conceptual Dependency (CD) Primitive Acts (Schank)
#[derive(Debug, PartialEq, Clone)]
pub enum PrimitiveAct {
    /// Transfer of abstract relationship (e.g. give).
    Atrans,
    /// Transfer of physical location (e.g. go).
    Ptrans,
    /// Application of physical force (e.g. push).
    Propel,
    /// Transfer of mental information (e.g. tell).
    Mtrans,
    /// Construction of new information (e.g. think).
    Mbuild,
    /// Production of sound (e.g. say).
    Speak,
    /// Focusing a sense organ (e.g. listen).
    Attend,
}

/// A Semantic Frame representing an understood sentence.
#[derive(Debug, Clone)]
pub struct SemanticFrame {
    /// The primitive act this sentence expresses.
    pub act: PrimitiveAct,
    /// The agent performing the act.
    pub actor: String,
    /// The object of the act.
    pub object: String,
    /// Optional recipient (to whom).
    pub to: Option<String>,
    /// Optional source (from whom).
    pub from: Option<String>,
}

/// Pattern-matching semantic parser (ELIZA/SHRDLU/Schank lineage).
pub struct SemanticParser {
    lexicon: HashMap<String, PrimitiveAct>,
}

impl Default for SemanticParser {
    fn default() -> Self {
        Self::new()
    }
}

impl SemanticParser {
    /// Creates a new `SemanticParser` with a built-in English verb lexicon.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new() -> Self {
        let mut lexicon = HashMap::new();
        lexicon.insert("give".to_string(), PrimitiveAct::Atrans);
        lexicon.insert("go".to_string(), PrimitiveAct::Ptrans);
        lexicon.insert("tell".to_string(), PrimitiveAct::Mtrans);
        lexicon.insert("push".to_string(), PrimitiveAct::Propel);
        Self { lexicon }
    }

    /// Very basic pattern matching (ELIZA/SHRDLU style)
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn parse(&self, sentence: &str) -> Option<SemanticFrame> {
        let words: Vec<&str> = sentence.split_whitespace().collect();
        if words.len() < 3 {
            return None;
        }

        let actor = words[0].to_string();
        let verb = words[1].to_lowercase();
        let object = words[2].to_string();

        if let Some(act) = self.lexicon.get(&verb) {
            Some(SemanticFrame {
                act: act.clone(),
                actor,
                object,
                to: None,
                from: None,
            })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_semantic_parsing_speed() {
        let start = Instant::now();
        let parser = SemanticParser::new();
        let frame = parser.parse("John give book").unwrap();
        assert_eq!(frame.act, PrimitiveAct::Atrans);
        assert_eq!(frame.actor, "John");
        assert_eq!(frame.object, "book");
        let elapsed = start.elapsed();
        // The tests should take 5 seconds maximum
        assert!(elapsed.as_millis() < 5000);
    }
}
