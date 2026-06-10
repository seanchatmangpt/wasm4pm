//! Goldberg Construction Grammar: argument-structure constructions carry
//! meaning independently of the verb's lexical entry (Goldberg 1995,
//! "Constructions: A Construction Grammar Approach to Argument Structure").
//!
//! Built-in construction inventory (longest-form-first matching over
//! post-verbal chunks):
//!
//! | construction        | post-verb pattern | constructional meaning      |
//! |---------------------|-------------------|-----------------------------|
//! | ditransitive        | NP NP             | X CAUSE Y to RECEIVE Z      |
//! | caused-motion       | NP PP             | X CAUSE Y to MOVE Path      |
//! | transitive          | NP                | X ACT-ON Y                  |
//! | intransitive-motion | PP                | X MOVE Path                 |
//! | intransitive        | (none)            | X ACT                       |
//!
//! Pipeline: tokenize → pos-tag (lexicon facts `lex:<word>:pos`) → chunk NPs
//! ((det)(adj)*noun | pron) and PPs (prep NP) → match-construction
//! (longest-form-first) → bind-slot → fuse-meaning.
//!
//! Coercion (the Goldberg signature): when the verb's lexical valence
//! (`lex:<verb>:valence`) provides fewer arguments than the matched
//! construction (e.g. intransitive "sneeze" in the caused-motion frame
//! "sneezed the napkin off the table"), the construction itself contributes
//! the caused-motion meaning and the output carries `cxg:coerced = true`.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;

/// Goldberg argument-structure construction matcher.
pub struct ConstructionGrammar;

const MAX_TOKENS: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Chunk {
    /// Noun phrase with its surface text.
    Np(String),
    /// Prepositional phrase (oblique/path) with its surface text.
    Pp(String),
}

/// Construction inventory entry: name, post-verb pattern, arity, meaning frame.
struct Construction {
    name: &'static str,
    pattern: &'static [&'static str], // "NP" / "PP"
    arity: usize,                     // argument slots incl. subject
    frame: &'static str,
}

const INVENTORY: &[Construction] = &[
    Construction {
        name: "ditransitive",
        pattern: &["NP", "NP"],
        arity: 3,
        frame: "CAUSE-RECEIVE",
    },
    Construction {
        name: "caused-motion",
        pattern: &["NP", "PP"],
        arity: 3,
        frame: "CAUSE-MOVE",
    },
    Construction {
        name: "transitive",
        pattern: &["NP"],
        arity: 2,
        frame: "ACT-ON",
    },
    Construction {
        name: "intransitive-motion",
        pattern: &["PP"],
        arity: 2,
        frame: "MOVE",
    },
    Construction {
        name: "intransitive",
        pattern: &[],
        arity: 1,
        frame: "ACT",
    },
];

fn valence_arity(v: &str) -> usize {
    match v {
        "ditransitive" => 3,
        "transitive" => 2,
        _ => 1, // intransitive / intransitive-motion
    }
}

impl ConstructionGrammar {
    fn utterance(input: &BreedInput) -> Option<&str> {
        input
            .facts
            .iter()
            .find(|f| f.key == "cxg:utterance")
            .map(|f| f.value.as_str())
    }

    fn lexicon(input: &BreedInput) -> (BTreeMap<String, String>, BTreeMap<String, String>) {
        let mut pos = BTreeMap::new();
        let mut valence = BTreeMap::new();
        for f in &input.facts {
            if let Some(rest) = f.key.strip_prefix("lex:") {
                if let Some(word) = rest.strip_suffix(":pos") {
                    pos.insert(word.to_string(), f.value.clone());
                } else if let Some(word) = rest.strip_suffix(":valence") {
                    valence.insert(word.to_string(), f.value.clone());
                }
            }
        }
        (pos, valence)
    }
}

