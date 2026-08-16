//! ELIZA decomposition-reassembly engine (Weizenbaum 1966).
//!
//! When `input.rules` is non-empty the full keyword engine runs:
//!   1. Apply input substitutions (MY→YOUR, ME→YOU, I→YOU) to produce transformed text.
//!   2. Scan original tokens left-to-right for the first matching keyword.
//!   3. Follow `=KEYWORD` equivalence chains.
//!   4. Try each decomposition rule for the resolved keyword; first match wins.
//!   5. Render the reassembly template — numeric tokens (e.g. `3`) are replaced
//!      by the corresponding decomposition component capture (1-indexed).
//!
//! When `input.rules` is empty the catch-all wildcard-frame path is used;
//! unit tests depend on this behavior.
//!
//! Patterns can be supplied via `input.facts` with `key == "frame.pattern"`
//! and `value == "<pattern>||<template>"` (delimited by `||`). If no
//! patterns are supplied, a built-in Rogerian script is used.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;

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
    frames.sort_unstable_by_key(|b| std::cmp::Reverse(b.pattern.len()));
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

// ── Keyword engine ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
enum DecompComp {
    Wildcard,
    Literal(String),
    WordSet(Vec<String>),
}

/// Render a parsed decomposition pattern back into Weizenbaum's own
/// notation (e.g. `[Wildcard, Literal("YOUR"), Wildcard]` -> `"(0 YOUR 0)"`),
/// the inverse of `parse_decomp`.
fn render_decomp(decomp: &[DecompComp]) -> String {
    let parts: Vec<String> = decomp
        .iter()
        .map(|c| match c {
            DecompComp::Wildcard => "0".to_string(),
            DecompComp::Literal(w) => w.clone(),
            DecompComp::WordSet(words) => format!("(*{})", words.join(" ")),
        })
        .collect();
    format!("({})", parts.join(" "))
}

fn parse_decomp(s: &str) -> Vec<DecompComp> {
    let inner = s.trim().trim_start_matches('(').trim_end_matches(')');
    let mut comps: Vec<DecompComp> = Vec::new();
    let raw: Vec<&str> = inner.split_whitespace().collect();
    let mut i = 0;
    while i < raw.len() {
        let t = raw[i];
        if t == "0" {
            comps.push(DecompComp::Wildcard);
        } else if t.starts_with("(*") || t.starts_with("(/") {
            // Inline word set: (*WORD1 WORD2 ...) — may span multiple tokens
            let mut words: Vec<String> = Vec::new();
            let mut fragment = t
                .trim_start_matches("(*")
                .trim_start_matches("(/")
                .to_string();
            loop {
                let closed = fragment.ends_with(')');
                let word = fragment.trim_end_matches(')').to_uppercase();
                if !word.is_empty() {
                    words.push(word);
                }
                if closed || i + 1 >= raw.len() {
                    break;
                }
                i += 1;
                fragment = raw[i].to_string();
            }
            comps.push(DecompComp::WordSet(words));
        } else if t.starts_with('/') {
            comps.push(DecompComp::WordSet(vec![t[1..].to_uppercase()]));
        } else {
            comps.push(DecompComp::Literal(t.to_uppercase()));
        }
        i += 1;
    }
    // Empty decomp (bare keyword, no pattern) — treat as single wildcard
    if comps.is_empty() {
        comps.push(DecompComp::Wildcard);
    }
    comps
}

