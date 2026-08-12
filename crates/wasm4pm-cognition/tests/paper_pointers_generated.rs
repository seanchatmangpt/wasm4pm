// Paper-pointer meta-gate — generated from wasm4pm-compat ontology
// (ggen rule: paper-pointers, Overwrite mode — hand edits are reverted by sync).
//
// For every breed with a TRUE paper pointer, the fixture on disk must exist and
// carry a real asserted value + provenance. This closes the graceful-skip
// loophole structurally: a missing or skeleton fixture is a hard failure here,
// regardless of how tests/paper_grounded.rs reads it.

fn fixture_json(breed_id: &str) -> serde_json::Value {
    let path = format!(
        "{}/tests/fixtures/papers/{}.json",
        env!("CARGO_MANIFEST_DIR"),
        breed_id
    );
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("MISSING FIXTURE: {} — breeds with paper pointers must have fixtures", path));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e))
}

fn assert_real_fixture(breed_id: &str) {
    let v = fixture_json(breed_id);
    let raw = v.to_string();
    assert!(
        !raw.contains("REPLACE_WITH_PAPER_VALUE"),
        "SKELETON FIXTURE: {} still carries the generated placeholder — fill it from the paper",
        breed_id
    );
    // Structural provenance: a top-level "provenance" or "paper" key, OR an
    // "expected" object carrying a nested provenance. This requires a real JSON
    // key — a bare substring "paper" in some unrelated field's value no longer
    // satisfies this (A12 citation-without-assertion).
    let has_provenance = v.get("provenance").is_some()
        || v.get("paper").is_some()
        || v.get("expected")
            .and_then(|e| e.get("provenance"))
            .is_some();
    assert!(
        has_provenance,
        "NO PROVENANCE: fixture for {} has no structural provenance key (top-level \"provenance\" or expected.provenance) — A12 citation-without-assertion",
        breed_id
    );
}

#[test]
fn pointer_fixture_abductive_ibe_2_is_real() {
    // True pointer: "3.9000" — Thagard 1978, Sections II–III (Darwin case study)
    assert_real_fixture("abductive_ibe");
}

#[test]
fn pointer_fixture_abductive_lp_4_is_real() {
    // True pointer: "{rained},{sprinkler_on}" — Kakas, Kowalski & Toni 1992, Section 1.1 (grass-is-wet example)
    assert_real_fixture("abductive_lp");
}

#[test]
fn pointer_fixture_act_r_6_is_real() {
    // True pointer: "1.1667" — Anderson & Lebiere 1998, Ch. 3 Eq. 3.1 / Ch. 9 addition-fact retrieval
    assert_real_fixture("act_r");
}

#[test]
fn pointer_fixture_allen_temporal_8_is_real() {
    // True pointer: "o|d|s" — Allen 1983, Table 1 (transitivity table), entry meets ; during
    assert_real_fixture("allen_temporal");
}

#[test]
fn pointer_fixture_analogy_sme_10_is_real() {
    // True pointer: "(cause (greater (mass nucleus) (mass electron)) (revolve electron nucleus))" — Falkenhainer, Forbus & Gentner 1989, Section 5.1, Figures 13–15
    assert_real_fixture("analogy_sme");
}

#[test]
fn pointer_fixture_asp_12_is_real() {
    // True pointer: "p_1_2,q_1" — Gelfond & Lifschitz 1988, Section 2, Examples 1–2
    assert_real_fixture("asp");
}

#[test]
fn pointer_fixture_autoinstinct_learning_14_is_real() {
    // True pointer: "section-3-space-allocation-compact" — Sussman 1973 (MIT AI TR-297), Chapter II Scenario Sections 1–5, Problems 3.1–3.5
    assert_real_fixture("autoinstinct_learning");
}

#[test]
fn pointer_fixture_autoinstinct_neurosis_16_is_real() {
    // True pointer: "conflict_pairs=6" — Boden 1977, Artificial Intelligence and Natural Man, Chapter 6, pp. 198-212 (conflict detection framework)
    assert_real_fixture("autoinstinct_neurosis");
}

#[test]
fn pointer_fixture_autoinstinct_semantics_18_is_real() {
    // True pointer: "Atrans" — Schank 1972, Cognitive Psychology 3(4), Section 3 'The Primitive Acts', Table 1, pp. 567-571 ('John gave Mary a book')
    assert_real_fixture("autoinstinct_semantics");
}

#[test]
fn pointer_fixture_autoinstinct_vision_20_is_real() {
    // True pointer: "iterations_to_convergence=14" — Marr & Poggio 1976, Science 194(4262), Fig. 3 and 'Examples of Applying the Algorithm', p. 285
    assert_real_fixture("autoinstinct_vision");
}

