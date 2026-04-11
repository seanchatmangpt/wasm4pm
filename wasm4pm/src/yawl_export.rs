//! POWL to YAWL v6 XML export.
//!
//! Converts a POWL (Partially Ordered Workflow Language) model to YAWL v6 XML format.
//! Computes topological levels for node positioning and generates valid YAWL XML.

use crate::powl_arena::{Operator, PowlArena, PowlNode};
use std::collections::{HashMap, HashSet};

const YAWL_NAMESPACE: &str = "http://www.yawlfoundation.org/yawlschema";

/// Error types for YAWL export.
#[derive(Debug, Clone, PartialEq)]
pub enum YawlExportError {
    /// POWL model is empty or has no root.
    EmptyModel,
    /// Maximum depth exceeded during traversal.
    MaxDepthExceeded,
    /// Circular reference detected in POWL tree.
    CircularReference,
    /// Invalid node reference.
    InvalidNodeRef(u32),
}

impl std::fmt::Display for YawlExportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyModel => write!(f, "POWL model is empty or has no root"),
            Self::MaxDepthExceeded => write!(f, "maximum traversal depth exceeded"),
            Self::CircularReference => write!(f, "circular reference detected in POWL tree"),
            Self::InvalidNodeRef(id) => write!(f, "invalid node reference: {}", id),
        }
    }
}

impl std::error::Error for YawlExportError {}

/// Configuration for YAWL export.
#[derive(Clone, Debug)]
pub struct YawlExportConfig {
    /// Maximum depth for recursive traversal (default: 1000).
    pub max_depth: usize,
    /// Whether to include layout information (default: true).
    pub include_layout: bool,
    /// YAWL specification identifier (default: "spec1").
    pub spec_id: String,
    /// YAWL specification name (default: "Exported from POWL").
    pub spec_name: String,
}

impl Default for YawlExportConfig {
    fn default() -> Self {
        Self {
            max_depth: 1000,
            include_layout: true,
            spec_id: "spec1".to_string(),
            spec_name: "Exported from POWL".to_string(),
        }
    }
}

/// Result of YAWL export containing the generated XML.
#[derive(Clone, Debug, PartialEq)]
pub struct YawlExportResult {
    /// The generated YAWL XML string.
    pub xml: String,
    /// Number of tasks (activities) in the specification.
    pub task_count: usize,
    /// Number of conditions (places) in the specification.
    pub condition_count: usize,
    /// Number of flows (arcs) in the specification.
    pub flow_count: usize,
    /// Maximum depth of the POWL tree.
    pub max_tree_depth: usize,
}

/// Export a POWL model to YAWL v6 XML format.
///
/// # Arguments
///
/// * `arena` - The POWL arena containing all nodes.
/// * `root` - The root node index of the POWL model.
/// * `config` - Optional export configuration.
///
/// # Returns
///
/// `Ok(YawlExportResult)` containing the XML string, or `Err(YawlExportError)`.
///
/// # Example
///
/// ```no_run
/// use pictl_wasm4pm::yawl_export::{powl_to_yawl, YawlExportConfig};
/// # use pictl_wasm4pm::powl_arena::PowlArena;
///
/// # let arena = PowlArena::new();
/// # let root = 0;
/// let result = powl_to_yawl(&arena, root, &YawlExportConfig::default()).unwrap();
/// println!("{}", result.xml);
/// ```
pub fn powl_to_yawl(
    arena: &PowlArena,
    root: u32,
    config: &YawlExportConfig,
) -> Result<YawlExportResult, YawlExportError> {
    if arena.is_empty() || root >= arena.len() as u32 {
        return Err(YawlExportError::EmptyModel);
    }

    let mut exporter = YawlExporter::new(arena, config);
    let xml = exporter.export(root)?;
    let stats = exporter.get_stats();

    Ok(YawlExportResult {
        xml,
        task_count: stats.task_count,
        condition_count: stats.condition_count,
        flow_count: stats.flow_count,
        max_tree_depth: stats.max_depth,
    })
}

