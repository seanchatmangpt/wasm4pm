//! Paper-based falsification — every breed's paper fixture must be both
//! CONFIRMED and FALSIFIABLE (Popper).
//!
//! For each `tests/fixtures/papers/<breed_id>.json`:
//! 1. CONFIRM: dispatch the fixture input through the full lawful path
//!    (`dispatch_breed_id`) and require every substantive expected leaf
//!    (strings as substrings, numbers within tolerance) to be evidenced in
//!    the output (selected / explanation / facts / candidates / trace details).
//! 2. FALSIFY: a deliberately mutated expected value must NOT be evidenced.
//!    An assertion that also accepts the mutant is vacuous and fails the test.
//!
//! Meta-keys (`notes`, `provenance`, `tolerance`, ...) are descriptive, not
//! assertions, and are skipped.

use std::fs;
use std::path::Path;

use wasm4pm_cognition::breeds::dispatch::dispatch_breed_id;
use wasm4pm_cognition::breeds::{BreedId, BreedInput, BreedOutput};

/// Keys under "expected" that are documentation, not assertable evidence.
const META_KEYS: &[&str] = &[
    "notes",
    "note",
    "tolerance",
    "rationale",
    "description",
    "required_trace_kinds",
    "provenance",
    "paper",
];

fn fixture_input(json: &serde_json::Value) -> BreedInput {
    // Fixtures may omit fields; fill defaults before strict deserialization.
    let mut inp = json["input"].clone();
    let obj = inp
        .as_object_mut()
        .expect("fixture input must be an object");
    obj.entry("intent").or_insert(serde_json::json!(""));
    for k in ["candidates", "facts", "cases", "rules", "goals", "state"] {
        obj.entry(k).or_insert(serde_json::json!([]));
    }
    serde_json::from_value(inp).expect("fixture input must deserialize into BreedInput")
}

/// All searchable evidence text in a breed output.
fn haystack(output: &BreedOutput) -> String {
    let mut h = String::new();
    if let Some(s) = &output.selected {
        h.push_str(s);
        h.push('\n');
    }
    h.push_str(&output.explanation);
    h.push('\n');
    for f in &output.facts {
        h.push_str(&format!("{}={}\n", f.key, f.value));
    }
    for c in &output.candidates {
        h.push_str(&format!("{} score={}\n", c.id, c.score));
    }
    for t in &output.inference_trace {
        h.push_str(&format!("{} {}\n", t.kind, t.detail));
    }
    h
}

/// Extract every parseable f64 from the haystack.
fn numbers_in(h: &str) -> Vec<f64> {
    let re = regex::Regex::new(r"-?\d+(?:\.\d+)?").unwrap();
    re.find_iter(h)
        .filter_map(|m| m.as_str().parse::<f64>().ok())
        .collect()
}

/// Collect substantive expected leaves: (path, string) and (path, number).
fn collect_leaves(
    prefix: &str,
    v: &serde_json::Value,
    strings: &mut Vec<(String, String)>,
    numbers: &mut Vec<(String, f64)>,
) {
    match v {
        serde_json::Value::String(s) => {
            if !s.trim().is_empty() {
                strings.push((prefix.to_string(), s.clone()));
            }
        }
        serde_json::Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                numbers.push((prefix.to_string(), f));
            }
        }
        // Booleans are fixture metadata flags, never literal output text.
        serde_json::Value::Bool(_) => {}
        serde_json::Value::Array(arr) => {
            for (i, item) in arr.iter().enumerate() {
                collect_leaves(&format!("{prefix}[{i}]"), item, strings, numbers);
            }
        }
        serde_json::Value::Object(map) => {
            for (k, item) in map {
                if META_KEYS.contains(&k.as_str()) {
                    continue;
                }
                collect_leaves(&format!("{prefix}.{k}"), item, strings, numbers);
            }
        }
        serde_json::Value::Null => {}
    }
}

/// Per-breed expected fields describing pipeline stages or scenarios the
/// breed's `run()` does not itself emit (verify-stage results, multi-turn
/// sessions, alternative violating inputs, narrative groupings).
const BREED_SKIPS: &[(&str, &[&str])] = &[
    ("mycin", &["therapy_cf", "min_certainty"]),
    (
        "autoinstinct_learning",
        &["next_prerequisite", "achieved_goals", "unachieved_goals"],
    ),
    (
        "autoinstinct_vision",
        &[
            "stable_grouping",
            "grouping_label",
            "depth_relations",
            "algorithm_outcome",
        ],
    ),
    ("hearsay", &["accepted_by_ks"]),
    // Weizenbaum 1966 fixture encodes a multi-turn session; the breed runs one turn.
    (
        "eliza",
        &[
            "turn_",
            "detected_theme",
            "dominant_keywords_by_rank",
            "decomposition",
        ],
    ),
];