#[test]
fn pointer_fixture_bayesian_network_22_is_real() {
    // True pointer: "0.284171835" — Pearl 1988, Probabilistic Reasoning in Intelligent Systems, Ch. 2 burglary/earthquake/alarm network (parameterization as in Russell & Norvig Fig 14.2)
    assert_real_fixture("bayesian_network");
}

#[test]
fn pointer_fixture_belief_merging_24_is_real() {
    // True pointer: "p,-q" — Konieczny & Pino Perez 2002, Journal of Logic and Computation 12(5), Sections 5-6 (Sigma vs GMax discriminating profile)
    assert_real_fixture("belief_merging");
}

#[test]
fn pointer_fixture_cbr_26_is_real() {
    // True pointer: "CASE-PHYSICIAN-2WK" — Aamodt & Plaza 1994, AI Communications 7(1), section 1.2 p. 2 (physician vignette); CBR cycle Figure 1, p. 8
    assert_real_fixture("cbr");
}

#[test]
fn pointer_fixture_circumscription_28_is_real() {
    // True pointer: "flies_tweety=true,flies_opus=false" — McCarthy 1980, Artificial Intelligence 13(1-2), pp. 27-39, Section 4 (birds fly unless abnormal; penguins are abnormal)
    assert_real_fixture("circumscription");
}

#[test]
fn pointer_fixture_clp_31_is_real() {
    // True pointer: "x=6,y=3" — Jaffar & Lassez 1987, POPL '87, pp. 111-119, Sections 1-2 (CLP scheme)
    assert_real_fixture("clp");
}

#[test]
fn pointer_fixture_construction_grammar_33_is_real() {
    // True pointer: "CAUSE-RECEIVE" — Goldberg 1995, Constructions, Univ. of Chicago Press, Ch. 1-2 (ditransitive construction, 'Pat faxed Bill the letter')
    assert_real_fixture("construction_grammar");
}

#[test]
fn pointer_fixture_contingent_plan_35_is_real() {
    // True pointer: "(sense check-dirt dirt (act suck (done)) (done))" — Russell & Norvig 2010 (AIMA 3rd ed.), §4.3.2, AND-OR search in the partially observable vacuum world
    assert_real_fixture("contingent_plan");
}

#[test]
fn pointer_fixture_csp_ac3_37_is_real() {
    // True pointer: "SAT: X=B, Y=G, Z=R" — Mackworth 1977, Artificial Intelligence 8(1), 99-118, Section 3 (AC-3) on the canonical inequality network
    assert_real_fixture("csp_ac3");
}

#[test]
fn pointer_fixture_ctl_check_39_is_real() {
    // True pointer: "verified" — Clarke, Emerson & Sistla 1986, ACM TOPLAS 8(2), 244-263, Sections 4-5 (fixed-point labeling; mutex AG ¬(c1∧c2))
    assert_real_fixture("ctl_check");
}

#[test]
fn pointer_fixture_default_logic_41_is_real() {
    // True pointer: "not_flies" — Reiter 1980, Artificial Intelligence 13(1-2), 81-132, Section 1.1 (birds-fly default; Tweety the penguin)
    assert_real_fixture("default_logic");
}

#[test]
fn pointer_fixture_dempster_shafer_43_is_real() {
    // True pointer: "0.99" — Shafer 1976, A Mathematical Theory of Evidence, Princeton UP, Ch. 1 / Ch. 4 (two-witness combination, reliability 0.9 each)
    assert_real_fixture("dempster_shafer");
}

#[test]
fn pointer_fixture_dendral_45_is_real() {
    // True pointer: "ketone-F1-C2H5-C2H5" — Feigenbaum, Buchanan & Lederberg 1971 (AIM-131), Tables 4-5 (pp. 21-22); zero-order pruning example p. 15
    assert_real_fixture("dendral");
}

#[test]
fn pointer_fixture_description_logic_47_is_real() {
    // True pointer: "Pericarditis ⊑ HeartDisease" — Baader, Brandt & Lutz 2005 (Pushing the EL Envelope, IJCAI), Section 1 medical-ontology example; completion rules Table 2 (CR1-CR4)
    assert_real_fixture("description_logic");
}

#[test]
fn pointer_fixture_ebl_49_is_real() {
    // True pointer: "safe_to_stack(?x,?y) :- weight(?x,light), weight(?y,heavy)" — Mitchell, Keller & Kedar-Cabelli 1986, Machine Learning 1(1):47-80, Section 3 SafeToStack worked example
    assert_real_fixture("ebl");
}

#[test]
fn pointer_fixture_eliza_51_is_real() {
    // True pointer: "IN WHAT WAY" — Weizenbaum 1966, CACM 9(1):36-45, opening dialogue p. 36; DOCTOR script Appendix pp. 44-45 (ALIKE rank 10 -> DIT)
    assert_real_fixture("eliza");
}

