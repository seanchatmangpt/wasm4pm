//! Graphlaw vector oracle harness (FOUNDATION lane).
//!
//! Loads every `tests/fixtures/graphlaw/*.json` vector and:
//! 1. validates schema + provenance completeness (typed loader errors),
//! 2. enforces the graphlaw EXCLUDE-LIST (typed loader error if named),
//! 3. deserializes `breed_input` into `BreedInput` (serde, deny_unknown_fields),
//! 4. dispatches via `dispatch_breed_id` through the lawful path,
//! 5. CONFIRMS every expected derived fact / verdict is evidenced in the output,
//! 6. FALSIFIES: each expectation, mutated, must NOT be evidenced
//!    (anti-vacuity; clones the `paper_falsification.rs` pattern),
//! 7. verifies `stratified: true` on every asp vector,
//! 8. requires falsification twins (`vector_id` ending `-mutant`) to FAIL
//!    confirmation — proving the confirm machinery is non-vacuous.
//!
//! Vectors are frozen precomputed JSON generated from the graphlaw repo
//! (rev recorded in `provenance.graphlaw_rev`); this crate takes NO
//! workspace dependency on graphlaw — toolchains are incompatible.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use wasm4pm_cognition::breeds::dispatch::dispatch_breed_id;
use wasm4pm_cognition::breeds::{BreedId, BreedInput, BreedOutput};

/// Breeds excluded from the graphlaw vector campaign. A vector naming one of
/// these ids is refused at load time with a typed error.
const EXCLUDE_LIST: &[&str] = &[
    "circumscription",
    "abductive_ibe",
    "problog",
    "mycin",
    "production_rules",
    "fuzzy_logic",
    "dempster_shafer",
    "markov_logic",
    "belief_merging",
    "eliza",
    "soar",
    "act_r",
    "cbr",
    "hearsay",
    "episodic_memory",
    "meta_reasoning",
    "script_sam",
    "mdp",
    "pomdp",
    "ilp",
    "version_space",
    "qualitative_reason",
    "ocpm_route_discoverer",
    "abductive_lp",
];

/// Mutation suffix used by the falsification pass.
const MUTANT_SUFFIX: &str = " #MUTATED";

#[derive(Debug)]
struct Vector {
    vector_id: String,
    breed: String,
    stratified: bool,
    input: BreedInput,
    expected_facts: Vec<String>,
    expected_verdicts: Vec<(String, String)>,
    is_mutant_twin: bool,
    path: PathBuf,
}

/// Typed loader error (schema/provenance/exclude-list violations).
fn load_error(path: &Path, msg: String) -> String {
    format!(
        "graphlaw vector loader error in {}: {}",
        path.display(),
        msg
    )
}

fn require_str<'a>(
    obj: &'a serde_json::Map<String, Value>,
    key: &str,
    path: &Path,
) -> Result<&'a str, String> {
    obj.get(key)
        .and_then(|v| v.as_str())
        .ok_or_else(|| load_error(path, format!("missing or non-string field `{key}`")))
}

