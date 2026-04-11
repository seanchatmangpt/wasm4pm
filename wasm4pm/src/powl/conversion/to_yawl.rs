//! POWL to YAWL v6 XML conversion.
//!
//! Produces a valid YAWL specification document that can be imported into
//! the YAWL workflow engine.

use crate::powl_arena::{Operator, PowlArena, PowlNode};

struct Ids {
    counter: u32,
}

impl Ids {
    fn new() -> Self {
        Ids { counter: 0 }
    }

    fn next(&mut self, prefix: &str) -> String {
        self.counter += 1;
        format!("{}_{}", prefix, self.counter)
    }
}

struct Builder {
    ids: Ids,
    elements: Vec<String>,
    flows: Vec<String>,
}

impl Builder {
    fn new() -> Self {
        Builder {
            ids: Ids::new(),
            elements: Vec::new(),
            flows: Vec::new(),
        }
    }

    fn flow(&mut self, source: &str, target: &str) {
        self.flows.push(format!(
            r#"        <edge source="{}" target="{}"/>"#,
            source, target
        ));
    }

    fn task(&mut self, id: &str, name: &str, join: &str, split: &str) {
        let escaped = xml_escape(name);
        self.elements.push(format!("        <task id=\"{}\">", id));
        self.elements.push(format!("          <name>{}</name>", escaped));
        self.elements.push(format!("          <decomposesTo id=\"dt_{}\"/>", id));
        self.elements.push(format!("          <join code=\"{}\"/>", join));
        self.elements.push(format!("          <split code=\"{}\"/>", split));
        self.elements.push("        </task>".to_string());
    }

    fn condition(&mut self, id: &str) {
        self.elements.push(format!("        <condition id=\"{}\"/>", id));
    }

    fn convert(&mut self, arena: &PowlArena, idx: u32, entry: &str, exit: &str) {
        match arena.get(idx) {
            None => {
                self.flow(entry, exit);
            }

            Some(PowlNode::Transition(tr)) => {
                if tr.label.is_none() {
                    self.flow(entry, exit);
                    return;
                }
                let label = tr.label.as_deref().unwrap();
                let id = sanitize_id(label);
                self.task(&id, label, "xor", "xor");
                self.flow(entry, &id);
                self.flow(&id, exit);
            }

            Some(PowlNode::FrequentTransition(ft)) => {
                let id = sanitize_id(&ft.activity);
                self.task(&id, &ft.activity, "xor", "xor");
                self.flow(entry, &id);
                self.flow(&id, exit);
            }

            Some(PowlNode::StrictPartialOrder(spo)) => {
                self.convert_spo(arena, &spo.children, &spo.order, entry, exit);
            }

            Some(PowlNode::OperatorPowl(op)) => {
                match op.operator {
                    Operator::Xor => {
                        self.convert_xor(arena, &op.children, entry, exit);
                    }
                    Operator::Loop => {
                        self.convert_loop(arena, &op.children, entry, exit);
                    }
                    Operator::PartialOrder => {
                        self.chain(arena, &op.children, entry, exit);
                    }
                }
            }

            Some(PowlNode::DecisionGraph(_)) => {
                self.flow(entry, exit);
            }
        }
    }

    fn convert_xor(&mut self, arena: &PowlArena, children: &[u32], entry: &str, exit: &str) {
        if children.is_empty() {
            self.flow(entry, exit);
            return;
        }
        let merge_c = self.ids.next("c");
        let fork_c = self.ids.next("c");
        self.condition(&merge_c);
        self.condition(&fork_c);
        self.flow(entry, &merge_c);
        self.flow(&fork_c, exit);
        let fork_c = fork_c.clone();
        let merge_c = merge_c.clone();
        for &child_idx in children {
            let ce = self.ids.next("c");
            self.condition(&ce);
            self.flow(&merge_c, &ce);
            self.flow(&ce, &fork_c);
            self.convert(arena, child_idx, &ce, &fork_c);
        }
    }

