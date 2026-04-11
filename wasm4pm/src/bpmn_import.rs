/// BPMN 2.0 XML to POWL conversion.
///
/// Parses a BPMN 2.0 XML document and converts it to a POWL model string.
/// Handles both pm4wasm-generated BPMN (with `pm4py:connector`/`pm4py:silent`
/// markers) and generic BPMN from external tools (Camunda, bpmn.io, Signavio).
///
/// Mapping:
///
/// | BPMN element                                | POWL node              |
/// |---------------------------------------------|------------------------|
/// | `<task name="A"/>`                          | Transition("A")        |
/// | `<serviceTask pm4py:silent="true"/>`        | Transition(None) [tau] |
/// | `<exclusiveGateway>` (split/join pair)       | OperatorPowl(Xor)      |
/// | `<exclusiveGateway>` with back-arc           | OperatorPowl(Loop)     |
/// | `<parallelGateway>` (split/join pair)        | StrictPartialOrder     |
/// | Sequential chain of tasks                    | StrictPartialOrder(seq)|
use crate::powl_arena::{Operator, PowlArena};
use roxmltree::Document;
use std::collections::{HashMap, HashSet};

// ─── BPMN element types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum BpmnNodeType {
    Task,
    SilentTask,
    ExclusiveGateway,
    ParallelGateway,
    InclusiveGateway,
    StartEvent,
    EndEvent,
    Connector, // pm4py:connector serviceTask (virtual node, skip)
    Other,
}

#[derive(Debug, Clone)]
struct BpmnNode {
    #[allow(dead_code)]
    id: String,
    name: String,
    node_type: BpmnNodeType,
}

// ─── XML parsing helpers ────────────────────────────────────────────────────

/// Classify a BPMN element by its local tag name and attributes.
fn classify_element<'a, 'input>(
    local_name: &str,
    node: roxmltree::Node<'a, 'input>,
) -> BpmnNodeType {
    match local_name {
        "startEvent" => BpmnNodeType::StartEvent,
        "endEvent" => BpmnNodeType::EndEvent,
        "task" => BpmnNodeType::Task,
        "userTask" | "serviceTask" | "sendTask" | "receiveTask" | "callActivity" | "scriptTask"
        | "businessRuleTask" => {
            let is_connector = attr_val(node, "pm4py:connector").as_deref() == Some("true");
            let is_silent = attr_val(node, "pm4py:silent").as_deref() == Some("true");
            if is_connector {
                BpmnNodeType::Connector
            } else if is_silent {
                BpmnNodeType::SilentTask
            } else {
                BpmnNodeType::Task
            }
        }
        "exclusiveGateway" => BpmnNodeType::ExclusiveGateway,
        "parallelGateway" => BpmnNodeType::ParallelGateway,
        "inclusiveGateway" => BpmnNodeType::InclusiveGateway,
        _ => BpmnNodeType::Other,
    }
}

/// Get an attribute value from an roxmltree Node, supporting namespace-prefixed
/// attributes (e.g., `pm4py:connector`). roxmltree stores prefixed attributes
/// as-is in the attribute name string.
fn attr_val<'a, 'input>(node: roxmltree::Node<'a, 'input>, key: &str) -> Option<String> {
    node.attribute(key).map(|s| s.to_string())
}

/// Type alias for the BPMN graph extraction result.
type BpmnGraphResult = Result<(HashMap<String, BpmnNode>, Vec<(String, String)>), String>;

/// Extract all BPMN elements and sequence flows from the XML.
fn extract_bpmn_graph(xml: &str) -> BpmnGraphResult {
    let mut nodes: HashMap<String, BpmnNode> = HashMap::new();
    let mut flows: Vec<(String, String)> = Vec::new();

    let doc = Document::parse(xml).map_err(|e| e.to_string())?;

    let bpmn_elements = [
        "task",
        "userTask",
        "serviceTask",
        "sendTask",
        "receiveTask",
        "callActivity",
        "scriptTask",
        "businessRuleTask",
        "startEvent",
        "endEvent",
        "exclusiveGateway",
        "parallelGateway",
        "inclusiveGateway",
    ];

    for node in doc.root().descendants() {
        if !node.is_element() {
            continue;
        }

        let tag = node.tag_name().name();

        if bpmn_elements.contains(&tag) {
            let id = node
                .attribute("id")
                .unwrap_or(&format!("unknown_{}", nodes.len()))
                .to_string();
            let name = node.attribute("name").unwrap_or("").to_string();
            let node_type = classify_element(tag, node);

            nodes.insert(
                id.clone(),
                BpmnNode {
                    id,
                    name,
                    node_type,
                },
            );
        } else if tag == "sequenceFlow" {
            if let (Some(src), Some(tgt)) =
                (node.attribute("sourceRef"), node.attribute("targetRef"))
            {
                flows.push((src.to_string(), tgt.to_string()));
            }
        }
    }

    Ok((nodes, flows))
}

