/// Process Tree SVG Visualization
///
/// Renders POWL models as SVG with colored operator nodes and activity labels.
use crate::powl_arena::PowlArena;
use std::fmt::Write;

/// Color scheme for operator nodes
const COLORS: &[&str] = &[
    "#FFD700", // XOR - gold/yellow
    "#FF8C00", // LOOP - dark orange
    "#32CD32", // PARALLEL - lime green
    "#87CEEB", // SEQUENCE - sky blue
    "#DDA0DD", // MOVE_MERGE - plum
    "#F0E68C", // SILENT_MOVE_MERGE - khaki
    "#FF6B6B", // TRANSITIVE - light red
];

/// Node dimensions
const NODE_WIDTH: i32 = 120;
const NODE_HEIGHT: i32 = 50;
const HORIZONTAL_SPACING: i32 = 30;
const VERTICAL_SPACING: i32 = 60;

/// Get node label and color
fn get_node_info(arena: &PowlArena, idx: u32) -> (String, String, bool) {
    let node = arena.get(idx);
    match node {
        None => ("?".to_string(), "#cccccc".to_string(), false),
        Some(crate::powl_arena::PowlNode::Transition(tr)) => {
            let label = tr.label.as_deref().unwrap_or("τ").to_string();
            let is_silent = tr.label.is_none();
            (label, "#ffffff".to_string(), is_silent)
        }
        Some(crate::powl_arena::PowlNode::FrequentTransition(ft)) => {
            (ft.activity.clone(), "#ffffff".to_string(), false)
        }
        Some(crate::powl_arena::PowlNode::OperatorPowl(op)) => {
            let op_name = op.operator.as_str();
            let (label, color_idx) = match op_name {
                "X" | "×" => ("×", 0),  // XOR (both Latin X and multiplication sign)
                "→" => ("→", 3),        // SEQUENCE
                "*" => ("*", 1),        // LOOP
                "+" | "PO" => ("+", 2), // PARALLEL
                "⇧" => ("⇧", 4),        // MOVE_MERGE
                "⇩" => ("⇩", 5),        // SILENT_MOVE_MERGE
                "↔" => ("↔", 6),        // TRANSITIVE
                _ => ("?", 0),
            };
            (label.to_string(), COLORS[color_idx].to_string(), true)
        }
        Some(crate::powl_arena::PowlNode::StrictPartialOrder(_)) => {
            ("SPO".to_string(), COLORS[2].to_string(), true)
        }
        Some(crate::powl_arena::PowlNode::DecisionGraph(_)) => {
            ("DG".to_string(), COLORS[3].to_string(), true)
        }
    }
}

/// Get children of a node
fn get_children(arena: &PowlArena, idx: u32) -> Vec<u32> {
    let node = arena.get(idx);
    match node {
        Some(crate::powl_arena::PowlNode::OperatorPowl(op)) => op.children.clone(),
        Some(crate::powl_arena::PowlNode::StrictPartialOrder(spo)) => spo.children.clone(),
        Some(crate::powl_arena::PowlNode::DecisionGraph(dg)) => dg.children.clone(),
        _ => Vec::new(),
    }
}

/// Compute layout dimensions
fn compute_layout(arena: &PowlArena, root: u32) -> (i32, i32) {
    let children = get_children(arena, root);
    if children.is_empty() {
        (NODE_WIDTH, NODE_HEIGHT)
    } else {
        let mut total_width = 0;
        let mut max_height = NODE_HEIGHT;
        for child_idx in &children {
            let (w, h) = compute_layout(arena, *child_idx);
            total_width += w + HORIZONTAL_SPACING;
            max_height = max_height.max(h + VERTICAL_SPACING);
        }
        (total_width - HORIZONTAL_SPACING, max_height + NODE_HEIGHT)
    }
}

