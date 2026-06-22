use crate::lifecycle::LifecycleState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OperationKind {
    Simulate,
    MutateStructure,
    Mutate,
    QueryTopology,
    QueryHistorical,
    QueryDeterministic,
}

pub struct OperationRequest {
    kind: OperationKind,
}

impl OperationRequest {
    pub fn new(kind: OperationKind) -> Self {
        Self { kind }
    }
    pub fn kind(&self) -> &OperationKind {
        &self.kind
    }
}

pub struct LifecycleAuthority {
    pub current_state: LifecycleState,
}

impl Default for LifecycleAuthority {
    fn default() -> Self {
        Self {
            current_state: LifecycleState::Design,
        }
    }
}

impl LifecycleAuthority {
    pub fn resolve_current_state(&self) -> Result<LifecycleState, LifecycleError> {
        Ok(self.current_state)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LifecycleError {
    SimulationBlockedInDesign,
    GovernorInterventionBlocked,
    ArchivedModelImmutable,
}

impl std::fmt::Display for LifecycleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LifecycleError::SimulationBlockedInDesign => {
                write!(f, "LifecycleViolation::SimulationBlockedInDesign")
            }
            LifecycleError::GovernorInterventionBlocked => {
                write!(f, "LifecycleViolation::GovernorInterventionBlocked")
            }
            LifecycleError::ArchivedModelImmutable => {
                write!(f, "LifecycleViolation::ArchivedModelImmutable")
            }
        }
    }
}

pub fn enforce_lifecycle_state(
    operation: &OperationRequest,
    lsa_context: &LifecycleAuthority,
) -> Result<(), LifecycleError> {
    let current_state = lsa_context.resolve_current_state()?;

    match (current_state, operation.kind()) {
        (LifecycleState::Design, OperationKind::Simulate) => {
            Err(LifecycleError::SimulationBlockedInDesign)
        }
        (LifecycleState::Operation, OperationKind::MutateStructure) => {
            Err(LifecycleError::GovernorInterventionBlocked)
        }
        (
            LifecycleState::Decommission,
            OperationKind::Mutate | OperationKind::MutateStructure | OperationKind::Simulate,
        ) => {
            Err(LifecycleError::ArchivedModelImmutable)
        }
        _ => Ok(()), // Cleared for execution
    }
}