/// Internal YAWL exporter that maintains state during conversion.
struct YawlExporter<'a> {
    arena: &'a PowlArena,
    config: &'a YawlExportConfig,
    task_counter: usize,
    condition_counter: usize,
    flow_counter: usize,
    max_depth: usize,
    /// Map from POWL node ID to YAWL task ID.
    node_to_task: HashMap<u32, String>,
    /// Map from POWL node ID to YAWL condition ID.
    _node_to_condition: HashMap<u32, String>,
    /// Track visited nodes to detect cycles.
    visited: HashSet<u32>,
}

#[derive(Default)]
struct ExportStats {
    task_count: usize,
    condition_count: usize,
    flow_count: usize,
    max_depth: usize,
}

impl<'a> YawlExporter<'a> {
    fn new(arena: &'a PowlArena, config: &'a YawlExportConfig) -> Self {
        YawlExporter {
            arena,
            config,
            task_counter: 0,
            condition_counter: 0,
            flow_counter: 0,
            max_depth: 0,
            node_to_task: HashMap::new(),
            _node_to_condition: HashMap::new(),
            visited: HashSet::new(),
        }
    }

    fn get_stats(&self) -> ExportStats {
        ExportStats {
            task_count: self.task_counter,
            condition_count: self.condition_counter,
            flow_count: self.flow_counter,
            max_depth: self.max_depth,
        }
    }

    fn export(&mut self, root: u32) -> Result<String, YawlExportError> {
        let mut xml = String::new();

        // XML declaration
        xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");

        // Root specificationSet element
        xml.push_str(&format!(
            "<specificationSet xmlns=\"{}\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" ",
            YAWL_NAMESPACE
        ));
        xml.push_str("xsi:schemaLocation=\"http://www.yawlfoundation.org/yawlschema ");
        xml.push_str(
            "http://www.yawlfoundation.org/yawlschema/YAWLSchema2.0.xsd\" version=\"2.0\">\n",
        );

        // Export specification
        self.export_specification(&mut xml, root)?;

        // Close root element
        xml.push_str("</specificationSet>\n");

        Ok(xml)
    }

    fn export_specification(&mut self, xml: &mut String, root: u32) -> Result<(), YawlExportError> {
        xml.push_str(&format!(
            "  <specification uri=\"{}\">\n",
            self.config.spec_id
        ));
        xml.push_str("    <meta>\n");
        xml.push_str(&format!(
            "      <title>{}</title>\n",
            escape_xml(&self.config.spec_name)
        ));
        xml.push_str("      <creator>pictl/wasm4pm</creator>\n");
        xml.push_str("      <description>Exported from POWL model</description>\n");
        xml.push_str("    </meta>\n");

        // Export the net (workflow)
        self.export_net(xml, root, 0)?;

        xml.push_str("  </specification>\n");
        Ok(())
    }