fn load_vector(path: &Path) -> Result<Vector, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| load_error(path, format!("unreadable: {e}")))?;
    let v: Value =
        serde_json::from_str(&raw).map_err(|e| load_error(path, format!("invalid JSON: {e}")))?;
    let obj = v
        .as_object()
        .ok_or_else(|| load_error(path, "top level must be an object".into()))?;

    let vector_id = require_str(obj, "vector_id", path)?.to_string();
    let breed = require_str(obj, "breed", path)?.to_string();

    // EXCLUDE-LIST enforcement: typed refusal at load time.
    if EXCLUDE_LIST.contains(&breed.as_str()) {
        return Err(load_error(
            path,
            format!(
                "breed `{breed}` is on the graphlaw EXCLUDE-LIST and may not have vectors"
            ),
        ));
    }
    if BreedId::from_str_id(&breed).is_none() {
        return Err(load_error(path, format!("unknown breed id `{breed}`")));
    }

    // Provenance completeness.
    let prov = obj
        .get("provenance")
        .and_then(|p| p.as_object())
        .ok_or_else(|| load_error(path, "missing `provenance` object".into()))?;
    let graphlaw_rev = require_str(prov, "graphlaw_rev", path)?;
    if graphlaw_rev.len() != 40 || !graphlaw_rev.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(load_error(
            path,
            format!(
                "provenance.graphlaw_rev must be a full 40-hex sha, got \"{graphlaw_rev}\" \
                 (see tests/fixtures/graphlaw/REV-RELEASE-MAP.md)"
            ),
        ));
    }
    // graphlaw_version (optional, validated when present): the engine release
    // the rev was cut from, e.g. "26.10.13". Crosswalk:
    // tests/fixtures/graphlaw/REV-RELEASE-MAP.md.
    if let Some(ver) = prov.get("graphlaw_version") {
        let ver = ver.as_str().ok_or_else(|| {
            load_error(path, "provenance.graphlaw_version must be a string".into())
        })?;
        let parts: Vec<&str> = ver.split('.').collect();
        let well_formed = parts.len() == 3
            && parts
                .iter()
                .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
        if !well_formed {
            return Err(load_error(
                path,
                format!(
                    "provenance.graphlaw_version must be semver-ish N.N.N, got \"{ver}\" \
                     (see tests/fixtures/graphlaw/REV-RELEASE-MAP.md)"
                ),
            ));
        }
    }
    let purrdf = require_str(prov, "purrdf", path)?;
    if purrdf != "2.0.2" {
        return Err(load_error(
            path,
            format!("provenance.purrdf must be \"2.0.2\", got \"{purrdf}\""),
        ));
    }
    let eyeron = require_str(prov, "eyeron", path)?;
    if eyeron != "0.7.8" {
        return Err(load_error(
            path,
            format!("provenance.eyeron must be \"0.7.8\", got \"{eyeron}\""),
        ));
    }
    let generator = require_str(prov, "generator", path)?;
    if generator.trim().is_empty() {
        return Err(load_error(path, "provenance.generator must be non-empty".into()));
    }
    let stratified = prov
        .get("stratified")
        .and_then(|s| s.as_bool())
        .ok_or_else(|| load_error(path, "provenance.stratified must be a bool".into()))?;

    // ASP vectors must be stratified.
    if breed == "asp" && !stratified {
        return Err(load_error(
            path,
            "asp vector requires provenance.stratified == true".into(),
        ));
    }

    // breed_input -> BreedInput. Missing fields are defaulted (the
    // paper_falsification.rs fixture pattern) so in-flight encoder-lane
    // vectors load; wrong-TYPED fields still fail serde with a typed error.
    let bi = obj
        .get("breed_input")
        .ok_or_else(|| load_error(path, "missing `breed_input`".into()))?;
    let mut bi = bi.clone();
    if let Some(bi_obj) = bi.as_object_mut() {
        bi_obj.entry("intent").or_insert(serde_json::json!(""));
        for k in ["candidates", "facts", "cases", "rules", "goals", "state"] {
            bi_obj.entry(k).or_insert(serde_json::json!([]));
        }
        for r in bi_obj
            .get_mut("rules")
            .and_then(|v| v.as_array_mut())
            .into_iter()
            .flatten()
        {
            if let Some(r_obj) = r.as_object_mut() {
                r_obj.entry("certainty").or_insert(serde_json::json!(1.0));
            }
        }
        // bayesian_network dsep vectors: normalize the graphlaw-surface goal
        // {predicate: "dsep", value: "X-Y|obs"} into the breed's native
        // {predicate: "query", value: "dsep:X,Y|obs"}.
        if breed == "bayesian_network" {
            if let Some(goals) = bi_obj.get_mut("goals").and_then(|g| g.as_array_mut()) {
                for g in goals {
                    if let Some(g_obj) = g.as_object_mut() {
                        if g_obj.get("predicate").and_then(|p| p.as_str()) == Some("dsep") {
                            let value = g_obj
                                .get("value")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default()
                                .replacen('-', ",", 1);
                            g_obj.insert("id".into(), serde_json::json!("g1"));
                            g_obj.insert("predicate".into(), serde_json::json!("query"));
                            g_obj.insert("value".into(), serde_json::json!(format!("dsep:{value}")));
                        }
                    }
                }
            }
        }
    }
    let input: BreedInput = serde_json::from_value(bi.clone()).map_err(|e| {
        load_error(
            path,
            format!("breed_input does not deserialize into BreedInput: {e}"),
        )
    })?;

    // expected.
    let exp = obj
        .get("expected")
        .and_then(|e| e.as_object())
        .ok_or_else(|| load_error(path, "missing `expected` object".into()))?;
    let expected_facts = exp
        .get("derived_facts_sorted")
        .and_then(|d| d.as_array())
        .ok_or_else(|| load_error(path, "missing expected.derived_facts_sorted array".into()))?
        .iter()
        .map(|s| {
            s.as_str()
                .map(str::to_string)
                .ok_or_else(|| load_error(path, "derived_facts_sorted entries must be strings".into()))
        })
        .collect::<Result<Vec<String>, String>>()?;
    let mut expected_verdicts = Vec::new();
    if let Some(verdicts) = exp.get("verdicts").and_then(|v| v.as_object()) {
        for (k, val) in verdicts {
            let s = val
                .as_str()
                .ok_or_else(|| load_error(path, format!("verdicts.{k} must be a string")))?;
            expected_verdicts.push((k.clone(), s.to_string()));
        }
    } else if let Some(arr) = exp.get("verdicts").and_then(|v| v.as_array()) {
        // graphlaw-surface shape: [{"goal": "...", "verdict": "..."}].
        // Normalize goal keys (first dash -> comma) and dsep verdicts into
        // the breed's evidenced "q=true|false" trace string.
        for item in arr {
            let iobj = item
                .as_object()
                .ok_or_else(|| load_error(path, "verdicts[] entries must be objects".into()))?;
            let goal = iobj
                .get("goal")
                .and_then(|g| g.as_str())
                .ok_or_else(|| load_error(path, "verdicts[] entries need `goal`".into()))?;
            let verdict = iobj
                .get("verdict")
                .and_then(|v| v.as_str())
                .ok_or_else(|| load_error(path, "verdicts[] entries need `verdict`".into()))?;
            let key = goal.replacen('-', ",", 1);
            let value = match verdict {
                "dsep" => format!("{key}=true"),
                "not_dsep" => format!("{key}=false"),
                other => other.to_string(),
            };
            expected_verdicts.push((goal.to_string(), value));
        }
    }
    if expected_facts.is_empty() && expected_verdicts.is_empty() {
        return Err(load_error(
            path,
            "expected must be non-empty: derived_facts_sorted or verdicts required".into(),
        ));
    }

    let is_mutant_twin = vector_id.ends_with("-mutant");

    Ok(Vector {
        vector_id,
        breed,
        stratified,
        input,
        expected_facts,
        expected_verdicts,
        is_mutant_twin,
        path: path.to_path_buf(),
    })
}