impl CognitionBreed for ConstructionGrammar {
    fn id(&self) -> BreedId {
        BreedId::ConstructionGrammar
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "argument_structure_constructions".to_string(),
            "np_chunking".to_string(),
            "meaning_coercion".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let utt = Self::utterance(input)
            .ok_or_else(|| "construction_grammar requires a 'cxg:utterance' fact".to_string())?;
        if utt.trim().is_empty() {
            return Err("utterance is empty".to_string());
        }
        let n = utt.split_whitespace().count();
        if n > MAX_TOKENS {
            return Err(format!("utterance exceeds {} tokens", MAX_TOKENS));
        }
        let (pos, _) = Self::lexicon(input);
        if pos.is_empty() {
            return Err("lexicon is empty: at least one 'lex:<word>:pos' fact required".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::ConstructionGrammar,
            message: m,
        };
        let utt = Self::utterance(input)
            .ok_or_else(|| err("missing 'cxg:utterance' fact".to_string()))?;
        let (lex_pos, lex_valence) = Self::lexicon(input);

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |kind: &str, detail: String, trace: &mut Vec<TraceStep>| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        // 1. Tokenize.
        let tokens: Vec<String> = utt
            .split_whitespace()
            .map(|t| {
                t.trim_matches(|c: char| !c.is_ascii_alphanumeric())
                    .to_ascii_lowercase()
            })
            .filter(|t| !t.is_empty())
            .collect();
        push("tokenize", tokens.join(" "), &mut trace);
        if tokens.is_empty() {
            return Err(err("no tokens after tokenization".to_string()));
        }

        // 2. POS-tag from the lexicon (unknown word = refusal: no guessing).
        let mut tagged: Vec<(String, String)> = Vec::new();
        for t in &tokens {
            let p = lex_pos
                .get(t)
                .ok_or_else(|| err(format!("word '{}' not in lexicon", t)))?;
            push("pos-tag", format!("{}/{}", t, p), &mut trace);
            tagged.push((t.clone(), p.clone()));
        }

        // 3. Chunk: NP = (det)(adj)*noun | pron ; PP = prep NP. Verb passes through.
        let mut chunks: Vec<(Option<String>, Chunk)> = Vec::new(); // (verb passthrough, chunk)
        let mut verb: Option<String> = None;
        let mut verb_index_in_chunks: Option<usize> = None;
        let mut i = 0;
        let parse_np = |tagged: &[(String, String)], mut j: usize| -> Option<(String, usize)> {
            let mut words = Vec::new();
            if j < tagged.len() && tagged[j].1 == "pron" {
                return Some((tagged[j].0.clone(), j + 1));
            }
            if j < tagged.len() && tagged[j].1 == "det" {
                words.push(tagged[j].0.clone());
                j += 1;
            }
            while j < tagged.len() && tagged[j].1 == "adj" {
                words.push(tagged[j].0.clone());
                j += 1;
            }
            if j < tagged.len() && tagged[j].1 == "noun" {
                words.push(tagged[j].0.clone());
                return Some((words.join(" "), j + 1));
            }
            None
        };
        while i < tagged.len() {
            let (w, p) = &tagged[i];
            if p == "verb" {
                if verb.is_some() {
                    return Err(err("multiple verbs: only single-clause utterances supported".to_string()));
                }
                verb = Some(w.clone());
                verb_index_in_chunks = Some(chunks.len());
                i += 1;
            } else if p == "prep" {
                if let Some((np, next)) = parse_np(&tagged, i + 1) {
                    let text = format!("{} {}", w, np);
                    push("chunk", format!("PP[{}]", text), &mut trace);
                    chunks.push((None, Chunk::Pp(text)));
                    i = next;
                } else {
                    return Err(err(format!("preposition '{}' without NP complement", w)));
                }
            } else if let Some((np, next)) = parse_np(&tagged, i) {
                push("chunk", format!("NP[{}]", np), &mut trace);
                chunks.push((None, Chunk::Np(np)));
                i = next;
            } else {
                return Err(err(format!("cannot chunk at '{}' ({})", w, p)));
            }
        }
        let verb = verb.ok_or_else(|| err("no verb in utterance".to_string()))?;
        let vidx = verb_index_in_chunks.unwrap_or(0);
        let subject = if vidx > 0 {
            match &chunks[vidx - 1].1 {
                Chunk::Np(s) => Some(s.clone()),
                Chunk::Pp(_) => None,
            }
        } else {
            None
        };
        let subject = subject.ok_or_else(|| err("no subject NP before the verb".to_string()))?;
        let post: Vec<&Chunk> = chunks[vidx..].iter().map(|(_, c)| c).collect();

        // 4. Match constructions longest-form-first against the post-verb chunks.
        let mut matched: Option<&Construction> = None;
        for c in INVENTORY {
            let fits = c.pattern.len() == post.len()
                && c.pattern.iter().zip(post.iter()).all(|(p, ch)| match ch {
                    Chunk::Np(_) => *p == "NP",
                    Chunk::Pp(_) => *p == "PP",
                });
            push(
                "match-construction",
                format!("{}: {}", c.name, if fits { "match" } else { "no-match" }),
                &mut trace,
            );
            if fits {
                matched = Some(c);
                break;
            }
        }
        let cons = matched
            .ok_or_else(|| err("no construction matches the post-verbal chunk sequence".to_string()))?;

        // 5. Bind slots.
        let mut slots: Vec<(String, String)> = vec![("subj".to_string(), subject.clone())];
        push("bind-slot", format!("subj <- {}", subject), &mut trace);
        let mut np_count = 0;
        for (pi, ch) in post.iter().enumerate() {
            let (slot, text) = match ch {
                Chunk::Np(s) => {
                    np_count += 1;
                    let slot = if cons.name == "ditransitive" {
                        if np_count == 1 { "rec" } else { "theme" }
                    } else {
                        "obj"
                    };
                    (slot.to_string(), s.clone())
                }
                Chunk::Pp(s) => ("obl".to_string(), s.clone()),
            };
            push("bind-slot", format!("{} <- {} (arg {})", slot, text, pi + 1), &mut trace);
            slots.push((slot, text));
        }

        // 6. Fuse meaning: construction frame + verb; coercion if the verb's
        // lexical valence supplies fewer args than the construction demands.
        let lex_arity = lex_valence
            .get(&verb)
            .map(|v| valence_arity(v))
            .unwrap_or(cons.arity);
        let coerced = lex_arity < cons.arity;
        let args = slots
            .iter()
            .map(|(_, v)| v.clone())
            .collect::<Vec<_>>()
            .join(", ");
        let meaning = format!("{}({}; verb={})", cons.frame, args, verb);
        push(
            "fuse-meaning",
            format!(
                "{} via {}{}",
                meaning,
                cons.name,
                if coerced { " [coerced]" } else { "" }
            ),
            &mut trace,
        );

        let mut facts = vec![
            Fact {
                key: "cxg:construction".to_string(),
                value: cons.name.to_string(),
            },
            Fact {
                key: "cxg:meaning".to_string(),
                value: meaning.clone(),
            },
            Fact {
                key: "cxg:coerced".to_string(),
                value: coerced.to_string(),
            },
            Fact {
                key: "cxg:verb".to_string(),
                value: verb.clone(),
            },
        ];
        for (slot, text) in &slots {
            facts.push(Fact {
                key: format!("cxg:slot:{}", slot),
                value: text.clone(),
            });
        }

        Ok(BreedOutput {
            breed: BreedId::ConstructionGrammar,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(cons.name.to_string()),
            explanation: format!(
                "Construction grammar: '{}' matched {} ({}){}",
                utt,
                cons.name,
                meaning,
                if coerced {
                    " — meaning coerced by construction, not the verb's lexical entry"
                } else {
                    ""
                }
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "fuse-meaning") {
            return Err("missing fuse-meaning step".to_string());
        }
        if !output.facts.iter().any(|f| f.key == "cxg:meaning") {
            return Err("missing cxg:meaning fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lex(facts: &mut Vec<Fact>, word: &str, pos: &str) {
        facts.push(Fact {
            key: format!("lex:{}:pos", word),
            value: pos.into(),
        });
    }

    fn sneeze_input() -> BreedInput {
        let mut facts = vec![Fact {
            key: "cxg:utterance".into(),
            value: "he sneezed the napkin off the table".into(),
        }];
        lex(&mut facts, "he", "pron");
        lex(&mut facts, "sneezed", "verb");
        lex(&mut facts, "the", "det");
        lex(&mut facts, "napkin", "noun");
        lex(&mut facts, "off", "prep");
        lex(&mut facts, "table", "noun");
        facts.push(Fact {
            key: "lex:sneezed:valence".into(),
            value: "intransitive".into(),
        });
        BreedInput {
            intent: "parse".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn sneeze_napkin_is_caused_motion_with_coercion() {
        let out = ConstructionGrammar.run(&sneeze_input()).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("caused-motion"));
        let coerced = out.facts.iter().find(|f| f.key == "cxg:coerced").unwrap();
        assert_eq!(coerced.value, "true", "intransitive verb in caused-motion frame must be coerced");
        let meaning = out.facts.iter().find(|f| f.key == "cxg:meaning").unwrap();
        assert!(meaning.value.starts_with("CAUSE-MOVE"));
    }

    #[test]
    fn removing_oblique_changes_match() {
        let mut inp = sneeze_input();
        inp.facts[0].value = "he sneezed the napkin".into();
        let out = ConstructionGrammar.run(&inp).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("transitive"));
    }

    #[test]
    fn unknown_word_refused() {
        let mut inp = sneeze_input();
        inp.facts[0].value = "he sneezed the gronkulator off the table".into();
        assert!(ConstructionGrammar.run(&inp).is_err());
    }

    #[test]
    fn missing_utterance_refused() {
        let mut inp = sneeze_input();
        inp.facts.remove(0);
        assert!(ConstructionGrammar.preconditions(&inp).is_err());
    }
}
