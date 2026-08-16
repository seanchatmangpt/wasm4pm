//! wasm4auto — second-order cybernetics inside wasm4pm.
//!
//! This module is deliberately *not* another first-order MAPE-K executor.
//! `wasm4pm` already owns observation, diagnosis, self-healing and bounded
//! internal action dispatch.  This layer asks the second-order questions:
//!
//! - Is the plant still inside an admitted viability envelope?
//! - Does a robust controlled-invariant viability kernel exist?
//! - Does the regulator have enough response variety for admitted disturbances?
//! - Is the regulator's internal model adequate on the domain it claims?
//! - What is the least-authority adaptation intent justified by the evidence?
//! - When first-order regulation fails, should the controller be reconstituted?
//!
//! The implementation is finite, deterministic and fail-closed.  It encodes a
//! robust viability game (`exists action; for all disturbances; for all admitted
//! nondeterministic successors`) and computes the greatest controlled-invariant
//! subset by monotone fixed-point elimination.  Missing transition knowledge is
//! refused rather than interpreted as a safe transition.
//!
//! ## Authority boundary
//!
//! This module can manufacture *intents* only. It has no provider handle, no
//! filesystem/network actuator, and no representation of consequential DO
//! authority.  `Execute_MAPE-K != DO_BRCE`: downstream admission and BRCE remain
//! responsible for any real-world consequence.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;

pub const CAPABILITY_ID: &str = "wasm4auto";
pub const CONSEQUENTIAL_DO_AUTHORITY: bool = false;

pub type StateId = u32;
pub type ActionId = u32;
pub type DisturbanceId = u32;

/// Explicit computational fence for finite cybernetic analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComputationBudget {
    pub max_states: usize,
    pub max_actions: usize,
    pub max_disturbances: usize,
    pub max_transition_records: usize,
    pub max_transition_cells: usize,
    pub max_iterations: usize,
}

