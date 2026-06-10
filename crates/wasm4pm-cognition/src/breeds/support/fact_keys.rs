//! Typed parsers for prefix-based fact keys.

/// Typed representation of fact keys using prefixes.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum FactKey {
    /// Probabilistic prefix `prob:`
    Prob(String),
    /// Constraint satisfaction prefix `constraint:`
    Constraint(String),
    /// Linear Temporal Logic prefix `ltl:`
    Ltl(String),
    /// Domain specification prefix `domain:`
    Domain(String),
    /// Fuzzy logic variable prefix `fuzzy:`
    Fuzzy(String),
    /// Temporal relation prefix `temporal:`
    Temporal(String),
    /// Interval temporal logic prefix `interval:`
    Interval(String),
    /// Basic Probability Assignment prefix `bpa:`
    Bpa(String),
    /// Frame hierarchy prefix `frame:`
    Frame(String),
    /// Conditional Probability Table prefix `cpt:`
    Cpt(String),
    /// Evidence assertion prefix `evidence:`
    Evidence(String),
    /// Any other non-prefixed key
    Other(String),
}

impl FactKey {
    /// Parse a raw key string into a typed `FactKey`.
    pub fn parse(key: &str) -> Self {
        if let Some(suffix) = key.strip_prefix("prob:") {
            FactKey::Prob(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("constraint:") {
            FactKey::Constraint(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("ltl:") {
            FactKey::Ltl(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("domain:") {
            FactKey::Domain(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("fuzzy:") {
            FactKey::Fuzzy(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("temporal:") {
            FactKey::Temporal(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("interval:") {
            FactKey::Interval(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("bpa:") {
            FactKey::Bpa(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("frame:") {
            FactKey::Frame(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("cpt:") {
            FactKey::Cpt(suffix.to_string())
        } else if let Some(suffix) = key.strip_prefix("evidence:") {
            FactKey::Evidence(suffix.to_string())
        } else {
            FactKey::Other(key.to_string())
        }
    }

    /// Convert the typed `FactKey` back to its raw key representation.
    pub fn to_string(&self) -> String {
        match self {
            FactKey::Prob(s) => format!("prob:{}", s),
            FactKey::Constraint(s) => format!("constraint:{}", s),
            FactKey::Ltl(s) => format!("ltl:{}", s),
            FactKey::Domain(s) => format!("domain:{}", s),
            FactKey::Fuzzy(s) => format!("fuzzy:{}", s),
            FactKey::Temporal(s) => format!("temporal:{}", s),
            FactKey::Interval(s) => format!("interval:{}", s),
            FactKey::Bpa(s) => format!("bpa:{}", s),
            FactKey::Frame(s) => format!("frame:{}", s),
            FactKey::Cpt(s) => format!("cpt:{}", s),
            FactKey::Evidence(s) => format!("evidence:{}", s),
            FactKey::Other(s) => s.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_roundtrip_identity(s in ".*") {
            let parsed = FactKey::parse(&s);
            let serialized = parsed.to_string();
            prop_assert_eq!(&s, &serialized);
        }

        #[test]
        fn test_prefixes(s in "[a-zA-Z0-9_]*") {
            let prefixes = &[
                "prob:", "constraint:", "ltl:", "domain:", "fuzzy:", "temporal:",
                "interval:", "bpa:", "frame:", "cpt:", "evidence:"
            ];
            for prefix in prefixes {
                let key = format!("{}{}", prefix, s);
                let parsed = FactKey::parse(&key);
                match parsed {
                    FactKey::Other(_) => prop_assert!(false, "Expected typed variant for prefix {}", prefix),
                    _ => {}
                }
                prop_assert_eq!(&key, &parsed.to_string());
            }
        }
    }
}
