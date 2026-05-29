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

use crate::error::Wasm4pmError;
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
pub fn parse_powl_model_string(s: &str, arena: &mut PowlArena) -> Result<u32, Wasm4pmError> {
    let s = s.replace(['\n', '\r', '\t'], "").trim().to_string();

    if s.is_empty() {
        return Err(Wasm4pmError::Parse("empty POWL string".to_string()));
    }

    // Choice graph (POWL 2.0, Definition 1, arXiv:2505.07052)
    if s.starts_with("CG=") || s.starts_with("CG(") {
        return parse_choice_graph(&s, arena).map_err(Wasm4pmError::Parse);
    }

    // Decision graph
    if s.starts_with("DG=") || s.starts_with("DG(") {
        return parse_decision_graph(&s, arena).map_err(Wasm4pmError::Parse);
    }

    // Partial order
    if s.starts_with("PO=") || s.starts_with("PO(") {
        return parse_partial_order(&s, arena).map_err(Wasm4pmError::Parse);
    }

    // XOR
    if s.starts_with("X (") || s.starts_with("X(") {
        return parse_operator(&s, "X", Operator::Xor, arena).map_err(Wasm4pmError::Parse);
    }

    // Loop
    if s.starts_with("* (") || s.starts_with("*(") {
        return parse_operator(&s, "*", Operator::Loop, arena).map_err(Wasm4pmError::Parse);
    }

    // Sequence operator
    if s.starts_with("-> (") || s.starts_with("->(") {
        return parse_sequence_operator(&s, arena).map_err(Wasm4pmError::Parse);
    }

    // Parallel operator
    if s.starts_with("+ (") || s.starts_with("+(") {
        return parse_parallel_operator(&s, arena).map_err(Wasm4pmError::Parse);
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
    // Extract nodes first; then search for order= AFTER the nodes section so
    // that `order={...}` patterns embedded inside child sub-models (which live
    // in the nodes section) are not mistakenly matched.
    let (nodes_str, after_nodes) = extract_braced_content_from(s, "nodes={", 0)?;
    let order_str = extract_braced_content_from(s, "order={", after_nodes)
        .map(|(c, _)| c)
        .unwrap_or("");

    let node_tokens: Vec<String> = if nodes_str.trim().is_empty() {
        Vec::new()
    } else {
        tokenize(nodes_str.trim())
    };

    let mut child_indices: Vec<u32> = Vec::new();
    let mut token_to_local: Vec<(String, u32)> = Vec::new();

    for tok in &node_tokens {
        let child_idx = parse_powl_model_string(tok, arena).map_err(|e| e.to_string())?;
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

                arena.add_order_edge(spo_idx, src_local, tgt_local).ok();
            }
        }
    }

    Ok(spo_idx)
}

// ─── Decision graph parsing ──────────────────────────────────────────────────────

fn parse_decision_graph(s: &str, arena: &mut PowlArena) -> Result<u32, String> {
    // Extract nodes first; search for order= only after the nodes section so
    // nested sub-model reprs that contain `order={` are not mistakenly matched.
    let (nodes_str, after_nodes) = extract_braced_content_from(s, "nodes={", 0)?;
    let order_str = extract_braced_content_from(s, "order={", after_nodes)
        .map(|(c, _)| c)
        .unwrap_or("");
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
        let child_idx = parse_powl_model_string(tok, arena).map_err(|e| e.to_string())?;
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

                order.add_edge(src_local, tgt_local);
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
        indices.push(idx);
    }
    Ok(indices)
}