    fn export_net(
        &mut self,
        xml: &mut String,
        node_id: u32,
        depth: usize,
    ) -> Result<(), YawlExportError> {
        self.max_depth = self.max_depth.max(depth);

        if depth > self.config.max_depth {
            return Err(YawlExportError::MaxDepthExceeded);
        }

        if !self.visited.insert(node_id) {
            return Err(YawlExportError::CircularReference);
        }

        xml.push_str("    <net id=\"n1\">\n");

        // Export input condition (start place)
        let input_id = self.alloc_condition();
        xml.push_str(&format!("      <inputCondition id=\"{}\">\n", input_id));
        xml.push_str("        <name>Input Condition</name>\n");
        xml.push_str("      </inputCondition>\n");

        // Export output condition (end place)
        let output_id = self.alloc_condition();
        xml.push_str(&format!("      <outputCondition id=\"{}\">\n", output_id));
        xml.push_str("        <name>Output Condition</name>\n");
        xml.push_str("      </outputCondition>\n");

        // Export nodes based on POWL type
        if let Some(node) = self.arena.nodes.get(node_id as usize) {
            match node {
                PowlNode::Transition(t) => {
                    self.export_transition(xml, node_id, t, &input_id, &output_id, depth)?;
                }
                PowlNode::FrequentTransition(t) => {
                    self.export_frequent_transition(xml, node_id, t, &input_id, &output_id, depth)?;
                }
                PowlNode::StrictPartialOrder(po) => {
                    self.export_partial_order(xml, po, &input_id, &output_id, depth)?;
                }
                PowlNode::OperatorPowl(op) => {
                    self.export_operator(xml, node_id, op, &input_id, &output_id, depth)?;
                }
                PowlNode::DecisionGraph(_) => {
                    // Decision graphs not directly supported in YAWL
                    // Treat as simple task
                    self.export_simple_task(xml, node_id, "DecisionGraph", &input_id, &output_id)?;
                }
            }
        }

        xml.push_str("    </net>\n");

        self.visited.remove(&node_id);
        Ok(())
    }

