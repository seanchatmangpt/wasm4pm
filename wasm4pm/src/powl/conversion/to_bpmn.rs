/// POWL to BPMN 2.0 XML conversion.
use crate::powl_arena::{PowlArena, PowlNode};

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
    flow_counter: u32,
}

impl Builder {
    fn new() -> Self {
        Builder {
            ids: Ids::new(),
            elements: Vec::new(),
            flows: Vec::new(),
            flow_counter: 0,
        }
    }

    fn flow(&mut self, source: &str, target: &str) {
        self.flow_counter += 1;
        let id = format!("flow_{}", self.flow_counter);
        self.flows.push(format!(
            r#"    <sequenceFlow id="{}" sourceRef="{}" targetRef="{}"/>"#,
            id, source, target
        ));
    }

    fn convert(&mut self, arena: &PowlArena, idx: u32, entry: &str, exit: &str) {
        match arena.get(idx) {
            None => {
                let t = self.ids.next("tau");
                self.elements.push(format!(
                    r#"    <serviceTask id="{}" name="" pm4py:silent="true"/>"#,
                    t
                ));
                self.flow(entry, &t);
                self.flow(&t, exit);
            }
            Some(PowlNode::Transition(tr)) => {
                if let Some(label) = &tr.label {
                    let id = self.ids.next("task");
                    let escaped = xml_escape(label);
                    self.elements
                        .push(format!(r#"    <task id="{}" name="{}"/>"#, id, escaped));
                    self.flow(entry, &id);
                    self.flow(&id, exit);
                } else {
                    let id = self.ids.next("tau");
                    self.elements.push(format!(
                        r#"    <serviceTask id="{}" name="" pm4py:silent="true"/>"#,
                        id
                    ));
                    self.flow(entry, &id);
                    self.flow(&id, exit);
                }
            }
            Some(PowlNode::FrequentTransition(ft)) => {
                let id = self.ids.next("task");
                let escaped = xml_escape(&ft.activity);
                let loop_attr = if ft.selfloop {
                    r#" pm4py:loop="true""#
                } else if ft.skippable {
                    r#" pm4py:optional="true""#
                } else {
                    ""
                };
                self.elements.push(format!(
                    r#"    <task id="{}" name="{}"{}/>"#,
                    id, escaped, loop_attr
                ));
                self.flow(entry, &id);
                self.flow(&id, exit);
            }
            Some(PowlNode::OperatorPowl(op)) => {
                let operator = op.operator.as_str().to_string();
                let children = op.children.clone();
                match operator.as_str() {
                    "X" => {
                        let split = self.ids.next("xor_split");
                        let join = self.ids.next("xor_join");
                        self.elements.push(format!(
                            r#"    <exclusiveGateway id="{}" gatewayDirection="Diverging"/>"#,
                            split
                        ));
                        self.elements.push(format!(
                            r#"    <exclusiveGateway id="{}" gatewayDirection="Converging"/>"#,
                            join
                        ));
                        self.flow(entry, &split);
                        self.flow(&join, exit);
                        let split_c = split.clone();
                        let join_c = join.clone();
                        for child_idx in children {
                            let child_entry = self.ids.next("p");
                            let child_exit = self.ids.next("p");
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                child_entry
                            ));
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                child_exit
                            ));
                            self.flow(&split_c, &child_entry);
                            self.flow(&child_exit, &join_c);
                            self.convert(arena, child_idx, &child_entry, &child_exit);
                        }
                    }
                    "*" => {
                        let check = self.ids.next("loop_check");
                        let decide = self.ids.next("loop_decide");
                        self.elements.push(format!(
                            r#"    <exclusiveGateway id="{}" gatewayDirection="Converging"/>"#,
                            check
                        ));
                        self.elements.push(format!(
                            r#"    <exclusiveGateway id="{}" gatewayDirection="Diverging"/>"#,
                            decide
                        ));
                        let do_entry = self.ids.next("p");
                        let do_exit = self.ids.next("p");
                        self.elements.push(format!(
                            r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                            do_entry
                        ));
                        self.elements.push(format!(
                            r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                            do_exit
                        ));
                        self.flow(entry, &check);
                        self.flow(&check, &do_entry);
                        self.convert(arena, children[0], &do_entry, &do_exit);
                        self.flow(&do_exit, &decide);
                        self.flow(&decide, exit);
                        if children.len() > 1 {
                            let redo_entry = self.ids.next("p");
                            let redo_exit = self.ids.next("p");
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                redo_entry
                            ));
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                redo_exit
                            ));
                            self.flow(&decide, &redo_entry);
                            self.convert(arena, children[1], &redo_entry, &redo_exit);
                            self.flow(&redo_exit, &check);
                        }
                    }
                    _ => {
                        self.chain(arena, &children, entry, exit);
                    }
                }
            }
            Some(PowlNode::StrictPartialOrder(spo)) => {
                let children = spo.children.clone();
                if children.is_empty() {
                    let t = self.ids.next("tau");
                    self.elements.push(format!(
                        r#"    <serviceTask id="{}" name="" pm4py:silent="true"/>"#,
                        t
                    ));
                    self.flow(entry, &t);
                    self.flow(&t, exit);
                    return;
                }
                let order = &spo.order;
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
                    let next = if gi < groups.len() - 1 {
                        self.ids.next("sync")
                    } else {
                        exit.to_string()
                    };
                    if group.len() == 1 {
                        let ce = self.ids.next("p");
                        let cx = self.ids.next("p");
                        self.elements.push(format!(
                            r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                            ce
                        ));
                        self.elements.push(format!(
                            r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                            cx
                        ));
                        self.flow(&current, &ce);
                        if next != exit {
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                next
                            ));
                        }
                        self.convert(arena, group[0], &ce, &cx);
                        self.flow(&cx, &next);
                    } else {
                        let and_split = self.ids.next("and_split");
                        let and_join = self.ids.next("and_join");
                        self.elements.push(format!(
                            r#"    <parallelGateway id="{}" gatewayDirection="Diverging"/>"#,
                            and_split
                        ));
                        self.elements.push(format!(
                            r#"    <parallelGateway id="{}" gatewayDirection="Converging"/>"#,
                            and_join
                        ));
                        self.flow(&current, &and_split);
                        if gi < groups.len() - 1 {
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                next
                            ));
                        }
                        self.flow(&and_join, &next);
                        let split_c = and_split.clone();
                        let join_c = and_join.clone();
                        for &child_idx in group {
                            let ce = self.ids.next("p");
                            let cx = self.ids.next("p");
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                ce
                            ));
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                cx
                            ));
                            self.flow(&split_c, &ce);
                            self.flow(&cx, &join_c);
                            self.convert(arena, child_idx, &ce, &cx);
                        }
                    }
                    current = next;
                }
            }
            Some(PowlNode::DecisionGraph(dg)) => {
                // DecisionGraph → BPMN (treat as StrictPartialOrder with additional metadata)
                let children = dg.children.clone();
                if children.is_empty() {
                    let t = self.ids.next("tau");
                    self.elements.push(format!(
                        r#"    <serviceTask id="{}" name="" pm4py:silent="true"/>"#,
                        t
                    ));
                    self.flow(entry, &t);
                    self.flow(&t, exit);
                    return;
                }
                // Use the same logic as StrictPartialOrder for now
                let order = &dg.order;
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
                    let next = if gi < groups.len() - 1 {
                        self.ids.next("sync")
                    } else {
                        exit.to_string()
                    };
                    if group.len() == 1 {
                        let ce = self.ids.next("p");
                        let cx = self.ids.next("p");
                        self.elements.push(format!(
                            r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                            ce
                        ));
                        self.elements.push(format!(
                            r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                            cx
                        ));
                        self.flow(&current, &ce);
                        if next != exit {
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                next
                            ));
                        }
                        self.convert(arena, group[0], &ce, &cx);
                        self.flow(&cx, &next);
                    } else {
                        let and_split = self.ids.next("and_split");
                        let and_join = self.ids.next("and_join");
                        self.elements.push(format!(
                            r#"    <parallelGateway id="{}" gatewayDirection="Diverging"/>"#,
                            and_split
                        ));
                        self.elements.push(format!(
                            r#"    <parallelGateway id="{}" gatewayDirection="Converging"/>"#,
                            and_join
                        ));
                        self.flow(&current, &and_split);
                        if gi < groups.len() - 1 {
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                next
                            ));
                        }
                        self.flow(&and_join, &next);
                        let split_c = and_split.clone();
                        let join_c = and_join.clone();
                        for &child_idx in group {
                            let ce = self.ids.next("p");
                            let cx = self.ids.next("p");
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                ce
                            ));
                            self.elements.push(format!(
                                r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                                cx
                            ));
                            self.flow(&split_c, &ce);
                            self.flow(&cx, &join_c);
                            self.convert(arena, child_idx, &ce, &cx);
                        }
                    }
                    current = next;
                }
            }
        }
    }

    fn chain(&mut self, arena: &PowlArena, children: &[u32], entry: &str, exit: &str) {
        if children.is_empty() {
            let t = self.ids.next("tau");
            self.elements.push(format!(
                r#"    <serviceTask id="{}" name="" pm4py:silent="true"/>"#,
                t
            ));
            self.flow(entry, &t);
            self.flow(&t, exit);
            return;
        }
        let mut prev = entry.to_string();
        for (i, &child) in children.iter().enumerate() {
            let is_last = i == children.len() - 1;
            let next = if is_last {
                exit.to_string()
            } else {
                let p = self.ids.next("p");
                self.elements.push(format!(
                    r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
                    p
                ));
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

pub fn to_bpmn_xml(arena: &PowlArena, root: u32) -> String {
    let mut builder = Builder::new();
    let start_id = "startEvent_1".to_string();
    let end_id = "endEvent_1".to_string();
    let proc_entry = builder.ids.next("p");
    let proc_exit = builder.ids.next("p");
    builder.elements.push(format!(
        r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
        proc_entry
    ));
    builder.elements.push(format!(
        r#"    <serviceTask id="{}" name="" pm4py:connector="true"/>"#,
        proc_exit
    ));
    builder.flow(&start_id, &proc_entry);
    builder.convert(arena, root, &proc_entry, &proc_exit);
    builder.flow(&proc_exit, &end_id);
    let mut lines: Vec<String> = Vec::new();
    lines.push(r#"<?xml version="1.0" encoding="UTF-8"?>"#.to_string());
    lines.push(r#"<definitions"#.to_string());
    lines.push(r#"  xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL""#.to_string());
    lines.push(r#"  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance""#.to_string());
    lines.push(r#"  xmlns:pm4py="http://pm4py.org/bpmn-ext""#.to_string());
    lines.push(r#"  targetNamespace="http://pm4py.org/powl""#.to_string());
    lines.push(r#"  exporter="pm4py-powl-wasm""#.to_string());
    lines.push(r#"  exporterVersion="0.1.0">"#.to_string());
    lines.push(r#"  <process id="process_1" isExecutable="false">"#.to_string());
    lines.push(format!(r#"    <startEvent id="{}"/>"#, start_id));
    lines.push(format!(r#"    <endEvent id="{}"/>"#, end_id));
    for el in &builder.elements {
        lines.push(el.clone());
    }
    for fl in &builder.flows {
        lines.push(fl.clone());
    }
    lines.push("  </process>".to_string());
    lines.push("</definitions>".to_string());
    lines.join("\n")
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

    fn has_tag(xml: &str, tag: &str) -> bool {
        xml.contains(tag)
    }

    #[test]
    fn single_task_produces_valid_xml() {
        let (arena, root) = parse("A");
        let xml = to_bpmn_xml(&arena, root);
        assert!(has_tag(&xml, "<definitions"));
        assert!(has_tag(&xml, "<process"));
        assert!(has_tag(&xml, r#"name="A""#));
        assert!(has_tag(&xml, "<startEvent"));
        assert!(has_tag(&xml, "<endEvent"));
        assert!(has_tag(&xml, "</definitions>"));
    }

    #[test]
    fn xor_produces_exclusive_gateways() {
        let (arena, root) = parse("X(A, B)");
        let xml = to_bpmn_xml(&arena, root);
        assert!(has_tag(&xml, "exclusiveGateway"));
        assert!(has_tag(&xml, r#"name="A""#));
        assert!(has_tag(&xml, r#"name="B""#));
    }

    #[test]
    fn loop_produces_exclusive_gateways() {
        let (arena, root) = parse("*(A, B)");
        let xml = to_bpmn_xml(&arena, root);
        assert!(has_tag(&xml, "exclusiveGateway"));
        assert!(has_tag(&xml, r#"name="A""#));
    }

    #[test]
    fn spo_concurrent_produces_parallel_gateways() {
        let (arena, root) = parse("PO=(nodes={A, B}, order={})");
        let xml = to_bpmn_xml(&arena, root);
        assert!(has_tag(&xml, "parallelGateway"));
    }

    #[test]
    fn spo_sequential_no_parallel_gateways() {
        let (arena, root) = parse("PO=(nodes={A, B}, order={A-->B})");
        let xml = to_bpmn_xml(&arena, root);
        assert!(!has_tag(&xml, "parallelGateway"));
        assert!(has_tag(&xml, r#"name="A""#));
        assert!(has_tag(&xml, r#"name="B""#));
    }
}