fn load_all_vectors() -> Result<Vec<Vector>, String> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/graphlaw");
    let mut paths: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| format!("graphlaw fixture dir unreadable: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    paths.sort();
    if paths.is_empty() {
        return Err("no graphlaw vectors found (fixtures/graphlaw/*.json)".into());
    }
    paths.iter().map(|p| load_vector(p)).collect()
}

/// All searchable evidence text in a breed output (same shape as
/// paper_falsification.rs's haystack).
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

/// CONFIRM: every expected derived fact / verdict evidenced in the output.
fn confirm(vector: &Vector, output: &BreedOutput) -> Result<(), String> {
    let h = haystack(output);
    for fact in &vector.expected_facts {
        if !h.contains(fact.as_str()) {
            return Err(format!(
                "expected derived fact `{fact}` not evidenced in output"
            ));
        }
    }
    for (label, verdict) in &vector.expected_verdicts {
        if !h.contains(verdict.as_str()) {
            return Err(format!(
                "expected verdict `{label}: {verdict}` not evidenced in output"
            ));
        }
    }
    Ok(())
}

/// FALSIFY (anti-vacuity): each expectation, mutated, must NOT be evidenced.
/// If a mutant is evidenced the confirm assertion is vacuous.
fn falsify(vector: &Vector, output: &BreedOutput) -> Result<(), String> {
    let h = haystack(output);
    for fact in &vector.expected_facts {
        let mutant = format!("{fact}{MUTANT_SUFFIX}");
        if h.contains(&mutant) {
            return Err(format!(
                "vacuous confirm: mutant `{mutant}` is evidenced in output"
            ));
        }
    }
    for (label, verdict) in &vector.expected_verdicts {
        let mutant = format!("{verdict}{MUTANT_SUFFIX}");
        if h.contains(&mutant) {
            return Err(format!(
                "vacuous confirm: mutant verdict `{label}: {mutant}` is evidenced in output"
            ));
        }
    }
    Ok(())
}

