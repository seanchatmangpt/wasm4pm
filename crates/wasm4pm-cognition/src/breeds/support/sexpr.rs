//! Minimal s-expression parser for SME structure mapping (`analogy_sme`).
//!
//! Grammar: `sexpr := atom | '(' sexpr* ')'`; atoms are runs of non-space,
//! non-paren characters. Rank-1 property proven below: `parse(print(x)) == x`
//! for every well-formed expression (round-trip identity).

use std::fmt;

/// An s-expression: an atom or a list of s-expressions.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Sexpr {
    /// A bare symbol/token.
    Atom(String),
    /// A parenthesized list.
    List(Vec<Sexpr>),
}

impl fmt::Display for Sexpr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Sexpr::Atom(s) => write!(f, "{}", s),
            Sexpr::List(items) => {
                write!(f, "(")?;
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        write!(f, " ")?;
                    }
                    write!(f, "{}", item)?;
                }
                write!(f, ")")
            }
        }
    }
}

impl Sexpr {
    /// Parse a single s-expression; trailing input is an error.
    pub fn parse(input: &str) -> Result<Sexpr, String> {
        let tokens = tokenize(input);
        let mut pos = 0;
        let expr = parse_tokens(&tokens, &mut pos)?;
        if pos != tokens.len() {
            return Err(format!(
                "trailing tokens after expression (at token {})",
                pos
            ));
        }
        Ok(expr)
    }

    /// Functor (head atom) of a list expression, if any.
    pub fn functor(&self) -> Option<&str> {
        match self {
            Sexpr::List(items) => match items.first() {
                Some(Sexpr::Atom(a)) => Some(a),
                _ => None,
            },
            Sexpr::Atom(_) => None,
        }
    }

    /// Maximum nesting depth (atoms have depth 0).
    pub fn depth(&self) -> usize {
        match self {
            Sexpr::Atom(_) => 0,
            Sexpr::List(items) => 1 + items.iter().map(Sexpr::depth).max().unwrap_or(0),
        }
    }
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut cur = String::new();
    for c in input.chars() {
        match c {
            '(' | ')' => {
                if !cur.is_empty() {
                    tokens.push(std::mem::take(&mut cur));
                }
                tokens.push(c.to_string());
            }
            c if c.is_whitespace() => {
                if !cur.is_empty() {
                    tokens.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        tokens.push(cur);
    }
    tokens
}

fn parse_tokens(tokens: &[String], pos: &mut usize) -> Result<Sexpr, String> {
    let tok = tokens
        .get(*pos)
        .ok_or_else(|| "unexpected end of input".to_string())?;
    *pos += 1;
    match tok.as_str() {
        "(" => {
            let mut items = Vec::new();
            loop {
                match tokens.get(*pos).map(|s| s.as_str()) {
                    Some(")") => {
                        *pos += 1;
                        return Ok(Sexpr::List(items));
                    }
                    Some(_) => items.push(parse_tokens(tokens, pos)?),
                    None => return Err("unbalanced '(': missing ')'".to_string()),
                }
            }
        }
        ")" => Err("unexpected ')'".to_string()),
        atom => Ok(Sexpr::Atom(atom.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn arb_sexpr() -> impl Strategy<Value = Sexpr> {
        let atom = "[a-z][a-z0-9_-]{0,8}".prop_map(Sexpr::Atom);
        atom.prop_recursive(4, 32, 5, |inner| {
            proptest::collection::vec(inner, 0..5).prop_map(Sexpr::List)
        })
    }

    proptest! {
        #[test]
        fn round_trip_identity(e in arb_sexpr()) {
            let printed = e.to_string();
            let reparsed = Sexpr::parse(&printed).expect("printed form must parse");
            prop_assert_eq!(e, reparsed);
        }
    }

    #[test]
    fn parses_nested_structure() {
        let e = Sexpr::parse("(cause (greater (mass sun) (mass planet)) (revolve planet sun))")
            .unwrap();
        assert_eq!(e.functor(), Some("cause"));
        assert_eq!(e.depth(), 3);
        if let Sexpr::List(items) = &e {
            assert_eq!(items.len(), 3);
        } else {
            panic!("expected list");
        }
    }

    #[test]
    fn rejects_malformed_input() {
        assert!(Sexpr::parse("(a b").is_err());
        assert!(Sexpr::parse("a b)").is_err());
        assert!(Sexpr::parse("").is_err());
        assert!(Sexpr::parse("a b").is_err()); // trailing token
        assert!(Sexpr::parse(")").is_err());
    }

    #[test]
    fn whitespace_insensitive() {
        let a = Sexpr::parse("(f  a\n b\t(g c))").unwrap();
        let b = Sexpr::parse("(f a b (g c))").unwrap();
        assert_eq!(a, b);
    }
}