// ─── Graph analysis ────────────────────────────────────────────────────────

/// Build a "shortcut" outgoing map that skips connector nodes.
/// This transparently resolves chains like: startEvent -> connector -> task
/// into direct edges: startEvent -> task.
fn build_shortcut_outgoing(
    flows: &[(String, String)],
    connector_ids: &HashSet<String>,
) -> HashMap<String, Vec<String>> {
    // Build raw adjacency
    let mut raw: HashMap<String, Vec<String>> = HashMap::new();
    for (src, tgt) in flows {
        raw.entry(src.clone()).or_default().push(tgt.clone());
    }

    // For each node, resolve through connector chains
    let mut resolved: HashMap<String, Vec<String>> = HashMap::new();
    for (src, targets) in &raw {
        let mut final_targets: Vec<String> = Vec::new();
        for tgt in targets {
            let end = resolve_through_connectors(tgt, &raw, connector_ids);
            if !final_targets.contains(&end) {
                final_targets.push(end);
            }
        }
        resolved.insert(src.clone(), final_targets);
    }
    resolved
}

/// Follow a chain of connector nodes to find the real target.
fn resolve_through_connectors(
    start: &str,
    raw: &HashMap<String, Vec<String>>,
    connector_ids: &HashSet<String>,
) -> String {
    let mut current = start.to_string();
    let mut visited = HashSet::new();
    while connector_ids.contains(&current) {
        if !visited.insert(current.clone()) {
            break; // Cycle guard
        }
        if let Some(nexts) = raw.get(&current) {
            if let Some(next) = nexts.first() {
                current = next.clone();
            } else {
                break;
            }
        } else {
            break;
        }
    }
    current
}

// ─── POWL construction ─────────────────────────────────────────────────────

/// Convert a BPMN graph to POWL, starting from the start event and tracing
/// through the model.
fn bpmn_graph_to_powl(
    arena: &mut PowlArena,
    nodes: &HashMap<String, BpmnNode>,
    outgoing: &HashMap<String, Vec<String>>,
) -> Result<u32, String> {
    // Find start nodes
    let start_nodes = find_start_nodes(nodes, outgoing);
    if start_nodes.is_empty() {
        return Err("No start event found in BPMN model".to_string());
    }

    // Build POWL from each start node, then combine
    let mut powl_roots: Vec<u32> = Vec::new();
    for start_id in &start_nodes {
        let visited = &mut HashSet::new();
        let root = build_subtree(arena, start_id, nodes, outgoing, visited)?;
        powl_roots.push(root);
    }

    if powl_roots.len() == 1 {
        Ok(powl_roots[0])
    } else {
        // Multiple start nodes: wrap in XOR (choice of which process to start)
        Ok(arena.add_operator(Operator::Xor, powl_roots))
    }
}

/// Find start event nodes (startEvent elements, or nodes with no incoming edges).
fn find_start_nodes(
    nodes: &HashMap<String, BpmnNode>,
    outgoing: &HashMap<String, Vec<String>>,
) -> Vec<String> {
    // Prefer explicit start events
    let start_events: Vec<String> = nodes
        .iter()
        .filter(|(_, n)| n.node_type == BpmnNodeType::StartEvent)
        .map(|(id, _)| id.clone())
        .collect();

    if !start_events.is_empty() {
        start_events
    } else {
        // Find nodes with no incoming edges
        let has_incoming: HashSet<String> = nodes
            .keys()
            .filter(|id| outgoing.values().any(|targets| targets.contains(id)))
            .cloned()
            .collect();

        nodes
            .iter()
            .filter(|(id, n)| {
                !has_incoming.contains(*id)
                    && n.node_type != BpmnNodeType::EndEvent
                    && n.node_type != BpmnNodeType::Connector
                    && n.node_type != BpmnNodeType::Other
            })
            .map(|(id, _)| id.clone())
            .collect()
    }
}