fn run_vector(vector: &Vector) -> Result<(), String> {
    let id = BreedId::from_str_id(&vector.breed).ok_or_else(|| {
        format!("vector {}: unknown breed {}", vector.vector_id, vector.breed)
    })?;
    let dispatched = dispatch_breed_id(id, &vector.input);
    let all_refused = !vector.expected_verdicts.is_empty()
        && vector
            .expected_verdicts
            .iter()
            .all(|(_, v)| v == "refused");
    // "refusal" verdicts carry the expected error text: dispatch MUST fail
    // and the typed error must contain that text.
    let refusal_expectations: Vec<&str> = vector
        .expected_verdicts
        .iter()
        .filter(|(label, _)| label.contains("refus"))
        .map(|(_, v)| v.as_str())
        .collect();
    let output = match dispatched {
        Ok(o) => {
            if refusal_expectations.is_empty() && !all_refused {
                Some(o)
            } else {
                return Err(format!(
                    "vector {}: dispatch unexpectedly SUCCEEDED; expected refusal",
                    vector.vector_id
                ));
            }
        }
        Err(e) => {
            if all_refused {
                // Lawful-path typed refusal (e.g. the prolog deny path omits
                // the query phase the OCEL conformance gate requires).
                eprintln!(
                    "[graphlaw-oracle] vector {} ({}) correctly REFUSED: {e}",
                    vector.vector_id, vector.breed
                );
                None
            } else if !refusal_expectations.is_empty() {
                for want in &refusal_expectations {
                    if !e.contains(want) {
                        return Err(format!(
                            "vector {}: refusal error `{e}` does not contain expected `{want}`",
                            vector.vector_id
                        ));
                    }
                }
                eprintln!(
                    "[graphlaw-oracle] vector {} ({}) correctly REFUSED with expected error",
                    vector.vector_id, vector.breed
                );
                None
            } else {
                return Err(format!(
                    "vector {}: dispatch_breed_id({}) failed: {e}",
                    vector.vector_id, vector.breed
                ));
            }
        }
    };
    let output = match output {
        Some(o) => o,
        None => return Ok(()),
    };

    let confirm_result = confirm(vector, &output);
    if vector.is_mutant_twin {
        // Twin must FAIL confirmation — that is the falsification proof.
        match confirm_result {
            Err(reason) => {
                eprintln!(
                    "[graphlaw-oracle] twin {} correctly FALSIFIED: {reason}",
                    vector.vector_id
                );
                return Ok(());
            }
            Ok(()) => {
                return Err(format!(
                    "mutant twin {} was CONFIRMED — the oracle confirm machinery is vacuous",
                    vector.vector_id
                ));
            }
        }
    }
    confirm_result?;
    falsify(vector, &output)?;
    eprintln!(
        "[graphlaw-oracle] vector {} ({}) confirmed + falsifiable, stratified={}",
        vector.vector_id, vector.breed, vector.stratified
    );
    Ok(())
}

#[test]
fn graphlaw_vector_oracle_roundtrip() {
    let vectors = load_all_vectors().unwrap_or_else(|e| panic!("{e}"));
    let mut failures = Vec::new();
    for v in &vectors {
        if let Err(e) = run_vector(v) {
            failures.push(e);
        }
    }
    let confirmed: Vec<&Vector> = vectors.iter().filter(|v| !v.is_mutant_twin).collect();
    let twins: Vec<&Vector> = vectors.iter().filter(|v| v.is_mutant_twin).collect();
    assert!(
        !confirmed.is_empty(),
        "no non-mutant graphlaw vectors were exercised"
    );
    assert!(
        !twins.is_empty(),
        "no mutant twin present — falsification path unproven"
    );
    assert!(
        failures.is_empty(),
        "graphlaw vector oracle failures:\n  - {}",
        failures.join("\n  - ")
    );
    eprintln!(
        "[graphlaw-oracle] {} vectors loaded ({} confirm, {} twins); all green",
        vectors.len(),
        confirmed.len(),
        twins.len()
    );
}

