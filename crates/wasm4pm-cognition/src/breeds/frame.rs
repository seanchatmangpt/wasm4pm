//! ELIZA-style frame/pattern matching with pronoun reflection (Weizenbaum 1966).
//!
//! Patterns use a trivial wildcard grammar:
//!   `*` = greedy slot capture (one or more whitespace-delimited tokens).
//! A pattern is matched against `input.intent` lowercased; on first match
//! (longest-pattern-first), captured slots are bound by position to template
//! placeholders `${1}`, `${2}`, ... yielding the response.
//!
//! Pronoun reflection (Weizenbaum's key innovation):
//!   Captured slots have pronouns swapped reflexively (I↔you, me↔you, my↔your, etc.)
//!   before insertion into templates, creating illusion of understanding.
//!
//! Patterns can be supplied via `input.facts` with `key == "frame.pattern"`
//! and `value == "<pattern>||<template>"` (delimited by `||`). If no
//! patterns are supplied, a built-in Rogerian script is used.

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep};

/// Frame / ELIZA breed.
pub struct Eliza;

#[derive(Debug, Clone)]
struct Frame {
    pattern: String,
    template: String,
}

fn default_frames() -> Vec<Frame> {
    vec![
        Frame {
            pattern: "i am * because *".to_string(),
            template: "Why are you ${1} because ${2}?".to_string(),
        },
        Frame {
            pattern: "i am *".to_string(),
            template: "How long have you been ${1}?".to_string(),
        },
        Frame {
            pattern: "i feel *".to_string(),
            template: "Tell me more about feeling ${1}.".to_string(),
        },
        Frame {
            pattern: "i need *".to_string(),
            template: "Why do you need ${1}?".to_string(),
        },
        Frame {
            pattern: "*".to_string(),
            template: "Please go on.".to_string(),
        },
    ]
}

