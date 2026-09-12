//! Deterministic, read-only command projection over admitted machine state.
//!
//! This module composes the existing Hearsay-II blackboard and ELIZA frame
//! engines for one deliberately narrow purpose: turn already-admitted machine
//! state into human-readable text without placing generative AI, probability,
//! or presentation preferences in the control path.
//!
//! Invariants:
//! - Bronze/`Observed` facts are refused. Projection starts at Silver/`Admitted`.
//! - Hearsay uses fixed certainty `1.0`; ordering is encoded symbolically.
//! - ELIZA selects a deterministic presentation template.
//! - Strategist and DISC profiles affect presentation only.
//! - `control_subject_hash` excludes every presentation preference.
//! - The returned effect is always [`ProjectionEffect::ReadOnly`].

use crate::breeds::{
    frame::Eliza, hearsay::Hearsay, BreedInput, CognitionBreed, Fact, Rule,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fmt;

/// Epistemic/operational standing used by the medallion control pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum MedallionStage {
    /// Raw observation (Bronze). Not eligible for command projection.
    Observed,
    /// Canonical admitted fact (Silver).
    Admitted,
    /// Qualified executable knowledge (Gold).
    Qualified,
    /// Qualified action admitted by an explicit authority boundary.
    Authorized,
    /// Authorized action that actually executed.
    Executed,
    /// Executed consequence with verification evidence.
    Verified,
}

impl MedallionStage {
    fn as_str(self) -> &'static str {
        match self {
            Self::Observed => "observed",
            Self::Admitted => "admitted",
            Self::Qualified => "qualified",
            Self::Authorized => "authorized",
            Self::Executed => "executed",
            Self::Verified => "verified",
        }
    }
}

/// Typed fact categories available to the human-readable projection layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProjectionFactKind {
    /// Declared campaign objective.
    Objective,
    /// Control-system decision already selected outside this module.
    Decision,
    /// Constraint affecting the current situation.
    Constraint,
    /// Authority-envelope fact or refusal.
    Authority,
    /// Verification, provenance, or receipt evidence.
    Evidence,
    /// Information about future options destroyed or preserved by commitment.
    OptionLoss,
    /// Explicit unresolved/unknown state.
    Unknown,
    /// Observed consequence of prior execution.
    Consequence,
    /// Continuity, resilience, or stability information.
    Continuity,
}

impl ProjectionFactKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Objective => "objective",
            Self::Decision => "decision",
            Self::Constraint => "constraint",
            Self::Authority => "authority",
            Self::Evidence => "evidence",
            Self::OptionLoss => "option-loss",
            Self::Unknown => "unknown",
            Self::Consequence => "consequence",
            Self::Continuity => "continuity",
        }
    }
}

/// Historical/strategic vocabulary used only to shape presentation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrategistProfile {
    /// Neutral operational language.
    Plain,
    /// Decisive-point, maneuver, concentration, and campaign language.
    Napoleon,
    /// Information advantage, indirectness, and avoidable-conflict language.
    SunTzu,
    /// Friction, uncertainty, purpose, and constraint language.
    Clausewitz,
    /// Orientation, tempo, adaptation, and feedback language.
    Boyd,
}

impl StrategistProfile {
    fn as_str(self) -> &'static str {
        match self {
            Self::Plain => "plain",
            Self::Napoleon => "napoleon",
            Self::SunTzu => "sun-tzu",
            Self::Clausewitz => "clausewitz",
            Self::Boyd => "boyd",
        }
    }
}

/// DISC vector used as a human-readable presentation preference only.
///
/// Values are constrained to `0..=10`. This type makes no psychological
/// validity claim; it is a deterministic projection parameter. It is never
/// included in the control-subject hash and cannot alter authority or actuation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscVector {
    /// Dominance component.
    pub d: u8,
    /// Influence component.
    pub i: u8,
    /// Steadiness component.
    pub s: u8,
    /// Conscientiousness component.
    pub c: u8,
}