/// Recursively build a POWL subtree from a BPMN node.
fn build_subtree(
    arena: &mut PowlArena,
    node_id: &str,
    nodes: &HashMap<String, BpmnNode>,
    outgoing: &HashMap<String, Vec<String>>,
    visited: &mut HashSet<String>,
) -> Result<u32, String> {
    // Cycle guard
    if !visited.insert(node_id.to_string()) {
        // Back-edge detected: return a tau (silent transition) as placeholder
        return Ok(arena.add_silent_transition());
    }

    let node = nodes
        .get(node_id)
        .ok_or_else(|| format!("Node '{}' not found in BPMN elements", node_id))?;

    let children_ids = outgoing.get(node_id).cloned().unwrap_or_default();

    // Filter children: skip end events and connectors
    let real_children: Vec<String> = children_ids
        .iter()
        .filter(|id| {
            nodes.get(*id).is_none_or(|n| {
                n.node_type != BpmnNodeType::EndEvent && n.node_type != BpmnNodeType::Connector
            })
        })
        .cloned()
        .collect();

    let result = match &node.node_type {
        BpmnNodeType::StartEvent => {
            if real_children.len() == 1 {
                build_subtree(arena, &real_children[0], nodes, outgoing, visited)
            } else if real_children.is_empty() {
                Ok(arena.add_silent_transition())
            } else {
                // Multiple paths from start: XOR
                let child_nodes: Vec<u32> = real_children
                    .iter()
                    .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(arena.add_operator(Operator::Xor, child_nodes))
            }
        }

        BpmnNodeType::EndEvent => Ok(arena.add_silent_transition()),

        BpmnNodeType::Task => {
            let label = if node.name.is_empty() {
                None
            } else {
                Some(node.name.clone())
            };

            if real_children.is_empty() {
                Ok(arena.add_transition(label))
            } else {
                let task_node = arena.add_transition(label);
                let child_nodes: Vec<u32> = real_children
                    .iter()
                    .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                    .collect::<Result<Vec<_>, _>>()?;

                if child_nodes.len() == 1 {
                    Ok(arena.add_sequence(vec![task_node, child_nodes[0]]))
                } else {
                    let mut all = vec![task_node];
                    all.extend(child_nodes);
                    Ok(arena.add_sequence(all))
                }
            }
        }

        BpmnNodeType::SilentTask => {
            if real_children.is_empty() {
                Ok(arena.add_silent_transition())
            } else {
                let tau_node = arena.add_silent_transition();
                let child_nodes: Vec<u32> = real_children
                    .iter()
                    .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                    .collect::<Result<Vec<_>, _>>()?;

                if child_nodes.len() == 1 {
                    Ok(arena.add_sequence(vec![tau_node, child_nodes[0]]))
                } else {
                    let mut all = vec![tau_node];
                    all.extend(child_nodes);
                    Ok(arena.add_sequence(all))
                }
            }
        }

        BpmnNodeType::ExclusiveGateway => {
            if real_children.is_empty() {
                Ok(arena.add_silent_transition())
            } else if real_children.len() == 1 {
                build_subtree(arena, &real_children[0], nodes, outgoing, visited)
            } else {
                // Multiple paths: check for loop (back-edge)
                let forward_children: Vec<String> = real_children
                    .iter()
                    .filter(|c| !visited.contains(*c))
                    .cloned()
                    .collect();
                let back_edge_children: Vec<String> = real_children
                    .iter()
                    .filter(|c| visited.contains(*c))
                    .cloned()
                    .collect();

                if !back_edge_children.is_empty() && !forward_children.is_empty() {
                    // Loop pattern: do-branch and redo-branch
                    let do_child =
                        build_subtree(arena, &forward_children[0], nodes, outgoing, visited)?;
                    let redo_child = if forward_children.len() > 1 {
                        build_subtree(arena, &forward_children[1], nodes, outgoing, visited)?
                    } else {
                        let mut new_visited = HashSet::new();
                        build_subtree(
                            arena,
                            &back_edge_children[0],
                            nodes,
                            outgoing,
                            &mut new_visited,
                        )?
                    };
                    Ok(arena.add_operator(Operator::Loop, vec![do_child, redo_child]))
                } else {
                    // XOR choice
                    let child_nodes: Vec<u32> = real_children
                        .iter()
                        .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                        .collect::<Result<Vec<_>, _>>()?;
                    Ok(arena.add_operator(Operator::Xor, child_nodes))
                }
            }
        }

        BpmnNodeType::ParallelGateway => {
            if real_children.is_empty() {
                Ok(arena.add_silent_transition())
            } else if real_children.len() == 1 {
                build_subtree(arena, &real_children[0], nodes, outgoing, visited)
            } else {
                // Parallel: SPO with no ordering constraints (all concurrent)
                let child_nodes: Vec<u32> = real_children
                    .iter()
                    .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(arena.add_strict_partial_order(child_nodes))
            }
        }

        BpmnNodeType::InclusiveGateway => {
            // Treat inclusive gateway as XOR (simplification)
            if real_children.is_empty() {
                Ok(arena.add_silent_transition())
            } else if real_children.len() == 1 {
                build_subtree(arena, &real_children[0], nodes, outgoing, visited)
            } else {
                let child_nodes: Vec<u32> = real_children
                    .iter()
                    .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(arena.add_operator(Operator::Xor, child_nodes))
            }
        }

        BpmnNodeType::Connector | BpmnNodeType::Other => {
            if real_children.len() == 1 {
                build_subtree(arena, &real_children[0], nodes, outgoing, visited)
            } else if real_children.is_empty() {
                Ok(arena.add_silent_transition())
            } else {
                let child_nodes: Vec<u32> = real_children
                    .iter()
                    .map(|c| build_subtree(arena, c, nodes, outgoing, visited))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(arena.add_sequence(child_nodes))
            }
        }
    };

    visited.remove(node_id);
    result
}

