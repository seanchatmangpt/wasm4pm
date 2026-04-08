/// Convert a POWL model to a Petri net.
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use crate::powl_models::{PowlCounts as Counts, PowlMarking as Marking, PowlPetriNet as PetriNet, PowlPetriNetResult as PetriNetResult};
use std::collections::HashMap;

fn new_place(net: &mut PetriNet, counts: &mut Counts) -> String {
    let n = counts.inc_places();
    net.add_place(&format!("p_{}", n))
}

fn new_hidden_trans(net: &mut PetriNet, counts: &mut Counts, type_trans: &str) -> String {
    let n = counts.inc_hidden();
    net.add_transition(&format!("{}_{}", type_trans, n), None)
}

fn new_visible_trans(
    net: &mut PetriNet,
    counts: &mut Counts,
    label: &str,
    activity: &str,
    skippable: bool,
    selfloop: bool,
) -> String {
    let n = counts.inc_visible();
    let name = format!("vis_{}", n);
    let mut props = HashMap::new();
    props.insert("activity".to_string(), serde_json::Value::String(activity.to_string()));
    props.insert("skippable".to_string(), serde_json::Value::Bool(skippable));
    props.insert("selfloop".to_string(), serde_json::Value::Bool(selfloop));
    net.add_transition_with_props(&name, Some(label.to_string()), props)
}