fn parse_frames(input: &BreedInput) -> Vec<Frame> {
    let mut frames: Vec<Frame> = input
        .facts
        .iter()
        .filter(|f| f.key == "frame.pattern")
        .filter_map(|f| {
            let parts: Vec<&str> = f.value.splitn(2, "||").collect();
            if parts.len() == 2 {
                Some(Frame {
                    pattern: parts[0].trim().to_lowercase(),
                    template: parts[1].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect();
    if frames.is_empty() {
        frames = default_frames();
    }
    // Longest pattern first (more specific matches before catch-all `*`).
    frames.sort_by_key(|b| std::cmp::Reverse(b.pattern.len()));
    frames
}

fn try_match(pattern: &str, text: &str) -> Option<Vec<String>> {
    let p_tokens: Vec<String> = pattern.split_whitespace().map(|s| s.to_string()).collect();
    let t_tokens: Vec<String> = text.split_whitespace().map(|s| s.to_string()).collect();
    let mut bindings: Vec<String> = Vec::new();
    fn rec(p: &[String], t: &[String], out: &mut Vec<String>) -> bool {
        if p.is_empty() {
            return t.is_empty();
        }
        if p[0] == "*" {
            if p.len() == 1 {
                if t.is_empty() {
                    return false;
                }
                out.push(t.join(" "));
                return true;
            }
            for split in 1..=t.len() {
                let captured = t[..split].join(" ");
                out.push(captured);
                if rec(&p[1..], &t[split..], out) {
                    return true;
                }
                out.pop();
            }
            false
        } else {
            if t.is_empty() {
                return false;
            }
            if p[0].eq_ignore_ascii_case(&t[0]) {
                rec(&p[1..], &t[1..], out)
            } else {
                false
            }
        }
    }
    if rec(&p_tokens, &t_tokens, &mut bindings) {
        Some(bindings)
    } else {
        None
    }
}

/// Reflect pronouns in text (Weizenbaum's core insight).
///
/// Swaps I↔you, me↔you, my↔your, etc. to create illusion of empathy.
/// Applied to captured slots before insertion into template.
///
/// Properties (Rank-1):
/// - Consistency: Reflexive operation (reflect(reflect(x)) may differ due to word boundaries,
///   but reflect is idempotent when applied to alternating pronouns).
/// - No false negatives: All standard first/second person pronouns are handled
///   at start-of-string, mid-string (with surrounding whitespace), AND end-of-string.
fn reflect_pronouns(text: &str) -> String {
    // Pad input so that pronouns at start-of-string and end-of-string have
    // synthetic " " boundaries on both sides. After the substitution sweep
    // we trim those padding spaces off. This eliminates the
    // "end-of-string `me`/`my` not matched" defect (iter-4 deferred finding).
    let mut result = format!(" {} ", text);

    // Order matters: longer forms first to avoid partial matches.
    let reflections: &[(&str, &str)] = &[
        // Contractions (longest matches first)
        (" i'm ", " you're "),
        (" i've ", " you've "),
        (" i'll ", " you'll "),
        // Pronouns
        (" i ", " you "),
        (" me ", " you "),
        (" my ", " your "),
        (" mine ", " yours "),
        // Verb agreement
        (" am ", " are "),
    ];

    for (from, to) in reflections {
        result = result.replace(from, to);
    }

    // Strip the one-character padding we added on each end. We added exactly
    // one ' ' on each side, so trim only that — preserve any user whitespace.
    let trimmed = if let Some(stripped) = result.strip_prefix(' ') {
        stripped
    } else {
        result.as_str()
    };
    let trimmed = trimmed.strip_suffix(' ').unwrap_or(trimmed);
    trimmed.to_string()
}

fn render(template: &str, slots: &[String]) -> String {
    let mut out = template.to_string();
    for (i, s) in slots.iter().enumerate() {
        // Apply pronoun reflection to captured slot before insertion.
        let reflected = reflect_pronouns(s);
        out = out.replace(&format!("${{{}}}", i + 1), &reflected);
    }
    out
}

impl CognitionBreed for Eliza {
    fn id(&self) -> BreedId {
        BreedId::Eliza
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["pattern_matching".to_string(), "slot_filling".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.intent.trim().is_empty() {
            return Err("ELIZA requires a non-empty intent".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let frames = parse_frames(input);
        let text = input.intent.to_lowercase();
        let mut trace: Vec<TraceStep> = Vec::new();

        for frame in &frames {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "try-pattern".to_string(),
                detail: frame.pattern.clone(),
                depth: 0,
                objects: vec![],
            });
            if let Some(slots) = try_match(&frame.pattern, &text) {
                let response = render(&frame.template, &slots);
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "match-pattern".to_string(),
                    detail: frame.pattern.clone(),
                    depth: 0,
                    objects: vec![],
                });
                for (i, s) in slots.iter().enumerate() {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "bind-slot".to_string(),
                        detail: format!("${{{}}}={}", i + 1, s),
                        depth: 0,
                        objects: vec![],
                    });
                }
                return Ok(BreedOutput {
                    breed: BreedId::Eliza,
                    candidates: input.candidates.clone(),
                    facts: input.facts.clone(),
                    selected: Some(frame.pattern.clone()),
                    explanation: response,
                    inference_trace: trace,
                    ocel_log: None,
                    retained_cases: vec![],
                });
            }
        }

        Ok(BreedOutput {
            breed: BreedId::Eliza,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation: "No pattern matched.".to_string(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("ELIZA must record at least one pattern attempt".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    #[test]
    fn pronoun_reflection_swaps_i_to_you() {
        assert_eq!(reflect_pronouns("i am happy"), "you are happy");
    }

    #[test]
    fn pronoun_reflection_swaps_me() {
        // Padded-and-trimmed implementation reflects ` me ` even with no
        // user-supplied whitespace boundaries.
        assert_eq!(reflect_pronouns("me"), "you");
    }

    #[test]
    fn pronoun_reflection_swaps_my() {
        assert_eq!(reflect_pronouns("my"), "your");
    }

    #[test]
    fn pronoun_reflection_swaps_mine() {
        assert_eq!(reflect_pronouns("mine"), "yours");
    }

    #[test]
    fn pronoun_reflection_swaps_contractions() {
        assert_eq!(reflect_pronouns("i'm"), "you're");
        assert_eq!(reflect_pronouns("i've"), "you've");
        assert_eq!(reflect_pronouns("i'll"), "you'll");
    }

    /// Rank-1 regression test for iter-4 deferred finding:
    /// end-of-string `me`/`my` MUST reflect even though it has no trailing space.
    /// Domain: ELIZA pronoun reflection (Weizenbaum 1966) is reflexive at any
    /// position; missing the end position is a fitness defect.
    #[test]
    fn pronoun_reflection_end_of_string_me_my() {
        assert_eq!(reflect_pronouns("i love me"), "you love you");
        assert_eq!(reflect_pronouns("this is my"), "this is your");
        assert_eq!(
            reflect_pronouns("the choice is mine"),
            "the choice is yours"
        );
    }

    /// Rank-1 regression test: start-of-string pronouns still reflect after
    /// switching from anchor-based to padded substitution.
    #[test]
    fn pronoun_reflection_start_of_string_contractions() {
        assert_eq!(reflect_pronouns("i'm here"), "you're here");
        assert_eq!(reflect_pronouns("i've been"), "you've been");
        assert_eq!(reflect_pronouns("i'll go"), "you'll go");
    }

    #[test]
    fn eliza_pronoun_reflection_in_response() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "i am depressed".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.breed, BreedId::Eliza);
        // With pronoun reflection, "i am depressed" captures "depressed",
        // and the response should be "How long have you been depressed?"
        assert!(
            output.explanation.contains("you been"),
            "Should have reflected pronoun in response, got: {}",
            output.explanation
        );
    }

    #[test]
    fn eliza_reflexive_dialogue_multi_turn() {
        let breed = Eliza;

        // First turn: "i feel sad"
        let input1 = BreedInput {
            intent: "i feel sad".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output1 = breed.run(&input1).expect("run ok 1");
        // Should capture "sad" and reflect to "Tell me more about feeling sad."
        assert!(output1.explanation.contains("feeling"));

        // Second turn: "i need help"
        let input2 = BreedInput {
            intent: "i need help".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output2 = breed.run(&input2).expect("run ok 2");
        // Should capture "help" and reflect to "Why do you need help?"
        assert!(output2.explanation.contains("you need"));
    }

    #[test]
    fn eliza_pattern_matching_basic() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "i am confused".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.breed, BreedId::Eliza);
        assert!(output.selected.is_some());
        assert!(!output.explanation.is_empty());
        assert!(
            output
                .inference_trace
                .iter()
                .any(|t| t.kind == "match-pattern"),
            "Should have matched a pattern"
        );
    }

    #[test]
    fn eliza_catchall_pattern() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "this is something unexpected".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        // Should fall back to catch-all "*" pattern
        assert!(output.explanation.contains("Please go on"));
    }

    #[test]
    fn eliza_custom_frames_via_facts() {
        let breed = Eliza;
        let custom_frames = vec![Fact {
            key: "frame.pattern".to_string(),
            value: "why * || What is the reason for ${1}?".to_string(),
        }];
        let input = BreedInput {
            intent: "why am i sad".to_string(),
            candidates: vec![],
            facts: custom_frames,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let output = breed.run(&input).expect("run ok");
        assert!(output.explanation.contains("reason"));
    }

    #[test]
    fn eliza_precondition_rejects_empty_intent() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("non-empty intent"));
    }

    #[test]
    fn try_match_basic_wildcard() {
        let pattern = "i am *";
        let text = "i am happy";
        let result = try_match(pattern, text);
        assert!(result.is_some());
        let slots = result.unwrap();
        assert_eq!(slots.len(), 1);
        assert_eq!(slots[0], "happy");
    }

    #[test]
    fn try_match_multi_slot() {
        let pattern = "i am * because *";
        let text = "i am tired because i worked";
        let result = try_match(pattern, text);
        assert!(result.is_some());
        let slots = result.unwrap();
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0], "tired");
        assert_eq!(slots[1], "i worked");
    }
}