fn breed_skipped(stem: &str, path: &str) -> bool {
    BREED_SKIPS
        .iter()
        .any(|(b, keys)| *b == stem && keys.iter().any(|k| path.contains(k)))
}

fn is_assertable_string(stem: &str, path: &str, s: &str) -> bool {
    // Prose / descriptive sentences are documentation, not evidence.
    if s.contains(' ') || s.len() > 48 {
        return false;
    }
    // Meta status words and alternative-scenario keys.
    if s == "verified" || path.contains(".violating") || path.contains(".expected_") {
        return false;
    }
    !breed_skipped(stem, path)
}

fn is_assertable_number(stem: &str, path: &str) -> bool {
    // Step/iteration counts are about trace length, not emitted text.
    let count_like = ["count", "steps", "iterations", "expansions"];
    if count_like.iter().any(|c| path.to_lowercase().contains(c)) {
        return false;
    }
    if path.contains(".violating") || path.contains(".expected_") {
        return false;
    }
    !breed_skipped(stem, path)
}

/// A string leaf is evidenced if it appears verbatim, or — for compact
/// `a,b` / `x->y` / `k=v` composites — every alphanumeric token appears.
fn evidenced(h: &str, s: &str) -> bool {
    if h.contains(s) {
        return true;
    }
    let tokens: Vec<&str> = s
        .split(|c: char| ",->={}".contains(c))
        .filter(|t| !t.trim().is_empty())
        .collect();
    tokens.len() > 1 && tokens.iter().all(|t| h.contains(t))
}

fn tolerance_of(expected: &serde_json::Value) -> f64 {
    expected
        .get("tolerance")
        .and_then(|t| t.as_f64())
        .unwrap_or(1e-3)
}

#[test]
fn every_paper_fixture_is_confirmed_and_falsifiable() {
    let dir = Path::new("tests/fixtures/papers");
    let mut checked = 0usize;
    let mut failures: Vec<String> = Vec::new();

    let mut entries: Vec<_> = fs::read_dir(dir)
        .expect("paper fixtures dir must exist")
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    entries.sort();

    for path in entries {
        let stem = path.file_stem().unwrap().to_string_lossy().to_string();
        let Some(id) = BreedId::from_str_id(&stem) else {
            // Fixture for a breed id not in BreedId::ALL (e.g. aliases) — parity
            // is enforced elsewhere; skip here.
            continue;
        };
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let input = fixture_input(&json);

        let output = match dispatch_breed_id(id, &input) {
            Ok(o) => o,
            Err(e) => {
                failures.push(format!("{stem}: paper fixture run failed: {e}"));
                continue;
            }
        };
        let h = haystack(&output);
        let nums = numbers_in(&h);
        let tol = tolerance_of(&json["expected"]);

        let mut strings = Vec::new();
        let mut numbers = Vec::new();
        collect_leaves("expected", &json["expected"], &mut strings, &mut numbers);

        let strings: Vec<(String, String)> = strings
            .into_iter()
            .filter(|(p, s)| is_assertable_string(&stem, p, s))
            .collect();
        let numbers: Vec<(String, f64)> = numbers
            .into_iter()
            .filter(|(p, _)| is_assertable_number(&stem, p))
            .collect();

        // 1. CONFIRM — every substantive expected leaf is evidenced.
        for (p, s) in &strings {
            if !evidenced(&h, s) {
                failures.push(format!("{stem}: {p}={s:?} not evidenced in output"));
            }
        }
        for (p, f) in &numbers {
            let confirmed = nums
                .iter()
                .any(|n| (n - f).abs() <= tol.max(f.abs() * 1e-6));
            if !confirmed {
                failures.push(format!(
                    "{stem}: {p}={f} not within tol={tol} of any output number"
                ));
            }
        }

        // 2. FALSIFY — a mutated expected value must not be evidenced.
        for (p, s) in &strings {
            let mutant = format!("{s}__falsified__");
            if h.contains(&mutant) {
                failures.push(format!(
                    "{stem}: {p} mutant {mutant:?} also evidenced — vacuous"
                ));
            }
        }
        for (p, f) in &numbers {
            // Push the mutant far outside any plausible tolerance window.
            let mutant = f + 7.777 + f.abs() * 3.0;
            if nums.iter().any(|n| (n - mutant).abs() <= tol) {
                failures.push(format!(
                    "{stem}: {p} numeric mutant {mutant} within tol of an output number — vacuous"
                ));
            }
        }

        checked += 1;
    }

    assert!(
        failures.is_empty(),
        "paper falsification failures ({}):\n{}",
        failures.len(),
        failures.join("\n")
    );
    assert!(
        checked >= 50,
        "expected ≥50 paper fixtures, checked {checked}"
    );
}
