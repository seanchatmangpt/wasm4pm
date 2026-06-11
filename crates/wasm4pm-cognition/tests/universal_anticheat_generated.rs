// Universal anti-cheat tests — generated from wasm4pm-compat ontology
// (ggen rule: universal-anticheat, Overwrite mode — hand edits are reverted by sync).
//
// Two structural locks per breed:
//   decoy: the plausible-miscitation value must NOT appear as a literal in the
//          breed's source (an agent that hardcoded a wrong citation is exposed).
//   true:  the published value must NOT appear as a literal either — the
//          algorithm must DERIVE it (hardcoding the right answer is A8 fraud).
//
// Assertion values live in wasm4pm-compat/ggen/ontology-breeds/paper-pointers.ttl;
// weakening one requires a commit in THAT repo, not this one.

fn breed_source(module: &str) -> String {
    let src_path = format!("{}/src/breeds/{}.rs", env!("CARGO_MANIFEST_DIR"), module);
    std::fs::read_to_string(&src_path)
        .unwrap_or_else(|_| panic!("MISSING SOURCE: {} — every pointer-bearing breed must have its module on disk", src_path))
}

/// Strip inline `#[cfg(test)]` modules: doc-comment examples and unit tests may
/// legitimately mention paper values; the lock applies to production code only.
fn production_half(src: &str) -> &str {
    match src.find("#[cfg(test)]") {
        Some(i) => &src[..i],
        None => src,
    }
}

#[test]
fn anticheat_abductive_ibe_decoy_1_not_in_source() {
    // Thagard 1978, Sections II–III (Darwin case study)
    // Why this is a decoy: creation_score (the losing hypothesis's score) is the most likely value an agent mistakes for the answer/winning score
    let src = breed_source("abductive_ibe");
    let needle = r#"0.7000"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "abductive_ibe"
    );
}

#[test]
fn anticheat_abductive_ibe_true_2_not_hardcoded() {
    // Thagard 1978, Sections II–III (Darwin case study)
    // Derivation: expected.score: evolution score = coverage(4) − 0.1·cost(1) = 3.9
    let value = r#"3.9000"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("abductive_ibe");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "abductive_ibe"
    );
}

#[test]
fn anticheat_abductive_lp_decoy_3_not_in_source() {
    // Kakas, Kowalski & Toni 1992, Section 1.1 (grass-is-wet example)
    // Why this is a decoy: the non-minimal joint explanation is excluded by minimality, but a careless agent would union both abducibles into one explanation
    let src = breed_source("abductive_lp");
    let needle = r#"{rained,sprinkler_on}"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "abductive_lp"
    );
}

#[test]
fn anticheat_abductive_lp_true_4_not_hardcoded() {
    // Kakas, Kowalski & Toni 1992, Section 1.1 (grass-is-wet example)
    // Derivation: expected.value: two minimal abductive explanations enumerated size-then-lex
    let value = r#"{rained},{sprinkler_on}"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("abductive_lp");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "abductive_lp"
    );
}

#[test]
fn anticheat_act_r_decoy_5_not_in_source() {
    // Anderson & Lebiere 1998, Ch. 3 Eq. 3.1 / Ch. 9 addition-fact retrieval
    // Why this is a decoy: activation of the losing neighbour chunk fact35 (0.3 + 1/3 ≈ 0.6333); an agent may cite the competitor's activation as the retrieved value
    let src = breed_source("act_r");
    let needle = r#"0.6333"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "act_r"
    );
}

#[test]
fn anticheat_act_r_true_6_not_hardcoded() {
    // Anderson & Lebiere 1998, Ch. 3 Eq. 3.1 / Ch. 9 addition-fact retrieval
    // Derivation: expected.activation_fact34: A(fact34)=0.5 + 2/3 ≈ 1.1667 (tolerance 0.001)
    let value = r#"1.1667"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("act_r");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "act_r"
    );
}

#[test]
fn anticheat_allen_temporal_decoy_7_not_in_source() {
    // Allen 1983, Table 1 (transitivity table)
    // Why this is a decoy: the inverse relation (derived:C,A) is the converse entry; an agent could cite the inverse direction as the A,C composition result
    let src = breed_source("allen_temporal");
    let needle = r#"oi|di|si"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "allen_temporal"
    );
}

#[test]
fn anticheat_allen_temporal_true_8_not_hardcoded() {
    // Allen 1983, Table 1 (transitivity table), entry meets ; during
    // Derivation: expected.derived['derived:A,C']: m composed with d = (o s d)
    let value = r#"o|d|s"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("allen_temporal");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "allen_temporal"
    );
}

#[test]
fn anticheat_analogy_sme_decoy_9_not_in_source() {
    // Falkenhainer, Forbus & Gentner 1989, Section 5.1
    // Why this is a decoy: the temperature attribute (base:3) must NOT map (attributes are dropped); an agent may wrongly carry it over as an inference with substituted entities
    let src = breed_source("analogy_sme");
    let needle = r#"(greater (temperature nucleus) (temperature electron))"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "analogy_sme"
    );
}

#[test]
fn anticheat_analogy_sme_true_10_not_hardcoded() {
    // Falkenhainer, Forbus & Gentner 1989, Section 5.1, Figures 13–15
    // Derivation: expected.candidate_inference_contains: the unique candidate inference carried over from base:2 with substituted entities
    let value = r#"(cause (greater (mass nucleus) (mass electron)) (revolve electron nucleus))"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("analogy_sme");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "analogy_sme"
    );
}

#[test]
fn anticheat_asp_decoy_11_not_in_source() {
    // Gelfond & Lifschitz 1988, Section 2
    // Why this is a decoy: q_2 is explicitly excluded from the stable model; an agent ignoring the negation-as-failure constraint would include both q(1) and q(2)
    let src = breed_source("asp");
    let needle = r#"p_1_2,q_1,q_2"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "asp"
    );
}

#[test]
fn anticheat_asp_true_12_not_hardcoded() {
    // Gelfond & Lifschitz 1988, Section 2, Examples 1–2
    // Derivation: expected.answer_set_0: unique stable model {p(1,2), q(1)}
    let value = r#"p_1_2,q_1"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("asp");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "asp"
    );
}

