//! ogse:// virtual document rendering for the OGSE Living Protocol Server.
//!
//! Routes an `ogse://` URI to a rendered markdown document drawn from the
//! current SubstrateIndex.  All rendering is pure — no I/O side effects.

use crate::ogse::substrate_index::SubstrateIndex;

// ── Public entry point ────────────────────────────────────────────────────────

/// Route an `ogse://` URI to a rendered markdown string.
///
/// Returns `None` when the URI does not match any known pattern.
pub fn render_virtual_doc(uri: &str, index: &SubstrateIndex) -> Option<String> {
    // Strip the scheme so we work with the path only.
    let path = uri.strip_prefix("ogse://").unwrap_or(uri);

    if let Some(algo) = path.strip_prefix("receipt/") {
        return Some(render_receipt(algo, index));
    }
    if let Some(algo) = path.strip_prefix("standing/") {
        return Some(render_standing(algo, index));
    }
    if path == "crown/pi" {
        return Some(render_crown_table(index));
    }
    if path == "residuals/current" {
        return Some(render_residuals(index));
    }
    if let Some(role) = path.strip_prefix("agent-context/") {
        return Some(render_agent_context(role, index));
    }
    if let Some(cat) = path.strip_prefix("category/") {
        return Some(render_category(cat, index));
    }

    None
}

// ── Receipt ───────────────────────────────────────────────────────────────────
//
// Shows all 6 crown field validation statuses from the Standing record:
//   declared · generated · receipted · falsified · admitted · receipt_crown_valid

fn render_receipt(algo: &str, index: &SubstrateIndex) -> String {
    let check = |b: bool| if b { "✓" } else { "✗" };

    match index.get(algo) {
        None => format!(
            "# Receipt: {algo}\n\nAlgorithm `{algo}` not found in substrate index.\n\nΛ(R) = 0\n",
        ),
        Some((_entry, standing)) => {
            // All 6 crown validation statuses
            format!(
                "# Receipt: {algo}\n\n\
                ## Crown Field Validation Statuses\n\n\
                | Crown Field | Status |\n\
                |---|---|\n\
                | declared | {declared} |\n\
                | generated | {generated} |\n\
                | receipted | {receipted} |\n\
                | falsified | {falsified} |\n\
                | admitted | {admitted} |\n\
                | receipt_crown_valid | {crown_valid} |\n\n\
                ## Metrics\n\n\
                | Field | Value |\n\
                |---|---|\n\
                | fitness | `{fitness:.6}` |\n\n\
                Λ(R) = {lambda_r}\n",
                algo = algo,
                declared = check(standing.declared),
                generated = check(standing.generated),
                receipted = check(standing.receipted),
                falsified = check(standing.falsified),
                admitted = check(standing.admitted),
                crown_valid = check(standing.receipt_crown_valid),
                fitness = standing.fitness,
                lambda_r = if standing.receipted && standing.receipt_crown_valid {
                    1
                } else {
                    0
                },
            )
        }
    }
}

// ── Standing ──────────────────────────────────────────────────────────────────

fn render_standing(algo: &str, index: &SubstrateIndex) -> String {
    let check = |b: bool| if b { "✓" } else { "✗" };

    match index.get(algo) {
        None => format!(
            "# Standing: {algo}\n\nAlgorithm not found in substrate index.\n\nΛ({algo}) = false\n",
        ),
        Some((_entry, standing)) => format!(
            "# Standing: {algo}\n\n\
            | Dimension | Status |\n\
            |---|---|\n\
            | Declared | {declared} |\n\
            | Generated | {generated} |\n\
            | Receipted | {receipted} |\n\
            | Falsified | {falsified} |\n\
            | Admitted | {admitted} |\n\
            | Receipt Crown Valid | {crown_valid} |\n\n\
            Fitness: `{fitness:.6}`\n\n\
            Λ({algo}) = {admitted_bool}\n",
            algo = algo,
            declared = check(standing.declared),
            generated = check(standing.generated),
            receipted = check(standing.receipted),
            falsified = check(standing.falsified),
            admitted = check(standing.admitted),
            crown_valid = check(standing.receipt_crown_valid),
            fitness = standing.fitness,
            admitted_bool = standing.admitted,
        ),
    }
}

// ── Crown table ───────────────────────────────────────────────────────────────

