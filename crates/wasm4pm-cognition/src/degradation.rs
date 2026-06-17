//! Graceful degradation modes for the cognition layer.
//! Full mode supports all 9 implemented breeds.

/// Operational mode determining which breeds are active.
///
/// The registry holds 9 real breed implementations — each a dispatched algorithm
/// (no stubs). Degradation reduces the active set when resources are constrained
/// or health is critical.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DegradationMode {
    /// All 9 implemented breeds active.
    Full,
    /// 5 breeds active (reduced resource usage).
    Reduced,
    /// 3 breeds active (minimal viable cognition).
    Minimal,
    /// Emergency: eliza only.
    Emergency,
}

impl std::fmt::Display for DegradationMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DegradationMode::Full => write!(f, "Full"),
            DegradationMode::Reduced => write!(f, "Reduced"),
            DegradationMode::Minimal => write!(f, "Minimal"),
            DegradationMode::Emergency => write!(f, "Emergency"),
        }
    }
}

/// Signals that trigger a degradation mode change.
#[derive(Debug, Clone, PartialEq)]
pub struct DegradationTrigger {
    /// System is under memory pressure.
    pub memory_pressure: bool,
    /// Breed response time has exceeded budget.
    pub response_time_exceeded: bool,
    /// Fraction of breed runs that errored (0.0–1.0).
    pub error_rate: f32,
    /// Current RL health level (0=normal … 4=failed).
    pub health_level: u8,
}

impl DegradationTrigger {
    /// Healthy system — no degradation signals.
    pub fn healthy() -> Self {
        Self {
            memory_pressure: false,
            response_time_exceeded: false,
            error_rate: 0.0,
            health_level: 0,
        }
    }

    /// Critical system — all signals at worst.
    pub fn critical() -> Self {
        Self {
            memory_pressure: true,
            response_time_exceeded: true,
            error_rate: 1.0,
            health_level: 4,
        }
    }

    /// Return a copy with values clamped to valid ranges.
    pub fn clamped(&self) -> Self {
        Self {
            memory_pressure: self.memory_pressure,
            response_time_exceeded: self.response_time_exceeded,
            error_rate: self.error_rate.clamp(0.0, 1.0),
            health_level: self.health_level.min(4),
        }
    }
}

impl Default for DegradationTrigger {
    fn default() -> Self {
        Self::healthy()
    }
}

/// Select the appropriate degradation mode from the current trigger signals.
///
/// Decision table (highest severity wins):
/// - `health_level >= 3` → Emergency (single breed)
/// - `memory_pressure || health_level == 2 || error_rate >= 0.6` → Minimal (3 breeds)
/// - `response_time_exceeded || error_rate >= 0.3 || health_level == 1` → Reduced (5 breeds)
/// - otherwise → Full (all 9 breeds active)
pub fn select_degradation_mode(trigger: &DegradationTrigger) -> DegradationMode {
    let t = trigger.clamped();

    if t.health_level >= 3 {
        return DegradationMode::Emergency;
    }

    if t.memory_pressure || t.health_level == 2 || t.error_rate >= 0.6 {
        return DegradationMode::Minimal;
    }

    if t.response_time_exceeded || t.error_rate >= 0.3 || t.health_level == 1 {
        return DegradationMode::Reduced;
    }

    DegradationMode::Full
}

/// Return the ordered list of breed names active in a given mode.
///
/// Full mode lists all 9 implemented breeds; tighter modes list the subset that
/// stays active under resource or health pressure.
pub fn breeds_for_mode(mode: DegradationMode) -> Vec<String> {
    match mode {
        DegradationMode::Full => vec![
            "eliza".into(),
            "cbr".into(),
            "dendral".into(),
            "strips".into(),
            "prolog".into(),
            "mycin".into(),
            "gps".into(),
            "soar".into(),
            "hearsay".into(),
        ],
        DegradationMode::Reduced => vec![
            "eliza".into(),
            "cbr".into(),
            "mycin".into(),
            "prolog".into(),
            "strips".into(),
        ],
        DegradationMode::Minimal => vec![
            "eliza".into(),
            "cbr".into(),
            "mycin".into(),
        ],
        DegradationMode::Emergency => vec!["eliza".into()],
    }
}

/// Count of active breeds in a given mode.
pub fn breed_count(mode: DegradationMode) -> usize {
    breeds_for_mode(mode).len()
}

/// Returns true if the named breed is active in the given mode.
pub fn breed_active_in_mode(breed: &str, mode: DegradationMode) -> bool {
    breeds_for_mode(mode).iter().any(|b| b == breed)
}

/// Human-readable rationale string for the selected mode.
///
/// All rationale strings reference the registry's 9 implemented breeds.
pub fn mode_rationale(trigger: &DegradationTrigger, mode: DegradationMode) -> String {
    let registry_note = "9 implemented breeds in registry";
    match mode {
        DegradationMode::Full => format!(
            "Full: system nominal ({registry_note})"
        ),
        DegradationMode::Reduced => {
            let reasons: Vec<&str> = [
                trigger.response_time_exceeded.then_some("latency exceeded"),
                (trigger.error_rate >= 0.3).then_some("error rate ≥ 30%"),
                (trigger.health_level == 1).then_some("health=1"),
            ]
            .iter()
            .flatten()
            .copied()
            .collect();
            let reason_str = if reasons.is_empty() {
                "system signal".to_string()
            } else {
                reasons.join(", ")
            };
            format!(
                "Reduced: 5 breeds active due to {reason_str} ({registry_note})"
            )
        }
        DegradationMode::Minimal => {
            let reasons: Vec<&str> = [
                trigger.memory_pressure.then_some("memory pressure"),
                (trigger.health_level == 2).then_some("health=2"),
                (trigger.error_rate >= 0.6).then_some("error rate ≥ 60%"),
            ]
            .iter()
            .flatten()
            .copied()
            .collect();
            let reason_str = if reasons.is_empty() {
                "system signal".to_string()
            } else {
                reasons.join(", ")
            };
            format!(
                "Minimal: 3 breeds active due to {reason_str} ({registry_note})"
            )
        }
        DegradationMode::Emergency => format!(
            "Emergency: eliza only due to health={} ({registry_note})",
            trigger.health_level
        ),
    }
}

/// Operator recommendation for recovering from the given mode.
pub fn recovery_recommendation(mode: DegradationMode) -> &'static str {
    match mode {
        DegradationMode::Full => "System nominal. No action required.",
        DegradationMode::Reduced => {
            "Investigate latency or error rate. Reduce load or scale resources."
        }
        DegradationMode::Minimal => {
            "Address memory pressure or reduce error rate below 60%. \
             Clear breed caches and restart non-critical subsystems."
        }
        DegradationMode::Emergency => {
            "CRITICAL: health >= 3. Immediate intervention required. \
             Only eliza breed is active. Resolve root cause before restoring full mode."
        }
    }
}
