use std::fs;
use regex::Regex;

fn assert_no_fraud(file_path: &str, names: &[&str]) {
    // Attempt to read from several possible relative locations
    let content = fs::read_to_string(file_path)
        .or_else(|_| fs::read_to_string(format!("crates/wasm4pm-cognition/{}", file_path)))
        .or_else(|_| {
             // Fallback for some environments where it might be in a different subpath
             let p = std::path::Path::new("src/breeds").join(std::path::Path::new(file_path).file_name().unwrap());
             fs::read_to_string(p)
        });

    let src = content.unwrap_or_else(|_| {
        panic!("MISSING SOURCE: {} — anti-fraud gate cannot silently skip", file_path)
    });
    for &name in names {
        let pattern = format!(r"\b{}\b", name);
        let re = Regex::new(&pattern).unwrap();
        if re.is_match(&src) {
            panic!("FRAUD DETECTED: {} contains fresh oracle identifier {}", file_path, name);
        }
    }
}

#[test]
fn anti_fraud_gate_ltl_monitor() {
    assert_no_fraud("src/breeds/ltl_monitor.rs", &["oracle_secret_zorp", "oracle_secret_blee"]);
}

#[test]
fn anti_fraud_gate_allen_temporal() {
    assert_no_fraud("src/breeds/allen_temporal.rs", &["oracle_secret_gamma", "oracle_secret_delta", "oracle_secret_eps"]);
}

#[test]
fn anti_fraud_gate_fuzzy_logic() {
    assert_no_fraud("src/breeds/fuzzy_logic.rs", &["oracle_secret_zorp", "oracle_secret_blee"]);
}

#[test]
fn anti_fraud_gate_bayesian_network() {
    assert_no_fraud("src/breeds/bayesian_network.rs", &["oracle_secret_Q", "oracle_secret_R", "oracle_secret_S", "oracle_secret_X", "oracle_secret_Y"]);
}

#[test]
fn anti_fraud_gate_csp_ac3() {
    assert_no_fraud("src/breeds/csp_ac3.rs", &["oracle_secret_zorp", "oracle_secret_blee"]);
}

#[test]
fn anti_fraud_gate_default_logic() {
    assert_no_fraud("src/breeds/default_logic.rs", &["oracle_secret_gronk", "oracle_secret_wibble", "oracle_secret_dark_wibble"]);
}

#[test]
fn anti_fraud_gate_htn_planning() {
    assert_no_fraud("src/breeds/htn_planning.rs", &["oracle_secret_zorp_location", "oracle_secret_blee_station", "oracle_secret_zorp_credits"]);
}

#[test]
fn anti_fraud_gate_dempster_shafer() {
    assert_no_fraud("src/breeds/dempster_shafer.rs", &["oracle_secret_zorp", "oracle_secret_blee"]);
}

#[test]
fn anti_fraud_gate_frames_inheritance() {
    assert_no_fraud("src/breeds/frames_inheritance.rs", &["oracle_secret_zorp", "oracle_secret_blee"]);
}

#[test]
fn anti_fraud_gate_ebl() {
    assert_no_fraud("src/breeds/ebl.rs", &["obj2"]);
}

#[test]
fn anti_fraud_gate_asp() {
    assert_no_fraud("src/breeds/asp.rs", &["oracle_secret_zorp", "oracle_secret_blee"]);
}

#[test]
fn anti_fraud_gate_description_logic() {
    assert_no_fraud("src/breeds/description_logic.rs", &["oracle_secret_concept", "oracle_secret_role"]);
}

#[test]
fn anti_fraud_gate_abductive_lp() {
    assert_no_fraud("src/breeds/abductive_lp.rs", &["oracle_secret_abducible", "oracle_secret_observation"]);
}

#[test]
fn anti_fraud_gate_abductive_ibe() {
    assert_no_fraud("src/breeds/abductive_ibe.rs", &["oracle_secret_evidence", "oracle_secret_hypothesis"]);
}

#[test]
fn anti_fraud_gate_partial_order_plan() {
    assert_no_fraud("src/breeds/partial_order_plan.rs", &["oracle_secret_zorp_pkg", "oracle_secret_blee_loc", "oracle_secret_glorp_loc"]);
}

#[test]
fn anti_fraud_gate_event_calculus() {
    assert_no_fraud("src/breeds/event_calculus.rs", &["oracle_secret_zorp_fluent", "oracle_secret_blee_event"]);
}

#[test]
fn anti_fraud_gate_mdp() {
    assert_no_fraud("src/breeds/mdp.rs", &["oracle_secret_zorp_state", "oracle_secret_blee_action"]);
}

#[test]
fn anti_fraud_gate_version_space() {
    assert_no_fraud("src/breeds/version_space.rs", &["oracle_secret_zorp_attr", "oracle_secret_blee_val"]);
}

#[test]
fn anti_fraud_gate_belief_merging() {
    assert_no_fraud("src/breeds/belief_merging.rs", &["oracle_secret_zorp_atom", "oracle_secret_blee_atom"]);
}

