/// DFG text format parser ported from pm4py classic importer.
///
/// File format (pm4py `.dfg`):
///   Line 0:        number of activities (N)
///   Lines 1..N:    activity names (one per line)
///   Line N+1:      number of start activities (SA)
///   Lines N+2..:   "idx x count"  (e.g. "0x5")
///   Then:          number of end activities (EA)
///   Then EA lines: "idx x count"
///   Then:          number of DFG edges (E) — **optional header line**
///   Then E lines:  "from_idx>to_idx x count"
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::error::{self, codes};
use crate::models::{DFGNode, DirectlyFollowsRelation, DFG};
use crate::state;

// ── Public result type ────────────────────────────────────────────────────────

/// Parsed DFG as plain Rust types (mirrors pm4py's triple return value).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DfgResult {
    /// Directly-follows counts keyed by (from, to) activity names.
    pub dfg: HashMap<(String, String), u64>,
    /// Activities that start traces and their counts.
    pub start_activities: HashMap<String, u64>,
    /// Activities that end traces and their counts.
    pub end_activities: HashMap<String, u64>,
}

// ── Core parser ───────────────────────────────────────────────────────────────

/// Parse a pm4py `.dfg` text file.
///
/// # Errors
/// Returns a descriptive `String` when the input is malformed.
pub fn parse_dfg_text(content: &str) -> Result<DfgResult, String> {
    // Collect non-empty lines (mirrors pm4py readlines behaviour; blank lines
    // that only carry a newline are preserved as empty strings in pm4py but
    // skipped here because the format never requires them).
    let rows: Vec<&str> = content.lines().collect();

    if rows.is_empty() {
        return Err("DFG file is empty".to_string());
    }

    let mut i = 0usize;

    // ── Activities ────────────────────────────────────────────────────────────
    let num_activities: usize = rows[i]
        .trim()
        .parse()
        .map_err(|_| format!("Line {}: expected activity count, got {:?}", i, rows[i]))?;
    i += 1;

    let mut activities: Vec<String> = Vec::with_capacity(num_activities);
    for _ in 0..num_activities {
        if i >= rows.len() {
            return Err(format!(
                "Unexpected EOF reading activity names (expected {})",
                num_activities
            ));
        }
        activities.push(rows[i].trim().to_string());
        i += 1;
    }

    // ── Start activities ──────────────────────────────────────────────────────
    if i >= rows.len() {
        return Err("Unexpected EOF before start-activity count".to_string());
    }
    let num_sa: usize = rows[i].trim().parse().map_err(|_| {
        format!(
            "Line {}: expected start-activity count, got {:?}",
            i, rows[i]
        )
    })?;
    i += 1;

    let mut start_activities: HashMap<String, u64> = HashMap::with_capacity(num_sa);
    for _ in 0..num_sa {
        if i >= rows.len() {
            return Err("Unexpected EOF reading start activities".to_string());
        }
        let (act, count) = parse_idx_x_count(rows[i], &activities, i)?;
        start_activities.insert(act, count);
        i += 1;
    }

    // ── End activities ────────────────────────────────────────────────────────
    if i >= rows.len() {
        return Err("Unexpected EOF before end-activity count".to_string());
    }
    let num_ea: usize = rows[i]
        .trim()
        .parse()
        .map_err(|_| format!("Line {}: expected end-activity count, got {:?}", i, rows[i]))?;
    i += 1;

    let mut end_activities: HashMap<String, u64> = HashMap::with_capacity(num_ea);
    for _ in 0..num_ea {
        if i >= rows.len() {
            return Err("Unexpected EOF reading end activities".to_string());
        }
        let (act, count) = parse_idx_x_count(rows[i], &activities, i)?;
        end_activities.insert(act, count);
        i += 1;
    }

    // ── DFG edges ─────────────────────────────────────────────────────────────
    // pm4py does NOT emit an edge-count header — it just reads until EOF.
    // However some exporters do emit one; we handle both: if the next line
    // contains no '>' separator and parses as a plain integer we treat it as
    // an optional edge count and skip it.
    if i < rows.len() {
        let candidate = rows[i].trim();
        if !candidate.contains('>') {
            if candidate.parse::<usize>().is_ok() {
                // optional edge-count header — consume and ignore
                i += 1;
            }
        }
    }

    let mut dfg: HashMap<(String, String), u64> = HashMap::new();
    while i < rows.len() {
        let line = rows[i].trim();
        if line.is_empty() {
            i += 1;
            continue;
        }
        // Format: "from_idx>to_idx x count"
        let (acts_part, count_str) = line
            .rsplit_once('x')
            .ok_or_else(|| format!("Line {}: expected 'idx>idx x count', got {:?}", i, line))?;
        let count: u64 = count_str
            .trim()
            .parse()
            .map_err(|_| format!("Line {}: invalid count {:?}", i, count_str))?;

        let (from_str, to_str) = acts_part
            .trim()
            .split_once('>')
            .ok_or_else(|| format!("Line {}: expected 'from>to', got {:?}", i, acts_part))?;

        let from_idx: usize = from_str
            .trim()
            .parse()
            .map_err(|_| format!("Line {}: invalid from-index {:?}", i, from_str))?;
        let to_idx: usize = to_str
            .trim()
            .parse()
            .map_err(|_| format!("Line {}: invalid to-index {:?}", i, to_str))?;

        let from_act = activities
            .get(from_idx)
            .ok_or_else(|| format!("Line {}: from-index {} out of range", i, from_idx))?
            .clone();
        let to_act = activities
            .get(to_idx)
            .ok_or_else(|| format!("Line {}: to-index {} out of range", i, to_idx))?
            .clone();

        dfg.insert((from_act, to_act), count);
        i += 1;
    }

    Ok(DfgResult {
        dfg,
        start_activities,
        end_activities,
    })
}

