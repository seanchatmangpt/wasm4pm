//! Registry admission ratchet (anti-cheat threat model, Part 3 item 3).
//!
//! PARTIAL_ALIVE in `breeds/registry.json` is EARNED, not asserted: every
//! PARTIAL_ALIVE breed must, in this single test run, (1) route through
//! dispatch (not "unknown"/"unsupported"), (2) have its OCPN L1 model and
//! OCEL fitness report (fitness == 1.0, with measured provenance fields) on
//! disk, (3) have both the Rust and TS paper fixtures on disk, and (4) be
//! mirrored in `BreedId::ALL` and the TS `BreedIdSchema`.
//!
//! Written tier-agnostically: counts ratchet up as tiers land (defeats A10).

use std::collections::BTreeSet;
use std::path::Path;

use wasm4pm_cognition::breeds::{BreedId, BreedInput};

fn registry() -> serde_json::Value {
    let raw = std::fs::read_to_string("breeds/registry.json").expect("registry.json");
    serde_json::from_str(&raw).expect("registry.json parses")
}

fn alive_ids() -> BTreeSet<String> {
    registry()
        .as_array()
        .expect("registry is an array")
        .iter()
        .filter(|b| b["status"] == "PARTIAL_ALIVE")
        .map(|b| b["breed_id"].as_str().expect("breed_id").to_string())
        .collect()
}