impl DiscVector {
    /// Construct a validated `0..=10` DISC vector.
    pub fn new(d: u8, i: u8, s: u8, c: u8) -> Result<Self, ProjectionRefusal> {
        let vector = Self { d, i, s, c };
        vector.validate()?;
        Ok(vector)
    }

    /// Return the arithmetic complement on the 0–10 scale.
    ///
    /// For example, `10/8/4/4` becomes `0/2/6/6`. This is a presentation
    /// transform only; it does not change the machine policy.
    #[must_use]
    pub fn complement(self) -> Self {
        Self {
            d: 10 - self.d,
            i: 10 - self.i,
            s: 10 - self.s,
            c: 10 - self.c,
        }
    }

    fn validate(self) -> Result<(), ProjectionRefusal> {
        for (dimension, value) in [("D", self.d), ("I", self.i), ("S", self.s), ("C", self.c)] {
            if value > 10 {
                return Err(ProjectionRefusal::InvalidDisc { dimension, value });
            }
        }
        Ok(())
    }

    fn dominant_emphasis(self) -> &'static str {
        // Tie order intentionally prefers evidence/continuity over urgency.
        if self.c >= self.s && self.c >= self.d && self.c >= self.i {
            "evidence"
        } else if self.s >= self.d && self.s >= self.i {
            "continuity"
        } else if self.d >= self.i {
            "action"
        } else {
            "opportunity"
        }
    }
}

/// Human-facing projection configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionProfile {
    /// Strategic vocabulary/ordering profile.
    pub strategist: StrategistProfile,
    /// DISC presentation vector.
    pub disc: DiscVector,
}

/// One typed, provenance-bound fact made available to projection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionFact {
    /// Stable fact identifier.
    pub id: String,
    /// Semantic category used for deterministic salience ordering.
    pub kind: ProjectionFactKind,
    /// Human-readable value already grounded by the upstream system.
    pub value: String,
    /// Minimum medallion standing of this fact.
    pub stage: MedallionStage,
    /// Receipt/provenance identifier binding the fact to evidence.
    pub source_receipt: String,
}

/// Machine state supplied to the presentation boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandProjectionInput {
    /// Stable campaign or command-context identifier.
    pub campaign_id: String,
    /// Decision already selected by the control system.
    pub control_decision: String,
    /// Current machine standing, such as `PARTIAL_ALIVE`, `ALIVE`, or `REFUSED`.
    pub standing: String,
    /// Facts eligible for human-readable projection.
    pub facts: Vec<ProjectionFact>,
}

/// Effect class for a command projection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProjectionEffect {
    /// The projection can display information but cannot mutate machine state.
    ReadOnly,
}

/// Deterministic human-readable projection result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandProjection {
    /// Strategist vocabulary used for this rendering.
    pub strategist: StrategistProfile,
    /// Human-readable deterministic text.
    pub text: String,
    /// Fact selected by Hearsay-style blackboard salience as the headline.
    pub headline_fact_id: String,
    /// Facts directly represented in the output text.
    pub cited_fact_ids: Vec<String>,
    /// Evidence receipts directly represented in the output text.
    pub source_receipts: Vec<String>,
    /// BLAKE3 identity of control state, deliberately independent of persona/DISC.
    pub control_subject_hash: String,
    /// BLAKE3 identity of this exact presentation.
    pub projection_hash: String,
    /// Exact Hearsay blackboard hypothesis selected during projection.
    pub blackboard_selection: String,
    /// Exact ELIZA template identifier selected during projection.
    pub template_id: String,
    /// Proof that this result is presentation-only.
    pub effect: ProjectionEffect,
}

/// Typed refusal from the deterministic projection boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectionRefusal {
    /// DISC values must remain on the declared 0–10 scale.
    InvalidDisc {
        /// Invalid dimension.
        dimension: &'static str,
        /// Invalid value.
        value: u8,
    },
    /// Required command input was empty.
    MissingInput(&'static str),
    /// Projection requires at least one fact.
    EmptyFacts,
    /// Duplicate fact ids would make citation/replay ambiguous.
    DuplicateFactId(String),
    /// Raw Bronze observations cannot be presented as admitted command state.
    UnadmittedFact(String),
    /// A fact lacks a required field.
    MissingFactField {
        /// Fact identifier.
        fact_id: String,
        /// Missing field name.
        field: &'static str,
    },
    /// Existing Hearsay implementation refused or failed.
    Hearsay(String),
    /// Hearsay returned a selection that did not bind to an input fact.
    MissingHeadline(String),
    /// Existing ELIZA implementation refused or failed.
    Eliza(String),
}