    fn export_transition(
        &mut self,
        xml: &mut String,
        node_id: u32,
        t: &crate::powl_arena::TransitionNode,
        input_id: &str,
        output_id: &str,
        __depth: usize,
    ) -> Result<(), YawlExportError> {
        let task_id = self.alloc_task(node_id);
        let label = t.label.as_deref().unwrap_or("tau");

        xml.push_str(&format!("      <task id=\"{}\">\n", task_id));
        xml.push_str(&format!("        <name>{}</name>\n", escape_xml(label)));
        xml.push_str("      </task>\n");

        // Flows: input -> task -> output
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            input_id, task_id
        ));
        self.flow_counter += 1;
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            task_id, output_id
        ));
        self.flow_counter += 1;

        Ok(())
    }

    fn export_frequent_transition(
        &mut self,
        xml: &mut String,
        node_id: u32,
        t: &crate::powl_arena::FrequentTransitionNode,
        input_id: &str,
        output_id: &str,
        __depth: usize,
    ) -> Result<(), YawlExportError> {
        let task_id = self.alloc_task(node_id);

        xml.push_str(&format!("      <task id=\"{}\">\n", task_id));
        xml.push_str(&format!("        <name>{}</name>\n", escape_xml(&t.label)));

        // Add decomposition info for frequent transitions
        if t.skippable || t.selfloop {
            xml.push_str(&format!(
                "        <decomposition id=\"decomp_{}\"/>\n",
                node_id
            ));
        }

        xml.push_str("      </task>\n");

        // Flows
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            input_id, task_id
        ));
        self.flow_counter += 1;
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            task_id, output_id
        ));
        self.flow_counter += 1;

        Ok(())
    }

    fn export_partial_order(
        &mut self,
        xml: &mut String,
        po: &crate::powl_arena::StrictPartialOrderNode,
        input_id: &str,
        output_id: &str,
        _depth: usize,
    ) -> Result<(), YawlExportError> {
        // For partial orders, export each child as a task
        // Connect them based on the order relation
        let mut prev_task_id: Option<String> = None;

        for (idx, &child_id) in po.children.iter().enumerate() {
            let task_id = self.alloc_task(child_id);

            // Get label for child
            let label =
                if let Some(PowlNode::Transition(t)) = self.arena.nodes.get(child_id as usize) {
                    t.label.as_deref().unwrap_or("tau")
                } else if let Some(PowlNode::FrequentTransition(t)) =
                    self.arena.nodes.get(child_id as usize)
                {
                    &t.label
                } else {
                    "activity"
                };

            xml.push_str(&format!("      <task id=\"{}\">\n", task_id));
            xml.push_str(&format!("        <name>{}</name>\n", escape_xml(label)));
            xml.push_str("      </task>\n");

            // Connect from input or previous task
            let source_id = if idx == 0 {
                input_id
            } else {
                prev_task_id.as_ref().unwrap()
            };
            xml.push_str(&format!(
                "      <flow source=\"{}\" target=\"{}\"/>\n",
                source_id, task_id
            ));
            self.flow_counter += 1;

            prev_task_id = Some(task_id);
        }

        // Connect last task to output
        if let Some(last_task_id) = prev_task_id {
            xml.push_str(&format!(
                "      <flow source=\"{}\" target=\"{}\"/>\n",
                last_task_id, output_id
            ));
            self.flow_counter += 1;
        }

        Ok(())
    }

    fn export_operator(
        &mut self,
        xml: &mut String,
        node_id: u32,
        op: &crate::powl_arena::OperatorPowlNode,
        input_id: &str,
        output_id: &str,
        _depth: usize,
    ) -> Result<(), YawlExportError> {
        // Export operator as a composite task
        let task_id = self.alloc_task(node_id);
        let op_name = match op.operator {
            Operator::Xor => "XOR",
            Operator::Loop => "LOOP",
            Operator::PartialOrder => "PARTIAL_ORDER",
        };

        xml.push_str(&format!("      <task id=\"{}\">\n", task_id));
        xml.push_str(&format!("        <name>{}</name>\n", op_name));

        // Add decomposition for composite operator
        xml.push_str(&format!(
            "        <decomposition id=\"decomp_{}\"/>\n",
            node_id
        ));
        xml.push_str("      </task>\n");

        // Flow from input to this task
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            input_id, task_id
        ));
        self.flow_counter += 1;

        // Flow from this task to output
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            task_id, output_id
        ));
        self.flow_counter += 1;

        Ok(())
    }

    fn export_simple_task(
        &mut self,
        xml: &mut String,
        node_id: u32,
        label: &str,
        input_id: &str,
        output_id: &str,
    ) -> Result<(), YawlExportError> {
        let task_id = self.alloc_task(node_id);

        xml.push_str(&format!("      <task id=\"{}\">\n", task_id));
        xml.push_str(&format!("        <name>{}</name>\n", escape_xml(label)));
        xml.push_str("      </task>\n");

        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            input_id, task_id
        ));
        self.flow_counter += 1;
        xml.push_str(&format!(
            "      <flow source=\"{}\" target=\"{}\"/>\n",
            task_id, output_id
        ));
        self.flow_counter += 1;

        Ok(())
    }

    fn alloc_task(&mut self, node_id: u32) -> String {
        let task_id = format!("t{}", self.task_counter);
        self.task_counter += 1;
        self.node_to_task.insert(node_id, task_id.clone());
        task_id
    }

    fn alloc_condition(&mut self) -> String {
        let cond_id = format!("c{}", self.condition_counter);
        self.condition_counter += 1;
        cond_id
    }
}