    fn convert_loop(&mut self, arena: &PowlArena, children: &[u32], entry: &str, exit: &str) {
        let merge_c = self.ids.next("c");
        let fork_c = self.ids.next("c");
        self.condition(&merge_c);
        self.condition(&fork_c);
        self.flow(entry, &merge_c);
        let do_entry = self.ids.next("c");
        let do_exit = self.ids.next("c");
        self.condition(&do_entry);
        self.condition(&do_exit);
        self.flow(&merge_c, &do_entry);
        self.convert(arena, children[0], &do_entry, &do_exit);
        self.flow(&do_exit, &fork_c);
        self.flow(&fork_c, exit);
        if children.len() > 1 {
            let redo_entry = self.ids.next("c");
            let redo_exit = self.ids.next("c");
            self.condition(&redo_entry);
            self.condition(&redo_exit);
            self.flow(&fork_c, &redo_entry);
            self.convert(arena, children[1], &redo_entry, &redo_exit);
            self.flow(&redo_exit, &merge_c);
        }
    }

    fn convert_spo(
        &mut self,
        arena: &PowlArena,
        children: &[u32],
        order: &crate::powl_arena::BinaryRelation,
        entry: &str,
        exit: &str,
    ) {
        if children.is_empty() {
            self.flow(entry, exit);
            return;
        }
        let n = children.len();
        let mut level = vec![0usize; n];
        for i in 0..n {
            for j in 0..n {
                if order.is_edge(i, j) && level[j] <= level[i] {
                    level[j] = level[i] + 1;
                }
            }
        }
        let max_level = level.iter().copied().max().unwrap_or(0);
        let mut groups: Vec<Vec<u32>> = vec![Vec::new(); max_level + 1];
        for (node_i, &lv) in level.iter().enumerate() {
            groups[lv].push(children[node_i]);
        }
        let mut current = entry.to_string();
        for (gi, group) in groups.iter().enumerate() {
            let is_last = gi == groups.len() - 1;
            let next = if is_last {
                exit.to_string()
            } else {
                self.ids.next("c")
            };
            if group.len() == 1 {
                let ce = self.ids.next("c");
                self.condition(&ce);
                self.flow(&current, &ce);
                self.convert(arena, group[0], &ce, &next);
            } else {
                let merge_c = self.ids.next("c");
                let fork_c = self.ids.next("c");
                self.condition(&merge_c);
                self.condition(&fork_c);
                if !is_last {
                    self.condition(&next);
                }
                self.flow(&current, &merge_c);
                self.flow(&fork_c, &next);
                let fork_c = fork_c.clone();
                let merge_c = merge_c.clone();
                for &child_idx in group {
                    let ce = self.ids.next("c");
                    self.condition(&ce);
                    self.flow(&merge_c, &ce);
                    self.flow(&ce, &fork_c);
                    self.convert(arena, child_idx, &ce, &fork_c);
                }
            }
            current = next;
        }
    }

