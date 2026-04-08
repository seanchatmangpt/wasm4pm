//! Recursive-descent parser for POWL model strings.
//!
//! Mirrors `pm4py/objects/powl/parser.py:parse_powl_model_string()`.
//!
//! Grammar (informally):
//!   powl  ::= partial_order | decision_graph | xor | loop | tau | transition
//!   partial_order ::= "PO=(nodes={" nodes "}, order={" edges "})"
//!   decision_graph ::= "DG=(nodes={" nodes "}, order={" edges "}, starts=[" starts "], ends=[" ends "], empty=" bool ")"
//!   xor   ::= "X (" powl ("," powl)* ")"
//!   loop  ::= "* (" powl ("," powl)* ")"
//!   tau   ::= "tau"
//!   transition ::= label     (any string not matching above)

use crate::powl_arena::{BinaryRelation, Operator, PowlArena};

// ─── Tokeniser ────────────────────────────────────────────────────────────────

fn tokenize(s: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut depth = 0usize;
    let mut cur = String::new();
    for ch in s.chars() {
        match ch {
            '(' | '{' => {
                depth += 1;
                cur.push(ch);
            }
            ')' | '}' => {
                depth = depth.saturating_sub(1);
                cur.push(ch);
            }
            ',' if depth == 0 => {
                let tok = cur.trim().to_string();
                if !tok.is_empty() {
                    tokens.push(tok);
                }
                cur.clear();
            }
            _ => {
                cur.push(ch);
            }
        }
    }
    let tok = cur.trim().to_string();
    if !tok.is_empty() {
        tokens.push(tok);
    }
    tokens
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/// Parse a POWL model string and return the root index in the arena.
pub fn parse_powl_model_string(
    s: &str,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let s = s
        .replace(['\n', '\r', '\t'], "")
        .trim()
        .to_string();

    if s.is_empty() {
        return Err("empty POWL string".to_string());
    }

    // Decision graph
    if s.starts_with("DG=") || s.starts_with("DG(") {
        return parse_decision_graph(&s, arena);
    }

    // Partial order
    if s.starts_with("PO=") || s.starts_with("PO(") {
        return parse_partial_order(&s, arena);
    }

    // XOR
    if s.starts_with("X (") || s.starts_with("X(") {
        return parse_operator(&s, "X", Operator::Xor, arena);
    }

    // Loop
    if s.starts_with("* (") || s.starts_with("*(") {
        return parse_operator(&s, "*", Operator::Loop, arena);
    }

    // Silent transition
    if s == "tau" {
        let idx = arena.add_silent_transition();
        return Ok(idx);
    }

    // Labeled transition
    let label = s.trim_matches('\'').to_string();
    Ok(arena.add_transition(Some(label)))
}

// ─── Partial order parsing ────────────────────────────────────────────────────

fn parse_partial_order(s: &str, arena: &mut PowlArena) -> Result<u32, String> {
    let nodes_str = extract_braced_content(s, "nodes={")?;
    let order_str = extract_braced_content(s, "order={")?;

    let node_tokens: Vec<String> = if nodes_str.trim().is_empty() {
        Vec::new()
    } else {
        tokenize(nodes_str.trim())
    };

    let mut child_indices: Vec<u32> = Vec::new();
    let mut token_to_local: Vec<(String, u32)> = Vec::new();

    for tok in &node_tokens {
        let child_idx = parse_powl_model_string(tok, arena)?;
        let local = child_indices.len() as u32;
        child_indices.push(child_idx);
        token_to_local.push((tok.clone(), local));
    }

    let spo_idx = arena.add_strict_partial_order(child_indices.clone());

    if !order_str.trim().is_empty() {
        let edge_tokens: Vec<String> = tokenize(order_str.trim());
        for edge_tok in &edge_tokens {
            if let Some(arrow_pos) = edge_tok.find("-->") {
                let src_str = edge_tok[..arrow_pos].trim();
                let tgt_str = edge_tok[arrow_pos + 3..].trim();

                let src_local = token_to_local
                    .iter()
                    .position(|(t, _)| node_label_matches(t, src_str))
                    .ok_or_else(|| format!("edge source '{}' not found in nodes", src_str))?;
                let tgt_local = token_to_local
                    .iter()
                    .position(|(t, _)| node_label_matches(t, tgt_str))
                    .ok_or_else(|| format!("edge target '{}' not found in nodes", tgt_str))?;

                arena.add_order_edge(spo_idx, src_local, tgt_local);
            }
        }
    }

    Ok(spo_idx)
}

// ─── Decision graph parsing ──────────────────────────────────────────────────────

fn parse_decision_graph(s: &str, arena: &mut PowlArena) -> Result<u32, String> {
    let nodes_str = extract_braced_content(s, "nodes={")?;
    let order_str = extract_braced_content(s, "order={")?;
    let starts_str = extract_bracketed_content(s, "starts=[")?;
    let ends_str = extract_bracketed_content(s, "ends=[")?;
    let empty_str = extract_bool_value(s, "empty=")?;

    let node_tokens: Vec<String> = if nodes_str.trim().is_empty() {
        Vec::new()
    } else {
        tokenize(nodes_str.trim())
    };

    let mut child_indices: Vec<u32> = Vec::new();
    let mut token_to_local: Vec<(String, u32)> = Vec::new();

    for tok in &node_tokens {
        let child_idx = parse_powl_model_string(tok, arena)?;
        let local = child_indices.len() as u32;
        child_indices.push(child_idx);
        token_to_local.push((tok.clone(), local));
    }

    let n = child_indices.len();
    let mut order = BinaryRelation::new(n);

    if !order_str.trim().is_empty() {
        let edge_tokens: Vec<String> = tokenize(order_str.trim());
        for edge_tok in &edge_tokens {
            if let Some(arrow_pos) = edge_tok.find("-->") {
                let src_str = edge_tok[..arrow_pos].trim();
                let tgt_str = edge_tok[arrow_pos + 3..].trim();

                let src_local = token_to_local
                    .iter()
                    .position(|(t, _)| node_label_matches(t, src_str))
                    .ok_or_else(|| format!("edge source '{}' not found in nodes", src_str))?;
                let tgt_local = token_to_local
                    .iter()
                    .position(|(t, _)| node_label_matches(t, tgt_str))
                    .ok_or_else(|| format!("edge target '{}' not found in nodes", tgt_str))?;

                order.add_edge(src_local as usize, tgt_local as usize);
            }
        }
    }

    let start_nodes: Vec<usize> = if starts_str.trim().is_empty() {
        Vec::new()
    } else {
        parse_node_list(starts_str, &token_to_local)?
    };

    let end_nodes: Vec<usize> = if ends_str.trim().is_empty() {
        Vec::new()
    } else {
        parse_node_list(ends_str, &token_to_local)?
    };

    let empty_path: bool = empty_str == "true";

    Ok(arena.add_decision_graph(child_indices, order, start_nodes, end_nodes, empty_path))
}

fn parse_node_list(s: &str, token_to_local: &[(String, u32)]) -> Result<Vec<usize>, String> {
    let tokens: Vec<String> = tokenize(s.trim());
    let mut indices = Vec::new();
    for tok in &tokens {
        let idx = token_to_local
            .iter()
            .position(|(t, _)| node_label_matches(t, tok))
            .ok_or_else(|| format!("node '{}' not found in token list", tok))?;
        indices.push(idx as usize);
    }
    Ok(indices)
}

fn extract_bracketed_content<'a>(s: &'a str, key: &str) -> Result<&'a str, String> {
    let start = s
        .find(key)
        .ok_or_else(|| format!("'{}' not found in '{}'", key, s))?;
    let content_start = start + key.len();
    let rest = &s[content_start..];
    let mut depth = 1usize;
    let mut end = 0usize;
    for (i, ch) in rest.char_indices() {
        match ch {
            '[' | '(' | '{' => depth += 1,
            ']' | ')' | '}' => {
                depth -= 1;
                if depth == 0 {
                    end = i;
                    break;
                }
            }
            _ => {}
        }
    }
    Ok(&rest[..end])
}