/// Render tree recursively
fn render_tree_recursive(
    arena: &PowlArena,
    root: u32,
    x: i32,
    y: i32,
    buffer: &mut String,
    id_counter: &mut usize,
) {
    let (label, color, is_operator) = get_node_info(arena, root);
    let id = format!("node_{}", id_counter);
    *id_counter += 1;

    // Write node
    let fill = if is_operator { &color } else { "#ffffff" };
    let escaped_label = label
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");

    write!(
        buffer,
        r#"<rect id="{}" x="{}" y="{}" width="{}" height="{}" fill="{}" class="node" rx="5"/>"#,
        id, x, y, NODE_WIDTH, NODE_HEIGHT, fill
    )
    .unwrap();

    let text_y = y + NODE_HEIGHT / 2 + 4;
    write!(
        buffer,
        r#"<text x="{}" y="{}" class="label">{}</text>"#,
        x + NODE_WIDTH / 2,
        text_y,
        escaped_label
    )
    .unwrap();

    // Render children
    let children = get_children(arena, root);
    if !children.is_empty() {
        let child_y = y + NODE_HEIGHT + VERTICAL_SPACING;
        let mut child_x = x;
        let total_child_width: i32 = children.iter().map(|c| compute_layout(arena, *c).0).sum();
        let total_spacing = (children.len() - 1) as i32 * HORIZONTAL_SPACING;
        let available_width = total_child_width + total_spacing;

        // Center children under parent
        if available_width < NODE_WIDTH {
            child_x += (NODE_WIDTH - available_width) / 2;
        }

        for child_idx in children {
            // Draw edge from parent to child
            let parent_bottom_x = x + NODE_WIDTH / 2;
            let parent_bottom_y = y + NODE_HEIGHT;
            let (child_w, _) = compute_layout(arena, child_idx);
            let child_top_x = child_x + child_w / 2;
            let child_top_y = child_y;

            write!(buffer,
                "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"#333\" stroke-width=\"2\"/>",
                parent_bottom_x, parent_bottom_y, child_top_x, child_top_y
            ).unwrap();

            // Recursively render child
            render_tree_recursive(arena, child_idx, child_x, child_y, buffer, id_counter);

            // Move to next child position
            child_x += child_w + HORIZONTAL_SPACING;
        }
    }
}

/// Render a POWL model as SVG.
///
/// # Arguments
/// * `arena` - POWL arena containing the model
/// * `root` - Root node index
///
/// # Returns
/// SVG string
pub fn render_process_tree_svg(arena: &PowlArena, root: u32) -> String {
    let mut buffer = String::new();
    let (width, height) = compute_layout(arena, root);

    // Write header
    write!(
        buffer,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}" viewBox="0 0 {} {}">"#,
        width + 40,
        height + 40,
        width + 40,
        height + 40
    )
    .unwrap();
    write!(buffer, "<style>").unwrap();
    write!(buffer, ".node {{ stroke: #333; stroke-width: 2px; }}").unwrap();
    write!(
        buffer,
        ".label {{ font-family: Arial, sans-serif; font-size: 12px; text-anchor: middle; }}"
    )
    .unwrap();
    write!(buffer, "</style>").unwrap();

    // Render tree
    let mut id_counter = 0;
    render_tree_recursive(arena, root, 20, 20, &mut buffer, &mut id_counter);

    // Write footer
    write!(buffer, "</svg>").unwrap();
    buffer
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    #[test]
    fn test_svg_generation() {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string("X(A, B)", &mut arena).unwrap();
        let svg = render_process_tree_svg(&arena, root);

        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
        assert!(svg.contains("×")); // XOR operator
        assert!(svg.contains("A")); // Activity A
        assert!(svg.contains("B")); // Activity B
    }

    #[test]
    fn test_loop_colors() {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string("*(A, B)", &mut arena).unwrap();
        let svg = render_process_tree_svg(&arena, root);

        assert!(svg.contains("#FF8C00")); // LOOP orange color
        assert!(svg.contains("*"));
    }

    #[test]
    fn test_parallel_colors() {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string("PO=(nodes={A, B}, order={})", &mut arena).unwrap();
        let svg = render_process_tree_svg(&arena, root);

        assert!(svg.contains("#32CD32")); // PARALLEL green color
        assert!(svg.contains("SPO"));
    }
}