impl fmt::Display for ProjectionRefusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDisc { dimension, value } => {
                write!(f, "DISC {dimension} value {value} is outside 0..=10")
            }
            Self::MissingInput(field) => write!(f, "missing command input: {field}"),
            Self::EmptyFacts => f.write_str("projection requires at least one admitted fact"),
            Self::DuplicateFactId(id) => write!(f, "duplicate projection fact id: {id}"),
            Self::UnadmittedFact(id) => {
                write!(f, "Bronze/Observed fact is not eligible for projection: {id}")
            }
            Self::MissingFactField { fact_id, field } => {
                write!(f, "projection fact {fact_id} is missing {field}")
            }
            Self::Hearsay(message) => write!(f, "Hearsay projection failed: {message}"),
            Self::MissingHeadline(selection) => {
                write!(f, "Hearsay selection did not bind to an input fact: {selection}")
            }
            Self::Eliza(message) => write!(f, "ELIZA template selection failed: {message}"),
        }
    }
}

impl std::error::Error for ProjectionRefusal {}

/// Project already-admitted machine state into deterministic human-readable text.
///
/// Hearsay-II is used only as a deterministic blackboard salience mechanism:
/// every knowledge-source certainty is exactly `1.0`, and symbolic rank is
/// encoded in the posted hypothesis. ELIZA is used only to select a fixed
/// template identifier. No output from this function has actuation authority.
pub fn project_command(
    input: &CommandProjectionInput,
    profile: ProjectionProfile,
) -> Result<CommandProjection, ProjectionRefusal> {
    validate_input(input, profile)?;

    let control_subject_hash = hash_control_subject(input);
    let (blackboard_selection, headline_fact) = select_headline(input, profile)?;
    let template_id = select_template(profile.strategist)?;
    let text = render_template(&template_id, headline_fact, input, profile.disc);
    let cited_fact_ids = vec![headline_fact.id.clone()];
    let source_receipts = vec![headline_fact.source_receipt.clone()];
    let projection_hash = hash_projection(
        &control_subject_hash,
        profile,
        &blackboard_selection,
        &template_id,
        &text,
    );

    Ok(CommandProjection {
        strategist: profile.strategist,
        text,
        headline_fact_id: headline_fact.id.clone(),
        cited_fact_ids,
        source_receipts,
        control_subject_hash,
        projection_hash,
        blackboard_selection,
        template_id,
        effect: ProjectionEffect::ReadOnly,
    })
}

fn validate_input(
    input: &CommandProjectionInput,
    profile: ProjectionProfile,
) -> Result<(), ProjectionRefusal> {
    profile.disc.validate()?;
    if input.campaign_id.trim().is_empty() {
        return Err(ProjectionRefusal::MissingInput("campaign_id"));
    }
    if input.control_decision.trim().is_empty() {
        return Err(ProjectionRefusal::MissingInput("control_decision"));
    }
    if input.standing.trim().is_empty() {
        return Err(ProjectionRefusal::MissingInput("standing"));
    }
    if input.facts.is_empty() {
        return Err(ProjectionRefusal::EmptyFacts);
    }

    let mut ids = BTreeSet::new();
    for fact in &input.facts {
        if fact.id.trim().is_empty() {
            return Err(ProjectionRefusal::MissingFactField {
                fact_id: "<empty>".to_string(),
                field: "id",
            });
        }
        if !ids.insert(fact.id.clone()) {
            return Err(ProjectionRefusal::DuplicateFactId(fact.id.clone()));
        }
        if fact.stage == MedallionStage::Observed {
            return Err(ProjectionRefusal::UnadmittedFact(fact.id.clone()));
        }
        if fact.value.trim().is_empty() {
            return Err(ProjectionRefusal::MissingFactField {
                fact_id: fact.id.clone(),
                field: "value",
            });
        }
        if fact.source_receipt.trim().is_empty() {
            return Err(ProjectionRefusal::MissingFactField {
                fact_id: fact.id.clone(),
                field: "source_receipt",
            });
        }
    }
    Ok(())
}