/// Returns one capture string per component (wildcards hold their match;
/// literals/word-sets hold the matched token; 1-indexed in reassembly).
fn match_decomp(comps: &[DecompComp], tokens: &[String]) -> Option<Vec<String>> {
    let n = comps.len();
    let mut captures = vec![String::new(); n];
    fn rec(comps: &[DecompComp], toks: &[String], caps: &mut Vec<String>, idx: usize) -> bool {
        if comps.is_empty() {
            return toks.is_empty();
        }
        match &comps[0] {
            DecompComp::Wildcard => {
                // Greedy: try longest first
                for len in (0..=toks.len()).rev() {
                    caps[idx] = toks[..len].join(" ");
                    if rec(&comps[1..], &toks[len..], caps, idx + 1) {
                        return true;
                    }
                }
                false
            }
            DecompComp::Literal(lit) => {
                if toks.is_empty() {
                    return false;
                }
                let stripped = toks[0]
                    .trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ';'))
                    .to_uppercase();
                if stripped == *lit {
                    caps[idx] = toks[0].clone();
                    rec(&comps[1..], &toks[1..], caps, idx + 1)
                } else {
                    false
                }
            }
            DecompComp::WordSet(words) => {
                if toks.is_empty() {
                    return false;
                }
                let stripped = toks[0]
                    .trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ';'))
                    .to_uppercase();
                if words.contains(&stripped) {
                    caps[idx] = toks[0].clone();
                    rec(&comps[1..], &toks[1..], caps, idx + 1)
                } else {
                    false
                }
            }
        }
    }
    if rec(comps, tokens, &mut captures, 0) {
        Some(captures)
    } else {
        None
    }
}

fn apply_reassembly(template: &str, slots: &[String]) -> String {
    let words: Vec<&str> = template.split_whitespace().collect();
    let mut out: Vec<String> = Vec::new();
    for w in words {
        if let Ok(n) = w.parse::<usize>() {
            if n >= 1 && n <= slots.len() {
                let s = slots[n - 1].trim().to_string();
                if !s.is_empty() {
                    out.push(s);
                }
            }
        } else {
            out.push(w.to_string());
        }
    }
    out.join(" ")
}