#[test]
fn anticheat_autoinstinct_learning_decoy_13_not_in_source() {
    // Sussman 1973 (MIT AI TR-297), Chapter II, Problems 3.4–3.6
    // Why this is a decoy: g3 is also unachieved and thematically adjacent (space allocation), but depends on g2 first; an agent may pick the later flush-ordering goal
    let src = breed_source("autoinstinct_learning");
    let needle = r#"section-4-space-allocation-flush-ordering"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "autoinstinct_learning"
    );
}

#[test]
fn anticheat_autoinstinct_learning_true_14_not_hardcoded() {
    // Sussman 1973 (MIT AI TR-297), Chapter II Scenario Sections 1–5, Problems 3.1–3.5
    // Derivation: expected.next_prerequisite: lowest-index unachieved goal g2
    let value = r#"section-3-space-allocation-compact"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("autoinstinct_learning");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "autoinstinct_learning"
    );
}

#[test]
fn anticheat_autoinstinct_neurosis_decoy_15_not_in_source() {
    // Boden 1977, Chapter 6, pp. 198-212
    // Why this is a decoy: Careless agent counts the 12 individual belief facts instead of the 6 contradiction pairs the algorithm derives
    let src = breed_source("autoinstinct_neurosis");
    let needle = r#"conflict_pairs=12"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "autoinstinct_neurosis"
    );
}

#[test]
fn anticheat_autoinstinct_neurosis_true_16_not_hardcoded() {
    // Boden 1977, Artificial Intelligence and Natural Man, Chapter 6, pp. 198-212 (conflict detection framework)
    // Derivation: expected.conflict_pairs in the fixture lists exactly 6 mutually incompatible belief pairs; the algorithm must surface all 6 double-binds with status=has_findings
    let value = r#"conflict_pairs=6"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("autoinstinct_neurosis");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "autoinstinct_neurosis"
    );
}

#[test]
fn anticheat_autoinstinct_semantics_true_17_not_hardcoded() {
    // Schank 1972, Cognitive Psychology 3(4), Section 3 'The Primitive Acts', Table 1, pp. 567-571 ('John gave Mary a book')
    // Derivation: expected.cd_primitive = 'Atrans' — the canonical CD primitive for abstract ownership transfer in the paper's most-cited worked example
    let value = r#"Atrans"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("autoinstinct_semantics");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "autoinstinct_semantics"
    );
}

#[test]
fn anticheat_autoinstinct_vision_decoy_18_not_in_source() {
    // Marr & Poggio 1976, Fig. 3, p. 285
    // Why this is a decoy: 7 is the number of disparity layers (-3 to +3) in the same figure; a careless agent cites the layer count as the convergence iteration count
    let src = breed_source("autoinstinct_vision");
    let needle = r#"iterations_to_convergence=7"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "autoinstinct_vision"
    );
}

#[test]
fn anticheat_autoinstinct_vision_true_19_not_hardcoded() {
    // Marr & Poggio 1976, Science 194(4262), Fig. 3 and 'Examples of Applying the Algorithm', p. 285
    // Derivation: expected.iterations_to_convergence = 14: the cooperative network on the 50%-density random-dot stereogram reaches its stable fixed point at iteration 14, with foreground square at disparity +3
    let value = r#"iterations_to_convergence=14"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("autoinstinct_vision");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "autoinstinct_vision"
    );
}

#[test]
fn anticheat_bayesian_network_decoy_20_not_in_source() {
    // Pearl 1988, Ch. 2 alarm network CPT
    // Why this is a decoy: P(A|B,E)=0.95 is the top CPT entry of the same network; agents commonly hardcode this conditional probability (or the rounded '0.284') as the final posterior instead of computing 0.284171835
    let src = breed_source("bayesian_network");
    let needle = r#"0.95"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "bayesian_network"
    );
}

#[test]
fn anticheat_bayesian_network_true_21_not_hardcoded() {
    // Pearl 1988, Probabilistic Reasoning in Intelligent Systems, Ch. 2 burglary/earthquake/alarm network (parameterization as in Russell & Norvig Fig 14.2)
    // Derivation: expected.posterior = 0.284171835 with tolerance 1e-6: exact posterior P(Burglary | JohnCalls=t, MaryCalls=t) by enumeration over the canonical CPTs
    let value = r#"0.284171835"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("bayesian_network");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "bayesian_network"
    );
}

#[test]
fn anticheat_belief_merging_decoy_22_not_in_source() {
    // Konieczny & Pino Perez 2002, Sections 5-6
    // Why this is a decoy: 'p,q' is the Sigma (sum/majoritarian) result on this profile; the most likely error is conflating the two operator families and citing the majority world as the GMax output — exactly the disagreement the paper exists to demonstrate
    let src = breed_source("belief_merging");
    let needle = r#"gmax_models=p,q"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "belief_merging"
    );
}

#[test]
fn anticheat_belief_merging_true_23_not_hardcoded() {
    // Konieczny & Pino Perez 2002, Journal of Logic and Computation 12(5), Sections 5-6 (Sigma vs GMax discriminating profile)
    // Derivation: expected.gmax_models = ['p,-q','-p,q']: GMax (egalitarian) selects the compromise worlds with leximax vector (1,1,1) over the majority world's (2,0,0); 'p,-q' is the first GMax model and never appears among the Sigma models
    let value = r#"p,-q"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("belief_merging");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "belief_merging"
    );
}

#[test]
fn anticheat_cbr_decoy_24_not_in_source() {
    // Aamodt & Plaza 1994, p. 2 vignettes
    // Why this is a decoy: The other medical case shares domain and primary symptom (fever) but mismatches on cough/rash and urgency (3 of 5 features differ); an agent matching only on domain+fever would retrieve it instead
    let src = breed_source("cbr");
    let needle = r#"CASE-PHYSICIAN-6MO"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "cbr"
    );
}

#[test]
fn anticheat_cbr_true_25_not_hardcoded() {
    // Aamodt & Plaza 1994, AI Communications 7(1), section 1.2 p. 2 (physician vignette); CBR cycle Figure 1, p. 8
    // Derivation: expected.retrieved_case = 'CASE-PHYSICIAN-2WK': highest Jaccard similarity (4 of 5 features match: medical/fever/cough/moderate), yielding suggested solution 'antibiotic-course'
    let value = r#"CASE-PHYSICIAN-2WK"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("cbr");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "cbr"
    );
}