// ─── Public API ─────────────────────────────────────────────────────────────

/// Parse a BPMN 2.0 XML string and convert it to a POWL model string.
///
/// Handles both pm4wasm-generated BPMN and generic BPMN from external tools.
/// Connector nodes (pm4py:connector) and silent tasks (pm4py:silent) are
/// transparently resolved.
///
/// Mirrors `pm4py.read_bpmn()`.
///
/// # Errors
/// Returns a descriptive error string on parse failure or invalid BPMN structure.
pub fn bpmn_to_powl_string(bpmn_xml: &str) -> Result<String, String> {
    if bpmn_xml.trim().is_empty() {
        return Err("Empty BPMN XML".to_string());
    }

    let (nodes, flows) = extract_bpmn_graph(bpmn_xml)?;

    if nodes.is_empty() {
        return Err("No BPMN elements found in XML".to_string());
    }

    // Identify connector nodes
    let connector_ids: HashSet<String> = nodes
        .iter()
        .filter(|(_, n)| n.node_type == BpmnNodeType::Connector)
        .map(|(id, _)| id.clone())
        .collect();

    // Build shortcut outgoing map (resolves through connectors)
    let outgoing = build_shortcut_outgoing(&flows, &connector_ids);

    let mut arena = PowlArena::new();
    let root = bpmn_graph_to_powl(&mut arena, &nodes, &outgoing)?;

    Ok(arena.to_repr(root))
}