impl ComputationBudget {
    #[must_use]
    pub const fn new(
        max_states: usize,
        max_actions: usize,
        max_disturbances: usize,
        max_transition_records: usize,
        max_transition_cells: usize,
        max_iterations: usize,
    ) -> Self {
        Self {
            max_states,
            max_actions,
            max_disturbances,
            max_transition_records,
            max_transition_cells,
            max_iterations,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum AutonomicError {
    #[error("REFUSED:EMPTY_STATE_SPACE")]
    EmptyStateSpace,
    #[error("REFUSED:EMPTY_ACTION_SPACE")]
    EmptyActionSpace,
    #[error("REFUSED:EMPTY_DISTURBANCE_SPACE")]
    EmptyDisturbanceSpace,
    #[error("REFUSED:ZERO_COMPUTATION_BUDGET")]
    ZeroComputationBudget,
    #[error("REFUSED:BUDGET_EXCEEDED:{dimension}:observed={observed}:limit={limit}")]
    BudgetExceeded {
        dimension: &'static str,
        observed: usize,
        limit: usize,
    },
    #[error("REFUSED:UNKNOWN_STATE:{0}")]
    UnknownState(StateId),
    #[error("REFUSED:UNKNOWN_ACTION:{0}")]
    UnknownAction(ActionId),
    #[error("REFUSED:UNKNOWN_DISTURBANCE:{0}")]
    UnknownDisturbance(DisturbanceId),
    #[error("REFUSED:INCOMPLETE_TRANSITION_RELATION:state={state}:action={action}:disturbance={disturbance}")]
    IncompleteTransitionRelation {
        state: StateId,
        action: ActionId,
        disturbance: DisturbanceId,
    },
    #[error("REFUSED:ITERATION_BUDGET_EXCEEDED:observed={observed}:limit={limit}")]
    IterationBudgetExceeded { observed: usize, limit: usize },
    #[error("REFUSED:EMPTY_VIABILITY_ENVELOPE")]
    EmptyViabilityEnvelope,
    #[error("REFUSED:INVALID_ENVELOPE_DIMENSION:{dimension}:lower={lower}:upper={upper}")]
    InvalidEnvelopeDimension {
        dimension: String,
        lower: i64,
        upper: i64,
    },
    #[error("REFUSED:DUPLICATE_ENVELOPE_DIMENSION:{0}")]
    DuplicateEnvelopeDimension(String),
    #[error("REFUSED:MISSING_MEASUREMENT:{0}")]
    MissingMeasurement(String),
    #[error("REFUSED:DUPLICATE_DISTURBANCE_REQUIREMENT:{0}")]
    DuplicateDisturbanceRequirement(DisturbanceId),
    #[error("REFUSED:MISSING_DISTURBANCE_REQUIREMENT:{0}")]
    MissingDisturbanceRequirement(DisturbanceId),
    #[error("REFUSED:EMPTY_RESPONSE_SET:{0}")]
    EmptyResponseSet(DisturbanceId),
    #[error("REFUSED:EMPTY_REGULATOR_ACTION_SET")]
    EmptyRegulatorActionSet,
    #[error("REFUSED:MODEL_PREDICTION_OUTSIDE_ADMITTED_ACTIONS:{0}")]
    ModelPredictionOutsideAdmittedActions(ActionId),
    #[error("REFUSED:EMPTY_REGULATOR_ID")]
    EmptyRegulatorId,
    #[error("REFUSED:EMPTY_CONTRACT_ID")]
    EmptyContractId,
    #[error("REFUSED:EMPTY_RECEIPT_SUBJECT")]
    EmptyReceiptSubject,
    #[error("REFUSED:DUPLICATE_REGULATOR_NODE:{0}")]
    DuplicateRegulatorNode(String),
    #[error("REFUSED:EMPTY_REGULATOR_NODE_ID")]
    EmptyRegulatorNodeId,
    #[error("REFUSED:UNKNOWN_REGULATOR_PARENT:node={node}:parent={parent}")]
    UnknownRegulatorParent { node: String, parent: String },
    #[error("REFUSED:RECURSIVE_REGULATOR_CYCLE:{0}")]
    RecursiveRegulatorCycle(String),
    #[error("REFUSED:RECURSIVE_REGULATOR_ROOT_COUNT:{0}")]
    RecursiveRegulatorRootCount(usize),
    #[error("REFUSED:VSM_PROFILE_INCOMPLETE:node={node}:missing={missing:?}")]
    VsmProfileIncomplete {
        node: String,
        missing: Vec<VsmRole>,
    },
    #[error("REFUSED:SERIALIZATION_FAILURE:{0}")]
    SerializationFailure(String),
}

/// One admitted plant transition. Multiple records with the same `(from,
/// action, disturbance)` are interpreted as admitted nondeterminism; robust
/// viability requires *all* such successors to remain viable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlantTransition {
    pub from: StateId,
    pub action: ActionId,
    pub disturbance: DisturbanceId,
    pub to: StateId,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TransitionKey {
    pub state: StateId,
    pub action: ActionId,
    pub disturbance: DisturbanceId,
}

/// Finite plant used by the viability and Good-Regulator courts.
#[derive(Debug, Clone)]
pub struct BoundedPlant {
    states: BTreeSet<StateId>,
    actions: BTreeSet<ActionId>,
    disturbances: BTreeSet<DisturbanceId>,
    transitions: BTreeMap<TransitionKey, BTreeSet<StateId>>,
    budget: ComputationBudget,
}

impl BoundedPlant {
    pub fn new(
        states: Vec<StateId>,
        actions: Vec<ActionId>,
        disturbances: Vec<DisturbanceId>,
        transitions: Vec<PlantTransition>,
        budget: ComputationBudget,
    ) -> Result<Self, AutonomicError> {
        if [
            budget.max_states,
            budget.max_actions,
            budget.max_disturbances,
            budget.max_transition_records,
            budget.max_transition_cells,
            budget.max_iterations,
        ]
        .contains(&0)
        {
            return Err(AutonomicError::ZeroComputationBudget);
        }

        let states: BTreeSet<_> = states.into_iter().collect();
        let actions: BTreeSet<_> = actions.into_iter().collect();
        let disturbances: BTreeSet<_> = disturbances.into_iter().collect();

        if states.is_empty() {
            return Err(AutonomicError::EmptyStateSpace);
        }
        if actions.is_empty() {
            return Err(AutonomicError::EmptyActionSpace);
        }
        if disturbances.is_empty() {
            return Err(AutonomicError::EmptyDisturbanceSpace);
        }
        Self::check_bound("states", states.len(), budget.max_states)?;
        Self::check_bound("actions", actions.len(), budget.max_actions)?;
        Self::check_bound(
            "disturbances",
            disturbances.len(),
            budget.max_disturbances,
        )?;
        Self::check_bound(
            "transition_records",
            transitions.len(),
            budget.max_transition_records,
        )?;

        let cells = states
            .len()
            .checked_mul(actions.len())
            .and_then(|v| v.checked_mul(disturbances.len()))
            .unwrap_or(usize::MAX);
        Self::check_bound("transition_cells", cells, budget.max_transition_cells)?;

        let mut relation = BTreeMap::<TransitionKey, BTreeSet<StateId>>::new();
        for t in transitions {
            if !states.contains(&t.from) {
                return Err(AutonomicError::UnknownState(t.from));
            }
            if !states.contains(&t.to) {
                return Err(AutonomicError::UnknownState(t.to));
            }
            if !actions.contains(&t.action) {
                return Err(AutonomicError::UnknownAction(t.action));
            }
            if !disturbances.contains(&t.disturbance) {
                return Err(AutonomicError::UnknownDisturbance(t.disturbance));
            }
            relation
                .entry(TransitionKey {
                    state: t.from,
                    action: t.action,
                    disturbance: t.disturbance,
                })
                .or_default()
                .insert(t.to);
        }

        Ok(Self {
            states,
            actions,
            disturbances,
            transitions: relation,
            budget,
        })
    }

    fn check_bound(
        dimension: &'static str,
        observed: usize,
        limit: usize,
    ) -> Result<(), AutonomicError> {
        if observed > limit {
            return Err(AutonomicError::BudgetExceeded {
                dimension,
                observed,
                limit,
            });
        }
        Ok(())
    }

    pub fn validate_totality(&self) -> Result<(), AutonomicError> {
        for &state in &self.states {
            for &action in &self.actions {
                for &disturbance in &self.disturbances {
                    let key = TransitionKey {
                        state,
                        action,
                        disturbance,
                    };
                    if !self.transitions.contains_key(&key) {
                        return Err(AutonomicError::IncompleteTransitionRelation {
                            state,
                            action,
                            disturbance,
                        });
                    }
                }
            }
        }
        Ok(())
    }

    #[must_use]
    pub fn states(&self) -> &BTreeSet<StateId> {
        &self.states
    }

    #[must_use]
    pub fn actions(&self) -> &BTreeSet<ActionId> {
        &self.actions
    }

    #[must_use]
    pub fn disturbances(&self) -> &BTreeSet<DisturbanceId> {
        &self.disturbances
    }

    fn successors(&self, key: &TransitionKey) -> Option<&BTreeSet<StateId>> {
        self.transitions.get(key)
    }

    fn robust_action_for(
        &self,
        state: StateId,
        candidate_kernel: &BTreeSet<StateId>,
    ) -> Option<ActionId> {
        self.actions.iter().copied().find(|&action| {
            self.disturbances.iter().all(|&disturbance| {
                let key = TransitionKey {
                    state,
                    action,
                    disturbance,
                };
                self.successors(&key)
                    .map(|successors| {
                        !successors.is_empty()
                            && successors
                                .iter()
                                .all(|successor| candidate_kernel.contains(successor))
                    })
                    .unwrap_or(false)
            })
        })
    }

    /// Compute the robust viability kernel as a greatest fixed point.
    ///
    /// A state survives iff there exists one admitted action such that, for
    /// every admitted disturbance and every admitted nondeterministic successor,
    /// the next state remains in the candidate kernel.
    pub fn viability_kernel(
        &self,
        safe_states: &BTreeSet<StateId>,
    ) -> Result<ViabilityKernel, AutonomicError> {
        self.validate_totality()?;
        for &state in safe_states {
            if !self.states.contains(&state) {
                return Err(AutonomicError::UnknownState(state));
            }
        }

        let mut kernel = safe_states.clone();
        for iteration in 1..=self.budget.max_iterations {
            let next: BTreeSet<_> = kernel
                .iter()
                .copied()
                .filter(|state| self.robust_action_for(*state, &kernel).is_some())
                .collect();

            if next == kernel {
                let policy = kernel
                    .iter()
                    .filter_map(|&state| {
                        self.robust_action_for(state, &kernel)
                            .map(|action| (state, action))
                    })
                    .collect();
                return Ok(ViabilityKernel {
                    states: kernel,
                    robust_policy: policy,
                    iterations: iteration,
                });
            }
            kernel = next;
        }

        Err(AutonomicError::IterationBudgetExceeded {
            observed: self.budget.max_iterations.saturating_add(1),
            limit: self.budget.max_iterations,
        })
    }

    fn digest(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update(b"wasm4pm.autonomic.plant/v1");
        hasher.update(b"states");
        feed_u64(&mut hasher, self.states.len() as u64);
        for state in &self.states {
            feed_u64(&mut hasher, *state as u64);
        }
        hasher.update(b"actions");
        feed_u64(&mut hasher, self.actions.len() as u64);
        for action in &self.actions {
            feed_u64(&mut hasher, *action as u64);
        }
        hasher.update(b"disturbances");
        feed_u64(&mut hasher, self.disturbances.len() as u64);
        for disturbance in &self.disturbances {
            feed_u64(&mut hasher, *disturbance as u64);
        }
        hasher.update(b"transitions");
        feed_u64(&mut hasher, self.transitions.len() as u64);
        for (key, successors) in &self.transitions {
            feed_u64(&mut hasher, key.state as u64);
            feed_u64(&mut hasher, key.action as u64);
            feed_u64(&mut hasher, key.disturbance as u64);
            feed_u64(&mut hasher, successors.len() as u64);
            for successor in successors {
                feed_u64(&mut hasher, *successor as u64);
            }
        }
        hasher.finalize().to_hex().to_string()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViabilityKernel {
    pub states: BTreeSet<StateId>,
    pub robust_policy: BTreeMap<StateId, ActionId>,
    pub iterations: usize,
}

impl ViabilityKernel {
    #[must_use]
    pub fn contains(&self, state: StateId) -> bool {
        self.states.contains(&state)
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.states.is_empty()
    }
}

/// One quantitative viability constraint. Integer-valued signals avoid hidden
/// floating-point/target drift in the admission court.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViabilityConstraint {
    pub dimension: String,
    pub lower: i64,
    pub upper: i64,
    pub warning_margin: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViabilityEnvelope {
    pub constraints: Vec<ViabilityConstraint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeasuredState {
    pub state_id: StateId,
    pub signals: BTreeMap<String, i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ViabilityStatus {
    Viable,
    Threatened,
    Outside,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViabilityAssessment {
    pub state_id: StateId,
    pub status: ViabilityStatus,
    pub threatened_dimensions: Vec<String>,
    pub violated_dimensions: Vec<String>,
}

impl ViabilityEnvelope {
    pub fn validate(&self) -> Result<(), AutonomicError> {
        if self.constraints.is_empty() {
            return Err(AutonomicError::EmptyViabilityEnvelope);
        }
        let mut names = BTreeSet::new();
        for constraint in &self.constraints {
            if constraint.dimension.trim().is_empty() || constraint.lower > constraint.upper {
                return Err(AutonomicError::InvalidEnvelopeDimension {
                    dimension: constraint.dimension.clone(),
                    lower: constraint.lower,
                    upper: constraint.upper,
                });
            }
            if !names.insert(constraint.dimension.clone()) {
                return Err(AutonomicError::DuplicateEnvelopeDimension(
                    constraint.dimension.clone(),
                ));
            }
        }
        Ok(())
    }

    pub fn assess(&self, state: &MeasuredState) -> Result<ViabilityAssessment, AutonomicError> {
        self.validate()?;
        let mut threatened = Vec::new();
        let mut violated = Vec::new();

        for constraint in &self.constraints {
            let value = *state
                .signals
                .get(&constraint.dimension)
                .ok_or_else(|| AutonomicError::MissingMeasurement(constraint.dimension.clone()))?;

            if value < constraint.lower || value > constraint.upper {
                violated.push(constraint.dimension.clone());
                continue;
            }

            let distance_lower = (value as i128 - constraint.lower as i128) as u128;
            let distance_upper = (constraint.upper as i128 - value as i128) as u128;
            if distance_lower.min(distance_upper) <= constraint.warning_margin as u128 {
                threatened.push(constraint.dimension.clone());
            }
        }

        let status = if !violated.is_empty() {
            ViabilityStatus::Outside
        } else if !threatened.is_empty() {
            ViabilityStatus::Threatened
        } else {
            ViabilityStatus::Viable
        };
        Ok(ViabilityAssessment {
            state_id: state.state_id,
            status,
            threatened_dimensions: threatened,
            violated_dimensions: violated,
        })
    }
}

/// Disturbances are quotiented by the set of responses that can regulate them.
/// This is more precise than comparing raw disturbance/action cardinalities:
/// two disturbances requiring the same response do not create two independent
/// regulatory degrees of freedom.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DisturbanceRequirement {
    pub disturbance: DisturbanceId,
    pub admissible_responses: BTreeSet<ActionId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseRepertoire {
    pub admitted_actions: BTreeSet<ActionId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequisiteVarietyAssessment {
    pub adequate: bool,
    pub disturbance_count: usize,
    pub required_equivalence_classes: usize,
    pub covered_equivalence_classes: usize,
    pub selected_responses: BTreeMap<DisturbanceId, ActionId>,
    pub uncovered_disturbances: Vec<DisturbanceId>,
}

pub fn assess_requisite_variety(
    plant: &BoundedPlant,
    requirements: &[DisturbanceRequirement],
    repertoire: &ResponseRepertoire,
) -> Result<RequisiteVarietyAssessment, AutonomicError> {
    for &action in &repertoire.admitted_actions {
        if !plant.actions.contains(&action) {
            return Err(AutonomicError::UnknownAction(action));
        }
    }

    let mut by_disturbance = BTreeMap::<DisturbanceId, BTreeSet<ActionId>>::new();
    for requirement in requirements {
        if !plant.disturbances.contains(&requirement.disturbance) {
            return Err(AutonomicError::UnknownDisturbance(requirement.disturbance));
        }
        if requirement.admissible_responses.is_empty() {
            return Err(AutonomicError::EmptyResponseSet(requirement.disturbance));
        }
        for &action in &requirement.admissible_responses {
            if !plant.actions.contains(&action) {
                return Err(AutonomicError::UnknownAction(action));
            }
        }
        if by_disturbance
            .insert(requirement.disturbance, requirement.admissible_responses.clone())
            .is_some()
        {
            return Err(AutonomicError::DuplicateDisturbanceRequirement(
                requirement.disturbance,
            ));
        }
    }

    for &disturbance in &plant.disturbances {
        if !by_disturbance.contains_key(&disturbance) {
            return Err(AutonomicError::MissingDisturbanceRequirement(disturbance));
        }
    }

    let mut required_classes = BTreeSet::<Vec<ActionId>>::new();
    let mut covered_classes = BTreeSet::<Vec<ActionId>>::new();
    let mut selected = BTreeMap::new();
    let mut uncovered = Vec::new();

    for (&disturbance, acceptable) in &by_disturbance {
        let signature: Vec<_> = acceptable.iter().copied().collect();
        required_classes.insert(signature.clone());
        let selected_action = acceptable
            .intersection(&repertoire.admitted_actions)
            .next()
            .copied();
        match selected_action {
            Some(action) => {
                selected.insert(disturbance, action);
                covered_classes.insert(signature);
            }
            None => uncovered.push(disturbance),
        }
    }

    Ok(RequisiteVarietyAssessment {
        adequate: uncovered.is_empty(),
        disturbance_count: plant.disturbances.len(),
        required_equivalence_classes: required_classes.len(),
        covered_equivalence_classes: covered_classes.len(),
        selected_responses: selected,
        uncovered_disturbances: uncovered,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelPrediction {
    pub state: StateId,
    pub action: ActionId,
    pub disturbance: DisturbanceId,
    pub successors: BTreeSet<StateId>,
}

#[derive(Debug, Clone)]
pub struct RegulatorModel {
    pub regulator_id: String,
    pub admitted_actions: BTreeSet<ActionId>,
    predictions: BTreeMap<TransitionKey, BTreeSet<StateId>>,
}

impl RegulatorModel {
    pub fn new(
        regulator_id: impl Into<String>,
        admitted_actions: BTreeSet<ActionId>,
        predictions: Vec<ModelPrediction>,
    ) -> Result<Self, AutonomicError> {
        let regulator_id = regulator_id.into();
        if regulator_id.trim().is_empty() {
            return Err(AutonomicError::EmptyRegulatorId);
        }
        if admitted_actions.is_empty() {
            return Err(AutonomicError::EmptyRegulatorActionSet);
        }
        let mut index = BTreeMap::<TransitionKey, BTreeSet<StateId>>::new();
        for p in predictions {
            index
                .entry(TransitionKey {
                    state: p.state,
                    action: p.action,
                    disturbance: p.disturbance,
                })
                .or_default()
                .extend(p.successors);
        }
        Ok(Self {
            regulator_id,
            admitted_actions,
            predictions: index,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelMismatch {
    pub key: TransitionKey,
    pub plant_successors: BTreeSet<StateId>,
    pub predicted_successors: BTreeSet<StateId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelAdequacyAssessment {
    pub regulator_id: String,
    pub adequate: bool,
    pub relevant_cells: usize,
    pub modeled_cells: usize,
    pub missing_predictions: Vec<TransitionKey>,
    pub contradictions: Vec<ModelMismatch>,
}

/// Finite-domain Conant–Ashby court. This does *not* claim a global theorem
/// proof; it checks whether the regulator is an exact model of the admitted
/// plant relation on the kernel/action/disturbance domain it claims to regulate.
pub fn assess_model_adequacy(
    plant: &BoundedPlant,
    kernel: &ViabilityKernel,
    model: &RegulatorModel,
) -> Result<ModelAdequacyAssessment, AutonomicError> {
    plant.validate_totality()?;
    for &state in &kernel.states {
        if !plant.states.contains(&state) {
            return Err(AutonomicError::UnknownState(state));
        }
    }
    for &action in &model.admitted_actions {
        if !plant.actions.contains(&action) {
            return Err(AutonomicError::UnknownAction(action));
        }
    }
    for (key, successors) in &model.predictions {
        if !plant.states.contains(&key.state) {
            return Err(AutonomicError::UnknownState(key.state));
        }
        if !plant.actions.contains(&key.action) {
            return Err(AutonomicError::UnknownAction(key.action));
        }
        if !model.admitted_actions.contains(&key.action) {
            return Err(AutonomicError::ModelPredictionOutsideAdmittedActions(key.action));
        }
        if !plant.disturbances.contains(&key.disturbance) {
            return Err(AutonomicError::UnknownDisturbance(key.disturbance));
        }
        for &successor in successors {
            if !plant.states.contains(&successor) {
                return Err(AutonomicError::UnknownState(successor));
            }
        }
    }

    let mut missing = Vec::new();
    let mut contradictions = Vec::new();
    let mut modeled = 0usize;

    for &state in &kernel.states {
        for &action in &model.admitted_actions {
            for &disturbance in &plant.disturbances {
                let key = TransitionKey {
                    state,
                    action,
                    disturbance,
                };
                let actual = plant
                    .successors(&key)
                    .expect("validate_totality guarantees every transition cell exists");
                match model.predictions.get(&key) {
                    None => missing.push(key),
                    Some(predicted) => {
                        modeled += 1;
                        if predicted != actual {
                            contradictions.push(ModelMismatch {
                                key,
                                plant_successors: actual.clone(),
                                predicted_successors: predicted.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    let relevant_cells = kernel
        .states
        .len()
        .saturating_mul(model.admitted_actions.len())
        .saturating_mul(plant.disturbances.len());
    Ok(ModelAdequacyAssessment {
        regulator_id: model.regulator_id.clone(),
        adequate: missing.is_empty() && contradictions.is_empty(),
        relevant_cells,
        modeled_cells: modeled,
        missing_predictions: missing,
        contradictions,
    })
}

/// Authority is ordered by reversibility. None of these variants is
/// consequential-world DO authority.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum AdaptationAuthority {
    ObserveOnly = 0,
    ParameterTune = 1,
    PolicySelect = 2,
    ControllerReplace = 3,
    ControllerGenerate = 4,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegulationContract {
    pub contract_id: String,
    pub authority_ceiling: AdaptationAuthority,
}

impl RegulationContract {
    pub fn new(
        contract_id: impl Into<String>,
        authority_ceiling: AdaptationAuthority,
    ) -> Result<Self, AutonomicError> {
        let contract_id = contract_id.into();
        if contract_id.trim().is_empty() {
            return Err(AutonomicError::EmptyContractId);
        }
        Ok(Self {
            contract_id,
            authority_ceiling,
        })
    }

    /// Consequential DO is intentionally not representable by the adaptation
    /// authority lattice.
    #[must_use]
    pub const fn grants_consequential_do(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RegulatorDeficit {
    ViabilityEnvelopeViolated,
    OutsideViabilityKernel,
    InsufficientRequisiteVariety,
    InadequateInternalModel,
    ViabilityMarginThreatened,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdaptationKind {
    TuneParameters,
    SelectPolicy,
    ReplaceController,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdaptationIntent {
    pub kind: AdaptationKind,
    pub required_authority: AdaptationAuthority,
    pub deficit: RegulatorDeficit,
}

impl AdaptationIntent {
    #[must_use]
    pub const fn grants_consequential_do(&self) -> bool {
        false
    }
}

/// Pure construction request. It carries no actuator and cannot install the
/// controller it asks downstream manufacture/admission layers to construct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReconstitutionIntent {
    pub contract_id: String,
    pub reason: RegulatorDeficit,
    pub required_authority: AdaptationAuthority,
    pub requested_artifacts: Vec<String>,
}

impl ReconstitutionIntent {
    fn new(contract_id: &str, reason: RegulatorDeficit) -> Self {
        Self {
            contract_id: contract_id.to_string(),
            reason,
            required_authority: AdaptationAuthority::ControllerGenerate,
            requested_artifacts: vec![
                "regulator_model".to_string(),
                "regulation_contract".to_string(),
                "admission_evidence".to_string(),
                "execution_receipt_schema".to_string(),
            ],
        }
    }

    #[must_use]
    pub const fn grants_consequential_do(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutonomicDecision {
    Maintain,
    Adapt(AdaptationIntent),
    Reconstitute(ReconstitutionIntent),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutonomicRefusal {
    AuthorityCeilingExceeded {
        required: AdaptationAuthority,
        ceiling: AdaptationAuthority,
        deficit: RegulatorDeficit,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutonomicVerdict {
    Admitted(AutonomicDecision),
    Refused(AutonomicRefusal),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecondOrderAssessment {
    pub viability: ViabilityAssessment,
    pub viability_kernel: ViabilityKernel,
    pub requisite_variety: RequisiteVarietyAssessment,
    pub model_adequacy: ModelAdequacyAssessment,
}

fn admit_intent(
    contract: &RegulationContract,
    required: AdaptationAuthority,
    deficit: RegulatorDeficit,
    decision: AutonomicDecision,
) -> AutonomicVerdict {
    if required > contract.authority_ceiling {
        AutonomicVerdict::Refused(AutonomicRefusal::AuthorityCeilingExceeded {
            required,
            ceiling: contract.authority_ceiling,
            deficit,
        })
    } else {
        AutonomicVerdict::Admitted(decision)
    }
}

/// Second-order ultrastability policy. It chooses the *least reversible-authority
/// escalation* justified by the observed deficit; it never executes that intent.
pub fn ultrastable_decision(
    contract: &RegulationContract,
    assessment: &SecondOrderAssessment,
) -> AutonomicVerdict {
    if assessment.viability.status == ViabilityStatus::Outside {
        let deficit = RegulatorDeficit::ViabilityEnvelopeViolated;
        return admit_intent(
            contract,
            AdaptationAuthority::ControllerGenerate,
            deficit.clone(),
            AutonomicDecision::Reconstitute(ReconstitutionIntent::new(
                &contract.contract_id,
                deficit,
            )),
        );
    }

    if !assessment
        .viability_kernel
        .contains(assessment.viability.state_id)
    {
        let deficit = RegulatorDeficit::OutsideViabilityKernel;
        return admit_intent(
            contract,
            AdaptationAuthority::ControllerGenerate,
            deficit.clone(),
            AutonomicDecision::Reconstitute(ReconstitutionIntent::new(
                &contract.contract_id,
                deficit,
            )),
        );
    }

    if !assessment.requisite_variety.adequate {
        let deficit = RegulatorDeficit::InsufficientRequisiteVariety;
        return admit_intent(
            contract,
            AdaptationAuthority::ControllerGenerate,
            deficit.clone(),
            AutonomicDecision::Reconstitute(ReconstitutionIntent::new(
                &contract.contract_id,
                deficit,
            )),
        );
    }

    if !assessment.model_adequacy.adequate {
        let deficit = RegulatorDeficit::InadequateInternalModel;
        return admit_intent(
            contract,
            AdaptationAuthority::ControllerReplace,
            deficit.clone(),
            AutonomicDecision::Adapt(AdaptationIntent {
                kind: AdaptationKind::ReplaceController,
                required_authority: AdaptationAuthority::ControllerReplace,
                deficit,
            }),
        );
    }

    if assessment.viability.status == ViabilityStatus::Threatened {
        let deficit = RegulatorDeficit::ViabilityMarginThreatened;
        return admit_intent(
            contract,
            AdaptationAuthority::ParameterTune,
            deficit.clone(),
            AutonomicDecision::Adapt(AdaptationIntent {
                kind: AdaptationKind::TuneParameters,
                required_authority: AdaptationAuthority::ParameterTune,
                deficit,
            }),
        );
    }

    AutonomicVerdict::Admitted(AutonomicDecision::Maintain)
}

/// Stafford Beer VSM roles. System 3* is represented explicitly because audit
/// evidence is not equivalent to ordinary System 3 control.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize,
)]
pub enum VsmRole {
    System1Operations,
    System2Coordination,
    System3Control,
    System3StarAudit,
    System4Intelligence,
    System5Policy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecursiveRegulatorNode {
    pub id: String,
    pub parent: Option<String>,
    pub roles: BTreeSet<VsmRole>,
    pub operational_channels: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecursiveRegulatorAssessment {
    pub root: String,
    pub depth_by_node: BTreeMap<String, usize>,
    pub node_count: usize,
}

/// Validate a recursive VSM topology. Every recursion level must itself be a
/// viable regulator profile; a parent label does not grant authority to a child.
pub fn validate_recursive_regulator(
    nodes: &[RecursiveRegulatorNode],
) -> Result<RecursiveRegulatorAssessment, AutonomicError> {
    let mut by_id = BTreeMap::<String, &RecursiveRegulatorNode>::new();
    for node in nodes {
        if node.id.trim().is_empty() {
            return Err(AutonomicError::EmptyRegulatorNodeId);
        }
        if by_id.insert(node.id.clone(), node).is_some() {
            return Err(AutonomicError::DuplicateRegulatorNode(node.id.clone()));
        }
    }

    for node in nodes {
        if let Some(parent) = &node.parent {
            if !by_id.contains_key(parent) {
                return Err(AutonomicError::UnknownRegulatorParent {
                    node: node.id.clone(),
                    parent: parent.clone(),
                });
            }
        }
        validate_vsm_node(node)?;
    }

    // Cycle court precedes root-count court so a closed cycle is identified as
    // such rather than merely reported as having zero roots.
    for node in nodes {
        let mut seen = BTreeSet::new();
        let mut cursor = Some(node.id.as_str());
        while let Some(id) = cursor {
            if !seen.insert(id.to_string()) {
                return Err(AutonomicError::RecursiveRegulatorCycle(id.to_string()));
            }
            cursor = by_id
                .get(id)
                .and_then(|current| current.parent.as_deref());
        }
    }

    let roots: Vec<_> = nodes.iter().filter(|node| node.parent.is_none()).collect();
    if roots.len() != 1 {
        return Err(AutonomicError::RecursiveRegulatorRootCount(roots.len()));
    }

    let mut depths = BTreeMap::new();
    for node in nodes {
        let mut depth = 0usize;
        let mut cursor = node.parent.as_deref();
        while let Some(parent) = cursor {
            depth = depth.saturating_add(1);
            cursor = by_id
                .get(parent)
                .and_then(|parent_node| parent_node.parent.as_deref());
        }
        depths.insert(node.id.clone(), depth);
    }

    Ok(RecursiveRegulatorAssessment {
        root: roots[0].id.clone(),
        depth_by_node: depths,
        node_count: nodes.len(),
    })
}

fn validate_vsm_node(node: &RecursiveRegulatorNode) -> Result<(), AutonomicError> {
    let required = [
        VsmRole::System1Operations,
        VsmRole::System2Coordination,
        VsmRole::System3Control,
        VsmRole::System3StarAudit,
        VsmRole::System4Intelligence,
        VsmRole::System5Policy,
    ];
    let mut missing: Vec<_> = required
        .into_iter()
        .filter(|role| !node.roles.contains(role))
        .collect();
    if node.operational_channels == 0 && !missing.contains(&VsmRole::System1Operations) {
        missing.push(VsmRole::System1Operations);
    }
    missing.sort();
    missing.dedup();
    if !missing.is_empty() {
        return Err(AutonomicError::VsmProfileIncomplete {
            node: node.id.clone(),
            missing,
        });
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutonomicReceipt {
    pub schema: String,
    pub subject: String,
    pub contract_id: String,
    pub plant_digest: String,
    pub evidence_digest: String,
    pub verdict_digest: String,
    pub authority_ceiling: AdaptationAuthority,
    pub receipt_digest: String,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ReceiptRefusal {
    #[error("REFUSED:AUTONOMIC_EVIDENCE_DIGEST_MISMATCH")]
    EvidenceDigestMismatch,
    #[error("REFUSED:AUTONOMIC_VERDICT_DIGEST_MISMATCH")]
    VerdictDigestMismatch,
    #[error("REFUSED:AUTONOMIC_PLANT_DIGEST_MISMATCH")]
    PlantDigestMismatch,
    #[error("REFUSED:AUTONOMIC_RECEIPT_DIGEST_MISMATCH")]
    ReceiptDigestMismatch,
    #[error("REFUSED:AUTONOMIC_RECEIPT_SCHEMA_MISMATCH")]
    SchemaMismatch,
    #[error("REFUSED:AUTONOMIC_RECEIPT_CONTRACT_MISMATCH")]
    ContractMismatch,
    #[error("REFUSED:AUTONOMIC_RECEIPT_AUTHORITY_MISMATCH")]
    AuthorityMismatch,
    #[error("REFUSED:AUTONOMIC_RECEIPT_SERIALIZATION:{0}")]
    Serialization(String),
}

impl AutonomicReceipt {
    pub fn issue(
        subject: impl Into<String>,
        plant: &BoundedPlant,
        contract: &RegulationContract,
        assessment: &SecondOrderAssessment,
        verdict: &AutonomicVerdict,
    ) -> Result<Self, AutonomicError> {
        let subject = subject.into();
        if subject.trim().is_empty() {
            return Err(AutonomicError::EmptyReceiptSubject);
        }
        let schema = "wasm4pm.autonomic.receipt/v1";
        let plant_digest = plant.digest();
        let evidence_bytes = serde_json::to_vec(assessment)
            .map_err(|e| AutonomicError::SerializationFailure(e.to_string()))?;
        let verdict_bytes = serde_json::to_vec(verdict)
            .map_err(|e| AutonomicError::SerializationFailure(e.to_string()))?;
        let evidence_digest = domain_hash(b"wasm4pm.autonomic.evidence/v1", &[&evidence_bytes]);
        let verdict_digest = domain_hash(b"wasm4pm.autonomic.verdict/v1", &[&verdict_bytes]);
        let authority = [contract.authority_ceiling as u8];
        let receipt_digest = domain_hash(
            b"wasm4pm.autonomic.receipt/v1",
            &[
                schema.as_bytes(),
                subject.as_bytes(),
                contract.contract_id.as_bytes(),
                plant_digest.as_bytes(),
                evidence_digest.as_bytes(),
                verdict_digest.as_bytes(),
                &authority,
                &[0u8],
            ],
        );

        Ok(Self {
            schema: schema.to_string(),
            subject,
            contract_id: contract.contract_id.clone(),
            plant_digest,
            evidence_digest,
            verdict_digest,
            authority_ceiling: contract.authority_ceiling,
            receipt_digest,
        })
    }

    #[must_use]
    pub const fn grants_consequential_do(&self) -> bool {
        false
    }

    pub fn verify(
        &self,
        plant: &BoundedPlant,
        contract: &RegulationContract,
        assessment: &SecondOrderAssessment,
        verdict: &AutonomicVerdict,
    ) -> Result<(), ReceiptRefusal> {
        if self.schema != "wasm4pm.autonomic.receipt/v1" {
            return Err(ReceiptRefusal::SchemaMismatch);
        }
        if self.contract_id != contract.contract_id {
            return Err(ReceiptRefusal::ContractMismatch);
        }
        if self.authority_ceiling != contract.authority_ceiling {
            return Err(ReceiptRefusal::AuthorityMismatch);
        }
        if self.plant_digest != plant.digest() {
            return Err(ReceiptRefusal::PlantDigestMismatch);
        }
        let evidence_bytes = serde_json::to_vec(assessment)
            .map_err(|e| ReceiptRefusal::Serialization(e.to_string()))?;
        let verdict_bytes = serde_json::to_vec(verdict)
            .map_err(|e| ReceiptRefusal::Serialization(e.to_string()))?;
        let evidence_digest = domain_hash(b"wasm4pm.autonomic.evidence/v1", &[&evidence_bytes]);
        if evidence_digest != self.evidence_digest {
            return Err(ReceiptRefusal::EvidenceDigestMismatch);
        }
        let verdict_digest = domain_hash(b"wasm4pm.autonomic.verdict/v1", &[&verdict_bytes]);
        if verdict_digest != self.verdict_digest {
            return Err(ReceiptRefusal::VerdictDigestMismatch);
        }
        let authority = [self.authority_ceiling as u8];
        let expected = domain_hash(
            b"wasm4pm.autonomic.receipt/v1",
            &[
                self.schema.as_bytes(),
                self.subject.as_bytes(),
                self.contract_id.as_bytes(),
                self.plant_digest.as_bytes(),
                self.evidence_digest.as_bytes(),
                self.verdict_digest.as_bytes(),
                &authority,
                &[0u8],
            ],
        );
        if expected != self.receipt_digest {
            return Err(ReceiptRefusal::ReceiptDigestMismatch);
        }
        Ok(())
    }
}

fn feed_u64(hasher: &mut blake3::Hasher, value: u64) {
    hasher.update(&value.to_le_bytes());
}

fn domain_hash(domain: &[u8], fields: &[&[u8]]) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(domain);
    for field in fields {
        feed_u64(&mut hasher, field.len() as u64);
        hasher.update(field);
    }
    hasher.finalize().to_hex().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget() -> ComputationBudget {
        ComputationBudget::new(16, 8, 8, 128, 128, 32)
    }

    fn plant() -> BoundedPlant {
        let mut transitions = Vec::new();
        let mut push = |from, action, disturbance, to| {
            transitions.push(PlantTransition {
                from,
                action,
                disturbance,
                to,
            });
        };

        // state 0 has a robust recovery action (11)
        push(0, 10, 100, 0);
        push(0, 10, 101, 1);
        push(0, 11, 100, 0);
        push(0, 11, 101, 0);
        // state 1 cannot survive shock 101 under either action
        push(1, 10, 100, 1);
        push(1, 10, 101, 2);
        push(1, 11, 100, 0);
        push(1, 11, 101, 2);
        // state 2 is absorbing failure
        push(2, 10, 100, 2);
        push(2, 10, 101, 2);
        push(2, 11, 100, 2);
        push(2, 11, 101, 2);

        BoundedPlant::new(
            vec![0, 1, 2],
            vec![10, 11],
            vec![100, 101],
            transitions,
            budget(),
        )
        .unwrap()
    }

    fn kernel(plant: &BoundedPlant) -> ViabilityKernel {
        plant
            .viability_kernel(&BTreeSet::from([0, 1]))
            .unwrap()
    }

    fn envelope(status_value: i64) -> (ViabilityEnvelope, MeasuredState) {
        (
            ViabilityEnvelope {
                constraints: vec![ViabilityConstraint {
                    dimension: "health".to_string(),
                    lower: 10,
                    upper: 20,
                    warning_margin: 2,
                }],
            },
            MeasuredState {
                state_id: 0,
                signals: BTreeMap::from([("health".to_string(), status_value)]),
            },
        )
    }

    fn variety(plant: &BoundedPlant, actions: &[ActionId]) -> RequisiteVarietyAssessment {
        assess_requisite_variety(
            plant,
            &[
                DisturbanceRequirement {
                    disturbance: 100,
                    admissible_responses: BTreeSet::from([10, 11]),
                },
                DisturbanceRequirement {
                    disturbance: 101,
                    admissible_responses: BTreeSet::from([11]),
                },
            ],
            &ResponseRepertoire {
                admitted_actions: actions.iter().copied().collect(),
            },
        )
        .unwrap()
    }

    fn model(plant: &BoundedPlant, correct_shock: bool) -> ModelAdequacyAssessment {
        let k = kernel(plant);
        let regulator = RegulatorModel::new(
            "r1",
            BTreeSet::from([11]),
            vec![
                ModelPrediction {
                    state: 0,
                    action: 11,
                    disturbance: 100,
                    successors: BTreeSet::from([0]),
                },
                ModelPrediction {
                    state: 0,
                    action: 11,
                    disturbance: 101,
                    successors: BTreeSet::from([if correct_shock { 0 } else { 1 }]),
                },
            ],
        )
        .unwrap();
        assess_model_adequacy(plant, &k, &regulator).unwrap()
    }

    fn assessment(
        plant: &BoundedPlant,
        viability: ViabilityAssessment,
        variety_actions: &[ActionId],
        correct_model: bool,
    ) -> SecondOrderAssessment {
        let k = kernel(plant);
        SecondOrderAssessment {
            viability,
            viability_kernel: k,
            requisite_variety: variety(plant, variety_actions),
            model_adequacy: model(plant, correct_model),
        }
    }

    #[test]
    fn robust_viability_kernel_is_greatest_controlled_invariant_set() {
        let plant = plant();
        let kernel = kernel(&plant);
        assert_eq!(kernel.states, BTreeSet::from([0]));
        assert_eq!(kernel.robust_policy, BTreeMap::from([(0, 11)]));
        assert!(kernel.iterations >= 2);
    }

    #[test]
    fn incomplete_transition_knowledge_is_refused_not_assumed_safe() {
        let mut transitions = Vec::new();
        for state in [0, 1] {
            for action in [10, 11] {
                for disturbance in [100, 101] {
                    if (state, action, disturbance) != (1, 11, 101) {
                        transitions.push(PlantTransition {
                            from: state,
                            action,
                            disturbance,
                            to: state,
                        });
                    }
                }
            }
        }
        let plant = BoundedPlant::new(
            vec![0, 1],
            vec![10, 11],
            vec![100, 101],
            transitions,
            budget(),
        )
        .unwrap();
        assert_eq!(
            plant.viability_kernel(&BTreeSet::from([0, 1])),
            Err(AutonomicError::IncompleteTransitionRelation {
                state: 1,
                action: 11,
                disturbance: 101,
            })
        );
    }

    #[test]
    fn viability_envelope_distinguishes_margin_from_violation() {
        let (env, healthy) = envelope(15);
        assert_eq!(env.assess(&healthy).unwrap().status, ViabilityStatus::Viable);
        let (_, margin) = envelope(19);
        assert_eq!(env.assess(&margin).unwrap().status, ViabilityStatus::Threatened);
        let (_, failed) = envelope(21);
        assert_eq!(env.assess(&failed).unwrap().status, ViabilityStatus::Outside);
    }

    #[test]
    fn empty_viability_envelope_is_refused_not_vacuously_admitted() {
        let env = ViabilityEnvelope { constraints: vec![] };
        let state = MeasuredState {
            state_id: 0,
            signals: BTreeMap::new(),
        };
        assert_eq!(env.assess(&state), Err(AutonomicError::EmptyViabilityEnvelope));
    }

    #[test]
    fn requisite_variety_uses_response_equivalence_classes_and_refuses_gap() {
        let plant = plant();
        let adequate = variety(&plant, &[11]);
        assert!(adequate.adequate);
        assert_eq!(adequate.required_equivalence_classes, 2);
        assert_eq!(adequate.covered_equivalence_classes, 2);

        let insufficient = variety(&plant, &[10]);
        assert!(!insufficient.adequate);
        assert_eq!(insufficient.uncovered_disturbances, vec![101]);
    }

    #[test]
    fn good_regulator_court_detects_contradictory_internal_model() {
        let plant = plant();
        let adequate = model(&plant, true);
        assert!(adequate.adequate);
        assert_eq!(adequate.relevant_cells, 2);

        let wrong = model(&plant, false);
        assert!(!wrong.adequate);
        assert_eq!(wrong.contradictions.len(), 1);
        assert_eq!(wrong.contradictions[0].key.disturbance, 101);
    }

    #[test]
    fn ultrastability_uses_least_authority_for_margin_threat() {
        let plant = plant();
        let (env, state) = envelope(19);
        let assessed = assessment(&plant, env.assess(&state).unwrap(), &[11], true);
        let contract = RegulationContract::new("c1", AdaptationAuthority::ParameterTune).unwrap();
        let verdict = ultrastable_decision(&contract, &assessed);
        match verdict {
            AutonomicVerdict::Admitted(AutonomicDecision::Adapt(intent)) => {
                assert_eq!(intent.kind, AdaptationKind::TuneParameters);
                assert!(!intent.grants_consequential_do());
            }
            other => panic!("unexpected verdict: {other:?}"),
        }
    }

    #[test]
    fn insufficient_variety_cannot_self_grant_controller_generation_authority() {
        let plant = plant();
        let (env, state) = envelope(15);
        let assessed = assessment(&plant, env.assess(&state).unwrap(), &[10], true);
        let contract =
            RegulationContract::new("c1", AdaptationAuthority::ControllerReplace).unwrap();
        assert_eq!(
            ultrastable_decision(&contract, &assessed),
            AutonomicVerdict::Refused(AutonomicRefusal::AuthorityCeilingExceeded {
                required: AdaptationAuthority::ControllerGenerate,
                ceiling: AdaptationAuthority::ControllerReplace,
                deficit: RegulatorDeficit::InsufficientRequisiteVariety,
            })
        );
        assert!(!contract.grants_consequential_do());
    }

    #[test]
    fn sufficient_authority_emits_reconstitution_intent_not_actuation() {
        let plant = plant();
        let (env, state) = envelope(15);
        let assessed = assessment(&plant, env.assess(&state).unwrap(), &[10], true);
        let contract =
            RegulationContract::new("c1", AdaptationAuthority::ControllerGenerate).unwrap();
        match ultrastable_decision(&contract, &assessed) {
            AutonomicVerdict::Admitted(AutonomicDecision::Reconstitute(intent)) => {
                assert_eq!(
                    intent.reason,
                    RegulatorDeficit::InsufficientRequisiteVariety
                );
                assert!(!intent.grants_consequential_do());
                assert!(intent.requested_artifacts.contains(&"regulator_model".to_string()));
            }
            other => panic!("unexpected verdict: {other:?}"),
        }
    }

    #[test]
    fn vsm_recursive_regulator_requires_complete_systems_at_every_level() {
        let all_roles = BTreeSet::from([
            VsmRole::System1Operations,
            VsmRole::System2Coordination,
            VsmRole::System3Control,
            VsmRole::System3StarAudit,
            VsmRole::System4Intelligence,
            VsmRole::System5Policy,
        ]);
        let nodes = vec![
            RecursiveRegulatorNode {
                id: "enterprise".to_string(),
                parent: None,
                roles: all_roles.clone(),
                operational_channels: 3,
            },
            RecursiveRegulatorNode {
                id: "division".to_string(),
                parent: Some("enterprise".to_string()),
                roles: all_roles,
                operational_channels: 2,
            },
        ];
        let report = validate_recursive_regulator(&nodes).unwrap();
        assert_eq!(report.root, "enterprise");
        assert_eq!(report.depth_by_node["division"], 1);

        let mut invalid = nodes;
        invalid[1].roles.remove(&VsmRole::System5Policy);
        assert!(matches!(
            validate_recursive_regulator(&invalid),
            Err(AutonomicError::VsmProfileIncomplete { .. })
        ));
    }

    #[test]
    fn recursive_regulator_cycle_is_refused() {
        let all_roles = BTreeSet::from([
            VsmRole::System1Operations,
            VsmRole::System2Coordination,
            VsmRole::System3Control,
            VsmRole::System3StarAudit,
            VsmRole::System4Intelligence,
            VsmRole::System5Policy,
        ]);
        let nodes = vec![
            RecursiveRegulatorNode {
                id: "a".to_string(),
                parent: Some("b".to_string()),
                roles: all_roles.clone(),
                operational_channels: 1,
            },
            RecursiveRegulatorNode {
                id: "b".to_string(),
                parent: Some("a".to_string()),
                roles: all_roles,
                operational_channels: 1,
            },
        ];
        assert!(matches!(
            validate_recursive_regulator(&nodes),
            Err(AutonomicError::RecursiveRegulatorCycle(_))
        ));
    }

    #[test]
    fn receipt_is_deterministic_recomputable_and_binds_no_do_authority() {
        let plant = plant();
        let (env, state) = envelope(15);
        let assessed = assessment(&plant, env.assess(&state).unwrap(), &[11], true);
        let contract = RegulationContract::new("c1", AdaptationAuthority::ObserveOnly).unwrap();
        let verdict = ultrastable_decision(&contract, &assessed);
        assert_eq!(verdict, AutonomicVerdict::Admitted(AutonomicDecision::Maintain));

        let r1 = AutonomicReceipt::issue("subject@sha", &plant, &contract, &assessed, &verdict)
            .unwrap();
        let r2 = AutonomicReceipt::issue("subject@sha", &plant, &contract, &assessed, &verdict)
            .unwrap();
        assert_eq!(r1, r2);
        assert!(!r1.grants_consequential_do());
        r1.verify(&plant, &contract, &assessed, &verdict).unwrap();
    }

    #[test]
    fn receipt_tamper_is_detected() {
        let plant = plant();
        let (env, state) = envelope(15);
        let assessed = assessment(&plant, env.assess(&state).unwrap(), &[11], true);
        let contract = RegulationContract::new("c1", AdaptationAuthority::ObserveOnly).unwrap();
        let verdict = ultrastable_decision(&contract, &assessed);
        let mut receipt =
            AutonomicReceipt::issue("subject@sha", &plant, &contract, &assessed, &verdict)
                .unwrap();
        receipt.receipt_digest.replace_range(0..1, "x");
        assert_eq!(
            receipt.verify(&plant, &contract, &assessed, &verdict),
            Err(ReceiptRefusal::ReceiptDigestMismatch)
        );
    }
}