#[test]
fn anticheat_circumscription_decoy_26_not_in_source() {
    // McCarthy 1980, Section 4
    // Why this is a decoy: Naive monotone forward chaining that ignores the not_ab_bird_opus premise derives flies_opus=true — exactly the non-monotonic failure mode circumscription is designed to prevent
    let src = breed_source("circumscription");
    let needle = r#"flies_tweety=true,flies_opus=true"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "circumscription"
    );
}

#[test]
fn anticheat_circumscription_true_27_not_hardcoded() {
    // McCarthy 1980, Artificial Intelligence 13(1-2), pp. 27-39, Section 4 (birds fly unless abnormal; penguins are abnormal)
    // Derivation: expected.value field verbatim; the unique ab-minimal model is {ab_bird_opus}, so flies_tweety is entailed and flies_opus is not
    let value = r#"flies_tweety=true,flies_opus=false"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("circumscription");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "circumscription"
    );
}

#[test]
fn anticheat_clp_decoy_28_not_in_source() {
    // Jaffar & Lassez 1987, Sections 1-2
    // Why this is a decoy: Generate-and-test mindset assumes at least one labeling backtrack; the paper's point is the solver does it with zero search (expected.backtracks=0)
    let src = breed_source("clp");
    let needle = r#"backtracks=1"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "clp"
    );
}

#[test]
fn anticheat_clp_decoy_29_not_in_source() {
    // Jaffar & Lassez 1987, Sections 1-2
    // Why this is a decoy: Careless agent ignores strict inequality y<4 and treats it as y<=4, giving x=7,y=4 — plausible off-by-one on the constraint bound
    let src = breed_source("clp");
    let needle = r#"x=7,y=4"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "clp"
    );
}

#[test]
fn anticheat_clp_true_30_not_hardcoded() {
    // Jaffar & Lassez 1987, POPL '87, pp. 111-119, Sections 1-2 (CLP scheme)
    // Derivation: expected.value/solution: propagation on x=y+3, y<4, x in 6..9 yields unique solution x=6,y=3 with 0 backtracks
    let value = r#"x=6,y=3"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("clp");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "clp"
    );
}

#[test]
fn anticheat_construction_grammar_true_31_not_hardcoded() {
    // Goldberg 1995, Constructions, Univ. of Chicago Press, Ch. 1-2 (ditransitive construction, 'Pat faxed Bill the letter')
    // Derivation: expected.meaning_frame: the ditransitive construction (not the verb 'fax') supplies the transfer meaning; coerced=true, slot_rec=bill
    let value = r#"CAUSE-RECEIVE"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("construction_grammar");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "construction_grammar"
    );
}

#[test]
fn anticheat_contingent_plan_true_32_not_hardcoded() {
    // Russell & Norvig 2010 (AIMA 3rd ed.), §4.3.2, AND-OR search in the partially observable vacuum world
    // Derivation: expected.plan_tree: conditional plan 'sense dirt; if dirty then suck else nothing' returned by AND-OR search; sense_nodes=1
    let value = r#"(sense check-dirt dirt (act suck (done)) (done))"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("contingent_plan");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "contingent_plan"
    );
}

#[test]
fn anticheat_csp_ac3_decoy_33_not_in_source() {
    // Mackworth 1977, Section 3
    // Why this is a decoy: A different valid 3-coloring; satisfies the constraints but violates the fixture's deterministic lexicographic ordering (B<G<R) — an agent that just 'finds a solution' hardcodes a non-canonical permutation
    let src = breed_source("csp_ac3");
    let needle = r#"SAT: X=R, Y=G, Z=B"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "csp_ac3"
    );
}

#[test]
fn anticheat_csp_ac3_true_34_not_hardcoded() {
    // Mackworth 1977, Artificial Intelligence 8(1), 99-118, Section 3 (AC-3) on the canonical inequality network
    // Derivation: expected.explanation: MRV + lexicographic value order + MAC over complete triangle with domains {B,G,R} hand-derives X=B, Y=G, Z=R
    let value = r#"SAT: X=B, Y=G, Z=R"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("csp_ac3");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "csp_ac3"
    );
}

#[test]
fn anticheat_ctl_check_decoy_35_not_in_source() {
    // Clarke, Emerson & Sistla 1986, Section 5
    // Why this is a decoy: Agents conflate this with the paper's liveness/starvation discussion (where properties can fail) or emit a counterexample verdict; also 'rejected' is a status string this codebase never emits — a known miscitation pattern
    let src = breed_source("ctl_check");
    let needle = r#"rejected"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "ctl_check"
    );
}

#[test]
fn anticheat_ctl_check_true_36_not_hardcoded() {
    // Clarke, Emerson & Sistla 1986, ACM TOPLAS 8(2), 244-263, Sections 4-5 (fixed-point labeling; mutex AG ¬(c1∧c2))
    // Derivation: expected.value='verified' / verdict='holds': no reachable state of the two-process mutex system labels both c1 and c2, so AG !(c1 & c2) holds at s0 with no counterexample
    let value = r#"verified"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("ctl_check");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "ctl_check"
    );
}

#[test]
fn anticheat_default_logic_decoy_37_not_in_source() {
    // Reiter 1980, Section 1.1
    // Why this is a decoy: The fixture encodes r_birds_fly with certainty 0.9; a careless agent fires the default anyway and cites 'flies' (CF 0.9) as the conclusion, ignoring the unless:not_flies block — the paper's entire point
    let src = breed_source("default_logic");
    let needle = r#"flies:0.9"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "default_logic"
    );
}

#[test]
fn anticheat_default_logic_true_38_not_hardcoded() {
    // Reiter 1980, Artificial Intelligence 13(1-2), 81-132, Section 1.1 (birds-fly default; Tweety the penguin)
    // Derivation: expected.extension_contains includes not_flies (with bird, penguin) and extension_excludes flies; justification M flies(tweety) is blocked (block_step=true)
    let value = r#"not_flies"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("default_logic");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "default_logic"
    );
}

