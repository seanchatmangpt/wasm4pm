/// Typed parsers for cognition fact prefixes.
/// These strictly enforce the domain prefixes required by the PRD.

/// Keys parsed from fact prefixes.
pub enum FactKey<'a> {
    /// Probability prefix `prob:`
    Prob(&'a str),
    /// Constraint prefix `constraint:`
    Constraint(&'a str),
    /// LTL prefix `ltl:`
    Ltl(&'a str),
    /// Domain prefix `domain:`
    Domain(&'a str),
    /// Fuzzy prefix `fuzzy:`
    Fuzzy(&'a str),
    /// Temporal prefix `temporal:`
    Temporal(&'a str),
    /// Interval prefix `interval:`
    Interval(&'a str),
    /// BPA prefix `bpa:`
    Bpa(&'a str),
    /// Frame prefix `frame:`
    Frame(&'a str),
    /// CPT prefix `cpt:`
    Cpt(&'a str),
    /// Evidence prefix `evidence:`
    Evidence(&'a str),
    /// Unrecognized prefix or no prefix.
    Unknown(&'a str),
}

impl<'a> FactKey<'a> {
    /// Parses a string slice into a FactKey based on recognized PRD prefixes.
    pub fn parse(fact: &'a str) -> Self {
        if let Some(rest) = fact.strip_prefix("prob:") {
            Self::Prob(rest)
        } else if let Some(rest) = fact.strip_prefix("constraint:") {
            Self::Constraint(rest)
        } else if let Some(rest) = fact.strip_prefix("ltl:") {
            Self::Ltl(rest)
        } else if let Some(rest) = fact.strip_prefix("domain:") {
            Self::Domain(rest)
        } else if let Some(rest) = fact.strip_prefix("fuzzy:") {
            Self::Fuzzy(rest)
        } else if let Some(rest) = fact.strip_prefix("temporal:") {
            Self::Temporal(rest)
        } else if let Some(rest) = fact.strip_prefix("interval:") {
            Self::Interval(rest)
        } else if let Some(rest) = fact.strip_prefix("bpa:") {
            Self::Bpa(rest)
        } else if let Some(rest) = fact.strip_prefix("frame:") {
            Self::Frame(rest)
        } else if let Some(rest) = fact.strip_prefix("cpt:") {
            Self::Cpt(rest)
        } else if let Some(rest) = fact.strip_prefix("evidence:") {
            Self::Evidence(rest)
        } else {
            Self::Unknown(fact)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fact_key_parsing() {
        assert!(matches!(FactKey::parse("prob:0.5"), FactKey::Prob("0.5")));
        assert!(matches!(FactKey::parse("constraint:x<y"), FactKey::Constraint("x<y")));
        assert!(matches!(FactKey::parse("ltl:G p"), FactKey::Ltl("G p")));
        assert!(matches!(FactKey::parse("domain:x:1..5"), FactKey::Domain("x:1..5")));
        assert!(matches!(FactKey::parse("fuzzy:var:term"), FactKey::Fuzzy("var:term")));
        assert!(matches!(FactKey::parse("temporal:before"), FactKey::Temporal("before")));
        assert!(matches!(FactKey::parse("interval:A"), FactKey::Interval("A")));
        assert!(matches!(FactKey::parse("bpa:hyp:0.8"), FactKey::Bpa("hyp:0.8")));
        assert!(matches!(FactKey::parse("frame:animal"), FactKey::Frame("animal")));
        assert!(matches!(FactKey::parse("cpt:A|B"), FactKey::Cpt("A|B")));
        assert!(matches!(FactKey::parse("evidence:A=t"), FactKey::Evidence("A=t")));
        assert!(matches!(FactKey::parse("unknown:foo"), FactKey::Unknown("unknown:foo")));
    }
}