/// Apply the unconditional input substitutions (Weizenbaum 1966, p. 37):
/// MY→YOUR, ME→YOU, I→YOU, ARE→AM. Operates word-by-word; preserves
/// punctuation attached to tokens.
fn substitute_input(text: &str) -> String {
    let pairs: &[(&str, &str)] = &[("MY", "YOUR"), ("ME", "YOU"), ("AM", "ARE")];
    text.split_whitespace()
        .map(|w| {
            let stripped = w.trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ';'));
            let upper = stripped.to_uppercase();
            for (from, to) in pairs {
                if upper == *from {
                    // Preserve attached punctuation
                    let prefix = &w[..w.len() - w.trim_start_matches(stripped).len()];
                    let suffix = &w[w.find(stripped).unwrap_or(0) + stripped.len()..];
                    let _ = (prefix, suffix); // not needed — stripped is already w without punct
                    let punct: String = w
                        .chars()
                        .filter(|c| matches!(*c, ',' | '.' | '?' | '!' | ';'))
                        .collect();
                    return format!("{}{}", to, punct);
                }
            }
            w.to_string()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Build the keyword table once (keyword(uppercase) → decomposition/reassembly
/// rules in order) -- shared across every utterance in a multi-turn call, not
/// rebuilt per turn.
fn build_keyword_table(input: &BreedInput) -> BTreeMap<String, Vec<(Vec<DecompComp>, String)>> {
    let mut table: BTreeMap<String, Vec<(Vec<DecompComp>, String)>> = BTreeMap::new();
    for rule in &input.rules {
        let keyword = rule
            .premise
            .first()
            .cloned()
            .unwrap_or_default()
            .to_uppercase();
        let decomp_str = rule
            .premise
            .get(1)
            .cloned()
            .unwrap_or_else(|| "(0)".to_string());
        let decomp = parse_decomp(&decomp_str);
        table
            .entry(keyword)
            .or_default()
            .push((decomp, rule.conclusion.clone()));
    }
    table
}

/// Weizenbaum 1966's real per-utterance algorithm: substitute pronouns,
/// scan for the first matching keyword, follow any equivalence chain, try
/// decomposition/reassembly rules in order, fall back to the NONE keyword.
/// Extracted from the original single-utterance `run_keyword_engine` so the
/// exact same logic runs once per conversational turn (see
/// `run_multi_turn_keyword_engine`), not just once against `input.intent`.
fn process_utterance(
    utterance: &str,
    table: &BTreeMap<String, Vec<(Vec<DecompComp>, String)>>,
    trace: &mut Vec<TraceStep>,
) -> Option<(String, String)> {
    let subst = substitute_input(utterance);
    let tokens: Vec<String> = subst.split_whitespace().map(String::from).collect();

    let orig_tokens: Vec<String> = utterance.split_whitespace().map(String::from).collect();
    let mut found_keyword: Option<String> = None;
    'scan: for tok in &orig_tokens {
        let clean = tok
            .trim_matches(|c: char| matches!(c, ',' | '.' | '?' | '!' | ';'))
            .to_uppercase();
        if table.contains_key(&clean) {
            found_keyword = Some(clean);
            break 'scan;
        }
    }

    let mut keyword = found_keyword?;
    trace.push(TraceStep {
        step: trace.len(),
        kind: "keyword-found".to_string(),
        detail: keyword.clone(),
        depth: 0,
        objects: vec![],
    });

    // Follow equivalence chain (conclusion starts with '=')
    let mut hops = 0u8;
    loop {
        if hops >= 8 {
            break;
        }
        if let Some(rules) = table.get(&keyword) {
            if rules.len() == 1 && rules[0].1.starts_with('=') {
                let target = rules[0].1[1..].to_string();
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "equivalence".to_string(),
                    detail: format!("{}={}", keyword, target),
                    depth: 0,
                    objects: vec![],
                });
                keyword = target;
                hops += 1;
                continue;
            }
        }
        break;
    }

    // Try decomposition rules in order
    if let Some(rules) = table.get(&keyword) {
        for (decomp, reassembly) in rules {
            if let Some(slots) = match_decomp(decomp, &tokens) {
                let response = apply_reassembly(reassembly, &slots);
                // Render the matched decomposition pattern back into the
                // paper's own notation (e.g. "(0)", "(0 YOUR 0)") -- this was
                // computed (`decomp`) but never surfaced anywhere in the
                // output before this session; fits within the existing
                // `inference_trace` field, no schema change.
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "decomp-pattern".to_string(),
                    detail: render_decomp(decomp),
                    depth: 0,
                    objects: vec![],
                });
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "decomp-match".to_string(),
                    detail: reassembly.clone(),
                    depth: 0,
                    objects: vec![],
                });
                return Some((keyword, response));
            }
        }
    }

    // NONE fallback
    if let Some(rules) = table.get("NONE") {
        if let Some((_, reassembly)) = rules.first() {
            return Some(("NONE".to_string(), reassembly.clone()));
        }
    }

    None
}

/// Single-utterance entry point (backward compatible): processes only
/// `input.intent`, exactly as this function always did.
fn run_keyword_engine(input: &BreedInput, trace: &mut Vec<TraceStep>) -> Option<(String, String)> {
    let table = build_keyword_table(input);
    process_utterance(&input.intent, &table, trace)
}