#[test]
fn anticheat_dempster_shafer_decoy_39_not_in_source() {
    // Shafer 1976, Ch. 4
    // Why this is a decoy: 0.9*0.9=0.81 is the intersection mass m1(life)·m2(life) — the intermediate product before adding the cross terms (0.09+0.09); the single most likely hardcode for a careless combiner
    let src = breed_source("dempster_shafer");
    let needle = r#"0.81"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "dempster_shafer"
    );
}

#[test]
fn anticheat_dempster_shafer_true_40_not_hardcoded() {
    // Shafer 1976, A Mathematical Theory of Evidence, Princeton UP, Ch. 1 / Ch. 4 (two-witness combination, reliability 0.9 each)
    // Derivation: expected.value=expected.belief=0.99: m1(life)=m2(life)=0.9, K=0, combined m(life)=Bel(life)=1-0.1*0.1=0.99 (tolerance 1e-6)
    let value = r#"0.99"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("dempster_shafer");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "dempster_shafer"
    );
}

#[test]
fn anticheat_dendral_decoy_41_not_in_source() {
    // same paper, ketone family Table 4
    // Why this is a decoy: The fixture's correct structure is 3-pentanone (diethyl ketone). A careless agent confuses it with the other common C5H10O ketone isomer, 2-pentanone (methyl propyl ketone), which is NOT the top-ranked structure here.
    let src = breed_source("dendral");
    let needle = r#"2-pentanone"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "dendral"
    );
}

#[test]
fn anticheat_dendral_true_42_not_hardcoded() {
    // Feigenbaum, Buchanan & Lederberg 1971 (AIM-131), Tables 4-5 (pp. 21-22); zero-order pruning example p. 15
    // Derivation: expected.correct_structure / rank_of_correct_answer=1: diethyl ketone (3-pentanone) is ranked first by the Planner+Predictor, validated by alpha-cleavage fragments at m/z 57 and 29.
    let value = r#"ketone-F1-C2H5-C2H5"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("dendral");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "dendral"
    );
}

#[test]
fn anticheat_description_logic_decoy_43_not_in_source() {
    // same paper Section 1
    // Why this is a decoy: Subsumption is directional; an agent treating it as symmetric asserts the converse as true. Fixture sets dl:verdict:HeartDisease:Pericarditis='false', so this is the most likely wrong citation.
    let src = breed_source("description_logic");
    let needle = r#"HeartDisease ⊑ Pericarditis"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "description_logic"
    );
}

#[test]
fn anticheat_description_logic_true_44_not_hardcoded() {
    // Baader, Brandt & Lutz 2005 (Pushing the EL Envelope, IJCAI), Section 1 medical-ontology example; completion rules Table 2 (CR1-CR4)
    // Derivation: expected.verdicts['dl:verdict:Pericarditis:HeartDisease']='true' — the paper's stated entailment.
    let value = r#"Pericarditis ⊑ HeartDisease"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("description_logic");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "description_logic"
    );
}

#[test]
fn anticheat_ebl_decoy_45_not_in_source() {
    // same paper Section 3
    // Why this is a decoy: The canonical EBL failure mode: emitting the overspecialized rule with the training constants obj1/obj2 instead of variables. Fixture's rule_excludes explicitly forbids obj1/obj2.
    let src = breed_source("ebl");
    let needle = r#"safe_to_stack(obj1,obj2) :- weight(obj1,light), weight(obj2,heavy)"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "ebl"
    );
}

#[test]
fn anticheat_ebl_true_46_not_hardcoded() {
    // Mitchell, Keller & Kedar-Cabelli 1986, Machine Learning 1(1):47-80, Section 3 SafeToStack worked example
    // Derivation: expected.rule_contains ['weight(','safe_to_stack('] + rule_excludes ['obj1','obj2'] + has_variable=true: goal-regression yields an operational, variabilized rule over the weight predicates.
    let value = r#"safe_to_stack(?x,?y) :- weight(?x,light), weight(?y,heavy)"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("ebl");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "ebl"
    );
}

#[test]
fn anticheat_eliza_decoy_47_not_in_source() {
    // same paper, DIT reassembly rules Appendix p. 45
    // Why this is a decoy: A different reassembly rule attached to the same DIT keyword. An agent picking the wrong reassembly variant for turn 1 outputs this instead of the canonical 'IN WHAT WAY'.
    let src = breed_source("frame");
    let needle = r#"WHAT RESEMBLANCE DO YOU SEE"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "frame"
    );
}

#[test]
fn anticheat_eliza_true_48_not_hardcoded() {
    // Weizenbaum 1966, CACM 9(1):36-45, opening dialogue p. 36; DOCTOR script Appendix pp. 44-45 (ALIKE rank 10 -> DIT)
    // Derivation: expected.turn_1.eliza_response='IN WHAT WAY' — keyword ALIKE (rank 10, equivalenced to DIT) on 'Men are all alike.'
    let value = r#"IN WHAT WAY"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("frame");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "frame"
    );
}

#[test]
fn anticheat_episodic_memory_decoy_49_not_in_source() {
    // same fixture, temporal kernel formula
    // Why this is a decoy: Off-by-one on the temporal kernel: using 1/|Δt|=1/8=0.125 instead of 1/(1+|Δt|)=0.1111 gives 0.5+0.125=0.625. The most plausible arithmetic miscitation of the dinner score.
    let src = breed_source("episodic_memory");
    let needle = r#"0.625"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "episodic_memory"
    );
}

#[test]
fn anticheat_episodic_memory_true_50_not_hardcoded() {
    // Tulving 1983 (Elements of Episodic Memory, Ch. 7, temporal organisation); Nuxoll & Laird 2007, AAAI 1560-1565, Section 3 (partial-match retrieval)
    // Derivation: expected.score_dinner=0.6111 = Jaccard 0.5 + temporal kernel 1/(1+|10-2|)=0.1111; breakfast wins at 1.0, so dinner's distinctive runner-up score is the assertable derived value (tol 0.001).
    let value = r#"0.6111"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("episodic_memory");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "episodic_memory"
    );
}