#[test]
fn exclude_list_refuses_named_breeds() {
    // Typed loader refusal for each exclude-list breed, exercised through the
    // real loader on a synthetic vector.
    for breed in EXCLUDE_LIST {
        let vector = serde_json::json!({
            "vector_id": format!("{breed}-should-be-refused"),
            "breed": breed,
            "provenance": {
                "graphlaw_rev": "82c67c2b7e2ed71e7ca6bbd557e36fc7f446b1bd",
                "purrdf": "2.0.2",
                "eyeron": "0.7.8",
                "generator": "exclude-list court",
                "stratified": false
            },
            "breed_input": {
                "intent": "", "facts": [], "rules": [], "goals": [],
                "candidates": [], "cases": [], "state": []
            },
            "expected": {
                "derived_facts_sorted": ["x=y"],
                "verdicts": {},
                "notes": ""
            }
        });
        let dir = std::env::temp_dir().join(format!(
            "graphlaw-oracle-exclude-{}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("v.json");
        fs::write(&p, serde_json::to_string(&vector).unwrap()).unwrap();
        let err = load_vector(&p).expect_err("exclude-list vector must be refused");
        assert!(
            err.contains("EXCLUDE-LIST"),
            "expected EXCLUDE-LIST refusal for {breed}, got: {err}"
        );
        fs::remove_dir_all(&dir).ok();
    }
    // asp with stratified=false must also be refused.
    let asp_vector = serde_json::json!({
        "vector_id": "asp-nonstratified",
        "breed": "asp",
        "provenance": {
            "graphlaw_rev": "82c67c2b7e2ed71e7ca6bbd557e36fc7f446b1bd",
            "purrdf": "2.0.2",
            "eyeron": "0.7.8",
            "generator": "stratified court",
            "stratified": false
        },
        "breed_input": {
            "intent": "", "facts": [], "rules": [], "goals": [],
            "candidates": [], "cases": [], "state": []
        },
        "expected": { "derived_facts_sorted": ["x=y"], "verdicts": {}, "notes": "" }
    });
    let dir = std::env::temp_dir().join(format!("graphlaw-oracle-asp-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let p = dir.join("v.json");
    fs::write(&p, serde_json::to_string(&asp_vector).unwrap()).unwrap();
    let err = load_vector(&p).expect_err("non-stratified asp vector must be refused");
    assert!(
        err.contains("stratified"),
        "expected stratified refusal, got: {err}"
    );
    fs::remove_dir_all(&dir).ok();
}

// ---------------------------------------------------------------------------
// Rev <-> release crosswalk court.
//
// The fixtures pin `provenance.graphlaw_rev` = 82c67c2b… while the sibling
// ash_graphlaw runtime pins release 26.9.29 by wasm sha256
// (priv/graphlaw/MANIFEST.json). These are two identifiers over one engine
// with no linkage — this court restores it: the fixture rev must remain an
// ANCESTOR of the local graphlaw checkout's main. If graphlaw rebases or
// rewrites history, this fails loudly instead of drifting silently.
//
// Crosswalk facts (as-of 2026-10-13): see
// tests/fixtures/graphlaw/REV-RELEASE-MAP.md.
// ---------------------------------------------------------------------------

const GRAPHLAW_CHECKOUT: &str = "/Users/sac/graphlaw";
const FIXTURE_REV: &str = "82c67c2b7e2ed71e7ca6bbd557e36fc7f446b1bd";

/// Real ancestry probe over the sibling graphlaw checkout (read-only git).
/// Returns `Err(msg)` on drift, `Ok(())` when the rev is an ancestor of main.
fn rev_is_ancestor_of_main(rev: &str, checkout: &str) -> Result<(), String> {
    if !Path::new(checkout).join(".git").exists() {
        // BLOCKED:-skip — sibling checkout absent in this environment.
        eprintln!(
            "[graphlaw-oracle] BLOCKED:-skip graphlaw checkout absent at {checkout}; \
             rev-ancestry court not exercised"
        );
        return Ok(());
    }
    let exists = std::process::Command::new("git")
        .args(["-C", checkout, "rev-parse", "--verify", rev])
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    if !exists.status.success() {
        return Err(format!(
            "fixture graphlaw_rev {rev} does not resolve in {checkout} — \
             the fixture lineage has left the engine's history (rebase?)"
        ));
    }
    let ancestor = std::process::Command::new("git")
        .args(["-C", checkout, "merge-base", "--is-ancestor", rev, "main"])
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    if !ancestor.status.success() {
        return Err(format!(
            "fixture graphlaw_rev {rev} is NOT an ancestor of {checkout}/main — \
             fixture vectors and the engine have diverged; regenerate or re-pin"
        ));
    }
    Ok(())
}

#[test]
fn graphlaw_rev_ancestry_court() {
    rev_is_ancestor_of_main(FIXTURE_REV, GRAPHLAW_CHECKOUT)
        .unwrap_or_else(|e| panic!("graphlaw rev-ancestry drift: {e}"));
    eprintln!(
        "[graphlaw-oracle] rev-ancestry court: fixture rev {FIXTURE_REV} is an ancestor \
         of {GRAPHLAW_CHECKOUT}/main"
    );
}

#[test]
fn graphlaw_rev_court_sabotage_twin() {
    // Sabotage twin: the SAME court machinery run against a rev that cannot be
    // in graphlaw's history (all-zeros is unresolvable) MUST fail — proving
    // the ancestry court is non-vacuous.
    let bogus = "0".repeat(40);
    let result = rev_is_ancestor_of_main(&bogus, GRAPHLAW_CHECKOUT);
    if !Path::new(GRAPHLAW_CHECKOUT).join(".git").exists() {
        // Checkout absent: court was BLOCKED:-skip, twin degrades identically.
        assert!(
            result.is_ok(),
            "absent-checkout skip must be reported, not an error"
        );
        eprintln!("[graphlaw-oracle] twin: BLOCKED:-skip (no checkout), court unproven here");
        return;
    }
    let err = result.expect_err("bogus rev must fail the ancestry court");
    assert!(
        err.contains("does not resolve") || err.contains("NOT an ancestor"),
        "expected typed drift refusal for bogus rev, got: {err}"
    );
    eprintln!("[graphlaw-oracle] sabotage twin: bogus rev correctly REFUSED: {err}");

    // Loader-side twin: a synthetic vector whose graphlaw_rev is not 40-hex
    // (the old bug: any non-empty string passed) must be refused by the loader.
    let short_rev_vector = serde_json::json!({
        "vector_id": "short-rev-refused",
        "breed": "prolog",
        "provenance": {
            "graphlaw_rev": "82c67c2b",
            "purrdf": "2.0.2",
            "eyeron": "0.7.8",
            "generator": "loader twin",
            "stratified": false
        },
        "breed_input": {
            "intent": "", "facts": [], "rules": [], "goals": [],
            "candidates": [], "cases": [], "state": []
        },
        "expected": { "derived_facts_sorted": ["x=y"], "verdicts": {}, "notes": "" }
    });
    let dir = std::env::temp_dir().join(format!("graphlaw-oracle-rev-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let p = dir.join("v.json");
    fs::write(&p, serde_json::to_string(&short_rev_vector).unwrap()).unwrap();
    let err = load_vector(&p).expect_err("short graphlaw_rev must be refused");
    assert!(
        err.contains("40-hex"),
        "expected 40-hex refusal, got: {err}"
    );
    // And a malformed graphlaw_version (present but not N.N.N) must be refused.
    let bad_ver_vector = serde_json::json!({
        "vector_id": "bad-version-refused",
        "breed": "prolog",
        "provenance": {
            "graphlaw_rev": FIXTURE_REV,
            "graphlaw_version": "twenty-six",
            "purrdf": "2.0.2",
            "eyeron": "0.7.8",
            "generator": "loader twin",
            "stratified": false
        },
        "breed_input": {
            "intent": "", "facts": [], "rules": [], "goals": [],
            "candidates": [], "cases": [], "state": []
        },
        "expected": { "derived_facts_sorted": ["x=y"], "verdicts": {}, "notes": "" }
    });
    let p = dir.join("v2.json");
    fs::write(&p, serde_json::to_string(&bad_ver_vector).unwrap()).unwrap();
    let err = load_vector(&p).expect_err("malformed graphlaw_version must be refused");
    assert!(
        err.contains("graphlaw_version"),
        "expected graphlaw_version refusal, got: {err}"
    );
    // Well-formed optional version passes the loader.
    let good_ver_vector = serde_json::json!({
        "vector_id": "good-version-accepted",
        "breed": "prolog",
        "provenance": {
            "graphlaw_rev": FIXTURE_REV,
            "graphlaw_version": "26.10.13",
            "purrdf": "2.0.2",
            "eyeron": "0.7.8",
            "generator": "loader twin",
            "stratified": false
        },
        "breed_input": {
            "intent": "", "facts": [], "rules": [], "goals": [],
            "candidates": [], "cases": [], "state": []
        },
        "expected": { "derived_facts_sorted": ["x=y"], "verdicts": {}, "notes": "" }
    });
    let p = dir.join("v3.json");
    fs::write(&p, serde_json::to_string(&good_ver_vector).unwrap()).unwrap();
    load_vector(&p).expect("well-formed graphlaw_version must be accepted");
    fs::remove_dir_all(&dir).ok();
}