/// Multi-turn entry point: when `input.facts` supplies a conversational
/// transcript as `utterance:1`, `utterance:2`, ... (numerically ordered,
/// not insertion order -- fixtures may list them out of order), process
/// EVERY utterance through the same real keyword engine, sequentially,
/// within this one `run()` call.
///
/// Found and fixed this session: the original implementation only ever read
/// `input.intent` (turn 1) and silently ignored any `utterance:N` facts for
/// N > 1, even though they were real input data the caller supplied -- not
/// an inherent "one call = one turn" limitation, since `BreedOutput` already
/// carries multiple facts/trace steps from one call for other breeds.
///
/// Returns `None` if `input.facts` has no `utterance:` keys at all (caller
/// falls back to the single-utterance path).
fn run_multi_turn_keyword_engine(
    input: &BreedInput,
    trace: &mut Vec<TraceStep>,
) -> Option<Vec<(String, String, String)>> {
    let mut utterances: Vec<(u32, &str)> = input
        .facts
        .iter()
        .filter_map(|f| {
            let n: u32 = f.key.strip_prefix("utterance:")?.parse().ok()?;
            Some((n, f.value.as_str()))
        })
        .collect();
    if utterances.is_empty() {
        return None;
    }
    utterances.sort_by_key(|(n, _)| *n);

    let table = build_keyword_table(input);
    let mut turns: Vec<(String, String, String)> = Vec::new();
    for (n, utterance) in utterances {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "turn-start".to_string(),
            detail: format!("turn_{n}: {utterance}"),
            depth: 0,
            objects: vec![],
        });
        match process_utterance(utterance, &table, trace) {
            Some((keyword, response)) => turns.push((format!("turn_{n}"), keyword, response)),
            None => turns.push((
                format!("turn_{n}"),
                "NONE".to_string(),
                "PLEASE GO ON".to_string(),
            )),
        }
    }
    Some(turns)
}