#[test]
fn anticheat_event_calculus_decoy_51_not_in_source() {
    // same paper, initiates/terminates structure
    // Why this is a decoy: An agent that tracks 'hire initiates lecturer' but misses 'promote terminates lecturer' (the clipping) wrongly reports lecturer still holding at t=7. Negation of the fixture verdict.
    let src = breed_source("event_calculus");
    let needle = r#"lecturer@7=true"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "event_calculus"
    );
}

#[test]
fn anticheat_event_calculus_true_52_not_hardcoded() {
    // Kowalski & Sergot 1986, New Generation Computing 4(1):67-95, Sections 2-5 hired/promoted narrative
    // Derivation: expected.verdicts['ec:verdict:lecturer@7']='false': the lecturer period is clipped by the promote event at t=5, so it does not hold at t=7.
    let value = r#"lecturer@7=false"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("event_calculus");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "event_calculus"
    );
}

#[test]
fn anticheat_frames_inheritance_decoy_53_not_in_source() {
    // same paper, isa chain my_chair->chair->furniture
    // Why this is a decoy: An agent counts the full isa chain to furniture (3 frames) rather than halting at chair where the legs default resolves. Fixture states walk_steps=2.
    let src = breed_source("frames_inheritance");
    let needle = r#"walk_steps=3"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "frames_inheritance"
    );
}

#[test]
fn anticheat_frames_inheritance_true_54_not_hardcoded() {
    // Minsky 1974, MIT AI Lab Memo 306, frame systems / default assignments section
    // Derivation: expected.value='4', walk_steps=2: my_chair has no own legs slot, so inheritance walks my_chair -> chair (2 frames) and returns chair's default legs=4.
    let value = r#"legs=4 (walk_steps=2)"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("frames_inheritance");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "frames_inheritance"
    );
}

#[test]
fn anticheat_fuzzy_logic_decoy_55_not_in_source() {
    // Mamdani & Assilian 1975, Section 3
    // Why this is a decoy: The peak of the output triangle Tri(0,25,100) — a careless agent cites the membership-function apex (or mean-of-max) as the defuzzified output instead of computing the asymmetric centroid 41.66667; the fixture's asymmetric set exists precisely to defeat this fake
    let src = breed_source("fuzzy_logic");
    let needle = r#"25.0"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "fuzzy_logic"
    );
}

#[test]
fn anticheat_fuzzy_logic_true_56_not_hardcoded() {
    // Mamdani & Assilian 1975, Int. J. Man-Machine Studies 7(1), Section 3 (min-implication firing, max aggregation, discrete centroid defuzzification)
    // Derivation: expected.centroid / expected.value: 101-point discrete centroid of Tri(0,25,100) at fire strength 1.0; hand derivation in fixture notes gives sum(x*mu)/sum(mu)=2083.3333/50=41.66667, tolerance 1e-3
    let value = r#"41.66667"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("fuzzy_logic");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "fuzzy_logic"
    );
}

#[test]
fn anticheat_gps_decoy_57_not_in_source() {
    // Newell & Simon 1961, RAND P-2257, Fig. 4
    // Why this is a decoy: The fixture note says GPS 'first selects the delete-connective method (R6/R7 family)'; an agent skimming the trace plausibly cites R7 as the applied operator, but the grounded encoding applies R6
    let src = breed_source("gps");
    let needle = r#"R7,R12"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "gps"
    );
}

#[test]
fn anticheat_gps_true_58_not_hardcoded() {
    // Newell & Simon 1961, RAND P-2257, Fig. 3 (difference table) and Fig. 4 (GPS trace, first part of problem), pp. 3-15
    // Derivation: expected.solution_steps / operators_applied = [R6, R12]: GPS applies R6 to eliminate the horseshoe connective (L1->L2), then R12 to remove double negation (L2->L0)
    let value = r#"R6,R12"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("gps");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "gps"
    );
}

#[test]
fn anticheat_hearsay_decoy_59_not_in_source() {
    // Erman et al. 1980, Section 1.2, early steps of the worked example
    // Why this is a decoy: ARE* (97, 0:28) is the highest-credibility hypothesis in the trace (97 vs the final sentence's 85); an agent grabbing 'the rated answer' cites the early word-sequence island and its credibility 97 instead of the Step-38 spanning phrase at credibility 85
    let src = breed_source("hearsay");
    let needle = r#"[-ARE*]:0:28:97"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "hearsay"
    );
}

#[test]
fn anticheat_hearsay_true_60_not_hardcoded() {
    // Erman, Hayes-Roth, Lesser & Reddy 1980, ACM Computing Surveys 12(2), Section 1.1-1.2, Figures 5a-5h, Step 38 (pp. 222-232)
    // Derivation: expected.final_phrase: complete spanning phrase selected when KS STOP fires at Step 38, credibility 85 over time span 0:225 centiseconds
    let value = r#"[+ARE+ANY+BY+FEIGENBAUM+AND+FELDMAN+]*"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("hearsay");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "hearsay"
    );
}

#[test]
fn anticheat_htn_planning_decoy_61_not_in_source() {
    // Nau et al. 2003, Section 2
    // Why this is a decoy: A plausible-looking permutation an agent emits when it lists the operators from the rule set without replaying preconditions; drive-first strands the package at the depot (load requires truck=at_depot), so it is not a lawful plan
    let src = breed_source("htn_planning");
    let needle = r#"op:drive,op:load,op:unload"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "htn_planning"
    );
}

#[test]
fn anticheat_htn_planning_true_62_not_hardcoded() {
    // Nau et al. 2003, SHOP2, JAIR 20:379-404, Section 2 (total-order decomposition) with the logistics/transport domain
    // Derivation: expected.value / expected.plan: deliver decomposes via method:deliver:by_truck into the unique executable operator sequence load;drive;unload verified by hand replay in fixture notes
    let value = r#"op:load,op:drive,op:unload"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("htn_planning");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "htn_planning"
    );
}

