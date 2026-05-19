/// FM-5 Self-Referential Testing Detector
///
/// Identifies test code patterns that violate FM-5 (self-referential testing):
/// 1. Test derives expected value from implementation formula, then tests the formula
/// 2. Test calls function twice without seeding, expects identical results
/// 3. Test mocks function, asserts on mock behavior (circular dependency)
/// 4. Test uses implementation variable in assertion (tight coupling)
///
/// Rank-1 Oracle: Self-referential tests cannot prove correctness (tautology).
/// Solution: Expected value must be derived from external source (theorem, contract, or independently-computed oracle).

use regex::Regex;
use std::collections::HashMap;

/// Severity level for FM-5 violation
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Confidence {
    /// False positive risk; requires manual review
    Low,
    /// Likely FM-5; strong evidence but potential exception
    Medium,
    /// High confidence FM-5; likely tautology
    High,
}

/// A detected FM-5 violation
#[derive(Debug, Clone)]
pub struct Violation {
    pub pattern: String,
    pub confidence: Confidence,
    pub line_number: usize,
    pub code_snippet: String,
    pub fix_suggestion: String,
}

/// FM-5 detector for test code
pub struct FM5Detector {
    patterns: HashMap<&'static str, Regex>,
}

impl FM5Detector {
    pub fn new() -> Self {
        let mut patterns = HashMap::new();

        // Pattern 1: Test derives expected from implementation using same formula
        // Detects: assert_eq!(actual, computed_same_formula()) or assert!(expr using impl var)
        patterns.insert(
            "self_derived_expected",
            Regex::new(r"assert_eq!\(\s*[^,]+\s*,\s*([a-z_]+)\s*\(.*computed.*\)|assert.*==.*\.unwrap\(\)").unwrap(),
        );

        // Pattern 2: Function called twice without explicit seeding
        // Detects: let result1 = func(); let result2 = func(); assert_eq!(result1, result2)
        patterns.insert(
            "unseeded_double_call",
            Regex::new(r"let\s+[a-z_]+\s*=\s*([a-z_]+)\s*\(.*\);\s*(?:.*?;\s*)*let\s+[a-z_]+\s*=\s*\1\s*\(.*\);").unwrap(),
        );

        // Pattern 3: Test mocks function and asserts on mock behavior
        // Detects: vi.mock or jest.mock followed by assertion on mocked function
        patterns.insert(
            "mock_self_reference",
            Regex::new(r#"(?:vi|jest)\.mock\(['"].*['\"]\).*assert.*mock"#).unwrap(),
        );

        // Pattern 4: Test uses implementation variable in assertion
        // Detects: assert_eq!(actual, impl_var) or assert!(impl_var ==)
        patterns.insert(
            "impl_var_in_assert",
            Regex::new(r"assert_eq!\([^,]+,\s*[a-z_]*_impl[a-z_]*\)|assert!\([^)]*[a-z_]*_impl[a-z_]*").unwrap(),
        );

        FM5Detector { patterns }
    }

    /// Detect FM-5 violations in test code
    pub fn detect_violations(&self, test_code: &str) -> Vec<Violation> {
        let mut violations = Vec::new();

        for (line_number, line) in test_code.lines().enumerate() {
            // Pattern 1: Self-derived expected value
            if self.patterns["self_derived_expected"].is_match(line) {
                violations.push(Violation {
                    pattern: "self_derived_expected".to_string(),
                    confidence: Confidence::High,
                    line_number,
                    code_snippet: line.to_string(),
                    fix_suggestion: "Derive expected value from external oracle (mathematical theorem, domain contract, or independently-computed reference), not implementation formula".to_string(),
                });
            }

            // Pattern 2: Unseeded double call
            if self.patterns["unseeded_double_call"].is_match(line) {
                violations.push(Violation {
                    pattern: "unseeded_double_call".to_string(),
                    confidence: Confidence::Medium,
                    line_number,
                    code_snippet: line.to_string(),
                    fix_suggestion: "Explicitly seed RNG before calling. For determinism: use StdRng::seed_from_u64(42) or similar. For stochastic algorithms: use 5+ independent seeds".to_string(),
                });
            }

            // Pattern 3: Mock self-reference
            if self.patterns["mock_self_reference"].is_match(line) {
                violations.push(Violation {
                    pattern: "mock_self_reference".to_string(),
                    confidence: Confidence::High,
                    line_number,
                    code_snippet: line.to_string(),
                    fix_suggestion: "Never mock the function being tested. Test against real implementation. Mocks are only valid for dependencies (external services, I/O, random sources)".to_string(),
                });
            }

            // Pattern 4: Implementation variable in assertion
            if self.patterns["impl_var_in_assert"].is_match(line) {
                violations.push(Violation {
                    pattern: "impl_var_in_assert".to_string(),
                    confidence: Confidence::High,
                    line_number,
                    code_snippet: line.to_string(),
                    fix_suggestion: "Compare against external oracle, not implementation-derived variables. Use mathematical properties (e.g., convergence, bounds) instead".to_string(),
                });
            }
        }

        violations
    }

    /// Filter violations by confidence level (keeps violations >= threshold)
    pub fn filter_by_confidence(violations: Vec<Violation>, min_confidence: Confidence) -> Vec<Violation> {
        violations.into_iter().filter(|v| v.confidence >= min_confidence).collect()
    }

    /// Report violations in human-readable format
    pub fn report(violations: &[Violation]) -> String {
        if violations.is_empty() {
            return "✓ No FM-5 violations detected".to_string();
        }

        let mut report = format!("FM-5 Violations: {} detected\n", violations.len());
        for v in violations {
            report.push_str(&format!(
                "  Line {}: {:?} (confidence: {:?})\n    Code: {}\n    Fix: {}\n",
                v.line_number, v.pattern, v.confidence, v.code_snippet, v.fix_suggestion
            ));
        }
        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detects_self_derived_expected_value() {
        let detector = FM5Detector::new();
        let test_code = "assert_eq!(actual, computed_formula());";
        let violations = detector.detect_violations(test_code);
        assert!(!violations.is_empty());
        assert_eq!(violations[0].pattern, "self_derived_expected");
    }

    #[test]
    fn test_detects_unseeded_double_call() {
        let detector = FM5Detector::new();
        let test_code = "let result1 = algorithm(); let result2 = algorithm(); assert_eq!(result1, result2);";
        let violations = detector.detect_violations(test_code);
        assert!(!violations.is_empty());
        assert_eq!(violations[0].pattern, "unseeded_double_call");
    }

    #[test]
    fn test_detects_mock_self_reference() {
        let detector = FM5Detector::new();
        let test_code = "vi.mock('function'); assert!(mock.called);";
        let violations = detector.detect_violations(test_code);
        assert!(!violations.is_empty());
        assert_eq!(violations[0].pattern, "mock_self_reference");
    }

    #[test]
    fn test_detects_impl_var_in_assert() {
        let detector = FM5Detector::new();
        let test_code = "assert_eq!(actual, impl_variable);";
        let violations = detector.detect_violations(test_code);
        assert!(!violations.is_empty());
        assert_eq!(violations[0].pattern, "impl_var_in_assert");
    }

    #[test]
    fn test_allows_seeded_determinism_test() {
        let detector = FM5Detector::new();
        let test_code = r#"
            let mut rng = StdRng::seed_from_u64(42);
            let result1 = algorithm(&mut rng);
            let mut rng = StdRng::seed_from_u64(42);
            let result2 = algorithm(&mut rng);
            assert_eq!(result1, result2);
        "#;
        let violations = FM5Detector::filter_by_confidence(detector.detect_violations(test_code), Confidence::High);
        assert!(violations.is_empty(), "Seeded RNG should not trigger FM-5 warnings");
    }

    #[test]
    fn test_allows_external_oracle_assertions() {
        let detector = FM5Detector::new();
        let test_code = "assert!(result >= 0.0 && result <= 1.0); // Oracle: probability distribution";
        let violations = FM5Detector::filter_by_confidence(detector.detect_violations(test_code), Confidence::High);
        assert!(violations.is_empty(), "External oracle assertions should pass");
    }

    #[test]
    fn test_filter_by_confidence() {
        let detector = FM5Detector::new();
        let test_code = "assert_eq!(actual, computed_formula()); let x = func(); let y = func();";
        let violations = detector.detect_violations(test_code);
        assert!(violations.len() >= 1);

        let high_conf = FM5Detector::filter_by_confidence(violations.clone(), Confidence::High);
        let medium_conf = FM5Detector::filter_by_confidence(violations, Confidence::Medium);

        assert!(high_conf.len() <= medium_conf.len());
    }

    #[test]
    fn test_report_formatting() {
        let detector = FM5Detector::new();
        let test_code = "assert_eq!(actual, computed_formula());";
        let violations = detector.detect_violations(test_code);
        let report = FM5Detector::report(&violations);
        assert!(report.contains("FM-5 Violations"));
        assert!(report.contains("Fix:"));
    }

    #[test]
    fn test_empty_report() {
        let detector = FM5Detector::new();
        let test_code = "assert!(is_finite(result)); // Oracle: numerical stability";
        let violations = FM5Detector::filter_by_confidence(detector.detect_violations(test_code), Confidence::High);
        let report = FM5Detector::report(&violations);
        assert!(report.contains("No FM-5 violations"));
    }
}