#[test]
fn anti_fraud_gate_qualitative_reason() {
    assert_no_fraud("src/breeds/qualitative_reason.rs", &["oracle_secret_zorp_var", "oracle_secret_blee_var"]);
}

#[test]
fn anti_fraud_gate_script_sam() {
    assert_no_fraud("src/breeds/script_sam.rs", &["oracle_secret_zorp_script", "oracle_secret_blee_scene"]);
}

#[test]
fn anti_fraud_gate_clp() {
    assert_no_fraud("src/breeds/clp.rs", &["oracle_secret_zorp_var", "oracle_secret_blee_var"]);
}

#[test]
fn anti_fraud_gate_situation_calculus() {
    assert_no_fraud("src/breeds/situation_calculus.rs", &["oracle_secret_situation", "oracle_secret_fluent"]);
}

#[test]
fn anti_fraud_gate_circumscription() {
    assert_no_fraud("src/breeds/circumscription.rs", &["oracle_secret_penguin", "oracle_secret_opus"]);
}

#[test]
fn anti_fraud_gate_analogy_sme() {
    assert_no_fraud("src/breeds/analogy_sme.rs", &["oracle_secret_solar", "oracle_secret_atom"]);
}

#[test]
fn anti_fraud_gate_act_r() {
    assert_no_fraud("src/breeds/act_r.rs", &["oracle_secret_chunk", "oracle_secret_utility"]);
}

#[test]
fn anti_fraud_gate_problog() {
    assert_no_fraud("src/breeds/problog.rs", &["oracle_secret_pfact", "oracle_secret_world"]);
}

#[test]
fn anti_fraud_gate_sat_cdcl() {
    assert_no_fraud("src/breeds/sat_cdcl.rs", &["oracle_secret_clause", "oracle_secret_literal"]);
}

#[test]
fn anti_fraud_gate_episodic_memory() {
    assert_no_fraud("src/breeds/episodic_memory.rs", &["oracle_secret_episode", "oracle_secret_kernel"]);
}

#[test]
fn anti_fraud_gate_rl_symbolic() {
    assert_no_fraud("src/breeds/rl_symbolic.rs", &["oracle_secret_reward", "oracle_secret_gamma"]);
}

#[test]
fn anti_fraud_gate_ctl_check() {
    assert_no_fraud("src/breeds/ctl_check.rs", &["oracle_secret_formula", "oracle_secret_path"]);
}

#[test]
fn anti_fraud_gate_ilp() {
    assert_no_fraud("src/breeds/ilp.rs", &["oracle_secret_foil", "oracle_secret_gain"]);
}

#[test]
fn anti_fraud_gate_naive_physics() {
    assert_no_fraud("src/breeds/naive_physics.rs", &["oracle_secret_scene", "oracle_secret_axiom"]);
}

/// A8 universal sweep: every breed module file is checked against the UNION of
/// all fresh-oracle identifiers used anywhere in this gate. Per-breed tests
/// above give precise attribution; this sweep guarantees 55/55 coverage so a
/// new breed cannot ship un-gated.
#[test]
fn anti_fraud_universal_sweep_all_breed_modules() {
    // Union of every fresh name in this file (self-referential: parse own source).
    let own = fs::read_to_string("tests/anti_fraud_gate.rs")
        .or_else(|_| fs::read_to_string("crates/wasm4pm-cognition/tests/anti_fraud_gate.rs"))
        .expect("anti_fraud_gate.rs readable");
    let name_re = Regex::new(r#""(oracle_secret_[A-Za-z_]+)""#).unwrap();
    let mut names: Vec<String> = name_re
        .captures_iter(&own)
        .map(|c| c[1].to_string())
        .collect();
    names.sort();
    names.dedup();
    assert!(names.len() >= 30, "fresh-name extraction broken: {} names", names.len());

    let breeds_dir = std::path::Path::new("src/breeds");
    let breeds_dir = if breeds_dir.exists() {
        breeds_dir.to_path_buf()
    } else {
        std::path::Path::new("crates/wasm4pm-cognition/src/breeds").to_path_buf()
    };
    let mut checked = 0usize;
    for entry in fs::read_dir(&breeds_dir).expect("breeds dir readable") {
        let path = entry.expect("dir entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let fname = path.file_name().unwrap().to_string_lossy().to_string();
        // Infrastructure modules are not breed implementations.
        if matches!(fname.as_str(), "mod.rs" | "dispatch.rs" | "registration.rs" | "standing.rs" | "oracle_chain.rs") {
            continue;
        }
        let src = fs::read_to_string(&path).expect("breed source readable");
        // Only production half: inline #[cfg(test)] modules may cite fresh names legally.
        let prod = match src.find("#[cfg(test)]") {
            Some(i) => &src[..i],
            None => src.as_str(),
        };
        for name in &names {
            let re = Regex::new(&format!(r"\b{}\b", name)).unwrap();
            assert!(
                !re.is_match(prod),
                "FRAUD DETECTED (universal sweep): {} contains fresh oracle identifier {}",
                fname,
                name
            );
        }
        checked += 1;
    }
    assert!(checked >= 55, "universal sweep covered only {} breed modules", checked);
}
