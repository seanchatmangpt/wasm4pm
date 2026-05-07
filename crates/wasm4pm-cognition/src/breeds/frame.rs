//! ELIZA-style frame/pattern matching (Weizenbaum 1966).
//!
//! Patterns use a trivial wildcard grammar:
//!   `*` = greedy slot capture (one or more whitespace-delimited tokens).
//! A pattern is matched against `input.intent` lowercased; on first match
//! (longest-pattern-first), captured slots are bound by position to template
//! placeholders `${1}`, `${2}`, ... yielding the response.
//!
//! Patterns can be supplied via `input.facts` with `key == "frame.pattern"`
//! and `value == "<pattern>||<template>"` (delimited by `||`). If no
//! patterns are supplied, a built-in Rogerian script is used.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};

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
    frames.sort_by(|a, b| b.pattern.len().cmp(&a.pattern.len()));
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

fn render(template: &str, slots: &[String]) -> String {
    let mut out = template.to_string();
    for (i, s) in slots.iter().enumerate() {
        out = out.replace(&format!("${{{}}}", i + 1), s);
    }
    out
}

impl CognitionBreed for Eliza {
    fn id(&self) -> BreedId {
        BreedId::Eliza
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "pattern_matching".to_string(),
            "slot_filling".to_string(),
        ]
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
            });
            if let Some(slots) = try_match(&frame.pattern, &text) {
                let response = render(&frame.template, &slots);
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "match-pattern".to_string(),
                    detail: frame.pattern.clone(),
                    depth: 0,
                });
                for (i, s) in slots.iter().enumerate() {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "bind-slot".to_string(),
                        detail: format!("${{{}}}={}", i + 1, s),
                        depth: 0,
                    });
                }
                return Ok(BreedOutput {
                    breed: BreedId::Eliza,
                    candidates: input.candidates.clone(),
                    facts: input.facts.clone(),
                    selected: Some(frame.pattern.clone()),
                    explanation: response,
                    inference_trace: trace,
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
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("ELIZA must record at least one pattern attempt".to_string());
        }
        Ok(())
    }
}