fn extract_bool_value<'a>(s: &'a str, key: &str) -> Result<&'a str, String> {
    let start = s
        .find(key)
        .ok_or_else(|| format!("'{}' not found in '{}'", key, s))?;
    let content_start = start + key.len();
    let rest = &s[content_start..];

    // Find the end: either a comma, closing paren/brace, or end of string
    let mut end = 0usize;
    for (i, ch) in rest.char_indices() {
        match ch {
            ',' | ')' | '}' => {
                end = i;
                break;
            }
            _ => {}
        }
    }
    if end == 0 {
        end = rest.len();
    }
    Ok(rest[..end].trim())
}

fn node_label_matches(token: &str, label: &str) -> bool {
    token.trim() == label.trim()
        || token.trim().trim_matches('\'') == label.trim()
}

fn extract_braced_content<'a>(s: &'a str, key: &str) -> Result<&'a str, String> {
    let start = s
        .find(key)
        .ok_or_else(|| format!("'{}' not found in '{}'", key, s))?;
    let content_start = start + key.len();
    let rest = &s[content_start..];
    let mut depth = 1usize;
    let mut end = 0usize;
    for (i, ch) in rest.char_indices() {
        match ch {
            '{' | '(' => depth += 1,
            '}' | ')' => {
                depth -= 1;
                if depth == 0 {
                    end = i;
                    break;
                }
            }
            _ => {}
        }
    }
    Ok(&rest[..end])
}

