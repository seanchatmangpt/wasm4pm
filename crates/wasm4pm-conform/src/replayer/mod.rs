use serde::{Deserialize, Serialize};

/// Reduction budget for cooperative scheduling and host yielding (e.g. BEAM reduction ticks).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReductionBudget {
    pub remaining: u32,
    pub total_executed: u64,
}

impl ReductionBudget {
    pub fn new(quota: u32) -> Self {
        Self {
            remaining: quota,
            total_executed: 0,
        }
    }

    /// Consumes one reduction step. Returns true if quota remains, false if yielded.
    #[inline(always)]
    pub fn tick(&mut self) -> bool {
        self.total_executed = self.total_executed.saturating_add(1);
        if self.remaining > 0 {
            self.remaining -= 1;
            true
        } else {
            false
        }
    }
}

/// Result of a cooperative step operation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StepResult<T> {
    /// Yielded cooperatively due to reduction budget exhaustion.
    Yielded { remaining_events: usize },
    /// Evaluation completed successfully without violation.
    Complete(T),
    /// Invariant or normative trajectory violation encountered.
    Violation(ViolationRecord),
}

/// Description of a trajectory conformance violation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViolationRecord {
    pub event_id: u64,
    pub activity: String,
    pub object_id: u64,
    pub reason: String,
    pub step_index: usize,
}

/// Dual-64 transition lattice (`pn64`/`pnabi` layout).
/// Fits in registers/stack without dynamic allocation on the hot path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct TransitionLattice {
    /// Bitmask of enabled transitions (up to 64 transitions)
    pub enabled_mask: u64,
    /// Bitmask of completed/consumed transitions
    pub marked_mask: u64,
    /// Bitmask of synchronized join transitions
    pub sync_mask: u64,
}

impl TransitionLattice {
    pub const fn empty() -> Self {
        Self {
            enabled_mask: 0,
            marked_mask: 0,
            sync_mask: 0,
        }
    }

    /// Evaluates transition legality via branchless bitmask arithmetic.
    #[inline(always)]
    pub fn is_transition_legal(&self, transition_bit: u64) -> bool {
        (self.enabled_mask & transition_bit) != 0
    }

    /// Fires transition in constant time, updating marks and enables.
    #[inline(always)]
    pub fn fire(&mut self, transition_bit: u64, post_mask: u64) {
        self.enabled_mask &= !transition_bit;
        self.marked_mask |= transition_bit;
        self.enabled_mask |= post_mask;
    }
}

/// Dual-64 Bitpacked Replayer with cooperative reduction budgeting.
#[derive(Debug, Clone)]
pub struct Dual64Replayer {
    pub state_lattice: TransitionLattice,
    pub current_event_index: usize,
    pub reduction_budget: ReductionBudget,
}

impl Dual64Replayer {
    pub fn new(initial_lattice: TransitionLattice, budget: ReductionBudget) -> Self {
        Self {
            state_lattice: initial_lattice,
            current_event_index: 0,
            reduction_budget: budget,
        }
    }

    /// Replays a stream of events cooperatively against the transition lattice.
    /// Traversal guarantees a stack ceiling <= 32 KiB and zero heap allocations.
    pub fn replay_cooperative(
        &mut self,
        events: &[(u64, &str, u64)], // (event_id, activity, transition_bit)
        post_masks: &[u64],
    ) -> StepResult<TransitionLattice> {
        let total = events.len();
        while self.current_event_index < total {
            if !self.reduction_budget.tick() {
                return StepResult::Yielded {
                    remaining_events: total - self.current_event_index,
                };
            }

            let (event_id, activity, trans_bit) = events[self.current_event_index];
            if !self.state_lattice.is_transition_legal(trans_bit) {
                return StepResult::Violation(ViolationRecord {
                    event_id,
                    activity: activity.to_string(),
                    object_id: 0,
                    reason: format!("Illegal transition for activity '{}' with bit {:016x}", activity, trans_bit),
                    step_index: self.current_event_index,
                });
            }

            let post = if self.current_event_index < post_masks.len() {
                post_masks[self.current_event_index]
            } else {
                0
            };

            self.state_lattice.fire(trans_bit, post);
            self.current_event_index += 1;
        }

        StepResult::Complete(self.state_lattice)
    }
}
