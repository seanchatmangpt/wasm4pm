//! Typed complexity-cap enforcement for breeds.
//!
//! [`BoundedBreed`] is an opt-in supertrait of [`CognitionBreed`]. Existing
//! breeds are NOT required to implement it — their `preconditions()` continue
//! to work unchanged. New breeds adopt it for structured cap reporting.

use crate::breeds::{BreedInput, CognitionBreed, CognitionError};

/// Generic complexity limits for a breed. Fields set to `usize::MAX` are
/// uncapped.
#[derive(Debug, Clone)]
pub struct DomainBound {
    /// Maximum entries in `BreedInput::facts`.
    pub max_facts: usize,
    /// Maximum entries in `BreedInput::rules`.
    pub max_rules: usize,
    /// Maximum entries in `BreedInput::cases`.
    pub max_cases: usize,
    /// Maximum entries in `BreedInput::goals`.
    pub max_goals: usize,
    /// Maximum entries in `BreedInput::state`.
    pub max_state_atoms: usize,
    /// Maximum entries in `BreedInput::candidates`.
    pub max_candidates: usize,
}

impl Default for DomainBound {
    fn default() -> Self {
        Self {
            max_facts: usize::MAX,
            max_rules: usize::MAX,
            max_cases: usize::MAX,
            max_goals: usize::MAX,
            max_state_atoms: usize::MAX,
            max_candidates: usize::MAX,
        }
    }
}

/// Measured sizes from a `BreedInput`, parallel to [`DomainBound`].
#[derive(Debug, Clone, Default)]
pub struct DomainMeasure {
    /// Measured facts count.
    pub facts: usize,
    /// Measured rules count.
    pub rules: usize,
    /// Measured cases count.
    pub cases: usize,
    /// Measured goals count.
    pub goals: usize,
    /// Measured state atoms count.
    pub state_atoms: usize,
    /// Measured candidates count.
    pub candidates: usize,
}

impl DomainMeasure {
    /// Populate generic counts directly from a [`BreedInput`].
    pub fn from_input(input: &BreedInput) -> Self {
        Self {
            facts: input.facts.len(),
            rules: input.rules.len(),
            cases: input.cases.len(),
            goals: input.goals.len(),
            state_atoms: input.state.len(),
            candidates: input.candidates.len(),
        }
    }
}

/// Opt-in supertrait for breeds that declare explicit complexity bounds.
///
/// Adopt by implementing `breed_name` and `domain_bound`, then calling
/// `self.check_domain_bounds(input).map_err(|e| e.to_string())?` at the start
/// of `preconditions()`.
pub trait BoundedBreed: CognitionBreed {
    /// Static breed name for [`CognitionError`] messages.
    fn breed_name(&self) -> &'static str;

    /// Returns the generic complexity limits. Fields at `usize::MAX` are uncapped.
    fn domain_bound(&self) -> DomainBound;

    /// Measure the generic dimensions of `input`.
    ///
    /// Override when a breed counts a subset (e.g. CLP counts only `clp:var:*`
    /// facts, not all facts).
    fn measure_domain(&self, input: &BreedInput) -> DomainMeasure {
        DomainMeasure::from_input(input)
    }

    /// Breed-specific cap checks that do not fit the generic [`DomainBound`] fields.
    ///
    /// Default returns `None` (no extra checks). Override for dimensions like
    /// clause count, per-variable domain size, or product constraints.
    fn custom_check(&self, _input: &BreedInput) -> Option<CognitionError> {
        None
    }

    /// Provided: runs `measure_domain` against `domain_bound`, then calls
    /// `custom_check`. Returns the first `CognitionError::ComplexityCap`
    /// encountered, or `Ok(())`.
    fn check_domain_bounds(&self, input: &BreedInput) -> Result<(), CognitionError> {
        let bound = self.domain_bound();
        let measure = self.measure_domain(input);
        let name = self.breed_name();

        macro_rules! cap {
            ($measured:expr, $max:expr, $label:literal) => {
                if $measured > $max {
                    return Err(CognitionError::ComplexityCap {
                        breed: name,
                        detail: format!(
                            "{} count {} exceeds cap {} (refusal, not truncation)",
                            $label, $measured, $max
                        ),
                    });
                }
            };
        }

        cap!(measure.facts, bound.max_facts, "facts");
        cap!(measure.rules, bound.max_rules, "rules");
        cap!(measure.cases, bound.max_cases, "cases");
        cap!(measure.goals, bound.max_goals, "goals");
        cap!(measure.state_atoms, bound.max_state_atoms, "state_atoms");
        cap!(measure.candidates, bound.max_candidates, "candidates");

        if let Some(err) = self.custom_check(input) {
            return Err(err);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Receipt};

    struct TinyBreed;

    impl CognitionBreed for TinyBreed {
        fn id(&self) -> BreedId {
            BreedId::Mycin
        }
        fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
            self.check_domain_bounds(input).map_err(|e| e.to_string())
        }
        fn run(&self, _input: &BreedInput) -> Result<BreedOutput, BreedError> {
            Err(BreedError {
                breed: BreedId::Mycin,
                message: "TinyBreed::run is a test stub — not intended to be called".to_string(),
            })
        }
        fn postconditions(&self, _i: &BreedInput, _o: &BreedOutput) -> Result<(), String> {
            Ok(())
        }
    }

    impl BoundedBreed for TinyBreed {
        fn breed_name(&self) -> &'static str {
            "tiny"
        }
        fn domain_bound(&self) -> DomainBound {
            DomainBound {
                max_facts: 2,
                ..DomainBound::default()
            }
        }
    }

    fn input_with_n_facts(n: usize) -> BreedInput {
        use crate::breeds::Fact;
        let mut input = BreedInput::default();
        for i in 0..n {
            input.facts.push(Fact {
                key: format!("k{}", i),
                value: "v".to_string(),
            });
        }
        input
    }

    #[test]
    fn under_cap_passes() {
        let b = TinyBreed;
        assert!(b.preconditions(&input_with_n_facts(2)).is_ok());
    }

    #[test]
    fn over_cap_fails_with_complexity_cap_error() {
        let b = TinyBreed;
        let err = b.preconditions(&input_with_n_facts(3)).unwrap_err();
        assert!(err.contains("facts count 3 exceeds cap 2"), "got: {}", err);
    }

    #[test]
    fn default_domain_bound_all_max() {
        let bound = DomainBound::default();
        assert_eq!(bound.max_facts, usize::MAX);
        assert_eq!(bound.max_cases, usize::MAX);
    }
}