#[test]
fn pointer_fixture_episodic_memory_53_is_real() {
    // True pointer: "0.6111" — Tulving 1983 (Elements of Episodic Memory, Ch. 7, temporal organisation); Nuxoll & Laird 2007, AAAI 1560-1565, Section 3 (partial-match retrieval)
    assert_real_fixture("episodic_memory");
}

#[test]
fn pointer_fixture_event_calculus_55_is_real() {
    // True pointer: "lecturer@7=false" — Kowalski & Sergot 1986, New Generation Computing 4(1):67-95, Sections 2-5 hired/promoted narrative
    assert_real_fixture("event_calculus");
}

#[test]
fn pointer_fixture_frames_inheritance_57_is_real() {
    // True pointer: "legs=4 (walk_steps=2)" — Minsky 1974, MIT AI Lab Memo 306, frame systems / default assignments section
    assert_real_fixture("frames_inheritance");
}

#[test]
fn pointer_fixture_fuzzy_logic_59_is_real() {
    // True pointer: "41.66667" — Mamdani & Assilian 1975, Int. J. Man-Machine Studies 7(1), Section 3 (min-implication firing, max aggregation, discrete centroid defuzzification)
    assert_real_fixture("fuzzy_logic");
}

#[test]
fn pointer_fixture_gps_61_is_real() {
    // True pointer: "R6,R12" — Newell & Simon 1961, RAND P-2257, Fig. 3 (difference table) and Fig. 4 (GPS trace, first part of problem), pp. 3-15
    assert_real_fixture("gps");
}

#[test]
fn pointer_fixture_hearsay_63_is_real() {
    // True pointer: "[+ARE+ANY+BY+FEIGENBAUM+AND+FELDMAN+]*" — Erman, Hayes-Roth, Lesser & Reddy 1980, ACM Computing Surveys 12(2), Section 1.1-1.2, Figures 5a-5h, Step 38 (pp. 222-232)
    assert_real_fixture("hearsay");
}

#[test]
fn pointer_fixture_htn_planning_65_is_real() {
    // True pointer: "op:load,op:drive,op:unload" — Nau et al. 2003, SHOP2, JAIR 20:379-404, Section 2 (total-order decomposition) with the logistics/transport domain
    assert_real_fixture("htn_planning");
}

#[test]
fn pointer_fixture_ilp_67_is_real() {
    // True pointer: "female(V0), parent(V1,V0)" — Quinlan 1990, Machine Learning 5(3):239-266, Section 3 (FOIL information gain); the daughter/parent family example
    assert_real_fixture("ilp");
}

#[test]
fn pointer_fixture_ltl_monitor_69_is_real() {
    // True pointer: "progress_steps=4" — Havelund & Rosu 2001, ASE 2001 pp. 135-143, Section 4 (formula rewriting/progression) and Section 2 (finite-trace LTL semantics)
    assert_real_fixture("ltl_monitor");
}

#[test]
fn pointer_fixture_markov_logic_71_is_real() {
    // True pointer: "0.000000" — Richardson & Domingos 2006, Machine Learning 62(1-2):107-136, Table 1 / Fig. 1 (smokes/friends MLN, w=1.5 and w=1.1 clauses) grounded for {anna, bob}
    assert_real_fixture("markov_logic");
}

#[test]
fn pointer_fixture_mdp_73_is_real() {
    // True pointer: "1.8" — Bellman 1957, Dynamic Programming, Princeton Univ. Press, Ch. III–IV (functional equation / value iteration)
    assert_real_fixture("mdp");
}

#[test]
fn pointer_fixture_meta_reasoning_75_is_real() {
    // True pointer: "gentamicin" — Cox & Raja (eds.) 2011, Metareasoning: Thinking about Thinking, MIT Press, Ch. 1
    assert_real_fixture("meta_reasoning");
}

#[test]
fn pointer_fixture_morphological_77_is_real() {
    // True pointer: "thrust-augmentation-1=translatory-motion" — Zwicky, F. 1969, Discovery, Invention, Research Through the Morphological Approach, Macmillan — propulsive system morphology (1947 jet engine field)
    assert_real_fixture("morphological");
}

#[test]
fn pointer_fixture_mycin_79_is_real() {
    // True pointer: "0.7" — Shortliffe & Buchanan 1975, Math. Biosciences 23(3–4):351–379, §11.4 p.247 (MB[h,e]=0.7 for the streptococcus rule)
    assert_real_fixture("mycin");
}

#[test]
fn pointer_fixture_naive_physics_81_is_real() {
    // True pointer: "cup" — Hayes, P. J. 1985, Naive physics I: ontology for liquids, in Formal Theories of the Commonsense World pp.71–107, Ablex (§4–6, containment/support)
    assert_real_fixture("naive_physics");
}