fn empty_input() -> BreedInput {
    BreedInput {
        intent: "ratchet".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

/// Every PARTIAL_ALIVE breed routes through dispatch — the router must not
/// answer "unknown breed" or "unsupported breed" for an admitted id.
#[test]
fn every_alive_breed_dispatches() {
    let input = empty_input();
    for id in alive_ids() {
        match wasm4pm_cognition::breeds::dispatch_breed(&id, &input) {
            Ok(_) => {}
            Err(e) => {
                assert!(
                    !e.contains("unknown breed") && !e.contains("unsupported breed"),
                    "{} is PARTIAL_ALIVE but does not route: {}",
                    id,
                    e
                );
            }
        }
    }
}

/// Every PARTIAL_ALIVE breed has its OCPN L1 model and an OCEL report with
/// measured fitness 1.0 and provenance fields (not a bare assertion).
#[test]
fn every_alive_breed_has_ocpn_and_measured_report() {
    for id in alive_ids() {
        let model = format!("../../ocel/models/l1/{}.ocpn.json", id);
        assert!(
            Path::new(&model).exists(),
            "{} missing OCPN model {}",
            id,
            model
        );

        let report_path = format!("../../ocel/reports/{}.json", id);
        let raw = std::fs::read_to_string(&report_path)
            .unwrap_or_else(|e| panic!("{} missing OCEL report {}: {}", id, report_path, e));
        let report: serde_json::Value = serde_json::from_str(&raw).expect("report parses");
        assert_eq!(report["fitness"], 1.0, "{} report fitness must be 1.0", id);
        assert_eq!(report["admitted"], true, "{} report must be admitted", id);
        assert!(
            report.get("measured_by").is_some() && report.get("measured_on").is_some(),
            "{} report must carry measured-fitness provenance (A10 gate)",
            id
        );
    }
}

/// Every PARTIAL_ALIVE breed has both paper fixtures on disk (Rust + TS).
#[test]
fn every_alive_breed_has_both_fixtures() {
    for id in alive_ids() {
        let rust = format!("tests/fixtures/papers/{}.json", id);
        let ts = format!(
            "../../packages/cognition/src/__tests__/fixtures/papers/{}.json",
            id
        );
        assert!(
            Path::new(&rust).exists(),
            "{} missing Rust fixture {}",
            id,
            rust
        );
        assert!(Path::new(&ts).exists(), "{} missing TS fixture {}", id, ts);
    }
}

/// `BreedId::ALL` mirrors the registry's PARTIAL_ALIVE set exactly, and the
/// TS `BreedIdSchema` contains every id (count parity both directions).
#[test]
fn all_const_and_ts_schema_mirror_registry() {
    let alive = alive_ids();
    let all: BTreeSet<String> = BreedId::ALL.iter().map(|b| b.to_string()).collect();
    assert_eq!(
        alive, all,
        "BreedId::ALL must equal the registry PARTIAL_ALIVE set"
    );

    // schemas.ts consumes the ggen-generated PARTIAL_ALIVE_BREED_IDS; parse the
    // generated surface directly (breed-ids.ts) so this gate covers the actual
    // source of truth and any hand-edit to it.
    let schemas = std::fs::read_to_string("../../packages/cognition/src/schemas.ts")
        .expect("schemas.ts readable");
    assert!(
        schemas.contains("z.enum(PARTIAL_ALIVE_BREED_IDS)"),
        "BreedIdSchema must consume the generated PARTIAL_ALIVE_BREED_IDS"
    );
    let breed_ids_ts = std::fs::read_to_string("../../packages/cognition/src/breed-ids.ts")
        .expect("generated breed-ids.ts readable");
    let enum_block = breed_ids_ts
        .split("PARTIAL_ALIVE_BREED_IDS = [")
        .nth(1)
        .and_then(|s| s.split(']').next())
        .expect("PARTIAL_ALIVE_BREED_IDS block");
    let ts_ids: BTreeSet<String> = enum_block
        .split('"')
        .skip(1)
        .step_by(2)
        .map(|s| s.to_string())
        .collect();
    assert_eq!(
        ts_ids.len(),
        BreedId::ALL.len(),
        "BreedIdSchema length must equal BreedId::ALL length"
    );
    assert_eq!(ts_ids, all, "TS BreedIdSchema must mirror BreedId::ALL");
}

/// Fresh-name grep gate (A8): no hidden-oracle identifier from
/// `tests/oracle_hidden.rs` appears in production `src/breeds/*.rs` outside
/// `#[cfg(test)]` modules. (Inline unit tests are test code; the gate strips
/// everything from the first `#[cfg(test)]` marker onward.)
#[test]
fn fresh_oracle_names_absent_from_production_sources() {
    let fresh = [
        "zorp",
        "quux",
        "blee",
        "gronk",
        "dark_wibble",
        "zilk",
        "welp",
        "snorf",
        "korv",
        "flim",
        "flam",
        "bolv",
    ];
    for entry in std::fs::read_dir("src/breeds").expect("src/breeds") {
        let path = entry.expect("dir entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let body = std::fs::read_to_string(&path).expect("source readable");
        let production = body.split("#[cfg(test)]").next().unwrap_or("");
        for name in fresh {
            assert!(
                !production.contains(name),
                "A8 fraud signal: fresh oracle name {:?} found in production code {:?}",
                name,
                path
            );
        }
    }
}

/// Every registry entry carries a parseable "standing"; PARTIAL_ALIVE entries
/// satisfy the PARTIAL_ALIVE gate (>= Dispatchable); BOUNDED+ standing is
/// EARNED — it requires a complexity_caps field (generated from the breed's
/// DomainBound adoption, never hand-asserted). Duplicate breed_ids are a
/// union-merge defect and are rejected outright.
#[test]
fn every_entry_has_lawful_standing() {
    use wasm4pm_cognition::breeds::standing::BreedStanding;

    let reg = registry();
    let entries = reg.as_array().expect("registry is an array");

    let mut seen = BTreeSet::new();
    for entry in entries {
        let id = entry["breed_id"].as_str().expect("breed_id");
        assert!(
            seen.insert(id.to_string()),
            "duplicate registry entry: {}",
            id
        );

        let raw = entry["standing"]
            .as_str()
            .unwrap_or_else(|| panic!("{} missing \"standing\" field", id));
        let standing = BreedStanding::from_registry_str(raw)
            .unwrap_or_else(|| panic!("{} has unparseable standing {:?}", id, raw));

        if entry["status"] == "PARTIAL_ALIVE" {
            assert!(
                standing.is_partial_alive_eligible(),
                "{} is PARTIAL_ALIVE but standing {:?} < Dispatchable",
                id,
                standing
            );
        } else {
            assert!(
                standing < BreedStanding::Dispatchable,
                "{} claims standing {:?} but status is {}",
                id,
                standing,
                entry["status"]
            );
        }

        if standing >= BreedStanding::Bounded {
            assert!(
                entry
                    .get("complexity_caps")
                    .map_or(false, |c| c.is_object()),
                "{} claims {:?} without complexity_caps (BOUNDED unearned)",
                id,
                standing
            );
        }
    }
}

/// A8 extension for the universal-oracle corpus: fresh `uo_` identifiers used
/// by `support/oracle_impls/` must never appear in production breed sources
/// (whole file, no test-module stripping), and the oracle_impls module must
/// stay feature-gated so oracle inputs cannot leak into production builds.
#[test]
fn uo_oracle_names_absent_from_breed_sources() {
    let re = regex::Regex::new(r"\buo_[a-z0-9_]+\b").expect("regex");
    let scan_dirs = ["src/breeds", "src/breeds/support"];
    for dir in scan_dirs {
        for entry in std::fs::read_dir(dir).expect("readable dir") {
            let path = entry.expect("dir entry").path();
            if path.extension().map_or(true, |e| e != "rs") {
                continue;
            }
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if name == "oracle.rs" || name == "oracle_impls.rs" {
                continue;
            }
            let body = std::fs::read_to_string(&path).expect("readable source");
            if let Some(m) = re.find(&body) {
                panic!(
                    "FRAUD DETECTED: {} contains universal-oracle identifier {}",
                    path.display(),
                    m.as_str()
                );
            }
        }
    }

    let support_mod = std::fs::read_to_string("src/breeds/support/mod.rs").expect("support/mod.rs");
    assert!(
        support_mod
            .contains("#[cfg(all(not(target_arch = \"wasm32\"), feature = \"breed-oracles\"))]"),
        "oracle_impls must remain gated behind the breed-oracles feature"
    );
}

/// The crate vendors OCPN models (ocel-models/l1/) so include_str! works in
/// the published package. They must stay byte-identical to the canonical
/// repo-root copies in ocel/models/l1/ (skipped when building outside the
/// monorepo, e.g. from a crates.io tarball).
#[test]
fn vendored_ocpn_models_match_canonical() {
    let canonical = Path::new("../../ocel/models/l1");
    if !canonical.exists() {
        return;
    }
    for entry in std::fs::read_dir("ocel-models/l1").expect("vendored models dir") {
        let entry = entry.unwrap();
        let name = entry.file_name();
        let canon = canonical.join(&name);
        assert!(
            canon.exists(),
            "{:?} vendored but missing canonically",
            name
        );
        assert_eq!(
            std::fs::read(entry.path()).unwrap(),
            std::fs::read(&canon).unwrap(),
            "{:?} drifted from canonical ocel/models/l1 copy",
            name
        );
    }
}

/// Drill-4 lock: the consumer ontology must never hand-assert breedStatus —
/// status is derived exclusively by the alive-gate CONSTRUCT from
/// ocel/reports/evidence.ttl. A hand-asserted status in breeds.ttl leaks
/// straight into BreedId::ALL and registry.json (verified by tamper drill);
/// this gate plus every_alive_breed_has_ocpn_and_measured_report close it.
#[test]
fn consumer_ontology_never_asserts_breed_status() {
    for path in [
        "../../ggen/ontology/breeds.ttl",
        "../../ocel/reports/evidence.ttl",
    ] {
        let ttl = std::fs::read_to_string(path)
            .unwrap_or_else(|_| panic!("consumer ontology {} must exist", path));
        let asserts_status = ttl
            .lines()
            .filter(|l| !l.trim_start().starts_with('#'))
            .any(|l| l.contains("breedStatus"));
        assert!(
            !asserts_status,
            "{} hand-asserts breedStatus — status must be CONSTRUCT-derived from fitness evidence only",
            path
        );
    }
}