#[test]
fn anticheat_ilp_decoy_63_not_in_source() {
    // Quinlan 1990, Section 3, daughter example
    // Why this is a decoy: Classic argument-order miscitation: parent(V0,V1) reads 'daughter is the parent' — the correct literal is parent(V1,V0) (Y is parent of X). Agents routinely flip the parent/2 arguments when transcribing daughter(X,Y) :- female(X), parent(Y,X)
    let src = breed_source("ilp");
    let needle = r#"female(V0), parent(V0,V1)"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "ilp"
    );
}

#[test]
fn anticheat_ilp_true_64_not_hardcoded() {
    // Quinlan 1990, Machine Learning 5(3):239-266, Section 3 (FOIL information gain); the daughter/parent family example
    // Derivation: expected.body_set = {female(V0), parent(V1,V0)} with head daughter(V0,V1), clause_count = 1; one clause covers both positives and excludes all four negatives
    let value = r#"female(V0), parent(V1,V0)"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("ilp");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "ilp"
    );
}

#[test]
fn anticheat_ltl_monitor_decoy_65_not_in_source() {
    // Havelund & Rosu 2001, Section 4
    // Why this is a decoy: The violating trace has 3 events; an agent assumes the monitor consumes the whole trace and reports 3 progression steps, but progression halts at the violating event trace:1 (red,green), so the fixture value is 2
    let src = breed_source("ltl_monitor");
    let needle = r#"violating_progress_steps=3"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "ltl_monitor"
    );
}

#[test]
fn anticheat_ltl_monitor_true_66_not_hardcoded() {
    // Havelund & Rosu 2001, ASE 2001 pp. 135-143, Section 4 (formula rewriting/progression) and Section 2 (finite-trace LTL semantics)
    // Derivation: expected.verdict=true with expected.progress_steps=4: G (red -> !green) is progressed through all 4 events of the conforming trace and holds at end-of-trace; violating trace yields verdict=false with violating_progress_steps=2
    let value = r#"progress_steps=4"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("ltl_monitor");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "ltl_monitor"
    );
}

#[test]
fn anticheat_markov_logic_true_67_not_hardcoded() {
    // Richardson & Domingos 2006, Machine Learning 62(1-2):107-136, Table 1 / Fig. 1 (smokes/friends MLN, w=1.5 and w=1.1 clauses) grounded for {anna, bob}
    // Derivation: expected.cost = \
    let value = r#"0.000000"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("markov_logic");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "markov_logic"
    );
}

#[test]
fn anticheat_mdp_true_68_not_hardcoded() {
    // Bellman 1957, Dynamic Programming, Princeton Univ. Press, Ch. III–IV (functional equation / value iteration)
    // Derivation: expected.values.s0 = 1.8; closed-form fixed point of V(s0)=max(0.1+0.9·V(s0), 0+0.9·V(s1)) = max(1.0,1.8)=1.8, optimal action 'go'.
    let value = r#"1.8"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("mdp");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "mdp"
    );
}

#[test]
fn anticheat_meta_reasoning_true_69_not_hardcoded() {
    // Cox & Raja (eds.) 2011, Metareasoning: Thinking about Thinking, MIT Press, Ch. 1
    // Derivation: expected.decision_therapy='gentamicin' / selected='therapy=gentamicin'; confidence-weighted arbitration picks the 0.8-confidence mycin conclusion over the 0.6 prolog one.
    let value = r#"gentamicin"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("meta_reasoning");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "meta_reasoning"
    );
}

#[test]
fn anticheat_morphological_true_70_not_hardcoded() {
    // Zwicky, F. 1969, Discovery, Invention, Research Through the Morphological Approach, Macmillan — propulsive system morphology (1947 jet engine field)
    // Derivation: expected.selected includes 'thrust-augmentation-1=translatory-motion'; the exclusion constraint forbids 'no-motion', so the first admissible value is translatory-motion.
    let value = r#"thrust-augmentation-1=translatory-motion"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("morphological");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "morphological"
    );
}

#[test]
fn anticheat_mycin_true_71_not_hardcoded() {
    // Shortliffe & Buchanan 1975, Math. Biosciences 23(3–4):351–379, §11.4 p.247 (MB[h,e]=0.7 for the streptococcus rule)
    // Derivation: expected.organism_cf = 0.7; paper states MB[h,e]=0.7 ('7 out of 10' expert certainty, p.238 fn4) for gram-positive+coccus+chains→streptococcus.
    let value = r#"0.7"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("production_rules");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "production_rules"
    );
}

#[test]
fn anticheat_naive_physics_decoy_72_not_in_source() {
    // Hayes 1985, Ablex (support axioms)
    // Why this is a decoy: 'floor' falling is the over-derivation defect the fixture warns against; ground objects are immobile, so floor must be in not_falls — a careless agent over-propagates the support break.
    let src = breed_source("naive_physics");
    let needle = r#"floor"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "naive_physics"
    );
}

#[test]
fn anticheat_naive_physics_true_73_not_hardcoded() {
    // Hayes, P. J. 1985, Naive physics I: ontology for liquids, in Formal Theories of the Commonsense World pp.71–107, Ablex (§4–6, containment/support)
    // Derivation: expected.falls=['cup']; removing the table breaks the cup's direct support, so exactly the cup falls (and water spills).
    let value = r#"cup"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("naive_physics");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "naive_physics"
    );
}

#[test]
fn anticheat_ocpm_route_discoverer_true_74_not_hardcoded() {
    // van der Aalst, W.M.P. 2019, Object-Centric Process Mining: Dealing with Divergence and Convergence — Route Discovery
    // Derivation: expected.routes['route:o1']='Create->Pay'; object o1 participates in events e1(Create) and e2(Pay) only.
    let value = r#"Create->Pay"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("ocpm_route_discoverer");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "ocpm_route_discoverer"
    );
}

#[test]
fn anticheat_partial_order_plan_decoy_75_not_in_source() {
    // McAllester & Rosenblitt 1991, AAAI-91
    // Why this is a decoy: This linear goal-at-a-time order is exactly the Sussman anomaly's wrong solution: put_a_on_b deletes clear_b needed by put_b_on_c, an unresolved threat; agents emit the naive goal order.
    let src = breed_source("partial_order_plan");
    let needle = r#"put_c_from_a_on_table;put_a_on_b;put_b_on_c"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "partial_order_plan"
    );
}