fn render_crown_table(index: &SubstrateIndex) -> String {
    let check = |b: bool| if b { "✓" } else { "✗" };

    let mut rows = String::new();
    for (id, entry, standing) in index.all() {
        rows.push_str(&format!(
            "| {id} | {cat} | {declared} | {generated} | {receipted} | {falsified} | {admitted} | {crown} | {fitness:.3} |\n",
            id = id,
            cat = entry.category,
            declared = check(standing.declared),
            generated = check(standing.generated),
            receipted = check(standing.receipted),
            falsified = check(standing.falsified),
            admitted = check(standing.admitted),
            crown = check(standing.receipt_crown_valid),
            fitness = standing.fitness,
        ));
    }

    if rows.is_empty() {
        return "# Crown Gate — PI Algorithm Admission Status\n\nNo algorithms in substrate index.\n".to_string();
    }

    format!(
        "# Crown Gate — PI Algorithm Admission Status\n\n\
        | Algorithm | Category | Declared | Generated | Receipted | Falsified | Admitted | Crown Valid | Fitness |\n\
        |---|---|---|---|---|---|---|---|---|\n\
        {rows}",
    )
}

// ── Residuals ─────────────────────────────────────────────────────────────────

fn render_residuals(index: &SubstrateIndex) -> String {
    let mut residuals: Vec<(&str, &crate::ogse::substrate_index::Standing)> = index
        .all()
        .filter(|(_, _, s)| !s.admitted)
        .map(|(id, _, s)| (id, s))
        .collect();

    if residuals.is_empty() {
        return "# Residuals\n\nNo residuals — all declared algorithms are admitted.\n".to_string();
    }

    // Sort for stable output
    residuals.sort_by_key(|(id, _)| *id);

    let mut lines = String::from("# Residuals\n\nAlgorithms declared but not yet admitted:\n\n");
    for (id, standing) in residuals {
        let blockers: Vec<&str> = [
            (!standing.generated).then_some("generated"),
            (!standing.receipted).then_some("receipted"),
            (!standing.falsified).then_some("falsified"),
            (!standing.receipt_crown_valid).then_some("receipt_crown_valid"),
        ]
        .into_iter()
        .flatten()
        .collect();
        let blocker_str = if blockers.is_empty() {
            "admission pending".to_string()
        } else {
            blockers.join(", ")
        };
        lines.push_str(&format!(
            "- `{}` — missing: {} (fitness: {:.3})\n",
            id, blocker_str, standing.fitness
        ));
    }
    lines
}

// ── Agent context ─────────────────────────────────────────────────────────────

fn render_agent_context(role: &str, index: &SubstrateIndex) -> String {
    let admitted_count = index.admitted_algorithms().len();
    let total_count = index.count();

    format!(
        "# AgentContext: {role}\n\n\
        ## Substrate Summary\n\n\
        - Total algorithms: {total}\n\
        - Admitted algorithms: {admitted}\n\
        - Residual algorithms: {residual}\n\n\
        ## Role Guidance\n\n\
        Role `{role}` should operate against the admitted algorithm set.\n\
        Consult `ogse://crown/pi` for full admission status.\n\
        Consult `ogse://residuals/current` for outstanding gaps.\n\n\
        See `packages/agent-context` for the TypeScript organ definitions.\n",
        role = role,
        total = total_count,
        admitted = admitted_count,
        residual = total_count.saturating_sub(admitted_count),
    )
}

// ── Category ──────────────────────────────────────────────────────────────────

