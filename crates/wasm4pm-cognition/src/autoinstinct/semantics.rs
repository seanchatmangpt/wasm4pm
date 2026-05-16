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
    pub fn new() -> Self {
        let mut lexicon = HashMap::new();
        lexicon.insert("give".to_string(), PrimitiveAct::Atrans);
        lexicon.insert("go".to_string(), PrimitiveAct::Ptrans);
        lexicon.insert("tell".to_string(), PrimitiveAct::Mtrans);
        lexicon.insert("push".to_string(), PrimitiveAct::Propel);
        Self { lexicon }
    }

    /// Very basic pattern matching (ELIZA/SHRDLU style).
    ///
    /// Extracts `to`/`from` prepositional phrases from positions 3..N when
    /// present. Patterns supported:
    ///   "actor verb object to <recipient>"
    ///   "actor verb object from <source>"
    ///   "actor verb object from <source> to <recipient>"
    ///   "actor verb object to <recipient> from <source>"
    /// Single-token recipient/source only (first token after the preposition).
    /// This is the same minimalist surface grammar as the rest of the parser
    /// (positional, no real syntactic analysis), but it no longer drops the
    /// declared `to`/`from` fields on the floor (iter-4 deferred finding).
    pub fn parse(&self, sentence: &str) -> Option<SemanticFrame> {
        let words: Vec<&str> = sentence.split_whitespace().collect();
        if words.len() < 3 {
            return None;
        }

        let actor = words[0].to_string();
        let verb = words[1].to_lowercase();
        let object = words[2].to_string();

        let act = self.lexicon.get(&verb)?.clone();

        // Scan positions 3..N for `to <X>` and `from <X>` prepositions.
        let mut to: Option<String> = None;
        let mut from: Option<String> = None;
        let mut idx = 3;
        while idx + 1 < words.len() {
            match words[idx].to_lowercase().as_str() {
                "to" if to.is_none() => {
                    to = Some(words[idx + 1].to_string());
                    idx += 2;
                }
                "from" if from.is_none() => {
                    from = Some(words[idx + 1].to_string());
                    idx += 2;
                }
                _ => idx += 1,
            }
        }

        Some(SemanticFrame {
            act,
            actor,
            object,
            to,
            from,
        })
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

    /// Rank-2 regression test for iter-4 deferred finding:
    /// `to` field MUST be populated when the sentence contains "to <X>".
    /// Domain contract: Schank's CD primitives ATRANS/PTRANS/MTRANS all model
    /// a recipient — dropping it is a semantic loss the parser was supposed to
    /// preserve via the declared SemanticFrame::to field.
    #[test]
    fn parse_extracts_to_recipient() {
        let parser = SemanticParser::new();
        let frame = parser.parse("John give book to Mary").unwrap();
        assert_eq!(frame.act, PrimitiveAct::Atrans);
        assert_eq!(frame.actor, "John");
        assert_eq!(frame.object, "book");
        assert_eq!(frame.to.as_deref(), Some("Mary"));
        assert_eq!(frame.from, None);
    }

    /// Rank-2 regression test: `from` field MUST be populated when the
    /// sentence contains "from <X>".
    #[test]
    fn parse_extracts_from_source() {
        let parser = SemanticParser::new();
        let frame = parser.parse("John go store from home").unwrap();
        assert_eq!(frame.act, PrimitiveAct::Ptrans);
        assert_eq!(frame.from.as_deref(), Some("home"));
        assert_eq!(frame.to, None);
    }

    /// Rank-2 regression test: both `to` AND `from` are populated when the
    /// sentence contains both prepositions, regardless of order.
    #[test]
    fn parse_extracts_to_and_from_both_orders() {
        let parser = SemanticParser::new();
        let a = parser.parse("John give book to Mary from Alice").unwrap();
        assert_eq!(a.to.as_deref(), Some("Mary"));
        assert_eq!(a.from.as_deref(), Some("Alice"));
        let b = parser.parse("John give book from Alice to Mary").unwrap();
        assert_eq!(b.to.as_deref(), Some("Mary"));
        assert_eq!(b.from.as_deref(), Some("Alice"));
    }

    /// Rank-1 invariant: a bare "actor verb object" still produces None
    /// for to/from (no false positives when prepositions absent).
    #[test]
    fn parse_no_prepositions_means_none() {
        let parser = SemanticParser::new();
        let frame = parser.parse("John give book").unwrap();
        assert_eq!(frame.to, None);
        assert_eq!(frame.from, None);
    }
}
