//! Minimal S-expression tokenizer/parser shared by the domain and problem
//! parsers — a fresh, small parser (wasm4pm has no existing PDDL grammar to
//! extend; see the plan's investigation into `wasm4pm-cognition`).

#[derive(Debug, Clone, PartialEq)]
pub enum SExpr {
    Atom(String),
    List(Vec<SExpr>),
}

impl SExpr {
    pub fn as_atom(&self) -> Option<&str> {
        match self {
            SExpr::Atom(s) => Some(s),
            SExpr::List(_) => None,
        }
    }

    pub fn as_list(&self) -> Option<&[SExpr]> {
        match self {
            SExpr::List(items) => Some(items),
            SExpr::Atom(_) => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParseError {
    UnexpectedEof,
    UnbalancedParens,
    Empty,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::UnexpectedEof => write!(f, "unexpected end of input"),
            ParseError::UnbalancedParens => write!(f, "unbalanced parentheses"),
            ParseError::Empty => write!(f, "empty input"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Parse the first top-level S-expression in `text`.
pub fn parse_sexpr(text: &str) -> Result<SExpr, ParseError> {
    let tokens = tokenize(text);
    let mut pos = 0;
    let expr = parse_one(&tokens, &mut pos)?;
    Ok(expr)
}

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '(' | ')' => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
                tokens.push(c.to_string());
            }
            c if c.is_whitespace() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn parse_one(tokens: &[String], pos: &mut usize) -> Result<SExpr, ParseError> {
    let tok = tokens.get(*pos).ok_or(ParseError::UnexpectedEof)?;
    if tok == "(" {
        *pos += 1;
        let mut items = Vec::new();
        loop {
            match tokens.get(*pos) {
                None => return Err(ParseError::UnbalancedParens),
                Some(t) if t == ")" => {
                    *pos += 1;
                    return Ok(SExpr::List(items));
                }
                _ => items.push(parse_one(tokens, pos)?),
            }
        }
    } else if tok == ")" {
        Err(ParseError::UnbalancedParens)
    } else {
        *pos += 1;
        Ok(SExpr::Atom(tok.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_lists() {
        let e = parse_sexpr("(a (b c) d)").unwrap();
        let items = e.as_list().unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].as_atom(), Some("a"));
        assert_eq!(items[1].as_list().unwrap().len(), 2);
    }

    #[test]
    fn rejects_unbalanced_parens() {
        assert!(parse_sexpr("(a (b c)").is_err());
    }
}