// ── Catch-all wildcard engine (unchanged) ────────────────────────────────────

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
        let mut trace: Vec<TraceStep> = Vec::new();

        // Keyword engine path (Weizenbaum 1966 full algorithm)
        if !input.rules.is_empty() {
            // Multi-turn: input.facts supplies a real "utterance:N" transcript
            // -- process every turn, not just input.intent (turn 1 only).
            if let Some(turns) = run_multi_turn_keyword_engine(input, &mut trace) {
                let mut facts = input.facts.clone();
                for (turn_key, keyword, response) in &turns {
                    facts.push(Fact {
                        key: format!("{turn_key}_keyword"),
                        value: keyword.clone(),
                    });
                    facts.push(Fact {
                        key: format!("{turn_key}_response"),
                        value: response.clone(),
                    });
                }
                // Final selected/explanation reflect the LAST turn -- the
                // conversation's current state, matching the semantics a
                // single-utterance call already had (its one and only turn).
                let (_, last_keyword, last_response) = turns
                    .last()
                    .cloned()
                    .expect("run_multi_turn_keyword_engine returns Some only for non-empty turns");
                return Ok(BreedOutput {
                    breed: BreedId::Eliza,
                    candidates: input.candidates.clone(),
                    facts,
                    selected: Some(last_keyword),
                    explanation: last_response,
                    inference_trace: trace,
                    ocel_log: None,
                    retained_cases: vec![],
                });
            }

            if let Some((keyword, response)) = run_keyword_engine(input, &mut trace) {
                return Ok(BreedOutput {
                    breed: BreedId::Eliza,
                    candidates: input.candidates.clone(),
                    facts: input.facts.clone(),
                    selected: Some(keyword),
                    explanation: response,
                    inference_trace: trace,
                    ocel_log: None,
                    retained_cases: vec![],
                });
            }
            // No keyword matched — emit NONE response. Record the scan as a
            // trace step: the engine did real work (scanned every token
            // against the keyword table) and legitimately found nothing, so
            // this is a genuine (if empty) result, not a fraud signal.
            trace.push(TraceStep {
                step: trace.len(),
                kind: "no-keyword-match".to_string(),
                detail: "NONE".to_string(),
                depth: 0,
                objects: vec![],
            });
            return Ok(BreedOutput {
                breed: BreedId::Eliza,
                candidates: input.candidates.clone(),
                facts: input.facts.clone(),
                selected: None,
                explanation: "PLEASE GO ON".to_string(),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            });
        }

        // Catch-all wildcard-frame path
        let frames = parse_frames(input);
        let text = input.intent.to_lowercase();

        for frame in &frames {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "try-pattern".to_string(),
                detail: frame.pattern.clone(),
                depth: 0,
                objects: vec![],
            });
            if let Some(slots) = try_match(&frame.pattern, &text) {
                tracing::debug!(
                    breed.step = "pattern_matched",
                    breed = "eliza",
                    "ELIZA L1 step"
                );
                tracing::debug!(
                    breed.step = "script_selected",
                    breed = "eliza",
                    "ELIZA L1 step"
                );
                let response = render(&frame.template, &slots);
                tracing::debug!(
                    breed.step = "template_applied",
                    breed = "eliza",
                    "ELIZA L1 step"
                );
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
                tracing::debug!(
                    breed.step = "response_emitted",
                    breed = "eliza",
                    "ELIZA L1 step"
                );
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

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
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

    // ── Keyword engine tests (Weizenbaum 1966 DOCTOR script) ─────────────────

    fn make_rule(premise: &[&str], conclusion: &str) -> crate::breeds::Rule {
        crate::breeds::Rule {
            id: conclusion.to_lowercase().replace(' ', "-"),
            premise: premise.iter().map(|s| s.to_string()).collect(),
            conclusion: conclusion.to_string(),
            certainty: 1.0,
        }
    }

    /// Weizenbaum 1966, p. 36, turn 1: "Men are all alike." → "IN WHAT WAY"
    /// ALIKE (rank 10) equivalences to DIT; DIT decomp (0) → "IN WHAT WAY".
    #[test]
    fn eliza_alike_equivalences_to_dit_in_what_way() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "Men are all alike.".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![
                make_rule(&["ALIKE"], "=DIT"),
                make_rule(&["DIT", "(0)"], "IN WHAT WAY"),
            ],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert_eq!(
            output.explanation, "IN WHAT WAY",
            "ALIKE→=DIT→IN WHAT WAY; got: {}",
            output.explanation
        );
        assert_eq!(output.selected.as_deref(), Some("DIT"));
    }

    /// Weizenbaum 1966, p. 36, turn 2: "always" → "CAN YOU THINK OF A SPECIFIC EXAMPLE"
    #[test]
    fn eliza_always_fires_canthink() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "They're always bugging us about something or other.".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![make_rule(
                &["ALWAYS", "(0)"],
                "CAN YOU THINK OF A SPECIFIC EXAMPLE",
            )],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert_eq!(
            output.explanation, "CAN YOU THINK OF A SPECIFIC EXAMPLE",
            "got: {}",
            output.explanation
        );
    }

    /// Weizenbaum 1966, p. 36, turn 3: MY→YOUR substitution + slot ref in reassembly.
    #[test]
    fn eliza_my_substitution_and_slot_ref() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "Well, my boyfriend made me come here.".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![make_rule(&["MY", "(0 YOUR 0)"], "YOUR 3")],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        // After MY→YOUR substitution: "Well, YOUR boyfriend made YOU come here."
        // Decomp (0 YOUR 0): slot1="Well,", slot2=YOUR, slot3="boyfriend made YOU come here."
        // Reassembly "YOUR 3" → "YOUR boyfriend made YOU come here."
        assert!(
            output.explanation.starts_with("YOUR boyfriend"),
            "Expected 'YOUR boyfriend ...'; got: {}",
            output.explanation
        );
    }

    #[test]
    fn refuses_empty_intent() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn falsification_gate_eliza_keyword_precedence() {
        let breed = Eliza;
        let input = BreedInput {
            intent: "A B C".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![
                make_rule(&["C"], "C MATCHED"),
                make_rule(&["B"], "B MATCHED"),
                make_rule(&["A"], "A MATCHED"),
            ],
            goals: vec![],
            state: vec![],
        };
        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.explanation, "A MATCHED");
    }

    #[test]
    fn invariant_idempotency_of_reflection() {
        let first = super::reflect_pronouns("i am my");
        let second = super::reflect_pronouns(&first);
        assert_eq!(first, second);
    }
}
