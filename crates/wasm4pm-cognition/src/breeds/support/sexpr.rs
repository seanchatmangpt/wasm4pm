//! S-expression parser for Analogy SME and other symbolic breeds.
//!
//! Parses LISP-like strings (e.g., "(cause (push box) (move box))") into an AST.

/// An S-expression node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SExpr {
    /// An atomic symbol or literal
    Atom(String),
    /// A nested list of S-expressions
    List(Vec<SExpr>),
}

impl SExpr {
    /// Parse a string into an S-expression.
    pub fn parse(input: &str) -> Result<Self, String> {
        let tokens = Self::tokenize(input);
        let (expr, remainder) = Self::parse_tokens(&tokens)?;
        if !remainder.is_empty() {
            return Err("Trailing tokens".to_string());
        }
        Ok(expr)
    }

    fn tokenize(input: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        let mut current = String::new();
        for c in input.chars() {
            if c == '(' || c == ')' {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
                tokens.push(c.to_string());
            } else if c.is_whitespace() {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
            } else {
                current.push(c);
            }
        }
        if !current.is_empty() {
            tokens.push(current);
        }
        tokens
    }

    fn parse_tokens(tokens: &[String]) -> Result<(Self, &[String]), String> {
        if tokens.is_empty() {
            return Err("Unexpected EOF".to_string());
        }
        let token = &tokens[0];
        if token == "(" {
            let mut list = Vec::new();
            let mut rest = &tokens[1..];
            while !rest.is_empty() && rest[0] != ")" {
                let (expr, next_rest) = Self::parse_tokens(rest)?;
                list.push(expr);
                rest = next_rest;
            }
            if rest.is_empty() {
                return Err("Missing closing parenthesis".to_string());
            }
            Ok((SExpr::List(list), &rest[1..]))
        } else if token == ")" {
            Err("Unexpected closing parenthesis".to_string())
        } else {
            Ok((SExpr::Atom(token.clone()), &tokens[1..]))
        }
    }
    
    /// Render the S-expression back to a string.
    pub fn to_string(&self) -> String {
        match self {
            SExpr::Atom(s) => s.clone(),
            SExpr::List(l) => {
                let inner: Vec<String> = l.iter().map(|e| e.to_string()).collect();
                format!("({})", inner.join(" "))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sexpr_roundtrip() {
        let input = "(cause (push box) (move box))";
        let parsed = SExpr::parse(input).unwrap();
        assert_eq!(parsed.to_string(), input);
    }
}
