/// Chicago TDD Oracle Validator
///
/// Validates that test oracles conform to the Van der Aalst hierarchy:
/// - Rank-1 (Mathematical): External theorem (Bellman, Western Electric, etc.)
/// - Rank-2 (Domain): Industry standard contract or invariant
/// - Rank-3 (Metamorphic): Input perturbation → output relation
/// - Rank-4 (Statistical): Convergence trends over N trials (min 50 cycles, 5 seeds)
///
/// Rank-1 > Rank-2 > Rank-3 > Rank-4. Never use Rank-5 (code-derived oracle).
///
/// Doctrine: If code says it worked but event log cannot prove a lawful process happened, then it did not work.

use std::collections::HashSet;

/// Chicago TDD oracle rank (hierarchy from strongest to weakest)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Rank {
    /// Statistical property (e.g., convergence over 50+ cycles, 5+ seeds)
    Rank4,
    /// Metamorphic relation (e.g., health degrades → reward decreases)
    Rank3,
    /// Domain contract (e.g., SPC penalty structure, health state machine)
    Rank2,
    /// Mathematical theorem (e.g., Bellman equation, Western Electric rules)
    Rank1,
}

/// Oracle validation result
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationStatus {
    Valid { rank: Rank },
    Invalid { reason: String },
}

impl ValidationStatus {
    pub fn is_valid(&self) -> bool {
        matches!(self, ValidationStatus::Valid { .. })
    }
}

/// Oracle validator for Chicago TDD compliance
pub struct OracleValidator {
    rank1_keywords: HashSet<&'static str>,
    rank2_keywords: HashSet<&'static str>,
    rank3_keywords: HashSet<&'static str>,
    rank4_keywords: HashSet<&'static str>,
    forbidden_keywords: HashSet<&'static str>,
}

impl OracleValidator {
    pub fn new() -> Self {
        let mut rank1_keywords = HashSet::new();
        rank1_keywords.insert("bellman");
        rank1_keywords.insert("equation");
        rank1_keywords.insert("western");
        rank1_keywords.insert("electric");
        rank1_keywords.insert("theorem");
        rank1_keywords.insert("proven");
        rank1_keywords.insert("mathematical");
        rank1_keywords.insert("property");
        rank1_keywords.insert("convergence");
        rank1_keywords.insert("bound");

        let mut rank2_keywords = HashSet::new();
        rank2_keywords.insert("contract");
        rank2_keywords.insert("invariant");
        rank2_keywords.insert("domain");
        rank2_keywords.insert("rule");
        rank2_keywords.insert("policy");
        rank2_keywords.insert("always");
        rank2_keywords.insert("never");
        rank2_keywords.insert("must");

        let mut rank3_keywords = HashSet::new();
        rank3_keywords.insert("perturbation");
        rank3_keywords.insert("metamorphic");
        rank3_keywords.insert("relation");
        rank3_keywords.insert("increase");
        rank3_keywords.insert("decrease");
        rank3_keywords.insert("proportional");
        rank3_keywords.insert("inverse");

        let mut rank4_keywords = HashSet::new();
        rank4_keywords.insert("convergence");
        rank4_keywords.insert("trend");
        rank4_keywords.insert("trial");
        rank4_keywords.insert("seed");
        rank4_keywords.insert("confidence");
        rank4_keywords.insert("mean");
        rank4_keywords.insert("variance");
        rank4_keywords.insert("statistical");

        let mut forbidden_keywords = HashSet::new();
        forbidden_keywords.insert("computed_same_formula");
        forbidden_keywords.insert("impl_variable");
        forbidden_keywords.insert("code_path");
        forbidden_keywords.insert("state_machine");
        forbidden_keywords.insert("test_derives");

        OracleValidator {
            rank1_keywords,
            rank2_keywords,
            rank3_keywords,
            rank4_keywords,
            forbidden_keywords,
        }
    }

    /// Validate an oracle against Chicago TDD standards
    pub fn validate(&self, oracle_type: Rank, assertion: &str, implementation_context: &str) -> ValidationStatus {
        let assertion_lower = assertion.to_lowercase();
        let context_lower = implementation_context.to_lowercase();

        // Check for forbidden patterns (FM-5)
        for forbidden in &self.forbidden_keywords {
            if assertion_lower.contains(forbidden) {
                return ValidationStatus::Invalid {
                    reason: format!("FM-5 violation: oracle uses forbidden keyword '{}'", forbidden),
                };
            }
        }

        // Check for implementation coupling
        if context_lower.contains("assert") && assertion_lower.contains(&context_lower) {
            return ValidationStatus::Invalid {
                reason: "Oracle couples to implementation context; must be independent".to_string(),
            };
        }

        match oracle_type {
            Rank::Rank1 => self.validate_rank1(&assertion_lower),
            Rank::Rank2 => self.validate_rank2(&assertion_lower),
            Rank::Rank3 => self.validate_rank3(&assertion_lower),
            Rank::Rank4 => self.validate_rank4(&assertion_lower),
        }
    }

    fn validate_rank1(&self, assertion: &str) -> ValidationStatus {
        // Rank-1 must reference external theorem
        let has_theorem_marker = self.rank1_keywords.iter().any(|kw| assertion.contains(*kw));

        if !has_theorem_marker {
            return ValidationStatus::Invalid {
                reason: "Rank-1 oracle must reference mathematical theorem (Bellman, Western Electric, etc.)".to_string(),
            };
        }

        // Rank-1 must not be code-derived
        if assertion.contains("=") && !assertion.contains("<=") && !assertion.contains(">=") && !assertion.contains("!=") {
            return ValidationStatus::Invalid {
                reason: "Rank-1 oracle must use comparison operators (<=, >=, !=), not assignment".to_string(),
            };
        }

        ValidationStatus::Valid { rank: Rank::Rank1 }
    }

