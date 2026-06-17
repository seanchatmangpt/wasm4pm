//! Shared temporal-logic formula AST + Pratt parser, used by the LTL runtime
//! monitor (P1) and the CTL model checker (P3). Path quantifiers `A`/`E` are
//! first-class prefix operators so CTL formulas (`AG p`, `E (p U q)`, …)
//! parse with the same grammar.
//!
//! Grammar (precedence low → high, `->` and `U`/`R` right-associative):
//!
//! ```text
//! formula := implies
//! implies := or ( '->' implies )?
//! or      := and ( '|' and )*
//! and     := until ( '&' until )*
//! until   := unary ( ('U' | 'R') until )?
//! unary   := ('!' | 'X' | 'F' | 'G' | 'A' | 'E') unary | atom
//! atom    := 'true' | 'false' | ident | '(' formula ')'
//! ```
//!
//! Rank-1 properties proven below: print/parse round-trip identity over
//! arbitrary ASTs, precedence and associativity fixtures, and rejection of
//! malformed input.

use std::fmt;

/// A temporal-logic formula (LTL core + CTL path quantifiers).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Formula {
    /// Constant true.
    True,
    /// Constant false.
    False,
    /// Propositional atom (identifier).
    Atom(String),
    /// Negation `!φ`.
    Not(Box<Formula>),
    /// Conjunction `φ & ψ`.
    And(Box<Formula>, Box<Formula>),
    /// Disjunction `φ | ψ`.
    Or(Box<Formula>, Box<Formula>),
    /// Implication `φ -> ψ`.
    Implies(Box<Formula>, Box<Formula>),
    /// Next `X φ`.
    Next(Box<Formula>),
    /// Eventually (finally) `F φ`.
    Eventually(Box<Formula>),
    /// Globally (always) `G φ`.
    Globally(Box<Formula>),
    /// Until `φ U ψ`.
    Until(Box<Formula>, Box<Formula>),
    /// Release `φ R ψ` (dual of until).
    Release(Box<Formula>, Box<Formula>),
    /// CTL universal path quantifier `A φ`.
    AllPaths(Box<Formula>),
    /// CTL existential path quantifier `E φ`.
    ExistsPath(Box<Formula>),
}

impl Formula {
    /// Parse a formula from its textual form.
    pub fn parse(input: &str) -> Result<Formula, String> {
        let tokens = tokenize(input)?;
        let mut p = Parser { tokens, pos: 0 };
        let f = p.parse_bp(0)?;
        if p.pos != p.tokens.len() {
            return Err(format!("trailing input at token {}", p.pos));
        }
        Ok(f)
    }

    /// Number of AST nodes (size guard for breed preconditions).
    pub fn size(&self) -> usize {
        match self {
            Formula::True | Formula::False | Formula::Atom(_) => 1,
            Formula::Not(a)
            | Formula::Next(a)
            | Formula::Eventually(a)
            | Formula::Globally(a)
            | Formula::AllPaths(a)
            | Formula::ExistsPath(a) => 1 + a.size(),
            Formula::And(a, b)
            | Formula::Or(a, b)
            | Formula::Implies(a, b)
            | Formula::Until(a, b)
            | Formula::Release(a, b) => 1 + a.size() + b.size(),
        }
    }
}

impl fmt::Display for Formula {
    /// Fully-parenthesized binary operators; prefix unaries — guarantees the
    /// printed form re-parses to an identical AST.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Formula::True => write!(f, "true"),
            Formula::False => write!(f, "false"),
            Formula::Atom(s) => write!(f, "{}", s),
            Formula::Not(a) => write!(f, "!{}", a),
            Formula::Next(a) => write!(f, "X {}", a),
            Formula::Eventually(a) => write!(f, "F {}", a),
            Formula::Globally(a) => write!(f, "G {}", a),
            Formula::AllPaths(a) => write!(f, "A {}", a),
            Formula::ExistsPath(a) => write!(f, "E {}", a),
            Formula::And(a, b) => write!(f, "({} & {})", a, b),
            Formula::Or(a, b) => write!(f, "({} | {})", a, b),
            Formula::Implies(a, b) => write!(f, "({} -> {})", a, b),
            Formula::Until(a, b) => write!(f, "({} U {})", a, b),
            Formula::Release(a, b) => write!(f, "({} R {})", a, b),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Ident(String),
    True,
    False,
    Not,
    And,
    Or,
    Implies,
    Next,
    Finally,
    Globally,
    Until,
    Release,
    All,
    Exists,
    LParen,
    RParen,
}

fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            c if c.is_whitespace() => i += 1,
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            '!' => {
                tokens.push(Token::Not);
                i += 1;
            }
            '&' => {
                tokens.push(Token::And);
                i += 1;
            }
            '|' => {
                tokens.push(Token::Or);
                i += 1;
            }
            '-' => {
                if chars.get(i + 1) == Some(&'>') {
                    tokens.push(Token::Implies);
                    i += 2;
                } else {
                    return Err(format!("unexpected '-' at position {}", i));
                }
            }
            c if c.is_ascii_alphabetic() || c == '_' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let word: String = chars[start..i].iter().collect();
                tokens.push(match word.as_str() {
                    "true" => Token::True,
                    "false" => Token::False,
                    "X" => Token::Next,
                    "F" => Token::Finally,
                    "G" => Token::Globally,
                    "U" => Token::Until,
                    "R" => Token::Release,
                    "A" => Token::All,
                    "E" => Token::Exists,
                    _ => Token::Ident(word),
                });
            }
            other => {
                return Err(format!(
                    "unexpected character '{}' at position {}",
                    other, i
                ))
            }
        }
    }
    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

// Binding powers (Pratt): implies (1,0r) < or (2,3) < and (4,5) < until/release (7,6r).
const BP_IMPLIES: (u8, u8) = (1, 0);
const BP_OR: (u8, u8) = (2, 3);
const BP_AND: (u8, u8) = (4, 5);
const BP_UNTIL: (u8, u8) = (7, 6);

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn next(&mut self) -> Option<Token> {
        let t = self.tokens.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }

    fn parse_bp(&mut self, min_bp: u8) -> Result<Formula, String> {
        let mut lhs = match self.next().ok_or("unexpected end of formula")? {
            Token::True => Formula::True,
            Token::False => Formula::False,
            Token::Ident(s) => Formula::Atom(s),
            Token::Not => Formula::Not(Box::new(self.parse_unary_operand()?)),
            Token::Next => Formula::Next(Box::new(self.parse_unary_operand()?)),
            Token::Finally => Formula::Eventually(Box::new(self.parse_unary_operand()?)),
            Token::Globally => Formula::Globally(Box::new(self.parse_unary_operand()?)),
            Token::All => Formula::AllPaths(Box::new(self.parse_unary_operand()?)),
            Token::Exists => Formula::ExistsPath(Box::new(self.parse_unary_operand()?)),
            Token::LParen => {
                let f = self.parse_bp(0)?;
                match self.next() {
                    Some(Token::RParen) => f,
                    _ => return Err("expected ')'".to_string()),
                }
            }
            t => return Err(format!("unexpected token {:?}", t)),
        };
        loop {
            let (lbp, rbp, ctor): (u8, u8, fn(Box<Formula>, Box<Formula>) -> Formula) =
                match self.peek() {
                    Some(Token::Implies) => (BP_IMPLIES.0, BP_IMPLIES.1, Formula::Implies),
                    Some(Token::Or) => (BP_OR.0, BP_OR.1, Formula::Or),
                    Some(Token::And) => (BP_AND.0, BP_AND.1, Formula::And),
                    Some(Token::Until) => (BP_UNTIL.0, BP_UNTIL.1, Formula::Until),
                    Some(Token::Release) => (BP_UNTIL.0, BP_UNTIL.1, Formula::Release),
                    _ => break,
                };
            if lbp < min_bp {
                break;
            }
            self.next();
            let rhs = self.parse_bp(rbp.max(1))?;
            lhs = ctor(Box::new(lhs), Box::new(rhs));
        }
        Ok(lhs)
    }

    /// Unary operators bind tighter than every binary operator.
    fn parse_unary_operand(&mut self) -> Result<Formula, String> {
        // min_bp = 8 (above until's 7): the operand is exactly one unary chain / atom / group.
        self.parse_bp(8)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn arb_formula() -> impl Strategy<Value = Formula> {
        let leaf = prop_oneof![
            Just(Formula::True),
            Just(Formula::False),
            // avoid the reserved single letters X F G U R A E
            "[a-z][a-z0-9_]{0,6}".prop_map(Formula::Atom),
        ];
        leaf.prop_recursive(5, 64, 2, |inner| {
            prop_oneof![
                inner.clone().prop_map(|a| Formula::Not(Box::new(a))),
                inner.clone().prop_map(|a| Formula::Next(Box::new(a))),
                inner.clone().prop_map(|a| Formula::Eventually(Box::new(a))),
                inner.clone().prop_map(|a| Formula::Globally(Box::new(a))),
                inner.clone().prop_map(|a| Formula::AllPaths(Box::new(a))),
                inner.clone().prop_map(|a| Formula::ExistsPath(Box::new(a))),
                (inner.clone(), inner.clone())
                    .prop_map(|(a, b)| Formula::And(Box::new(a), Box::new(b))),
                (inner.clone(), inner.clone())
                    .prop_map(|(a, b)| Formula::Or(Box::new(a), Box::new(b))),
                (inner.clone(), inner.clone())
                    .prop_map(|(a, b)| Formula::Implies(Box::new(a), Box::new(b))),
                (inner.clone(), inner.clone())
                    .prop_map(|(a, b)| Formula::Until(Box::new(a), Box::new(b))),
                (inner.clone(), inner)
                    .prop_map(|(a, b)| Formula::Release(Box::new(a), Box::new(b))),
            ]
        })
    }

    proptest! {
        #[test]
        fn print_parse_round_trip(f in arb_formula()) {
            let printed = f.to_string();
            let reparsed = Formula::parse(&printed)
                .unwrap_or_else(|e| panic!("printed '{}' failed to parse: {}", printed, e));
            prop_assert_eq!(f, reparsed);
        }
    }

    fn atom(s: &str) -> Formula {
        Formula::Atom(s.to_string())
    }

    #[test]
    fn precedence_fixtures() {
        // a -> b | c & d  parses as  a -> (b | (c & d))
        assert_eq!(
            Formula::parse("a -> b | c & d").unwrap(),
            Formula::Implies(
                Box::new(atom("a")),
                Box::new(Formula::Or(
                    Box::new(atom("b")),
                    Box::new(Formula::And(Box::new(atom("c")), Box::new(atom("d"))))
                ))
            )
        );
        // p U q & r  parses as  (p U q) & r  (U binds tighter than &)
        assert_eq!(
            Formula::parse("p U q & r").unwrap(),
            Formula::And(
                Box::new(Formula::Until(Box::new(atom("p")), Box::new(atom("q")))),
                Box::new(atom("r"))
            )
        );
    }

    #[test]
    fn right_associativity() {
        // a -> b -> c  ==  a -> (b -> c)
        assert_eq!(
            Formula::parse("a -> b -> c").unwrap(),
            Formula::Implies(
                Box::new(atom("a")),
                Box::new(Formula::Implies(Box::new(atom("b")), Box::new(atom("c"))))
            )
        );
        // p U q U r  ==  p U (q U r)
        assert_eq!(
            Formula::parse("p U q U r").unwrap(),
            Formula::Until(
                Box::new(atom("p")),
                Box::new(Formula::Until(Box::new(atom("q")), Box::new(atom("r"))))
            )
        );
    }

    #[test]
    fn unary_binds_tighter_than_binary() {
        // G p U q  ==  (G p) U q
        assert_eq!(
            Formula::parse("G p U q").unwrap(),
            Formula::Until(
                Box::new(Formula::Globally(Box::new(atom("p")))),
                Box::new(atom("q"))
            )
        );
        // !a & b  ==  (!a) & b
        assert_eq!(
            Formula::parse("!a & b").unwrap(),
            Formula::And(
                Box::new(Formula::Not(Box::new(atom("a")))),
                Box::new(atom("b"))
            )
        );
    }

    #[test]
    fn ctl_path_quantifiers() {
        // AG p  and  E (p U q)
        assert_eq!(
            Formula::parse("A G p").unwrap(),
            Formula::AllPaths(Box::new(Formula::Globally(Box::new(atom("p")))))
        );
        assert_eq!(
            Formula::parse("E (p U q)").unwrap(),
            Formula::ExistsPath(Box::new(Formula::Until(
                Box::new(atom("p")),
                Box::new(atom("q"))
            )))
        );
    }

    #[test]
    fn rejects_malformed() {
        assert!(Formula::parse("").is_err());
        assert!(Formula::parse("(a").is_err());
        assert!(Formula::parse("a b").is_err());
        assert!(Formula::parse("a &").is_err());
        assert!(Formula::parse("a - b").is_err());
        assert!(Formula::parse("U a").is_err());
        assert!(Formula::parse("a @ b").is_err());
    }

    #[test]
    fn size_counts_nodes() {
        assert_eq!(Formula::parse("G (p -> F q)").unwrap().size(), 5);
        assert_eq!(atom("a").size(), 1);
    }
}