// ─── Choice graph parsing (CG=) ──────────────────────────────────────────────
//
// Grammar:
//   CG=(nodes={n0=Start, n1=Activity(a), n2=PO=(...), n3=End},
//       edges={n0->n1, n0->n2, n1->n3, n2->n3})
//
// `Start` and `End` are reserved literals. `Activity(label)` wraps a label.
// Any other expression is parsed as a nested POWL sub-model. Edges use `->`.
fn parse_choice_graph(s: &str, arena: &mut PowlArena) -> Result<u32, String> {
    let nodes_str = extract_braced_content(s, "nodes={")?;
    let edges_str = extract_braced_content(s, "edges={")?;

    let raw_node_tokens: Vec<String> = if nodes_str.trim().is_empty() {
        Vec::new()
    } else {
        tokenize(nodes_str.trim())
    };

    // Each node is `nID=<spec>`; record (id_str, ChoiceGraphNode).
    let mut id_to_idx: Vec<(String, usize)> = Vec::new();
    let mut nodes: Vec<wasm4pm_types::ChoiceGraphNode> = Vec::new();

    for tok in &raw_node_tokens {
        let (id_str, spec) = match tok.find('=') {
            Some(eq) => (
                tok[..eq].trim().to_string(),
                tok[eq + 1..].trim().to_string(),
            ),
            None => return Err(format!("CG node '{}' missing '=spec'", tok)),
        };
        let cg_node = parse_choice_graph_node_spec(&spec, arena)?;
        id_to_idx.push((id_str, nodes.len()));
        nodes.push(cg_node);
    }

    let mut edges: Vec<(usize, usize)> = Vec::new();
    if !edges_str.trim().is_empty() {
        let edge_tokens: Vec<String> = tokenize(edges_str.trim());
        for edge_tok in &edge_tokens {
            // Find `->` but not `-->` (used in PO/DG grammar).
            let arrow_pos = match edge_tok.find("->") {
                Some(p) => p,
                None => continue,
            };
            // Reject `-->` (legacy PO arrow): must be `->` only.
            if edge_tok.as_bytes().get(arrow_pos + 2) == Some(&b'>') {
                return Err(format!(
                    "CG edge '{}': use `->` (not `-->`) — `-->` belongs to PO/DG grammar",
                    edge_tok
                ));
            }
            let src_id = edge_tok[..arrow_pos].trim();
            let tgt_id = edge_tok[arrow_pos + 2..].trim();
            let src = id_to_idx
                .iter()
                .find(|(id, _)| id == src_id)
                .map(|(_, i)| *i)
                .ok_or_else(|| format!("CG edge source '{}' not found", src_id))?;
            let tgt = id_to_idx
                .iter()
                .find(|(id, _)| id == tgt_id)
                .map(|(_, i)| *i)
                .ok_or_else(|| format!("CG edge target '{}' not found", tgt_id))?;
            edges.push((src, tgt));
        }
    }

    let cg = wasm4pm_types::ChoiceGraph::new(nodes, edges)
        .map_err(|e| format!("invalid CG: {}", e))?;
    Ok(arena.add_choice_graph(&cg))
}

fn parse_choice_graph_node_spec(
    spec: &str,
    arena: &mut PowlArena,
) -> Result<wasm4pm_types::ChoiceGraphNode, String> {
    let s = spec.trim();
    if s == "Start" {
        return Ok(wasm4pm_types::ChoiceGraphNode::Start);
    }
    if s == "End" {
        return Ok(wasm4pm_types::ChoiceGraphNode::End);
    }
    if let Some(rest) = s.strip_prefix("Activity(") {
        let inner = rest
            .strip_suffix(')')
            .ok_or_else(|| format!("Activity(...) missing ')': '{}'", s))?;
        return Ok(wasm4pm_types::ChoiceGraphNode::Activity(inner.trim().to_string()));
    }
    // Fallback: parse as nested POWL sub-model.
    let sub_idx = parse_powl_model_string(s, arena).map_err(|e| e.to_string())?;
    Ok(wasm4pm_types::ChoiceGraphNode::SubModel(sub_idx))
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
    let t = token.trim().trim_matches('\'');
    let l = label.trim().trim_matches('\'');
    t == l
}

fn extract_braced_content<'a>(s: &'a str, key: &str) -> Result<&'a str, String> {
    extract_braced_content_from(s, key, 0).map(|(content, _)| content)
}

