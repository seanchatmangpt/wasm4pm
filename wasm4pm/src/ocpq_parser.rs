use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OcpqScope {
    Global,
    SameObject {
        #[serde(rename = "object_type")]
        object_type: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OcpqRelation {
    Before,
    After,
    ImmediatelyBefore,
    ImmediatelyAfter,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OcpqClause {
    Require {
        left: String,
        relation: OcpqRelation,
        right: String,
        scope: OcpqScope,
    },
    Forbid {
        activity: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcpqQuery {
    pub clauses: Vec<OcpqClause>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
    pub position: usize,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} at position {}", self.message, self.position)
    }
}

impl std::error::Error for ParseError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Require,
    Forbid,
    Before,
    After,
    Immediately,
    On,
    Same,
    Object,
    Of,
    Type,
    And,
    Semicolon,
    Identifier(String),
}

pub fn tokenize(input: &str) -> Result<Vec<(Token, usize)>, ParseError> {
    let mut tokens = Vec::new();
    let mut chars = input.char_indices().peekable();

    while let Some(&(i, c)) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }

        if c == ';' {
            tokens.push((Token::Semicolon, i));
            chars.next();
            continue;
        }

        if c == '"' {
            chars.next(); // skip opening quote
            let mut val = String::new();
            let mut closed = false;
            while let Some((_, c_next)) = chars.next() {
                if c_next == '"' {
                    closed = true;
                    break;
                }
                val.push(c_next);
            }
            if !closed {
                return Err(ParseError {
                    message: "Unterminated double-quoted string".to_string(),
                    position: i,
                });
            }
            tokens.push((Token::Identifier(val), i));
            continue;
        }

        // Parse identifier or keyword
        if c.is_alphabetic() || c == '_' {
            let mut val = String::new();
            while let Some(&(_, c_next)) = chars.peek() {
                if c_next.is_alphanumeric() || c_next == '_' || c_next == '-' || c_next == ':' {
                    val.push(c_next);
                    chars.next();
                } else {
                    break;
                }
            }

            let token = match val.to_uppercase().as_str() {
                "REQUIRE" => Token::Require,
                "FORBID" => Token::Forbid,
                "BEFORE" => Token::Before,
                "AFTER" => Token::After,
                "IMMEDIATELY" => Token::Immediately,
                "ON" => Token::On,
                "SAME" => Token::Same,
                "OBJECT" => Token::Object,
                "OF" => Token::Of,
                "TYPE" => Token::Type,
                "AND" => Token::And,
                _ => Token::Identifier(val),
            };
            tokens.push((token, i));
        } else {
            return Err(ParseError {
                message: format!("Unexpected character: '{}'", c),
                position: i,
            });
        }
    }

    Ok(tokens)
}