fn recursively_add_tree(
    arena: &PowlArena,
    node_idx: u32,
    net: &mut PetriNet,
    initial_place: &str,
    final_place: Option<&str>,
    counts: &mut Counts,
    force_add_skip: bool,
) -> String {
    let final_place_name: String = match final_place {
        Some(fp) => fp.to_string(),
        None => new_place(net, counts),
    };

    if force_add_skip {
        let invisible = new_hidden_trans(net, counts, "skip");
        net.add_arc(initial_place, &invisible);
        net.add_arc(&invisible, &final_place_name);
    }

    match arena.get(node_idx) {
        None => {
            let skip = new_hidden_trans(net, counts, "skip");
            net.add_arc(initial_place, &skip);
            net.add_arc(&skip, &final_place_name);
        }
        Some(PowlNode::Transition(t)) => {
            let pt = if t.label.is_none() {
                new_hidden_trans(net, counts, "skip")
            } else {
                let lbl = t.label.as_deref().unwrap();
                new_visible_trans(net, counts, lbl, lbl, false, false)
            };
            net.add_arc(initial_place, &pt);
            net.add_arc(&pt, &final_place_name);
        }
        Some(PowlNode::FrequentTransition(t)) => {
            let pt = new_visible_trans(net, counts, &t.label, &t.activity, t.skippable, t.selfloop);
            net.add_arc(initial_place, &pt);
            net.add_arc(&pt, &final_place_name);
        }
        Some(PowlNode::OperatorPowl(op)) => {
            let children = op.children.clone();
            let operator = op.operator;
            match operator {
                Operator::Xor => {
                    for &child in &children {
                        recursively_add_tree(arena, child, net, initial_place, Some(&final_place_name), counts, false);
                    }
                }
                Operator::Loop => {
                    let new_init_place = new_place(net, counts);
                    let init_loop_trans = new_hidden_trans(net, counts, "init_loop");
                    net.add_arc(initial_place, &init_loop_trans);
                    net.add_arc(&init_loop_trans, &new_init_place);
                    let loop_trans = new_hidden_trans(net, counts, "loop");
                    let do_idx = children[0];
                    let int1 = recursively_add_tree(arena, do_idx, net, &new_init_place, None, counts, false);
                    let redo_idx = children[1];
                    let int2 = recursively_add_tree(arena, redo_idx, net, &int1, None, counts, false);
                    let exit_trans = new_hidden_trans(net, counts, "skip");
                    net.add_arc(&int1, &exit_trans);
                    net.add_arc(&exit_trans, &final_place_name);
                    net.add_arc(&int2, &loop_trans);
                    net.add_arc(&loop_trans, &new_init_place);
                }
                _ => {
                    let skip = new_hidden_trans(net, counts, "skip");
                    net.add_arc(initial_place, &skip);
                    net.add_arc(&skip, &final_place_name);
                }
            }
        }
        Some(PowlNode::StrictPartialOrder(spo)) => {
            let children = spo.children.clone();
            let order = spo.order.get_transitive_reduction();
            let n = children.len();
            let tau_split = new_hidden_trans(net, counts, "tauSplit");
            net.add_arc(initial_place, &tau_split);
            let tau_join = new_hidden_trans(net, counts, "tauJoin");
            net.add_arc(&tau_join, &final_place_name);
            let start_locals = order.get_start_nodes();
            let end_locals = order.get_end_nodes();
            let mut init_places: Vec<String> = Vec::new();
            let mut final_places: Vec<String> = Vec::new();
            for (local, &child_idx) in children.iter().enumerate() {
                let i_place = new_place(net, counts);
                let f_place = new_place(net, counts);
                if start_locals.contains(&local) {
                    net.add_arc(&tau_split, &i_place);
                }
                if end_locals.contains(&local) {
                    net.add_arc(&f_place, &tau_join);
                }
                recursively_add_tree(arena, child_idx, net, &i_place, Some(&f_place), counts, false);
                init_places.push(i_place);
                final_places.push(f_place);
            }
            for i in 0..n {
                for j in 0..n {
                    if order.is_edge(i, j) {
                        let sync = new_hidden_trans(net, counts, "sync");
                        net.add_arc(&final_places[i], &sync);
                        net.add_arc(&sync, &init_places[j]);
                    }
                }
            }
        }
        Some(PowlNode::DecisionGraph(dg)) => {
            let children = dg.children.clone();
            let order = dg.order.get_transitive_reduction();
            let n = children.len();
            let tau_split = new_hidden_trans(net, counts, "init_dg");
            net.add_arc(initial_place, &tau_split);
            let tau_join = new_hidden_trans(net, counts, "final_dg");
            net.add_arc(&tau_join, &final_place_name);

            // Handle empty path: allow skipping directly from split to join
            if dg.empty_path {
                net.add_arc(&tau_split, &final_place_name);
            }

            let mut init_places: Vec<String> = Vec::new();
            let mut final_places: Vec<String> = Vec::new();
            for (local, &child_idx) in children.iter().enumerate() {
                let i_place = new_place(net, counts);
                let f_place = new_place(net, counts);
                // Use explicit start_nodes/end_nodes from DecisionGraph
                if dg.start_nodes.contains(&local) {
                    net.add_arc(&tau_split, &i_place);
                }
                if dg.end_nodes.contains(&local) {
                    net.add_arc(&f_place, &tau_join);
                }
                recursively_add_tree(arena, child_idx, net, &i_place, Some(&f_place), counts, false);
                init_places.push(i_place);
                final_places.push(f_place);
            }
            // Add ordering edges from transitive reduction
            for i in 0..n {
                for j in 0..n {
                    if order.is_edge(i, j) {
                        let sync = new_hidden_trans(net, counts, "sync");
                        net.add_arc(&final_places[i], &sync);
                        net.add_arc(&sync, &init_places[j]);
                    }
                }
            }
        }
    }
    final_place_name
}

fn remove_dead_places(net: &mut PetriNet, initial_marking: &Marking, final_marking: &Marking) {
    let im_places: std::collections::HashSet<&str> = initial_marking.keys().map(|s| s.as_str()).collect();
    let fm_places: std::collections::HashSet<&str> = final_marking.keys().map(|s| s.as_str()).collect();
    let place_names: Vec<String> = net.places.iter().map(|p| p.name.clone()).collect();
    for p in &place_names {
        if fm_places.contains(p.as_str()) || im_places.contains(p.as_str()) {
            continue;
        }
        let out_degree = net.arcs.iter().filter(|a| &a.source == p).count();
        let in_degree = net.arcs.iter().filter(|a| &a.target == p).count();
        if out_degree == 0 || in_degree == 0 {
            net.remove_place(p);
        }
    }
}