// ─── Operator parsing ─────────────────────────────────────────────────────────

fn parse_operator(
    s: &str,
    prefix: &str,
    op: Operator,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let after_prefix = s[prefix.len()..].trim();
    let inner = strip_outer_parens(after_prefix)
        .ok_or_else(|| format!("malformed operator expression: '{}'", s))?;

    let child_tokens = tokenize(inner.trim());
    if child_tokens.is_empty() {
        return Err(format!("operator '{}' has no children", prefix));
    }

    let mut children: Vec<u32> = Vec::new();
    for tok in &child_tokens {
        let child_idx = parse_powl_model_string(tok, arena)?;
        children.push(child_idx);
    }

    match op {
        Operator::Xor if children.len() < 2 => {
            return Err("XOR requires at least 2 children".to_string());
        }
        Operator::Loop if children.len() != 2 => {
            return Err("LOOP requires exactly 2 children".to_string());
        }
        _ => {}
    }

    Ok(arena.add_operator(op, children))
}

fn strip_outer_parens(s: &str) -> Option<&str> {
    let s = s.trim_start();
    if !s.starts_with('(') {
        return None;
    }
    let inner = &s[1..];
    let mut depth = 1usize;
    for (i, ch) in inner.char_indices() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&inner[..i]);
                }
            }
            _ => {}
        }
    }
    None
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).expect("parse failed");
        (arena, root)
    }

    #[test]
    fn parse_transition() {
        let (arena, root) = parse("A");
        assert_eq!(arena.to_repr(root), "A");
    }

    #[test]
    fn parse_silent() {
        let (arena, root) = parse("tau");
        assert_eq!(arena.to_repr(root), "tau");
    }

    #[test]
    fn parse_xor() {
        let (arena, root) = parse("X ( A, B )");
        assert_eq!(arena.to_repr(root), "X ( A, B )");
    }

    #[test]
    fn parse_loop() {
        let (arena, root) = parse("* ( A, tau )");
        assert_eq!(arena.to_repr(root), "* ( A, tau )");
    }

    #[test]
    fn parse_partial_order_no_edges() {
        let (arena, root) = parse("PO=(nodes={A, B}, order={})");
        assert_eq!(arena.to_repr(root), "PO=(nodes={A, B}, order={})");
    }

    #[test]
    fn parse_partial_order_with_edge() {
        let (arena, root) = parse("PO=(nodes={NODE1, NODE2}, order={NODE1-->NODE2})");
        assert_eq!(
            arena.to_repr(root),
            "PO=(nodes={NODE1, NODE2}, order={NODE1-->NODE2})"
        );
    }

    #[test]
    fn parse_nested() {
        let s = "PO=(nodes={A, X ( B, C )}, order={A-->X ( B, C )})";
        let (arena, root) = parse(s);
        let repr = arena.to_repr(root);
        assert!(repr.contains("A-->"));
        assert!(repr.contains("X ( B, C )"));
    }

    #[test]
    fn docstring_example() {
        let s = "PO=(nodes={ NODE1, NODE2, NODE3 }, order={ NODE1-->NODE2 })";
        let (arena, root) = parse(s);
        assert!(arena.validate_partial_orders(root).is_ok());
        let repr = arena.to_repr(root);
        assert!(repr.contains("NODE1-->NODE2"));
    }

    #[test]
    fn parse_quoted_label() {
        let (arena, root) = parse("'Register Request'");
        assert_eq!(arena.to_repr(root), "Register Request");
    }
}
