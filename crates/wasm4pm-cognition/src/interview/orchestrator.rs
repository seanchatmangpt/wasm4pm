//! Interview lifecycle state machine (ARD §3.1 Session Orchestrator).
//!
//! Transitions are the only way the phase changes — there is no setter for
//! `phase` — and every transition (including refused ones) is appended to a
//! log, so the orchestrator's entire history can be replayed and audited.

use serde::{Deserialize, Serialize};

/// Interview lifecycle phase.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Phase {
    /// Freshly constructed; nothing has happened yet (bootstrap).
    Created,
    /// Loading the pack / warming up.
    Preparing,
    /// Ready to receive the first observation.
    Ready,
    /// Interview introduction underway.
    Introduction,
    /// Problem statement presented.
    ProblemPresentation,
    /// Candidate is asking clarifying questions.
    Clarification,
    /// Candidate is planning their approach.
    Planning,
    /// Candidate is writing code.
    Implementation,
    /// Candidate code is executing.
    Execution,
    /// Candidate is debugging a failure.
    Debugging,
    /// Candidate is explaining their solution.
    Explanation,
    /// Interviewer follow-up questions.
    FollowUp,
    /// Terminal: interview completed successfully.
    Complete,
    /// Terminal: interview was refused (e.g. a fatal admission failure).
    Refused,
}

/// A recorded transition attempt, successful or not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransitionRecord {
    /// Phase before the transition.
    pub from: Phase,
    /// Phase requested.
    pub to: Phase,
    /// Whether the transition table admitted this move.
    pub admitted: bool,
}

/// A transition was rejected by the lifecycle table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidTransition {
    /// Phase the orchestrator was in.
    pub from: Phase,
    /// Phase that was requested.
    pub to: Phase,
}

fn is_legal(from: Phase, to: Phase) -> bool {
    use Phase::*;
    // Refused is reachable from any non-terminal phase — a fatal admission
    // failure can happen at any point in the interview.
    if to == Refused {
        return !matches!(from, Complete | Refused);
    }
    matches!(
        (from, to),
        (Created, Preparing)
            | (Preparing, Ready)
            | (Ready, Introduction)
            | (Introduction, ProblemPresentation)
            | (ProblemPresentation, Clarification)
            | (Clarification, Planning)
            | (Planning, Implementation)
            | (Implementation, Execution)
            | (Execution, Debugging)
            | (Execution, Explanation)
            | (Debugging, Implementation)
            | (Debugging, Execution)
            | (Explanation, FollowUp)
            | (FollowUp, Explanation)
            | (FollowUp, Complete)
    )
}

/// The interview lifecycle state machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Orchestrator {
    phase: Phase,
    log: Vec<TransitionRecord>,
}

impl Default for Orchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl Orchestrator {
    /// A fresh orchestrator always starts at [`Phase::Created`] with an empty log.
    pub fn new() -> Self {
        Self {
            phase: Phase::Created,
            log: Vec::new(),
        }
    }

    /// The current phase.
    pub fn phase(&self) -> Phase {
        self.phase
    }

    /// The complete, append-only transition log (successful and refused attempts).
    pub fn log(&self) -> &[TransitionRecord] {
        &self.log
    }

    /// Attempt a transition. Illegal transitions are recorded (`admitted: false`)
    /// but do not move `phase` and return an error — the orchestrator never
    /// silently advances on a rejected request.
    pub fn transition(&mut self, to: Phase) -> Result<Phase, InvalidTransition> {
        let from = self.phase;
        if is_legal(from, to) {
            self.log.push(TransitionRecord {
                from,
                to,
                admitted: true,
            });
            self.phase = to;
            Ok(to)
        } else {
            self.log.push(TransitionRecord {
                from,
                to,
                admitted: false,
            });
            Err(InvalidTransition { from, to })
        }
    }

    /// Reconstruct an orchestrator by replaying a previously recorded log from
    /// [`Phase::Created`], independently re-validating every transition rather
    /// than trusting the log's own `admitted` flags (chicken-and-egg guard).
    pub fn replay(log: &[TransitionRecord]) -> Result<Self, InvalidTransition> {
        let mut orchestrator = Self::new();
        for record in log {
            if record.from != orchestrator.phase {
                return Err(InvalidTransition {
                    from: orchestrator.phase,
                    to: record.to,
                });
            }
            if record.admitted {
                orchestrator.transition(record.to)?;
            } else {
                // A recorded refusal must independently re-refuse on replay.
                let outcome = orchestrator.transition(record.to);
                if outcome.is_ok() {
                    return Err(InvalidTransition {
                        from: record.from,
                        to: record.to,
                    });
                }
            }
        }
        Ok(orchestrator)
    }
}