/// Extract the content inside `key{...}` starting the search from byte offset `from`.
/// Returns `(content_slice, byte_offset_after_closing_brace)`.
///
/// Searching from an offset allows callers to chain sequential extractions
/// (e.g. find `nodes={...}` first, then search for `order={` only in the
/// remaining suffix) so that keys nested inside sub-model reprs are not
/// mistakenly matched.
fn extract_braced_content_from<'a>(
    s: &'a str,
    key: &str,
    from: usize,
) -> Result<(&'a str, usize), String> {
    let search_start = s
        .get(from..)
        .ok_or_else(|| format!("offset {} out of range", from))?;
    let rel_start = search_start
        .find(key)
        .ok_or_else(|| format!("'{}' not found in '{}'", key, &s[from..]))?;
    let abs_start = from + rel_start;
    let content_start = abs_start + key.len();
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
    // abs_end points to the byte just after the closing brace in `s`
    let abs_end = content_start + end + 1; // +1 skips the closing `}`
    Ok((&rest[..end], abs_end))
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
        let child_idx = parse_powl_model_string(tok, arena).map_err(|e| e.to_string())?;
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

// ─── Sequence operator parsing ─────────────────────────────────────────────────

fn parse_sequence_operator(s: &str, arena: &mut PowlArena) -> Result<u32, String> {
    // Remove "-> (" or "->("
    let after_prefix = if s.starts_with("-> (") {
        &s[4..]
    } else if s.starts_with("->(") {
        &s[3..]
    } else {
        return Err("parse_sequence: invalid prefix".to_string());
    };

    // Find the matching closing parenthesis
    let mut depth = 1usize;
    let mut closing_idx = None;
    for (i, ch) in after_prefix.char_indices() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => {
                depth -= 1;
                if depth == 0 {
                    closing_idx = Some(i);
                    break;
                }
            }
            _ => {}
        }
    }

    let closing_idx = closing_idx.ok_or_else(|| "parse_sequence: missing closing )".to_string())?;
    let content = &after_prefix[..closing_idx];

    // Tokenize children
    let tokens = tokenize(content);
    let mut children = Vec::new();
    for token in tokens {
        if !token.is_empty() && token != "," {
            let op = parse_powl_model_string(&token, arena).map_err(|e| e.to_string())?;
            children.push(op);
        }
    }

    if children.is_empty() {
        return Err("parse_sequence: no children".to_string());
    }

    // Create total-order sequence: all i < j edges
    Ok(arena.add_sequence(children))
}

// ─── Parallel operator parsing ─────────────────────────────────────────────────

fn parse_parallel_operator(s: &str, arena: &mut PowlArena) -> Result<u32, String> {
    // Remove "+ (" or "+("
    let after_prefix = if s.starts_with("+ (") {
        &s[3..]
    } else if s.starts_with("+(") {
        &s[2..]
    } else {
        return Err("parse_parallel: invalid prefix".to_string());
    };

    // Find the matching closing parenthesis
    let mut depth = 1usize;
    let mut closing_idx = None;
    for (i, ch) in after_prefix.char_indices() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => {
                depth -= 1;
                if depth == 0 {
                    closing_idx = Some(i);
                    break;
                }
            }
            _ => {}
        }
    }

    let closing_idx = closing_idx.ok_or_else(|| "parse_parallel: missing closing )".to_string())?;
    let content = &after_prefix[..closing_idx];

    // Tokenize children
    let tokens = tokenize(content);
    let mut children = Vec::new();
    for token in tokens {
        if !token.is_empty() && token != "," {
            let op = parse_powl_model_string(&token, arena).map_err(|e| e.to_string())?;
            children.push(op);
        }
    }

    if children.is_empty() {
        return Err("parse_parallel: no children".to_string());
    }

    // Create unordered parallel: no edges, pure partial order
    Ok(arena.add_strict_partial_order(children))
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

    #[test]
    fn parse_sequence_operator() {
        let (arena, root) = parse("-> (a b c)");
        assert!(arena.get(root).is_some());
    }

    #[test]
    fn parse_sequence_operator_nested() {
        let (arena, root) = parse("-> (-> (a b) c)");
        assert!(arena.get(root).is_some());
    }

    #[test]
    fn parse_sequence_operator_with_tau() {
        let (arena, root) = parse("-> (a tau b)");
        assert!(arena.get(root).is_some());
    }

    #[test]
    fn parse_parallel_operator() {
        let (arena, root) = parse("+ (a b c)");
        assert!(arena.get(root).is_some());
    }

    #[test]
    fn parse_parallel_operator_three_children() {
        let (arena, root) = parse("+ (x y z)");
        assert!(arena.get(root).is_some());
    }

    #[test]
    fn parse_parallel_operator_nested() {
        let (arena, root) = parse("+ (+ (a b) c)");
        assert!(arena.get(root).is_some());
    }
}