fn render_category(cat: &str, index: &SubstrateIndex) -> String {
    let check = |b: bool| if b { "✓" } else { "✗" };

    let by_cat = index.algorithms_by_category();
    let entries = match by_cat.get(cat) {
        None => {
            // List available categories
            let cats: Vec<&str> = by_cat.keys().copied().collect();
            let cat_list = if cats.is_empty() {
                "none".to_string()
            } else {
                cats.iter()
                    .map(|c| format!("`{c}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            return format!(
                "# Category: {cat}\n\nCategory `{cat}` not found.\n\nAvailable categories: {cat_list}\n",
            );
        }
        Some(v) => v,
    };

    let mut rows = String::new();
    for (id, entry, standing) in entries {
        rows.push_str(&format!(
            "| {id} | {citation} | {declared} | {generated} | {receipted} | {falsified} | {admitted} | {fitness:.3} |\n",
            id = id,
            citation = entry.citation,
            declared = check(standing.declared),
            generated = check(standing.generated),
            receipted = check(standing.receipted),
            falsified = check(standing.falsified),
            admitted = check(standing.admitted),
            fitness = standing.fitness,
        ));
    }

    format!(
        "# Category: {cat}\n\n\
        | Algorithm | Citation | Declared | Generated | Receipted | Falsified | Admitted | Fitness |\n\
        |---|---|---|---|---|---|---|---|\n\
        {rows}",
    )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ogse::substrate_index::{AlgoEntry, Standing, SubstrateIndex};
    use std::collections::BTreeMap;

    fn stub_index() -> SubstrateIndex {
        let mut entries: BTreeMap<String, (AlgoEntry, Standing)> = BTreeMap::new();

        entries.insert(
            "alpha_miner".to_string(),
            (
                AlgoEntry {
                    id: "alpha_miner".to_string(),
                    wasm_export: "alpha_miner".to_string(),
                    ttl_line: 10,
                    category: "discovery".to_string(),
                    citation: "van der Aalst 2004".to_string(),
                },
                Standing {
                    declared: true,
                    generated: true,
                    receipted: true,
                    falsified: true,
                    admitted: true,
                    fitness: 1.0,
                    receipt_crown_valid: true,
                    registry_export: "alpha_miner".to_string(),
                },
            ),
        );

        entries.insert(
            "heuristics_miner".to_string(),
            (
                AlgoEntry {
                    id: "heuristics_miner".to_string(),
                    wasm_export: "heuristics_miner".to_string(),
                    ttl_line: 20,
                    category: "discovery".to_string(),
                    citation: "Weijters 2006".to_string(),
                },
                Standing {
                    declared: true,
                    generated: false,
                    receipted: false,
                    falsified: false,
                    admitted: false,
                    fitness: 0.0,
                    receipt_crown_valid: false,
                    registry_export: String::new(),
                },
            ),
        );

        SubstrateIndex::from_entries(entries)
    }

    #[test]
    fn receipt_shows_all_6_crown_statuses() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://receipt/alpha_miner", &idx).unwrap();
        // All 6 crown field validation statuses must appear
        assert!(out.contains("declared"), "must show declared");
        assert!(out.contains("generated"), "must show generated");
        assert!(out.contains("receipted"), "must show receipted");
        assert!(out.contains("falsified"), "must show falsified");
        assert!(out.contains("admitted"), "must show admitted");
        assert!(
            out.contains("receipt_crown_valid"),
            "must show receipt_crown_valid"
        );
        assert!(
            out.contains("Λ(R) = 1"),
            "admitted receipt should show Λ(R) = 1"
        );
    }

    #[test]
    fn receipt_missing_shows_lambda_r_0() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://receipt/heuristics_miner", &idx).unwrap();
        assert!(out.contains("Λ(R) = 0"));
        assert!(out.contains("receipt_crown_valid"));
    }

    #[test]
    fn receipt_unknown_algo() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://receipt/nonexistent", &idx).unwrap();
        assert!(out.contains("not found"));
        assert!(out.contains("Λ(R) = 0"));
    }

    #[test]
    fn standing_contains_lambda_symbol() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://standing/alpha_miner", &idx).unwrap();
        // Must contain literal Λ character
        assert!(out.contains('Λ'), "standing must contain Λ");
        assert!(out.contains("true"));
    }

    #[test]
    fn standing_unknown_algo() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://standing/nonexistent", &idx).unwrap();
        assert!(out.contains("not found"));
        assert!(out.contains('Λ'));
    }

    #[test]
    fn crown_table_has_all_algorithms() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://crown/pi", &idx).unwrap();
        assert!(out.contains("Crown Gate"), "must contain Crown Gate header");
        assert!(out.contains("Algorithm"), "must have Algorithm column");
        assert!(out.contains("Admitted"), "must have Admitted column");
        // Must include all algorithms from the index
        assert!(out.contains("alpha_miner"), "must include alpha_miner");
        assert!(
            out.contains("heuristics_miner"),
            "must include heuristics_miner"
        );
        // Must be a markdown table (pipes)
        assert!(out.contains('|'), "must be a markdown table");
    }

    #[test]
    fn residuals_lists_non_admitted_algo() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://residuals/current", &idx).unwrap();
        assert!(
            out.contains("heuristics_miner"),
            "partial algo must appear in residuals"
        );
        // alpha_miner is admitted so should not appear in residuals body
        let lines: Vec<&str> = out.lines().filter(|l| l.contains("alpha_miner")).collect();
        assert!(
            lines.is_empty(),
            "admitted algo must not appear in residuals"
        );
    }

    #[test]
    fn agent_context_shows_substrate_summary() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://agent-context/planner", &idx).unwrap();
        assert!(out.contains("AgentContext: planner"));
        assert!(out.contains("packages/agent-context"));
        assert!(out.contains("TypeScript organ"));
        assert!(out.contains("Total algorithms"));
    }

    #[test]
    fn category_route_exists_and_returns_table() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://category/discovery", &idx).unwrap();
        assert!(
            out.contains("Category: discovery"),
            "header must name category"
        );
        assert!(out.contains("alpha_miner"), "must include alpha_miner");
        assert!(
            out.contains("heuristics_miner"),
            "must include heuristics_miner"
        );
        assert!(out.contains('|'), "must be a markdown table");
    }

    #[test]
    fn category_unknown_returns_available_list() {
        let idx = stub_index();
        let out = render_virtual_doc("ogse://category/unknown_cat", &idx).unwrap();
        assert!(out.contains("not found"));
        assert!(
            out.contains("discovery"),
            "should list available categories"
        );
    }

    #[test]
    fn unknown_uri_returns_none() {
        let idx = stub_index();
        assert!(render_virtual_doc("ogse://unknown/path", &idx).is_none());
    }
}