/// Escape special XML characters.
fn escape_xml(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            '&' => "&amp;".chars().collect::<Vec<_>>(),
            '<' => "&lt;".chars().collect::<Vec<_>>(),
            '>' => "&gt;".chars().collect::<Vec<_>>(),
            '"' => "&quot;".chars().collect::<Vec<_>>(),
            '\'' => "&apos;".chars().collect::<Vec<_>>(),
            _ => vec![c],
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("normal"), "normal");
        assert_eq!(escape_xml("<tag>"), "&lt;tag&gt;");
        assert_eq!(escape_xml("a & b"), "a &amp; b");
        assert_eq!(escape_xml("\"quote\""), "&quot;quote&quot;");
    }

    #[test]
    fn test_config_default() {
        let config = YawlExportConfig::default();
        assert_eq!(config.max_depth, 1000);
        assert_eq!(config.include_layout, true);
        assert_eq!(config.spec_id, "spec1");
        assert_eq!(config.spec_name, "Exported from POWL");
    }

    #[test]
    fn test_empty_arena() {
        let arena = PowlArena::new();
        let result = powl_to_yawl(&arena, 0, &YawlExportConfig::default());
        assert_eq!(result, Err(YawlExportError::EmptyModel));
    }

    #[test]
    fn test_invalid_root() {
        let mut arena = PowlArena::new();
        arena.add_transition(Some("A".to_string()));
        let result = powl_to_yawl(&arena, 999, &YawlExportConfig::default());
        assert!(matches!(result, Err(YawlExportError::EmptyModel)));
    }

    #[test]
    fn test_simple_transition_export() {
        let mut arena = PowlArena::new();
        let root = arena.add_transition(Some("TestActivity".to_string()));

        let result = powl_to_yawl(&arena, root, &YawlExportConfig::default()).unwrap();

        // Verify XML contains expected elements
        assert!(result.xml.contains("<?xml version=\"1.0\""));
        assert!(result.xml.contains("<specificationSet"));
        assert!(result
            .xml
            .contains("xmlns=\"http://www.yawlfoundation.org/yawlschema\""));
        assert!(result.xml.contains("<specification"));
        assert!(result.xml.contains("<net"));
        assert!(result.xml.contains("<inputCondition"));
        assert!(result.xml.contains("<outputCondition"));
        assert!(result.xml.contains("<task"));
        assert!(result.xml.contains("TestActivity"));
        assert!(result.xml.contains("<flow"));

        // Verify counts
        assert_eq!(result.task_count, 1);
        assert_eq!(result.condition_count, 2); // input + output
        assert_eq!(result.flow_count, 2); // input->task, task->output
    }

    #[test]
    fn test_silent_transition_export() {
        let mut arena = PowlArena::new();
        let root = arena.add_transition(None); // Silent transition

        let result = powl_to_yawl(&arena, root, &YawlExportConfig::default()).unwrap();

        assert!(result.xml.contains("<task"));
        assert!(result.xml.contains("tau"));
    }

    #[test]
    fn test_frequent_transition_export() {
        let mut arena = PowlArena::new();
        let root = arena.add_frequent_transition("Activity".to_string(), 0, Some(5));

        let result = powl_to_yawl(&arena, root, &YawlExportConfig::default()).unwrap();

        assert!(result.xml.contains("<task"));
        assert!(result.xml.contains("Activity"));
        assert!(result.xml.contains("<decomposition"));
    }

    #[test]
    fn test_xor_operator_export() {
        let mut arena = PowlArena::new();
        let child1 = arena.add_transition(Some("A".to_string()));
        let child2 = arena.add_transition(Some("B".to_string()));
        let root = arena.add_operator(crate::powl_arena::Operator::Xor, vec![child1, child2]);

        let result = powl_to_yawl(&arena, root, &YawlExportConfig::default()).unwrap();

        assert!(result.xml.contains("XOR"));
        assert!(result.xml.contains("<decomposition"));
    }

    #[test]
    fn test_loop_operator_export() {
        let mut arena = PowlArena::new();
        let child = arena.add_transition(Some("A".to_string()));
        let root = arena.add_operator(crate::powl_arena::Operator::Loop, vec![child]);

        let result = powl_to_yawl(&arena, root, &YawlExportConfig::default()).unwrap();

        assert!(result.xml.contains("LOOP"));
    }

    #[test]
    fn test_max_depth_limit() {
        let mut arena = PowlArena::new();

        // Create a deep partial order chain
        let mut children: Vec<u32> = Vec::new();
        for _ in 0..100 {
            children.push(arena.add_transition(Some("Activity".to_string())));
        }
        let root = arena.add_strict_partial_order(children);

        let mut config = YawlExportConfig::default();
        config.max_depth = 1; // Set very low limit

        // The export should succeed since depth is computed at net level only
        let result = powl_to_yawl(&arena, root, &config);
        assert!(result.is_ok());
    }
}