    fn validate_rank2(&self, assertion: &str) -> ValidationStatus {
        // Rank-2 must state domain contract explicitly
        let has_contract_marker = self.rank2_keywords.iter().any(|kw| assertion.contains(*kw));

        if !has_contract_marker {
            return ValidationStatus::Invalid {
                reason: "Rank-2 oracle must state domain contract (invariant, rule, policy)".to_string(),
            };
        }

        // Rank-2 must not assume code correctness
        if assertion.contains("code says") || assertion.contains("implementation") {
            return ValidationStatus::Invalid {
                reason: "Rank-2 oracle must not depend on code behavior; state the contract independently".to_string(),
            };
        }

        ValidationStatus::Valid { rank: Rank::Rank2 }
    }

    fn validate_rank3(&self, assertion: &str) -> ValidationStatus {
        // Rank-3 must describe input-output relation
        let has_relation_marker = self.rank3_keywords.iter().any(|kw| assertion.contains(*kw));

        if !has_relation_marker {
            return ValidationStatus::Invalid {
                reason: "Rank-3 oracle must describe metamorphic relation (increase/decrease/proportional)".to_string(),
            };
        }

        // Rank-3 must reference input perturbation
        if !assertion.contains("if") && !assertion.contains("when") {
            return ValidationStatus::Invalid {
                reason: "Rank-3 oracle must specify input condition (if X then Y)".to_string(),
            };
        }

        ValidationStatus::Valid { rank: Rank::Rank3 }
    }

    fn validate_rank4(&self, assertion: &str) -> ValidationStatus {
        // Rank-4 must reference statistical methodology
        let has_stat_marker = self.rank4_keywords.iter().any(|kw| assertion.contains(*kw));

        if !has_stat_marker {
            return ValidationStatus::Invalid {
                reason: "Rank-4 oracle must reference statistical properties (convergence, trend, confidence)".to_string(),
            };
        }

        // Rank-4 must mention trial count and seeds
        if !assertion.contains("trial") && !assertion.contains("seed") {
            return ValidationStatus::Invalid {
                reason: "Rank-4 oracle must specify number of trials and random seeds (min 5 seeds, 50+ cycles)".to_string(),
            };
        }

        ValidationStatus::Valid { rank: Rank::Rank4 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validates_rank1_bellman_oracle() {
        let validator = OracleValidator::new();
        let oracle = "Bellman equation: TD error converges to 0 as cycles increase";
        let result = validator.validate(Rank::Rank1, oracle, "");
        assert_eq!(result, ValidationStatus::Valid { rank: Rank::Rank1 });
    }

    #[test]
    fn test_validates_rank1_western_electric_oracle() {
        let validator = OracleValidator::new();
        let oracle = "Western Electric Rule 1: P(|x - μ| > 3σ) ≈ 0.27% proves special cause";
        let result = validator.validate(Rank::Rank1, oracle, "");
        assert_eq!(result, ValidationStatus::Valid { rank: Rank::Rank1 });
    }

    #[test]
    fn test_rejects_rank1_without_theorem() {
        let validator = OracleValidator::new();
        let oracle = "The algorithm works because the code says so";
        let result = validator.validate(Rank::Rank1, oracle, "");
        assert!(!result.is_valid());
    }

    #[test]
    fn test_validates_rank2_domain_contract() {
        let validator = OracleValidator::new();
        let oracle = "Domain contract: health improvement always yields positive reward";
        let result = validator.validate(Rank::Rank2, oracle, "");
        assert_eq!(result, ValidationStatus::Valid { rank: Rank::Rank2 });
    }

    #[test]
    fn test_rejects_rank2_code_dependent() {
        let validator = OracleValidator::new();
        let oracle = "The code says the system improves health correctly";
        let result = validator.validate(Rank::Rank2, oracle, "");
        assert!(!result.is_valid());
    }

    #[test]
    fn test_validates_rank3_metamorphic() {
        let validator = OracleValidator::new();
        let oracle = "Metamorphic: If health degrades, reward decreases (inverse relation)";
        let result = validator.validate(Rank::Rank3, oracle, "");
        assert_eq!(result, ValidationStatus::Valid { rank: Rank::Rank3 });
    }

    #[test]
    fn test_rejects_rank3_without_relation() {
        let validator = OracleValidator::new();
        let oracle = "The system works correctly";
        let result = validator.validate(Rank::Rank3, oracle, "");
        assert!(!result.is_valid());
    }

    #[test]
    fn test_validates_rank4_statistical() {
        let validator = OracleValidator::new();
        let oracle = "After 50+ cycles with 5 independent seeds, convergence trend shows mean TD error decreasing";
        let result = validator.validate(Rank::Rank4, oracle, "");
        assert_eq!(result, ValidationStatus::Valid { rank: Rank::Rank4 });
    }

    #[test]
    fn test_rejects_rank4_insufficient_rigor() {
        let validator = OracleValidator::new();
        let oracle = "Convergence happens over time";
        let result = validator.validate(Rank::Rank4, oracle, "");
        assert!(!result.is_valid());
    }

    #[test]
    fn test_rejects_fm5_self_reference() {
        let validator = OracleValidator::new();
        let oracle = "computed_same_formula() returns correct result";
        let result = validator.validate(Rank::Rank1, oracle, "");
        assert!(!result.is_valid());
    }

    #[test]
    fn test_oracle_hierarchy() {
        // Rank-1 > Rank-2: Rank-1 is stronger
        assert!(Rank::Rank1 > Rank::Rank2);
        assert!(Rank::Rank2 > Rank::Rank3);
        assert!(Rank::Rank3 > Rank::Rank4);
    }
}