#[test]
fn pointer_fixture_ocpm_route_discoverer_83_is_real() {
    // True pointer: "Create->Pay" — van der Aalst, W.M.P. 2019, Object-Centric Process Mining: Dealing with Divergence and Convergence — Route Discovery
    assert_real_fixture("ocpm_route_discoverer");
}

#[test]
fn pointer_fixture_partial_order_plan_85_is_real() {
    // True pointer: "put_c_from_a_on_table;put_b_on_c;put_a_on_b" — McAllester & Rosenblitt 1991, Systematic Nonlinear Planning, AAAI-91 pp.634–639 — Sussman anomaly / SNLP causal-link threat resolution
    assert_real_fixture("partial_order_plan");
}

#[test]
fn pointer_fixture_pomdp_87_is_real() {
    // True pointer: "0.850000" — Kaelbling, Littman & Cassandra 1998, Artificial Intelligence 101(1-2):99-134, §3 (tiger problem)
    assert_real_fixture("pomdp");
}

#[test]
fn pointer_fixture_problog_89_is_real() {
    // True pointer: "0.552000" — De Raedt, Kimmig & Toivonen 2007, IJCAI 2007 pp. 2468-2473, Section 2 (distribution semantics)
    assert_real_fixture("problog");
}

#[test]
fn pointer_fixture_prolog_91_is_real() {
    // True pointer: "bob-ann" — Kowalski 1974, IFIP Congress 74 pp. 569-574, Section 9 Figure 2 (parent/ancestor program)
    assert_real_fixture("prolog");
}

#[test]
fn pointer_fixture_qualitative_reason_93_is_real() {
    // True pointer: "+,0,-" — de Kleer & Brown 1984, Artificial Intelligence 24(1-3):7-83, Sections 1-3 (pressure-regulator valve confluence dQ = dP + dA)
    assert_real_fixture("qualitative_reason");
}

#[test]
fn pointer_fixture_rl_symbolic_95_is_real() {
    // True pointer: "0.9" — Watkins & Dayan 1992, Machine Learning 8(3-4):279-292, Theorem p. 281 (Q-learning convergence; Q*(s,a) = r + γ max Q*)
    assert_real_fixture("rl_symbolic");
}

#[test]
fn pointer_fixture_sat_cdcl_97_is_real() {
    // True pointer: "UNSAT" — Marques-Silva & Sakallah 1999, IEEE Trans. Computers 48(5):506-521, Section 3 (conflict analysis / non-chronological backtracking)
    assert_real_fixture("sat_cdcl");
}

#[test]
fn pointer_fixture_script_sam_99_is_real() {
    // True pointer: "sam:inferred:eat" — Schank & Abelson 1977, Scripts, Plans, Goals and Understanding, Chapter 3 (the $RESTAURANT script; John/lobster story)
    assert_real_fixture("script_sam");
}

#[test]
fn pointer_fixture_situation_calculus_101_is_real() {
    // True pointer: "on_a_table,on_b_table,clear_a,clear_b,handempty,color_b_red" — Reiter 1991, Sections 2-3 (successor-state axioms, blocks-world pickup/putdown example), in Lifschitz (Ed.), Papers in Honor of John McCarthy, pp. 359-380
    assert_real_fixture("situation_calculus");
}

#[test]
fn pointer_fixture_soar_103_is_real() {
    // True pointer: "op-move-blank-up" — Laird, Newell & Rosenbloom 1987, Artificial Intelligence 33(1), Section 2.3 (pp. 14-20), p. 17: single 'best' preference operator is selected; eight-puzzle Figures 3-5
    assert_real_fixture("soar");
}

#[test]
fn pointer_fixture_strips_105_is_real() {
    // True pointer: "turn-on-light,close-door1" — Fikes & Nilsson 1971, Artificial Intelligence 2(3-4), Section 2 (p. 191) — world model, goal G, operators O1..On; room-navigation domain of Section 3
    assert_real_fixture("strips");
}

#[test]
fn pointer_fixture_tableaux_107_is_real() {
    // True pointer: "valid" — Smullyan 1968, First-Order Logic, Part I Ch. II — Analytic Tableaux; F(A -> (B -> A)) closes using only alpha rules (beta_expansions = 0)
    assert_real_fixture("tableaux");
}

#[test]
fn pointer_fixture_triz_109_is_real() {
    // True pointer: "40,26" — Altshuller 1984, Creativity as an Exact Science, Contradiction Matrix (improving weight vs worsening strength, per fixture rule matrix_1_2)
    assert_real_fixture("triz");
}

#[test]
fn pointer_fixture_version_space_111_is_real() {
    // True pointer: "Sunny,Warm,?,Strong,?,?" — Mitchell 1982, Artificial Intelligence 18(2), Sections 3-4 (candidate-elimination); EnjoySport worked instance in Mitchell 1997 ML, Ch. 2, Tables 2.1/2.5
    assert_real_fixture("version_space");
}

