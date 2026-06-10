//! Formula parser
use std::fmt;
use std::iter::Peekable;

/// A formula in LTL or CTL.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Formula {
    /// Proposition
    Prop(String),
    /// Logical NOT
    Not(Box<Formula>),
    /// Logical AND
    And(Box<Formula>, Box<Formula>),
    /// Logical OR
    Or(Box<Formula>, Box<Formula>),
    /// Logical Implication
    Implies(Box<Formula>, Box<Formula>),
    /// LTL Next
    Next(Box<Formula>),
    /// LTL Eventually
    Eventually(Box<Formula>),
    /// LTL Globally
    Globally(Box<Formula>),
    /// LTL Until
    Until(Box<Formula>, Box<Formula>),
    /// LTL Release
    Release(Box<Formula>, Box<Formula>),
    /// CTL All
    All(Box<Formula>),
    /// CTL Exists
    Exists(Box<Formula>),
}

impl fmt::Display for Formula {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Formula::Prop(p) => write!(f, "{}", p),
            Formula::Not(phi) => write!(f, "!{}", phi),
            Formula::And(phi, psi) => write!(f, "({} & {})", phi, psi),
            Formula::Or(phi, psi) => write!(f, "({} | {})", phi, psi),
            Formula::Implies(phi, psi) => write!(f, "({} -> {})", phi, psi),
            Formula::Next(phi) => write!(f, "X {}", phi),
            Formula::Eventually(phi) => write!(f, "F {}", phi),
            Formula::Globally(phi) => write!(f, "G {}", phi),
            Formula::Until(phi, psi) => write!(f, "({} U {})", phi, psi),
            Formula::Release(phi, psi) => write!(f, "({} R {})", phi, psi),
            Formula::All(phi) => write!(f, "A {}", phi),
            Formula::Exists(phi) => write!(f, "E {}", phi),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Ident(String),
    Not,
    And,
    Or,
    Implies,
    Next,
    Eventually,
    Globally,
    Until,
    Release,
    All,
    Exists,
    LParen,
    RParen,
    Eof,
}

fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&c) = chars.peek() {
        match c {
            ' ' | '\t' | '\r' | '\n' => {
                chars.next();
            }
            '(' => {
                tokens.push(Token::LParen);
                chars.next();
            }
            ')' => {
                tokens.push(Token::RParen);
                chars.next();
            }
            '!' | '~' => {
                tokens.push(Token::Not);
                chars.next();
            }
            '&' => {
                chars.next();
                if let Some(&'&') = chars.peek() {
                    chars.next();
                }
                tokens.push(Token::And);
            }
            '|' => {
                chars.next();
                if let Some(&'|') = chars.peek() {
                    chars.next();
                }
                tokens.push(Token::Or);
            }
            '-' => {
                chars.next();
                if let Some(&'>') = chars.peek() {
                    chars.next();
                    tokens.push(Token::Implies);
                } else {
                    return Err("Expected '>' after '-'".into());
                }
            }
            '=' => {
                chars.next();
                if let Some(&'>') = chars.peek() {
                    chars.next();
                    tokens.push(Token::Implies);
                } else {
                    return Err("Expected '>' after '='".into());
                }
            }
            c if c.is_alphanumeric() || c == '_' => {
                let mut ident = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch.is_alphanumeric() || ch == '_' {
                        ident.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }
                match ident.as_str() {
                    "X" => tokens.push(Token::Next),
                    "F" => tokens.push(Token::Eventually),
                    "G" => tokens.push(Token::Globally),
                    "U" => tokens.push(Token::Until),
                    "R" | "V" => tokens.push(Token::Release),
                    "A" => tokens.push(Token::All),
                    "E" => tokens.push(Token::Exists),
                    "not" => tokens.push(Token::Not),
                    "and" => tokens.push(Token::And),
                    "or" => tokens.push(Token::Or),
                    _ => tokens.push(Token::Ident(ident)),
                }
            }
            _ => {
                return Err(format!("Unexpected character: {}", c));
            }
        }
    }
    tokens.push(Token::Eof);
    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn current(&self) -> &Token {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof)
    }

    fn advance(&mut self) {
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
    }

    fn prefix_binding_power(&self, op: &Token) -> ((), u8) {
        match op {
            Token::Not | Token::Next | Token::Eventually | Token::Globally | Token::All | Token::Exists => ((), 7),
            _ => panic!("Not a prefix operator"),
        }
    }

    fn infix_binding_power(&self, op: &Token) -> Option<(u8, u8)> {
        match op {
            Token::Until | Token::Release => Some((5, 6)),
            Token::And => Some((3, 4)),
            Token::Or => Some((1, 2)),
            Token::Implies => Some((0, 1)),
            _ => None,
        }
    }

    fn parse_expr(&mut self, min_bp: u8) -> Result<Formula, String> {
        let token = self.current().clone();
        self.advance();

        let mut lhs = match token {
            Token::Ident(name) => Formula::Prop(name),
            Token::LParen => {
                let expr = self.parse_expr(0)?;
                if *self.current() != Token::RParen {
                    return Err("Expected ')'".into());
                }
                self.advance();
                expr
            }
            Token::Not | Token::Next | Token::Eventually | Token::Globally | Token::All | Token::Exists => {
                let ((), r_bp) = self.prefix_binding_power(&token);
                let rhs = self.parse_expr(r_bp)?;
                match token {
                    Token::Not => Formula::Not(Box::new(rhs)),
                    Token::Next => Formula::Next(Box::new(rhs)),
                    Token::Eventually => Formula::Eventually(Box::new(rhs)),
                    Token::Globally => Formula::Globally(Box::new(rhs)),
                    Token::All => Formula::All(Box::new(rhs)),
                    Token::Exists => Formula::Exists(Box::new(rhs)),
                    _ => unreachable!(),
                }
            }
            _ => return Err(format!("Unexpected token: {:?}", token)),
        };

        loop {
            let op = self.current().clone();
            if op == Token::Eof {
                break;
            }

            if let Some((l_bp, r_bp)) = self.infix_binding_power(&op) {
                if l_bp < min_bp {
                    break;
                }
                self.advance();
                let rhs = self.parse_expr(r_bp)?;
                lhs = match op {
                    Token::And => Formula::And(Box::new(lhs), Box::new(rhs)),
                    Token::Or => Formula::Or(Box::new(lhs), Box::new(rhs)),
                    Token::Implies => Formula::Implies(Box::new(lhs), Box::new(rhs)),
                    Token::Until => Formula::Until(Box::new(lhs), Box::new(rhs)),
                    Token::Release => Formula::Release(Box::new(lhs), Box::new(rhs)),
                    _ => unreachable!(),
                };
                continue;
            }
            break;
        }
        Ok(lhs)
    }
}

impl Formula {
    /// Parses a string into a Formula
    pub fn parse(input: &str) -> Result<Self, String> {
        let tokens = tokenize(input)?;
        let mut parser = Parser::new(tokens);
        let ast = parser.parse_expr(0)?;
        if *parser.current() != Token::Eof {
            return Err("Unexpected trailing tokens".into());
        }
        Ok(ast)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser_roundtrip() {
        let cases = [
            "p",
            "!p",
            "X p",
            "F (p & q)",
            "G (p -> F q)",
            "(p U q)",
            "(p U (q R r))",
            "A G (p -> E F q)",
            "A X p",
            "(p | (q & r))",
            "((p | q) & r)",
        ];

        for &case in &cases {
            let ast = Formula::parse(case).expect("Should parse");
            let stringified = format!("{}", ast);
            let ast2 = Formula::parse(&stringified).expect("Should parse stringified");
            assert_eq!(ast, ast2, "Roundtrip failed for {}", case);
        }
    }

    #[test]
    fn test_precedence() {
        let ast1 = Formula::parse("p & q | r").unwrap();
        let ast2 = Formula::parse("(p & q) | r").unwrap();
        assert_eq!(ast1, ast2);

        let ast3 = Formula::parse("p | q & r").unwrap();
        let ast4 = Formula::parse("p | (q & r)").unwrap();
        assert_eq!(ast3, ast4);

        let ast5 = Formula::parse("p U q & r").unwrap();
        let ast6 = Formula::parse("(p U q) & r").unwrap();
        assert_eq!(ast5, ast6);
    }
    
    #[test]
    fn test_parser_errors() {
        assert!(Formula::parse("").is_err());
        assert!(Formula::parse("p &").is_err());
        assert!(Formula::parse("(p").is_err());
        assert!(Formula::parse("p )").is_err());
        assert!(Formula::parse("X").is_err());
    }
}
