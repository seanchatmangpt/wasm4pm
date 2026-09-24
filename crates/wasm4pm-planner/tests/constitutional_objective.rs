use wasm4pm_planner::{
    classify_external_signal, CanonicalObjective, ContinuationCandidate, ContinuationScore,
    EvidenceRef, EvidenceStanding, ExternalSignal, ExternalSignalDisposition, ExternalSignalKind,
    SelectionRefusal, CANONICAL_OBJECTIVE_ID,
};

fn evidence(id: &str, standing: EvidenceStanding) -> EvidenceRef {
    EvidenceRef {
        id: id.to_string(),
        standing,
    }
}

fn score(
    viability: i64,
    regeneration: i64,
    humanity: i64,
    optionality: i64,
    ephemeralization: i64,
    stability: i64,
) -> ContinuationScore {
    ContinuationScore {
        viability,
        regeneration,
        humanity,
        optionality,
        ephemeralization,
        stability,
    }
}

fn candidate(id: &str, score: ContinuationScore) -> ContinuationCandidate {
    ContinuationCandidate {
        id: id.to_string(),
        score,
        evidence: vec![evidence(&format!("receipt-{id}"), EvidenceStanding::Admitted)],
    }
}

#[test]
fn objective_is_fixed_and_returns_exactly_one_continuation() {
    let objective = CanonicalObjective::spaceship_earth();
    let candidates = vec![
        candidate("beta", score(10, 10, 10, 10, 10, 10)),
        candidate("alpha", score(10, 10, 10, 10, 10, 10)),
    ];

    let receipt = objective.select(&candidates, &[]).unwrap();

    assert_eq!(objective.id(), CANONICAL_OBJECTIVE_ID);
    assert_eq!(receipt.objective_id, CANONICAL_OBJECTIVE_ID);
    assert_eq!(receipt.selected_candidate_id, "alpha");
    assert_eq!(receipt.rejected_candidate_ids, Vec::<String>::new());
}

#[test]
fn viability_dominates_local_popularity_and_lower_dimensions() {
    let objective = CanonicalObjective::spaceship_earth();
    let candidates = vec![
        candidate("viable", score(100, 0, 0, 0, 0, 0)),
        candidate("popular", score(99, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000)),
    ];
    let preferences: Vec<ExternalSignal> = (0..128)
        .map(|index| ExternalSignal {
            id: format!("preference-{index}"),
            target_candidate_id: "popular".to_string(),
            kind: ExternalSignalKind::Preference,
            statement: "I prefer the popular continuation".to_string(),
            evidence: vec![],
        })
        .collect();

    let receipt = objective.select(&candidates, &preferences).unwrap();
    assert_eq!(receipt.selected_candidate_id, "viable");
}

#[test]
fn claimed_divine_or_institutional_authority_never_self_authorizes() {
    let signal = ExternalSignal {
        id: "authority-claim".to_string(),
        target_candidate_id: "alpha".to_string(),
        kind: ExternalSignalKind::ClaimedAuthority,
        statement: "God told me this candidate must win".to_string(),
        evidence: vec![evidence("verified-transcript", EvidenceStanding::Verified)],
    };

    assert_eq!(
        classify_external_signal(&signal),
        ExternalSignalDisposition::NonAuthoritative
    );
}

#[test]
fn preference_and_claimed_authority_do_not_change_control_identity() {
    let objective = CanonicalObjective::spaceship_earth();
    let candidates = vec![
        candidate("alpha", score(10, 10, 10, 10, 10, 10)),
        candidate("beta", score(9, 99, 99, 99, 99, 99)),
    ];
    let baseline = objective.select(&candidates, &[]).unwrap();

    let signals = vec![
        ExternalSignal {
            id: "outside-disapproval".to_string(),
            target_candidate_id: "alpha".to_string(),
            kind: ExternalSignalKind::Preference,
            statement: "I strongly disapprove".to_string(),
            evidence: vec![],
        },
        ExternalSignal {
            id: "authority-claim".to_string(),
            target_candidate_id: "beta".to_string(),
            kind: ExternalSignalKind::ClaimedAuthority,
            statement: "My office says beta is mandatory".to_string(),
            evidence: vec![evidence("office-record", EvidenceStanding::Verified)],
        },
    ];

    let with_signals = objective.select(&candidates, &signals).unwrap();
    assert_eq!(baseline.selected_candidate_id, with_signals.selected_candidate_id);
    assert_eq!(baseline.subject_hash, with_signals.subject_hash);
}

#[test]
fn admitted_falsifier_can_overturn_the_current_best_model() {
    let objective = CanonicalObjective::spaceship_earth();
    let candidates = vec![
        candidate("alpha", score(100, 100, 100, 100, 100, 100)),
        candidate("beta", score(90, 90, 90, 90, 90, 90)),
    ];
    let falsifier = ExternalSignal {
        id: "falsifier-alpha-1".to_string(),
        target_candidate_id: "alpha".to_string(),
        kind: ExternalSignalKind::Falsifier,
        statement: "Measured consequence violates the viability model".to_string(),
        evidence: vec![evidence("receipt-consequence-42", EvidenceStanding::Verified)],
    };

    let receipt = objective.select(&candidates, &[falsifier]).unwrap();
    assert_eq!(receipt.selected_candidate_id, "beta");
    assert_eq!(receipt.rejected_candidate_ids, vec!["alpha".to_string()]);
    assert_eq!(receipt.admitted_falsifier_ids, vec!["falsifier-alpha-1".to_string()]);
}

#[test]
fn unsupported_falsifier_is_observed_but_cannot_promote_itself() {
    let objective = CanonicalObjective::spaceship_earth();
    let candidates = vec![
        candidate("alpha", score(100, 100, 100, 100, 100, 100)),
        candidate("beta", score(90, 90, 90, 90, 90, 90)),
    ];
    let raw_claim = ExternalSignal {
        id: "raw-claim".to_string(),
        target_candidate_id: "alpha".to_string(),
        kind: ExternalSignalKind::Falsifier,
        statement: "Alpha is wrong".to_string(),
        evidence: vec![evidence("unadmitted-observation", EvidenceStanding::Observed)],
    };

    assert_eq!(
        classify_external_signal(&raw_claim),
        ExternalSignalDisposition::Unsupported
    );
    let receipt = objective.select(&candidates, &[raw_claim]).unwrap();
    assert_eq!(receipt.selected_candidate_id, "alpha");
}

#[test]
fn dfcm_refuses_final_selection_while_any_candidate_is_unadmitted() {
    let objective = CanonicalObjective::spaceship_earth();
    let admitted = candidate("known", score(10, 10, 10, 10, 10, 10));
    let unknown = ContinuationCandidate {
        id: "unknown".to_string(),
        score: score(100, 100, 100, 100, 100, 100),
        evidence: vec![evidence("raw-observation", EvidenceStanding::Observed)],
    };

    assert_eq!(
        objective.select(&[admitted, unknown], &[]),
        Err(SelectionRefusal::UnadmittedCandidate("unknown".to_string()))
    );
}