fn select_headline<'a>(
    input: &'a CommandProjectionInput,
    profile: ProjectionProfile,
) -> Result<(String, &'a ProjectionFact), ProjectionRefusal> {
    let facts = input
        .facts
        .iter()
        .map(|fact| Fact {
            key: "projection".to_string(),
            value: fact.id.clone(),
        })
        .collect();

    let rules = input
        .facts
        .iter()
        .map(|fact| {
            let rank = presentation_rank(profile, fact.kind);
            Rule {
                id: format!("projection-{rank:04}-{}", fact.id),
                premise: vec![format!("projection:{}", fact.id)],
                conclusion: format!("headline:{rank:04}:{}", fact.id),
                // Deliberately fixed: Hearsay is serving as a blackboard/agenda,
                // not as a probabilistic estimator in this boundary.
                certainty: 1.0,
            }
        })
        .collect();

    let hearsay_input = BreedInput {
        intent: "deterministic command projection".to_string(),
        facts,
        rules,
        ..BreedInput::default()
    };
    Hearsay
        .preconditions(&hearsay_input)
        .map_err(ProjectionRefusal::Hearsay)?;
    let output = Hearsay
        .run(&hearsay_input)
        .map_err(|error| ProjectionRefusal::Hearsay(error.to_string()))?;
    let selection = output
        .selected
        .ok_or_else(|| ProjectionRefusal::MissingHeadline("<none>".to_string()))?;
    let fact_id = selection
        .splitn(3, ':')
        .nth(2)
        .ok_or_else(|| ProjectionRefusal::MissingHeadline(selection.clone()))?;
    let fact = input
        .facts
        .iter()
        .find(|fact| fact.id == fact_id)
        .ok_or_else(|| ProjectionRefusal::MissingHeadline(selection.clone()))?;
    Ok((selection, fact))
}

fn presentation_rank(profile: ProjectionProfile, kind: ProjectionFactKind) -> u16 {
    let base = strategist_rank(profile.strategist, kind);
    let disc = disc_score(profile.disc, kind);
    base * 16 + u16::from(10 - disc)
}

fn disc_score(disc: DiscVector, kind: ProjectionFactKind) -> u8 {
    match kind {
        ProjectionFactKind::Decision => disc.d,
        ProjectionFactKind::Objective => disc.i.max(disc.d),
        ProjectionFactKind::Continuity | ProjectionFactKind::Consequence => disc.s,
        ProjectionFactKind::Constraint
        | ProjectionFactKind::Authority
        | ProjectionFactKind::Evidence
        | ProjectionFactKind::OptionLoss
        | ProjectionFactKind::Unknown => disc.c,
    }
}

fn strategist_rank(strategist: StrategistProfile, kind: ProjectionFactKind) -> u16 {
    use ProjectionFactKind::{
        Authority, Consequence, Constraint, Continuity, Decision, Evidence, Objective, OptionLoss,
        Unknown,
    };
    match strategist {
        StrategistProfile::Plain => match kind {
            Decision => 0,
            Authority => 1,
            Evidence => 2,
            Unknown => 3,
            Constraint => 4,
            Consequence => 5,
            OptionLoss => 6,
            Objective => 7,
            Continuity => 8,
        },
        StrategistProfile::Napoleon => match kind {
            Decision => 0,
            OptionLoss => 1,
            Objective => 2,
            Authority => 3,
            Consequence => 4,
            Constraint => 5,
            Evidence => 6,
            Unknown => 7,
            Continuity => 8,
        },
        StrategistProfile::SunTzu => match kind {
            Unknown => 0,
            Constraint => 1,
            OptionLoss => 2,
            Authority => 3,
            Evidence => 4,
            Objective => 5,
            Decision => 6,
            Continuity => 7,
            Consequence => 8,
        },
        StrategistProfile::Clausewitz => match kind {
            Constraint => 0,
            Unknown => 1,
            Objective => 2,
            Authority => 3,
            Decision => 4,
            Consequence => 5,
            Evidence => 6,
            OptionLoss => 7,
            Continuity => 8,
        },
        StrategistProfile::Boyd => match kind {
            Consequence => 0,
            Unknown => 1,
            Decision => 2,
            Constraint => 3,
            OptionLoss => 4,
            Authority => 5,
            Objective => 6,
            Evidence => 7,
            Continuity => 8,
        },
    }
}