#[test]
fn anticheat_partial_order_plan_true_76_not_hardcoded() {
    // McAllester & Rosenblitt 1991, Systematic Nonlinear Planning, AAAI-91 pp.634–639 — Sussman anomaly / SNLP causal-link threat resolution
    // Derivation: expected.plan / expected.value = 'put_c_from_a_on_table;put_b_on_c;put_a_on_b'; the interleaved order resolving causal-link threats by promotion/demotion.
    let value = r#"put_c_from_a_on_table;put_b_on_c;put_a_on_b"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("partial_order_plan");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "partial_order_plan"
    );
}

#[test]
fn anticheat_pomdp_decoy_77_not_in_source() {
    // Kaelbling, Littman & Cassandra 1998, §3 (tiger problem)
    // Why this is a decoy: careless agent cites the unnormalized Bayes numerator (0.85*0.5 = 0.425) as the posterior instead of normalizing
    let src = breed_source("pomdp");
    let needle = r#"0.425"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "pomdp"
    );
}

#[test]
fn anticheat_pomdp_true_78_not_hardcoded() {
    // Kaelbling, Littman & Cassandra 1998, Artificial Intelligence 101(1-2):99-134, §3 (tiger problem)
    // Derivation: expected.belief_tiger_left: posterior P(tiger-left | listen, hear-left) = 0.85*0.5 / (0.85*0.5 + 0.15*0.5) = 0.85 exactly
    let value = r#"0.850000"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("pomdp");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "pomdp"
    );
}

#[test]
fn anticheat_problog_decoy_79_not_in_source() {
    // De Raedt, Kimmig & Toivonen 2007, Section 2
    // Why this is a decoy: the complement (probability wet is false) is the last number computed before the final 1-x step; agents frequently hardcode it as the answer
    let src = breed_source("problog");
    let needle = r#"0.448"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "problog"
    );
}

#[test]
fn anticheat_problog_true_80_not_hardcoded() {
    // De Raedt, Kimmig & Toivonen 2007, IJCAI 2007 pp. 2468-2473, Section 2 (distribution semantics)
    // Derivation: expected.value/probability: P(wet) = 1 - (1-0.2)(1-0.2)(1-0.3) = 0.552, tolerance 1e-6; 2^3 = 8 worlds
    let value = r#"0.552000"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("problog");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "problog"
    );
}

#[test]
fn anticheat_prolog_decoy_81_not_in_source() {
    // Kowalski 1974, Section 9 Figure 2
    // Why this is a decoy: an agent that returns the first matching parent fact (or confuses ancestor chaining tom->bob->ann) cites tom-bob instead of the queried bob-ann binding
    let src = breed_source("prolog");
    let needle = r#"tom-bob"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "prolog"
    );
}

#[test]
fn anticheat_prolog_true_82_not_hardcoded() {
    // Kowalski 1974, IFIP Congress 74 pp. 569-574, Section 9 Figure 2 (parent/ancestor program)
    // Derivation: goal parent(bob-ann) is a direct fact; kernel returns Allow with selected='bob-ann', resolved binding 'ann'
    let value = r#"bob-ann"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("prolog");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "prolog"
    );
}

#[test]
fn anticheat_qualitative_reason_decoy_83_not_in_source() {
    // de Kleer & Brown 1984, Sections 1-3
    // Why this is a decoy: careless agents treat sign ambiguity as binary (increase vs decrease) and drop the dQ=0 steady branch, citing 2 states instead of the paper's 3
    let src = breed_source("qualitative_reason");
    let needle = r#"+,-"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "qualitative_reason"
    );
}

#[test]
fn anticheat_qualitative_reason_true_84_not_hardcoded() {
    // de Kleer & Brown 1984, Artificial Intelligence 24(1-3):7-83, Sections 1-3 (pressure-regulator valve confluence dQ = dP + dA)
    // Derivation: expected.q_values: ambiguous sign sum + ⊕ - forces exactly three envisionment branches dQ ∈ {+, 0, -}; expected.state_count = 3
    let value = r#"+,0,-"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("qualitative_reason");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "qualitative_reason"
    );
}

#[test]
fn anticheat_rl_symbolic_decoy_85_not_in_source() {
    // Watkins & Dayan 1992, p. 281
    // Why this is a decoy: agents miscount the discount horizon and apply γ twice (stay then go), citing 0.81 for Q*(s0,stay) instead of 0.9
    let src = breed_source("rl_symbolic");
    let needle = r#"0.81"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "rl_symbolic"
    );
}

#[test]
fn anticheat_rl_symbolic_true_86_not_hardcoded() {
    // Watkins & Dayan 1992, Machine Learning 8(3-4):279-292, Theorem p. 281 (Q-learning convergence; Q*(s,a) = r + γ max Q*)
    // Derivation: expected.q_s0_stay = 0.9: Q*(s0,stay) = 0 + 0.9·Q*(s0,go) = 0.9 with Q*(s0,go)=1.0; greedy policy_s0 = 'go', tolerance 0.05
    let value = r#"0.9"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("rl_symbolic");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "rl_symbolic"
    );
}

#[test]
fn anticheat_sat_cdcl_decoy_87_not_in_source() {
    // Marques-Silva & Sakallah 1999, Section 3
    // Why this is a decoy: agents that fake CDCL with plain backtracking report UNSAT with zero learned clauses; the fixture's anti-cheat condition is min_learned_clauses >= 1, so 'UNSAT with 0 learned clauses' is the canonical fraudulent answer
    let src = breed_source("sat_cdcl");
    let needle = r#"0 learned clauses"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "sat_cdcl"
    );
}

#[test]
fn anticheat_sat_cdcl_true_88_not_hardcoded() {
    // Marques-Silva & Sakallah 1999, IEEE Trans. Computers 48(5):506-521, Section 3 (conflict analysis / non-chronological backtracking)
    // Derivation: expected.value/verdict = UNSAT for pigeonhole PHP(3,2), with min_learned_clauses = 1 (at least one learned conflict clause must fire)
    let value = r#"UNSAT"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("sat_cdcl");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "sat_cdcl"
    );
}

