//! Presentation-form selector (ARD §3.14 Accessibility Projector).
//!
//! Selection logic only — no UI rendering, that's a consumer's job. Real
//! behavior this module owns: never select an option the profile marks
//! unusable, and prefer the previous turn's option (stability) unless the
//! profile's urgency threshold is crossed, so high-frequency hypothesis
//! churn upstream doesn't produce an unstable UI downstream.

/// One candidate presentation form.
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectionOption {
    /// Stable identifier for this projection form, e.g. `"high_contrast"`.
    pub id: String,
    /// How urgent this option's content is, in `[0.0, 1.0]`.
    pub urgency: f32,
}

/// A candidate's accessibility preferences.
#[derive(Debug, Clone)]
pub struct AccessibilityProfile {
    /// Presentation form ids this profile explicitly disallows.
    pub unusable: Vec<String>,
    /// The preferred default form when there's no prior projection to stay
    /// stable against (bootstrap / first mile).
    pub preferred_default: String,
    /// Urgency, at or above which a new option is allowed to replace the
    /// stable (previous-turn) one.
    pub urgency_threshold: f32,
}

/// No usable option was available to select from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoUsableOption;

/// Select the presentation form for this turn.
///
/// - `previous`: the form selected last turn, or `None` on the very first
///   projection (first mile: nothing to stay stable against yet).
/// - `candidates`: this turn's available options.
pub fn select_projection(
    profile: &AccessibilityProfile,
    previous: Option<&str>,
    candidates: &[ProjectionOption],
) -> Result<ProjectionOption, NoUsableOption> {
    let usable: Vec<&ProjectionOption> = candidates
        .iter()
        .filter(|option| !profile.unusable.contains(&option.id))
        .collect();

    if usable.is_empty() {
        return Err(NoUsableOption);
    }

    if let Some(previous_id) = previous {
        let still_available = usable.iter().find(|option| option.id == previous_id);
        let most_urgent = usable
            .iter()
            .max_by(|a, b| a.urgency.total_cmp(&b.urgency))
            .expect("usable is non-empty");

        if let Some(&stable) = still_available {
            if most_urgent.urgency < profile.urgency_threshold || most_urgent.id == stable.id {
                return Ok(stable.clone());
            }
            return Ok((*most_urgent).clone());
        }
        // The previous option isn't available this turn; fall through to
        // bootstrap-style selection below.
    }

    // Bootstrap / first mile: nothing to stay stable against — pick the
    // profile's preferred default if it's usable, otherwise the most
    // urgent usable option.
    if let Some(&preferred) = usable.iter().find(|option| option.id == profile.preferred_default) {
        return Ok(preferred.clone());
    }
    Ok(usable
        .into_iter()
        .max_by(|a, b| a.urgency.total_cmp(&b.urgency))
        .expect("usable is non-empty")
        .clone())
}