pub struct Parser {
    tokens: Vec<(Token, usize)>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<(Token, usize)>) -> Self {
        Parser { tokens, pos: 0 }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos).map(|(t, _)| t)
    }

    fn peek_pos(&self) -> usize {
        self.tokens.get(self.pos).map(|(_, p)| *p).unwrap_or(0)
    }

    fn next(&mut self) -> Option<Token> {
        if self.pos < self.tokens.len() {
            let (t, _) = &self.tokens[self.pos];
            self.pos += 1;
            Some(t.clone())
        } else {
            None
        }
    }

    fn expect(&mut self, expected: Token) -> Result<(), ParseError> {
        match self.peek() {
            Some(t) if *t == expected => {
                self.next();
                Ok(())
            }
            Some(t) => Err(ParseError {
                message: format!("Expected {:?}, found {:?}", expected, t),
                position: self.peek_pos(),
            }),
            None => Err(ParseError {
                message: format!("Expected {:?}, found EOF", expected),
                position: self.peek_pos(),
            }),
        }
    }

    pub fn parse_query(&mut self) -> Result<OcpqQuery, ParseError> {
        let mut clauses = Vec::new();

        if self.peek().is_none() {
            return Ok(OcpqQuery { clauses });
        }

        clauses.push(self.parse_clause()?);

        while let Some(t) = self.peek() {
            match t {
                Token::And => {
                    self.next(); // consume AND
                    clauses.push(self.parse_clause()?);
                }
                Token::Semicolon => {
                    self.next(); // consume ;
                    if self.peek().is_some() {
                        clauses.push(self.parse_clause()?);
                    }
                }
                _ => {
                    return Err(ParseError {
                        message: format!("Expected 'AND' or ';', found {:?}", t),
                        position: self.peek_pos(),
                    });
                }
            }
        }

        Ok(OcpqQuery { clauses })
    }

    fn parse_clause(&mut self) -> Result<OcpqClause, ParseError> {
        match self.peek() {
            Some(Token::Require) => {
                self.next(); // consume REQUIRE
                let left = self.parse_identifier()?;
                let relation = self.parse_relation()?;
                let right = self.parse_identifier()?;
                let scope = self.parse_scope()?;
                Ok(OcpqClause::Require { left, relation, right, scope })
            }
            Some(Token::Forbid) => {
                self.next(); // consume FORBID
                let activity = self.parse_identifier()?;
                Ok(OcpqClause::Forbid { activity })
            }
            Some(t) => Err(ParseError {
                message: format!("Expected 'REQUIRE' or 'FORBID', found {:?}", t),
                position: self.peek_pos(),
            }),
            None => Err(ParseError {
                message: "Expected clause, found EOF".to_string(),
                position: self.peek_pos(),
            }),
        }
    }

    fn parse_identifier(&mut self) -> Result<String, ParseError> {
        match self.next() {
            Some(Token::Identifier(s)) => Ok(s),
            Some(t) => Err(ParseError {
                message: format!("Expected identifier, found {:?}", t),
                position: self.peek_pos(),
            }),
            None => Err(ParseError {
                message: "Expected identifier, found EOF".to_string(),
                position: self.peek_pos(),
            }),
        }
    }

    fn parse_relation(&mut self) -> Result<OcpqRelation, ParseError> {
        match self.next() {
            Some(Token::Before) => Ok(OcpqRelation::Before),
            Some(Token::After) => Ok(OcpqRelation::After),
            Some(Token::Immediately) => {
                match self.next() {
                    Some(Token::Before) => Ok(OcpqRelation::ImmediatelyBefore),
                    Some(Token::After) => Ok(OcpqRelation::ImmediatelyAfter),
                    Some(t) => Err(ParseError {
                        message: format!("Expected 'BEFORE' or 'AFTER' after 'IMMEDIATELY', found {:?}", t),
                        position: self.peek_pos(),
                    }),
                    None => Err(ParseError {
                        message: "Expected 'BEFORE' or 'AFTER' after 'IMMEDIATELY', found EOF".to_string(),
                        position: self.peek_pos(),
                    }),
                }
            }
            Some(t) => Err(ParseError {
                message: format!("Expected 'BEFORE', 'AFTER', or 'IMMEDIATELY', found {:?}", t),
                position: self.peek_pos(),
            }),
            None => Err(ParseError {
                message: "Expected relation, found EOF".to_string(),
                position: self.peek_pos(),
            }),
        }
    }

    fn parse_scope(&mut self) -> Result<OcpqScope, ParseError> {
        if let Some(Token::On) = self.peek() {
            self.next(); // consume ON
            self.expect(Token::Same)?;
            self.expect(Token::Object)?;

            if let Some(Token::Of) = self.peek() {
                self.next(); // consume OF
                self.expect(Token::Type)?;
                let object_type = self.parse_identifier()?;
                Ok(OcpqScope::SameObject { object_type: Some(object_type) })
            } else {
                Ok(OcpqScope::SameObject { object_type: None })
            }
        } else {
            Ok(OcpqScope::Global)
        }
    }
}

pub fn parse(input: &str) -> Result<OcpqQuery, ParseError> {
    let tokens = tokenize(input)?;
    let mut parser = Parser::new(tokens);
    parser.parse_query()
}