#[test]
fn anticheat_script_sam_decoy_89_not_in_source() {
    // Schank & Abelson 1977, Chapter 3
    // Why this is a decoy: agents quote the book's narrative and bind 'lobster' as the inferred filler, but the fixture's role/inference filler is 'john' (customer role) and inferred_count is exactly 1 — no object inference
    let src = breed_source("script_sam");
    let needle = r#"lobster"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "script_sam"
    );
}

#[test]
fn anticheat_script_sam_true_90_not_hardcoded() {
    // Schank & Abelson 1977, Scripts, Plans, Goals and Understanding, Chapter 3 (the $RESTAURANT script; John/lobster story)
    // Derivation: expected.inferred = {sam:inferred:eat: john}, script = 'restaurant', inferred_count = 1, role customer = john; the unstated eating scene is the inferred gap
    let value = r#"sam:inferred:eat"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("script_sam");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "script_sam"
    );
}

#[test]
fn anticheat_situation_calculus_decoy_91_not_in_source() {
    // Reiter 1991, Sections 2-3
    // Why this is a decoy: These are only the frame-persist fluents (expected.frame_persist_fluents) — a careless agent cites the inertia-persisting subset as the final state, omitting the effect fluents (on_a_table, clear_a, clear_b, handempty)
    let src = breed_source("situation_calculus");
    let needle = r#"on_b_table,color_b_red"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "situation_calculus"
    );
}

#[test]
fn anticheat_situation_calculus_true_92_not_hardcoded() {
    // Reiter 1991, Sections 2-3 (successor-state axioms, blocks-world pickup/putdown example), in Lifschitz (Ed.), Papers in Honor of John McCarthy, pp. 359-380
    // Derivation: expected.value — final holding fluents after do(putdown_a, do(pickup_a, S0)) via Reiter successor-state axioms
    let value = r#"on_a_table,on_b_table,clear_a,clear_b,handempty,color_b_red"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("situation_calculus");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "situation_calculus"
    );
}

#[test]
fn anticheat_soar_decoy_93_not_in_source() {
    // Laird et al. 1987, Section 2.3
    // Why this is a decoy: It is the last-operator in input.state and carries an explicit 'worse' preference — an agent pattern-matching the most-mentioned operator or misreading the preference polarity would hardcode it
    let src = breed_source("soar");
    let needle = r#"op-move-blank-down"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "soar"
    );
}

#[test]
fn anticheat_soar_true_94_not_hardcoded() {
    // Laird, Newell & Rosenbloom 1987, Artificial Intelligence 33(1), Section 2.3 (pp. 14-20), p. 17: single 'best' preference operator is selected; eight-puzzle Figures 3-5
    // Derivation: expected.selected_operator — 'best' preference dominates acceptables; 'worse' eliminates down; right inapplicable
    let value = r#"op-move-blank-up"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("soar");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "soar"
    );
}

#[test]
fn anticheat_strips_decoy_95_not_in_source() {
    // Fikes & Nilsson 1971, Section 2 (p. 191)
    // Why this is a decoy: Reversed operator order — both operators are independently applicable in the initial state, so an agent that ignores the goal ordering (g1=light before g2=door1) plausibly emits the swapped plan; same set, wrong sequence
    let src = breed_source("strips");
    let needle = r#"close-door1,turn-on-light"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "strips"
    );
}

#[test]
fn anticheat_strips_true_96_not_hardcoded() {
    // Fikes & Nilsson 1971, Artificial Intelligence 2(3-4), Section 2 (p. 191) — world model, goal G, operators O1..On; room-navigation domain of Section 3
    // Derivation: expected.plan joined with commas — 2-step forward-search plan; goals ordered light=on then door1=closed
    let value = r#"turn-on-light,close-door1"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("strips");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "strips"
    );
}

#[test]
fn anticheat_tableaux_true_97_not_hardcoded() {
    // Smullyan 1968, First-Order Logic, Part I Ch. II — Analytic Tableaux; F(A -> (B -> A)) closes using only alpha rules (beta_expansions = 0)
    // Derivation: expected.verdict / expected.selected — K axiom tableau closes with zero beta (branching) expansions
    let value = r#"valid"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("tableaux");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "tableaux"
    );
}

#[test]
fn anticheat_triz_decoy_98_not_in_source() {
    // Altshuller 1984, Contradiction Matrix, classic cell row 1 (weight of moving object) x col 14 (strength)
    // Why this is a decoy: The widely-reproduced standard contradiction matrix gives principles 1,8,40,15 for weight-vs-strength — an agent citing the real published matrix instead of the fixture's encoded rule would hardcode this; different literal, highly plausible
    let src = breed_source("triz");
    let needle = r#"1,8,40,15"#;
    assert!(
        !production_half(&src).contains(needle),
        "ANTI-CHEAT A8/A12: decoy value {:?} found literally in {}.rs — algorithms must derive values, not hardcode miscitations",
        needle,
        "triz"
    );
}

#[test]
fn anticheat_triz_true_99_not_hardcoded() {
    // Altshuller 1984, Creativity as an Exact Science, Contradiction Matrix (improving weight vs worsening strength, per fixture rule matrix_1_2)
    // Derivation: expected.principles — matrix cell conclusion 'principles=40,26' for improving=weight, worsening=strength
    let value = r#"40,26"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("triz");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "triz"
    );
}

#[test]
fn anticheat_version_space_true_100_not_hardcoded() {
    // Mitchell 1982, Artificial Intelligence 18(2), Sections 3-4 (candidate-elimination); EnjoySport worked instance in Mitchell 1997 ML, Ch. 2, Tables 2.1/2.5
    // Derivation: expected.s — final specific boundary S4 after the four EnjoySport examples
    let value = r#"Sunny,Warm,?,Strong,?,?"#;
    // The hardcode lock applies to DERIVED values (numerics): a verdict
    // vocabulary string ("UNSAT", "valid") legitimately exists as a literal.
    if value.parse::<f64>().is_err() {
        return;
    }
    let src = breed_source("version_space");
    let needle = format!("{:?}", value);
    assert!(
        !production_half(&src).contains(&needle),
        "ANTI-CHEAT A8: published value {} appears as a string literal in {}.rs production code — it must be DERIVED by the algorithm, not hardcoded",
        needle,
        "version_space"
    );
}

