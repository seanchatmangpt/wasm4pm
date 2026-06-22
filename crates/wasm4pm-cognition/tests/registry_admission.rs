use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// Load and parse `breeds/registry.json` into a JSON value.
fn registry() -> Value {
    let data = fs::read_to_string("breeds/registry.json").expect("failed to read registry.json");
    serde_json::from_str(&data).expect("failed to parse registry.json")
}

#[test]
fn test_registry_admission_gate() {
    let registry_path = "breeds/registry.json";
    let registry_data = fs::read_to_string(registry_path).expect("failed to read registry.json");
    let registry: Vec<Value> =
        serde_json::from_str(&registry_data).expect("failed to parse registry.json");

    // We expect exactly 55 entries in the registry for now based on PRD count
    assert_eq!(
        registry.len(),
        55,
        "Registry must contain exactly 55 entries"
    );

    for entry in registry {
        let breed_id = entry["breed_id"].as_str().expect("missing breed_id");
        let status = entry["status"].as_str().expect("missing status");

        // When a breed is fully ADMITTED, it must satisfy fixture parity and dispatch.
        if status == "ADMITTED" {
            // Check Rust fixture
            let rust_fixture_path = format!("tests/fixtures/papers/{}.json", breed_id);
            assert!(
                fs::metadata(&rust_fixture_path).is_ok(),
                "Missing Rust fixture for ADMITTED breed {}",
                breed_id
            );

            // Check TS fixture
            let ts_fixture_path = format!(
                "../../packages/cognition/src/__tests__/fixtures/papers/{}.json",
                breed_id
            );
            assert!(
                fs::metadata(&ts_fixture_path).is_ok(),
                "Missing TS fixture for ADMITTED breed {}",
                breed_id
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
