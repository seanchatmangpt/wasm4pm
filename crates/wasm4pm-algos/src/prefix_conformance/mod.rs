pub mod law;

use law::{CompiledLaw, OrderingLaw};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The verdict for one case's current prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrefixVerdict {
    #[serde(rename = "ALIVE")]
    Alive,
    #[serde(rename = "DEAD")]
    Dead,
    #[serde(rename = "TERMINAL")]
    Terminal,
}

/// Stable refusal codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrefixRefusal {
    ReceiptBeforeGate,
    RepairWithoutRoute,
    ClearWithoutDiagnostic,
    SuggestWithoutRoute,
    RouteWithoutDiagnostic,
    OutOfOrderTimestamp,
    DuplicateTerminal,
    RepeatedActivity,
    HarnessActiveBeforeOutReceipt,
    ArtifactMutationOutsideSync,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FindingSeverity {
    Deny,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefixFinding {
    pub code: PrefixRefusal,
    pub severity: FindingSeverity,
    pub json_path: String,
    pub message: String,
    pub case_id: String,
    pub activity: String,
}

pub struct CaseCursor {
    pub case_id: String,
    pub dfa_state: usize,
    pub seen: Vec<String>,
    pub last_time_ms: i64,
    pub verdict: PrefixVerdict,
}

pub struct PrefixOracle {
    pub law: CompiledLaw,
    pub cases: HashMap<String, CaseCursor>,
}

pub struct PrefixEvent {
    pub activity: String,
    pub time_ms: i64,
    pub case_id: String,
    pub tape_index: usize,
}

impl PrefixOracle {
    pub fn new(law: &OrderingLaw) -> Self {
        PrefixOracle {
            law: law.compile(),
            cases: HashMap::new(),
        }
    }

    pub fn snapshot(&self) -> Vec<&CaseCursor> {
        self.cases.values().collect()
    }

    pub fn observe(&mut self, ev: &PrefixEvent) -> (PrefixVerdict, Vec<PrefixFinding>) {
        // Implementation for observing a single event
        let mut findings = Vec::new();
        
        let cursor = self.cases.entry(ev.case_id.clone()).or_insert_with(|| CaseCursor {
            case_id: ev.case_id.clone(),
            dfa_state: self.law.q_init,
            seen: Vec::new(),
            last_time_ms: ev.time_ms,
            verdict: PrefixVerdict::Alive,
        });

        if cursor.verdict == PrefixVerdict::Dead {
            return (PrefixVerdict::Dead, findings);
        }

        // D6: OutOfOrderTimestamp
        if ev.time_ms < cursor.last_time_ms {
            findings.push(PrefixFinding {
                code: PrefixRefusal::OutOfOrderTimestamp,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("Event {} timestamp is out of order.", ev.activity),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
            return (cursor.verdict, findings);
        }

        cursor.last_time_ms = ev.time_ms;

        // D7: DuplicateTerminal
        let is_terminal = self.law.accepting_activities.contains(&ev.activity);
        if cursor.verdict == PrefixVerdict::Terminal && is_terminal {
            findings.push(PrefixFinding {
                code: PrefixRefusal::DuplicateTerminal,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("Duplicate terminal event {}.", ev.activity),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
            return (cursor.verdict, findings);
        }

        // D8: RepeatedActivity
        if cursor.seen.contains(&ev.activity) && !is_terminal {
            findings.push(PrefixFinding {
                code: PrefixRefusal::RepeatedActivity,
                severity: FindingSeverity::Warning,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("Repeated non-terminal activity {}.", ev.activity),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
        }

        // Apply D1-D5 which are precedence checks based on the law
        // To be exact, the spec lists them explicitly.
        if ev.activity == "ReceiptEmitted" && !cursor.seen.contains(&"GatePassed".to_string()) {
            findings.push(PrefixFinding {
                code: PrefixRefusal::ReceiptBeforeGate,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("ReceiptEmitted cannot follow this prefix: GatePassed never observed for case {}", ev.case_id),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
        }

        if ev.activity == "RepairApplied" && !cursor.seen.contains(&"RouteSelected".to_string()) {
            findings.push(PrefixFinding {
                code: PrefixRefusal::RepairWithoutRoute,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("RepairApplied without RouteSelected for case {}", ev.case_id),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
        }

        if (ev.activity == "ReceiptEmitted" || ev.activity == "RefusalEmitted") && !cursor.seen.contains(&"DiagnosticRaised".to_string()) {
            findings.push(PrefixFinding {
                code: PrefixRefusal::ClearWithoutDiagnostic,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("Clear event {} without DiagnosticRaised for case {}", ev.activity, ev.case_id),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
        }

        if ev.activity == "RepairSuggested" && !cursor.seen.contains(&"RouteSelected".to_string()) {
            findings.push(PrefixFinding {
                code: PrefixRefusal::SuggestWithoutRoute,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("RepairSuggested without RouteSelected for case {}", ev.case_id),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
        }

        if ev.activity == "RouteSelected" && !cursor.seen.contains(&"DiagnosticRaised".to_string()) {
            findings.push(PrefixFinding {
                code: PrefixRefusal::RouteWithoutDiagnostic,
                severity: FindingSeverity::Deny,
                json_path: format!("$.events[{}]", ev.tape_index),
                message: format!("RouteSelected without DiagnosticRaised for case {}", ev.case_id),
                case_id: ev.case_id.clone(),
                activity: ev.activity.clone(),
            });
            cursor.verdict = PrefixVerdict::Dead;
        }

        if cursor.verdict == PrefixVerdict::Dead {
            return (cursor.verdict, findings);
        }

        // Move the DFA state
        if let Some(&next_state) = self.law.transitions.get(&(cursor.dfa_state, ev.activity.clone())) {
            cursor.dfa_state = next_state;
            if next_state == self.law.q_dead || !self.law.completable[next_state] {
                // If the DFA says it's dead, and it wasn't caught by D1-D5
                cursor.verdict = PrefixVerdict::Dead;
            }
        } else {
            // Not an activity in the law? Or no transition means dead?
            // "Any activity with no lawful outgoing edge from the current state goes to q_DEAD"
            cursor.dfa_state = self.law.q_dead;
            cursor.verdict = PrefixVerdict::Dead;
        }

        if cursor.verdict != PrefixVerdict::Dead {
            if !cursor.seen.contains(&ev.activity) {
                cursor.seen.push(ev.activity.clone());
            }
            if is_terminal {
                cursor.verdict = PrefixVerdict::Terminal;
            } else {
                cursor.verdict = PrefixVerdict::Alive;
            }
        }

        (cursor.verdict, findings)
    }

    pub fn classify_prefix(&self, case_id: &str, activities: &[String]) -> (PrefixVerdict, Vec<PrefixFinding>) {
        // Implement one-shot classification by spinning up a new oracle and observing all.
        let mut temp_oracle = PrefixOracle {
            law: self.law.clone(),
            cases: HashMap::new(),
        };

        let mut final_verdict = PrefixVerdict::Alive;
        let mut all_findings = Vec::new();

        for (i, act) in activities.iter().enumerate() {
            let ev = PrefixEvent {
                activity: act.clone(),
                time_ms: i as i64, // synthetic times
                case_id: case_id.to_string(),
                tape_index: i,
            };
            let (v, findings) = temp_oracle.observe(&ev);
            all_findings.extend(findings);
            final_verdict = v;
            if v == PrefixVerdict::Dead {
                break;
            }
        }

        (final_verdict, all_findings)
    }
}