fn select_template(strategist: StrategistProfile) -> Result<String, ProjectionRefusal> {
    let template_facts = [
        ("profile plain", "plain"),
        ("profile napoleon", "napoleon"),
        ("profile sun-tzu", "sun-tzu"),
        ("profile clausewitz", "clausewitz"),
        ("profile boyd", "boyd"),
    ]
    .into_iter()
    .map(|(pattern, template)| Fact {
        key: "frame.pattern".to_string(),
        value: format!("{pattern}||{template}"),
    })
    .collect();

    let eliza_input = BreedInput {
        intent: format!("profile {}", strategist.as_str()),
        facts: template_facts,
        ..BreedInput::default()
    };
    Eliza
        .preconditions(&eliza_input)
        .map_err(ProjectionRefusal::Eliza)?;
    let output = Eliza
        .run(&eliza_input)
        .map_err(|error| ProjectionRefusal::Eliza(error.to_string()))?;
    Ok(output.explanation)
}

fn render_template(
    template_id: &str,
    headline: &ProjectionFact,
    input: &CommandProjectionInput,
    disc: DiscVector,
) -> String {
    let lead = match template_id {
        "napoleon" => "Decisive point",
        "sun-tzu" => "Situation",
        "clausewitz" => "Friction",
        "boyd" => "Orientation",
        _ => "Status",
    };
    let emphasis = match disc.dominant_emphasis() {
        "evidence" => "Evidence first: the projection is bound to the cited receipt.",
        "continuity" => "Continuity first: presentation cannot mutate control state.",
        "action" => "Action first: the control decision was selected before presentation.",
        _ => "Opportunity first: presentation changes framing, not the machine decision.",
    };
    format!(
        "{lead}: {} Control decision: {}. Standing: {}. Evidence: {}. {emphasis}",
        headline.value, input.control_decision, input.standing, headline.source_receipt
    )
}

fn hash_control_subject(input: &CommandProjectionInput) -> String {
    let mut hasher = blake3::Hasher::new();
    feed(&mut hasher, &input.campaign_id);
    feed(&mut hasher, &input.control_decision);
    feed(&mut hasher, &input.standing);
    let mut facts: Vec<&ProjectionFact> = input.facts.iter().collect();
    facts.sort_by(|left, right| left.id.cmp(&right.id));
    for fact in facts {
        feed(&mut hasher, &fact.id);
        feed(&mut hasher, fact.kind.as_str());
        feed(&mut hasher, &fact.value);
        feed(&mut hasher, fact.stage.as_str());
        feed(&mut hasher, &fact.source_receipt);
    }
    hasher.finalize().to_hex().to_string()
}

fn hash_projection(
    control_subject_hash: &str,
    profile: ProjectionProfile,
    blackboard_selection: &str,
    template_id: &str,
    text: &str,
) -> String {
    let mut hasher = blake3::Hasher::new();
    feed(&mut hasher, control_subject_hash);
    feed(&mut hasher, profile.strategist.as_str());
    for value in [profile.disc.d, profile.disc.i, profile.disc.s, profile.disc.c] {
        hasher.update(&[value]);
    }
    feed(&mut hasher, blackboard_selection);
    feed(&mut hasher, template_id);
    feed(&mut hasher, text);
    hasher.finalize().to_hex().to_string()
}

fn feed(hasher: &mut blake3::Hasher, value: &str) {
    let len = value.len() as u64;
    hasher.update(&len.to_le_bytes());
    hasher.update(value.as_bytes());
}