// ── Helper ────────────────────────────────────────────────────────────────────

fn parse_idx_x_count(
    line: &str,
    activities: &[String],
    lineno: usize,
) -> Result<(String, u64), String> {
    let (idx_str, count_str) = line
        .trim()
        .split_once('x')
        .ok_or_else(|| format!("Line {}: expected 'idx x count', got {:?}", lineno, line))?;
    let idx: usize = idx_str
        .trim()
        .parse()
        .map_err(|_| format!("Line {}: invalid index {:?}", lineno, idx_str))?;
    let count: u64 = count_str
        .trim()
        .parse()
        .map_err(|_| format!("Line {}: invalid count {:?}", lineno, count_str))?;
    let act = activities
        .get(idx)
        .ok_or_else(|| format!("Line {}: activity index {} out of range", lineno, idx))?
        .clone();
    Ok((act, count))
}

// ── WASM export ───────────────────────────────────────────────────────────────

/// Parse a pm4py `.dfg` text string, store the DFG in state, and return a
/// handle JSON object:
/// `{ handle, activity_count, edge_count, start_count, end_count }`
///
/// # Errors
/// Returns a `JsValue` error on malformed input or state failures.
#[wasm_bindgen]
pub fn load_dfg_from_text(content: &str) -> Result<JsValue, JsValue> {
    let result = parse_dfg_text(content)
        .map_err(|e| error::wasm_err(codes::INVALID_INPUT, format!("DFG parse error: {}", e)))?;

    // Convert DfgResult → models::DFG (the existing StoredObject::DFG variant)
    let mut dfg = DFG::new();

    // Build node map (activity → total frequency from edges + SA/EA)
    let mut node_freq: HashMap<String, usize> = HashMap::new();
    for ((from, to), count) in &result.dfg {
        *node_freq.entry(from.clone()).or_insert(0) += *count as usize;
        *node_freq.entry(to.clone()).or_insert(0) += *count as usize;
    }
    // Ensure SA and EA activities also appear even if isolated
    for act in result
        .start_activities
        .keys()
        .chain(result.end_activities.keys())
    {
        node_freq.entry(act.clone()).or_insert(0);
    }

    for (act, freq) in &node_freq {
        dfg.nodes.push(DFGNode {
            id: act.clone(),
            label: act.clone(),
            frequency: *freq,
        });
    }
    dfg.nodes.sort_by(|a, b| a.id.cmp(&b.id));

    for ((from, to), count) in &result.dfg {
        dfg.edges.push(DirectlyFollowsRelation {
            from: from.clone(),
            to: to.clone(),
            frequency: *count as usize,
        });
    }
    dfg.edges
        .sort_by(|a, b| (a.from.as_str(), a.to.as_str()).cmp(&(b.from.as_str(), b.to.as_str())));

    for (act, count) in &result.start_activities {
        dfg.start_activities.insert(act.clone(), *count as usize);
    }
    for (act, count) in &result.end_activities {
        dfg.end_activities.insert(act.clone(), *count as usize);
    }

    let activity_count = dfg.nodes.len();
    let edge_count = dfg.edges.len();
    let start_count = dfg.start_activities.len();
    let end_count = dfg.end_activities.len();

    let app_state = state::get_or_init_state();
    let handle = app_state
        .store_object(state::StoredObject::DFG(dfg))
        .map_err(|e| {
            error::wasm_err(
                codes::INTERNAL_ERROR,
                format!("State store failed: {:?}", e),
            )
        })?;

    let response = serde_json::json!({
        "handle": handle,
        "activity_count": activity_count,
        "edge_count": edge_count,
        "start_count": start_count,
        "end_count": end_count,
    });

    serde_json::to_string(&response)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| {
            error::wasm_err(
                codes::INTERNAL_ERROR,
                format!("JSON serialisation failed: {}", e),
            )
        })
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_dfg_text() -> &'static str {
        "3\nA\nB\nC\n2\n0x10\n1x5\n1\n2x8\n2\n0>1x7\n1>2x4\n"
    }

    #[test]
    fn parses_activities() {
        let r = parse_dfg_text(sample_dfg_text()).unwrap();
        assert_eq!(r.start_activities.get("A"), Some(&10));
        assert_eq!(r.start_activities.get("B"), Some(&5));
        assert_eq!(r.end_activities.get("C"), Some(&8));
    }

    #[test]
    fn parses_edges() {
        let r = parse_dfg_text(sample_dfg_text()).unwrap();
        assert_eq!(r.dfg.get(&("A".to_string(), "B".to_string())), Some(&7));
        assert_eq!(r.dfg.get(&("B".to_string(), "C".to_string())), Some(&4));
        assert_eq!(r.dfg.len(), 2);
    }

    #[test]
    fn empty_input_errors() {
        assert!(parse_dfg_text("").is_err());
    }

    #[test]
    fn malformed_edge_errors() {
        // Missing '>' separator in edge line
        let bad = "1\nA\n0\n0\n1\nA A x 3\n";
        assert!(parse_dfg_text(bad).is_err());
    }
}