// ─── WASM export ────────────────────────────────────────────────────────────

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
/// WASM entry point: parse BPMN 2.0 XML and return a POWL model string.
///
/// # Errors
/// Returns a JavaScript `Error` with a descriptive message on failure.
pub fn read_bpmn(bpmn_xml: &str) -> Result<String, JsValue> {
    match bpmn_to_powl_string(bpmn_xml) {
        Ok(powl) => Ok(powl),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_arena::PowlArena;
    use crate::powl_parser::parse_powl_model_string;

    /// Helper: parse a POWL string and return (arena, root).
    fn parse(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).expect("parse failed");
        (arena, root)
    }

    #[test]
    fn test_simple_sequence_bpmn_to_powl() {
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="p1">
    <startEvent id="start"/>
    <task id="t1" name="A"/>
    <task id="t2" name="B"/>
    <endEvent id="end"/>
    <sequenceFlow sourceRef="start" targetRef="t1"/>
    <sequenceFlow sourceRef="t1" targetRef="t2"/>
    <sequenceFlow sourceRef="t2" targetRef="end"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("A"),
            "Expected 'A' in POWL output, got: {}",
            result
        );
        assert!(
            result.contains("B"),
            "Expected 'B' in POWL output, got: {}",
            result
        );
    }

    #[test]
    fn test_xor_gateway_bpmn_to_powl() {
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="p1">
    <startEvent id="start"/>
    <exclusiveGateway id="gw1"/>
    <task id="t1" name="A"/>
    <task id="t2" name="B"/>
    <endEvent id="end"/>
    <sequenceFlow sourceRef="start" targetRef="gw1"/>
    <sequenceFlow sourceRef="gw1" targetRef="t1"/>
    <sequenceFlow sourceRef="gw1" targetRef="t2"/>
    <sequenceFlow sourceRef="t1" targetRef="end"/>
    <sequenceFlow sourceRef="t2" targetRef="end"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("X"),
            "Expected XOR operator in POWL output, got: {}",
            result
        );
        assert!(
            result.contains("A"),
            "Expected 'A' in POWL output, got: {}",
            result
        );
        assert!(
            result.contains("B"),
            "Expected 'B' in POWL output, got: {}",
            result
        );
    }

    #[test]
    fn test_parallel_gateway_bpmn_to_powl() {
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="p1">
    <startEvent id="start"/>
    <parallelGateway id="gw_split"/>
    <task id="t1" name="A"/>
    <task id="t2" name="B"/>
    <parallelGateway id="gw_join"/>
    <endEvent id="end"/>
    <sequenceFlow sourceRef="start" targetRef="gw_split"/>
    <sequenceFlow sourceRef="gw_split" targetRef="t1"/>
    <sequenceFlow sourceRef="gw_split" targetRef="t2"/>
    <sequenceFlow sourceRef="t1" targetRef="gw_join"/>
    <sequenceFlow sourceRef="t2" targetRef="gw_join"/>
    <sequenceFlow sourceRef="gw_join" targetRef="end"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("A"),
            "Expected 'A' in POWL output, got: {}",
            result
        );
        assert!(
            result.contains("B"),
            "Expected 'B' in POWL output, got: {}",
            result
        );
    }

    #[test]
    fn test_empty_bpmn_errors() {
        let result = bpmn_to_powl_string("");
        assert!(result.is_err(), "Expected error for empty BPMN");
    }

    #[test]
    fn test_invalid_xml_does_not_panic() {
        // Should not panic; may succeed with no elements found or fail on parse
        let _ = bpmn_to_powl_string("not xml at all");
    }

    #[test]
    fn test_single_task_bpmn() {
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="p1">
    <startEvent id="start"/>
    <task id="t1" name="A"/>
    <endEvent id="end"/>
    <sequenceFlow sourceRef="start" targetRef="t1"/>
    <sequenceFlow sourceRef="t1" targetRef="end"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("A"),
            "Expected 'A' in POWL output, got: {}",
            result
        );
    }

    #[test]
    fn test_pm4wasm_connector_resolution() {
        // BPMN generated by pm4wasm's to_bpmn uses connector serviceTasks
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:pm4py="http://pm4py.org/bpmn-ext">
  <process id="process_1" isExecutable="false">
    <startEvent id="startEvent_1"/>
    <endEvent id="endEvent_1"/>
    <serviceTask id="p_1" name="" pm4py:connector="true"/>
    <serviceTask id="p_2" name="" pm4py:connector="true"/>
    <task id="task_1" name="A"/>
    <sequenceFlow id="flow_1" sourceRef="startEvent_1" targetRef="p_1"/>
    <sequenceFlow id="flow_2" sourceRef="p_1" targetRef="task_1"/>
    <sequenceFlow id="flow_3" sourceRef="task_1" targetRef="p_2"/>
    <sequenceFlow id="flow_4" sourceRef="p_2" targetRef="endEvent_1"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("A"),
            "Expected 'A' after connector resolution, got: {}",
            result
        );
    }

    #[test]
    fn test_user_task_recognized() {
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="p1">
    <startEvent id="start"/>
    <userTask id="ut1" name="Review"/>
    <endEvent id="end"/>
    <sequenceFlow sourceRef="start" targetRef="ut1"/>
    <sequenceFlow sourceRef="ut1" targetRef="end"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("Review"),
            "Expected 'Review' from userTask, got: {}",
            result
        );
    }

    #[test]
    fn test_no_start_event_finds_root() {
        // BPMN without explicit startEvent: should find node with no incoming flow
        let bpmn = r#"<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="p1">
    <task id="t1" name="A"/>
    <task id="t2" name="B"/>
    <sequenceFlow sourceRef="t1" targetRef="t2"/>
  </process>
</definitions>"#;
        let result = bpmn_to_powl_string(bpmn).unwrap();
        assert!(
            result.contains("A"),
            "Expected 'A' in POWL output, got: {}",
            result
        );
    }
}