pub fn apply(arena: &PowlArena, root: u32) -> PetriNetResult {
    let mut counts = Counts::default();
    let mut net = PetriNet::new("powl_net");
    net.add_place("source");
    net.add_place("sink");
    let mut initial_marking = Marking::new();
    let mut final_marking = Marking::new();
    initial_marking.insert("source".to_string(), 1);
    final_marking.insert("sink".to_string(), 1);
    let initial_place = new_place(&mut net, &mut counts);
    let tau_initial = new_hidden_trans(&mut net, &mut counts, "tau");
    net.add_arc("source", &tau_initial);
    net.add_arc(&tau_initial, &initial_place);
    let final_place = new_place(&mut net, &mut counts);
    let tau_final = new_hidden_trans(&mut net, &mut counts, "tau");
    net.add_arc(&final_place, &tau_final);
    net.add_arc(&tau_final, "sink");
    recursively_add_tree(arena, root, &mut net, &initial_place, Some(&final_place), &mut counts, false);
    net.apply_simple_reduction();
    remove_dead_places(&mut net, &initial_marking, &final_marking);
    PetriNetResult { net, initial_marking, final_marking }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn build(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn single_transition_produces_net() {
        let (arena, root) = build("A");
        let result = apply(&arena, root);
        assert!(result.net.places.iter().any(|p| p.name == "source"));
        assert!(result.net.places.iter().any(|p| p.name == "sink"));
        assert!(result.net.transitions.iter().any(|t| t.label.as_deref() == Some("A")));
    }

    #[test]
    fn xor_produces_choice() {
        let (arena, root) = build("X ( A, B )");
        let result = apply(&arena, root);
        let labels: Vec<Option<&str>> = result.net.transitions.iter().map(|t| t.label.as_deref()).collect();
        assert!(labels.contains(&Some("A")));
        assert!(labels.contains(&Some("B")));
    }

    #[test]
    fn partial_order_produces_parallel() {
        let (arena, root) = build("PO=(nodes={A, B}, order={})");
        let result = apply(&arena, root);
        let labels: Vec<Option<&str>> = result.net.transitions.iter().map(|t| t.label.as_deref()).collect();
        assert!(labels.contains(&Some("A")));
        assert!(labels.contains(&Some("B")));
    }

    #[test]
    fn sequence_order_preserves_structure() {
        let (arena, root) = build("PO=(nodes={A, B}, order={A-->B})");
        let result = apply(&arena, root);
        assert!(result.net.transitions.iter().any(|t| t.label.as_deref() == Some("A")));
        assert!(result.net.transitions.iter().any(|t| t.label.as_deref() == Some("B")));
    }

    #[test]
    fn loop_produces_cycle() {
        let (arena, root) = build("* ( A, B )");
        let result = apply(&arena, root);
        let labels: Vec<Option<&str>> = result.net.transitions.iter().map(|t| t.label.as_deref()).collect();
        assert!(labels.contains(&Some("A")));
        assert!(labels.contains(&Some("B")));
    }

    #[test]
    fn decision_graph_produces_net() {
        use crate::powl_arena::BinaryRelation;
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        // Order: 2 children + 2 sentinel (start=2, end=3)
        // start → A, start → B, A → end, B → end
        let mut order = BinaryRelation::new(4);
        order.add_edge(2, 0); // start → A
        order.add_edge(2, 1); // start → B
        order.add_edge(0, 3); // A → end
        order.add_edge(1, 3); // B → end
        let dg = arena.add_decision_graph(vec![a, b], order, vec![0, 1], vec![0, 1], false);
        let result = apply(&arena, dg);
        assert!(result.net.places.iter().any(|p| p.name == "source"));
        assert!(result.net.places.iter().any(|p| p.name == "sink"));
        let labels: Vec<Option<&str>> = result.net.transitions.iter().map(|t| t.label.as_deref()).collect();
        assert!(labels.contains(&Some("A")));
        assert!(labels.contains(&Some("B")));
    }
}