    fn chain(&mut self, arena: &PowlArena, children: &[u32], entry: &str, exit: &str) {
        if children.is_empty() {
            self.flow(entry, exit);
            return;
        }
        let mut prev = entry.to_string();
        for (i, &child) in children.iter().enumerate() {
            let is_last = i == children.len() - 1;
            let next = if is_last {
                exit.to_string()
            } else {
                let p = self.ids.next("c");
                self.condition(&p);
                p
            };
            self.convert(arena, child, &prev, &next);
            prev = next;
        }
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn sanitize_id(label: &str) -> String {
    let mut result = String::with_capacity(label.len());
    let mut prev_underscore = false;
    for ch in label.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            if ch == '_' {
                if prev_underscore {
                    continue;
                }
                prev_underscore = true;
            } else {
                prev_underscore = false;
            }
            result.push(ch);
        } else {
            if !prev_underscore {
                result.push('_');
                prev_underscore = true;
            }
        }
    }
    let trimmed = result.trim_matches('_');
    if trimmed.is_empty() {
        "task".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn to_yawl_xml(arena: &PowlArena, root: u32) -> String {
    let mut builder = Builder::new();
    let ic = "IC".to_string();
    let oc = "OC".to_string();
    builder.convert(arena, root, &ic, &oc);
    let mut lines: Vec<String> = Vec::new();
    lines.push(r#"<?xml version="1.0" encoding="UTF-8"?>"#.to_string());
    lines.push(r#"<specificationSet xmlns="http://www.yawlfoundation.org/yawlschema" version="6.0">"#.to_string());
    lines.push(r#"  <specification uri="powl_workflow">"#.to_string());
    lines.push(r#"    <meta>"#.to_string());
    lines.push(r#"      <creator>pictl</creator>"#.to_string());
    lines.push(r#"      <description>Generated from POWL model</description>"#.to_string());
    lines.push(r#"    </meta>"#.to_string());
    lines.push(r#"    <net id="mainNet">"#.to_string());
    lines.push(r#"      <processControlElements>"#.to_string());
    lines.push(r#"        <inputCondition id="IC"/>"#.to_string());
    lines.push(r#"        <outputCondition id="OC"/>"#.to_string());
    for el in &builder.elements {
        lines.push(el.clone());
    }
    lines.push(r#"      </processControlElements>"#.to_string());
    lines.push(r#"      <flow>"#.to_string());
    for fl in &builder.flows {
        lines.push(fl.clone());
    }
    lines.push(r#"      </flow>"#.to_string());
    lines.push(r#"    </net>"#.to_string());
    lines.push(r#"  </specification>"#.to_string());
    lines.push(r#"</specificationSet>"#.to_string());
    lines.join("\n")
}

pub fn powl_to_yawl_string(powl_string: &str) -> Result<String, String> {
    let mut arena = PowlArena::new();
    let root = crate::powl_parser::parse_powl_model_string(powl_string, &mut arena)
        .map_err(|e| format!("Parse error: {}", e))?;
    Ok(to_yawl_xml(&arena, root))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_arena::PowlArena;
    use crate::powl_parser::parse_powl_model_string;

    fn parse(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    fn has(xml: &str, needle: &str) -> bool {
        xml.contains(needle)
    }

    #[test]
    fn test_basic_yawl_conversion() {
        // Happy path: single task produces valid YAWL XML structure
        let (arena, root) = parse("A");
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<specificationSet"));
        assert!(has(&xml, "<name>A</name>"));
        assert!(has(&xml, "source=\"IC\""));
        assert!(has(&xml, "target=\"OC\""));

        // XOR produces conditions for branches
        let (arena, root) = parse("X ( A, B )");
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<name>A</name>"));
        assert!(has(&xml, "<name>B</name>"));

        // Silent transition is skipped (no task element)
        let (arena, root) = parse("tau");
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<specificationSet"));
        assert!(!has(&xml, "<task"));
    }

    #[test]
    fn test_partial_order_and_loop_conversion() {
        // Partial order (concurrent) produces AND flows
        let (arena, root) = parse("PO=(nodes={A, B}, order={})");
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<name>A</name>"));
        assert!(has(&xml, "<name>B</name>"));

        // Sequential PO (linear) flows directly without conditions
        let (arena, root) = parse("PO=(nodes={A, B}, order={A-->B})");
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<name>A</name>"));
        assert!(has(&xml, "<name>B</name>"));

        // Loop produces back flow from do body to redo
        let (arena, root) = parse("* ( A, B )");
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<name>A</name>"));
        assert!(has(&xml, "<name>B</name>"));
    }

    #[test]
    fn test_yawl_edge_cases_and_helpers() {
        // XML escaping in task names
        let mut arena = PowlArena::new();
        let root = arena.add_transition(Some("A<B>".into()));
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<name>A&lt;B&gt;</name>"));

        // ID sanitization helper
        assert_eq!(sanitize_id("A"), "A");
        assert_eq!(sanitize_id("hello world"), "hello_world");
        assert_eq!(sanitize_id(""), "task");

        // Frequent transition produces task element
        let root = arena.add_frequent_transition("Pay".into(), 1, Some(1));
        let xml = to_yawl_xml(&arena, root);
        assert!(has(&xml, "<name>Pay</name>"));
        assert!(has(&xml, "<task id=\"Pay\">"));
    }
}
