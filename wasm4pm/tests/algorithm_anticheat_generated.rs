// PI algorithm anti-cheat tests — generated from wasm4pm pi ontology.
// Regenerate with: ggen sync
//
// Structural locks per algorithm (identical doctrine to cognition breed anti-cheat):
//   decoy: plausible miscitation value must NOT appear as literal in production source
//   true:  published value must NOT appear as literal — must be DERIVED, not hardcoded
//          (only when pi:hardcodeLockable "true" on the pointer)

use std::fs;

fn algorithm_source(algorithm_id: &str) -> String {
    let paths = vec![
        format!("{}/src/{}.rs", env!("CARGO_MANIFEST_DIR"), algorithm_id),
        format!(
            "{}/src/algorithms/{}.rs",
            env!("CARGO_MANIFEST_DIR"),
            algorithm_id
        ),
        format!("{}/src/lib.rs", env!("CARGO_MANIFEST_DIR")),
    ];
    for path in &paths {
        if let Ok(src) = fs::read_to_string(path) {
            return src;
        }
    }
    String::new()
}

fn production_half(src: &str) -> String {
    let mut out = String::new();
    let mut lines = src.lines();
    while let Some(line) = lines.next() {
        if line.trim_start().starts_with("#[cfg(test)]") {
            let mut depth: i32 = 0;
            let mut opened = false;
            while let Some(cur) = lines.next() {
                for ch in cur.chars() {
                    if ch == '{' {
                        depth += 1;
                        opened = true;
                    } else if ch == '}' {
                        depth -= 1;
                    }
                }
                if opened && depth <= 0 {
                    break;
                }
            }
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

#[test]
fn anticheat_alignments_decoy_not_in_source() {
    // Locus: van der Aalst, Adriansyah & van Dongen 2012, WIREs DMKD 2(2):182-192, Section 3
    // Why decoy: 0.75 is per-trace fitness for a single non-conforming trace variant, not the log-level average over all traces.
    let src = algorithm_source("alignments");
    assert!(
        !production_half(&src).contains("fitness=0.75"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "fitness=0.75",
        "alignments"
    );
}

#[test]
fn anticheat_alignments_true_not_hardcoded() {
    // Locus: van der Aalst, Adriansyah & van Dongen 2012, WIREs DMKD 2(2):182-192, Section 3 — alignment fitness on running-example log
    // Derivation: Alignment-based fitness on canonical 6-trace running-example log against Alpha++-produced Petri net is 1.0. All traces have optimal alignments with zero move costs.
    let src = algorithm_source("alignments");
    assert!(
        !production_half(&src).contains("fitness=1.0"),
        "ANTI-CHEAT A8: published value {:?} hardcoded in {}.rs — must be DERIVED",
        "fitness=1.0",
        "alignments"
    );
}

#[test]
fn anticheat_alpha_plus_plus_decoy_not_in_source() {
    // Locus: van der Aalst, Weijters & Maruster 2004, IEEE TKDE 16(9), Section IV
    // Why decoy: 0.847 is the precision score of the Alpha++-produced model, not the fitness. Conflates precision with fitness.
    let src = algorithm_source("alpha_plus_plus");
    assert!(
        !production_half(&src).contains("fitness=0.847"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "fitness=0.847",
        "alpha_plus_plus"
    );
}

#[test]
fn anticheat_alpha_plus_plus_true_not_hardcoded() {
    // Locus: van der Aalst, Weijters & Maruster 2004, IEEE TKDE 16(9), Section IV — Alpha++ correctness proof on the running-example log
    // Derivation: Token-replay fitness on Alpha++-produced Petri net over canonical running-example log is exactly 1.0 — all trace variants replay without missing or remaining tokens.
    let src = algorithm_source("alpha_plus_plus");
    assert!(
        !production_half(&src).contains("fitness=1.0"),
        "ANTI-CHEAT A8: published value {:?} hardcoded in {}.rs — must be DERIVED",
        "fitness=1.0",
        "alpha_plus_plus"
    );
}

#[test]
fn anticheat_dfg_decoy_not_in_source() {
    // Locus: van der Aalst 2016, Chapter 7, Figure 7.2
    // Why decoy: Default frequency filter (minimum 2 occurrences) eliminates 3 low-frequency arcs, reporting 12 edges instead of the unfiltered 15.
    let src = algorithm_source("dfg");
    assert!(
        !production_half(&src).contains("activities=8,edges=12"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "activities=8,edges=12",
        "dfg"
    );
}

#[test]
fn anticheat_dfg_true_not_hardcoded() {
    // Locus: van der Aalst 2016, Process Mining (2nd ed.), Springer, Chapter 7, Figure 7.2 — running-example DFG over the hospital log
    // Derivation: 8 distinct activities and 15 directly-follows pairs when all traces are counted with zero frequency filter on the canonical running-example log.
    let src = algorithm_source("dfg");
    assert!(
        !production_half(&src).contains("activities=8,edges=15"),
        "ANTI-CHEAT A8: published value {:?} hardcoded in {}.rs — must be DERIVED",
        "activities=8,edges=15",
        "dfg"
    );
}

#[test]
fn anticheat_etconformance_precision_decoy_not_in_source() {
    // Locus: Munoz-Gama & Carmona 2010, BPM LNCS 6336, Section 2
    // Why decoy: Conflates ETC precision with 'behavioral precision' from Rozinat & van der Aalst 2008 — a different formula based on reachable states rather than escaping edges.
    let src = algorithm_source("etconformance_precision");
    assert!(
        !production_half(&src).contains("behavioral_precision"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "behavioral_precision",
        "etconformance_precision"
    );
}

#[test]
fn anticheat_genetic_algorithm_decoy_not_in_source() {
    // Locus: van der Aalst, de Medeiros & Weijters 2005, Petri Nets LNCS 3536, Section 4
    // Why decoy: 100 is the population used in the paper's sensitivity analysis (Section 4.2). Confuses the sensitivity experiment variant with the paper's recommended canonical configuration.
    let src = algorithm_source("genetic_algorithm");
    assert!(
        !production_half(&src).contains("population_size=100"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "population_size=100",
        "genetic_algorithm"
    );
}

#[test]
fn anticheat_genetic_algorithm_true_not_hardcoded() {
    // Locus: van der Aalst, de Medeiros & Weijters 2005, Petri Nets LNCS 3536, Section 4 — experimental setup: population size 50
    // Derivation: Paper's Section 4 experimental setup uses population size 50 as primary configuration. Fixture asserts default population_size equals 50 with paper-canonical parameters.
    let src = algorithm_source("genetic_algorithm");
    assert!(
        !production_half(&src).contains("population_size=50"),
        "ANTI-CHEAT A8: published value {:?} hardcoded in {}.rs — must be DERIVED",
        "population_size=50",
        "genetic_algorithm"
    );
}

#[test]
fn anticheat_heuristic_miner_decoy_not_in_source() {
    // Locus: Weijters & van der Aalst 2006, BETA Working Paper WP 166, Section 3
    // Why decoy: 0.3 is the operational default in smart_engine_run for noisy real-world logs. Confuses noise-tolerance setting with the paper's theoretical recommendation of 0.5.
    let src = algorithm_source("heuristic_miner");
    assert!(
        !production_half(&src).contains("dependency_threshold=0.3"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "dependency_threshold=0.3",
        "heuristic_miner"
    );
}

#[test]
fn anticheat_heuristic_miner_true_not_hardcoded() {
    // Locus: Weijters & van der Aalst 2006, BETA Working Paper WP 166, Section 3 — dependency measure threshold of 0.5 is the paper's recommended default
    // Derivation: Paper explicitly recommends >= 0.5 as the boundary above which a directly-follows arc is a genuine causal dependency.
    let src = algorithm_source("heuristic_miner");
    assert!(
        !production_half(&src).contains("dependency_threshold=0.5"),
        "ANTI-CHEAT A8: published value {:?} hardcoded in {}.rs — must be DERIVED",
        "dependency_threshold=0.5",
        "heuristic_miner"
    );
}

#[test]
fn anticheat_ilp_decoy_not_in_source() {
    // Locus: van der Aalst et al. 2004, BPM Center Report BPM-06-30, Section 4
    // Why decoy: 0.98 is from approximate-ILP evaluations where solver is given a time budget. Confuses ILP exact solution (fitness=1.0 by construction) with heuristic ILP approximation.
    let src = algorithm_source("ilp");
    assert!(
        !production_half(&src).contains("fitness=0.98"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "fitness=0.98",
        "ilp"
    );
}

#[test]
fn anticheat_inductive_miner_decoy_not_in_source() {
    // Locus: Leemans, Fahland & van der Aalst 2013, Petri Nets LNCS 7927
    // Why decoy: 0.92 is a typical token-replay fitness reported by the Heuristic Miner on the same running-example log — not the Inductive Miner.
    let src = algorithm_source("inductive_miner");
    assert!(
        !production_half(&src).contains("fitness=0.92"),
        "ANTI-CHEAT A8/A12: decoy value {:?} found as literal in {}.rs production source",
        "fitness=0.92",
        "inductive_miner"
    );
}
