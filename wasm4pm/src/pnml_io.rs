//! PNML (Petri Net Markup Language) import/export for pictl.
//!
//! Supports the PNML standard for exchanging Petri nets between tools.
//! Uses `roxmltree` for XML parsing (consistent with the rest of pictl).
//!
//! # Public API
//!
//! - [`from_pnml`] -- parse a PNML XML string into a [`PetriNet`](crate::models::PetriNet)
//! - [`to_pnml`] -- serialize a [`PetriNet`](crate::models::PetriNet) to PNML XML
//! - [`from_pnml_wasm`] / [`to_pnml_wasm`] -- WASM-exported wrappers

use crate::error::{codes, wasm_err};
use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract the first text content from a `<text>` child of `node`.
fn text_of(node: roxmltree::Node) -> Option<String> {
    for child in node.children() {
        if child.tag_name().name() == "text" {
            return Some(child.text().unwrap_or("").trim().to_string());
        }
    }
    None
}

/// Try to parse a string as `usize`.
fn parse_usize(s: &str) -> Option<usize> {
    s.trim().parse::<usize>().ok()
}

// ---------------------------------------------------------------------------
// from_pnml
// ---------------------------------------------------------------------------

/// Parse a PNML XML string into a [`PetriNet`].
///
/// Handles `<place>`, `<transition>`, `<arc>`, `<initialMarking>`, and
/// `<finalmarkings>` elements.  Labels are read from `<name><text>` children;
/// initial markings from `<initialMarking><text>` children; arc weights from
/// `<inscription><text>` children.
///
/// # Errors
///
/// Returns a `String` describing the parse failure (malformed XML or missing
/// required attributes).
pub fn from_pnml(pnml_string: &str) -> Result<PetriNet, String> {
    let doc = roxmltree::Document::parse(pnml_string)
        .map_err(|e| format!("Failed to parse PNML XML: {}", e))?;

    let mut net = PetriNet::new();

    // Walk the tree looking for <net>, <page>, <place>, <transition>, <arc>,
    // <initialMarking>, <finalmarkings>.
    let root = doc.root();

    // Find the <net> element.  PNML structure is: document -> pnml -> net.
    // Descend through the tree to find the first <net> at any depth.
    let net_node = root
        .descendants()
        .find(|n| n.tag_name().name() == "net")
        .ok_or_else(|| "PNML: missing <net> element".to_string())?;

    // Collect places, transitions, arcs from all <page> children (and
    // directly under <net> for flat PNML files).
    let mut containers: Vec<roxmltree::Node> = Vec::new();
    // The net itself may contain elements directly.
    containers.push(net_node);

    // Also collect <page> children.
    for child in net_node.children() {
        if child.tag_name().name() == "page" {
            containers.push(child);
        }
    }

    for container in &containers {
        for node in container.children() {
            match node.tag_name().name() {
                "place" => {
                    let id = node.attribute("id").unwrap_or("").to_string();
                    if id.is_empty() {
                        continue;
                    }

                    // Label from <name><text>
                    let label = node
                        .children()
                        .find(|n| n.tag_name().name() == "name")
                        .and_then(|name_node| text_of(name_node))
                        .unwrap_or_else(|| id.clone());

                    // Initial marking from <initialMarking><text>
                    let marking = node
                        .children()
                        .find(|n| n.tag_name().name() == "initialMarking")
                        .and_then(|im| text_of(im))
                        .and_then(|t| parse_usize(&t));

                    net.places.push(PetriNetPlace { id, label, marking });
                }
                "transition" => {
                    let id = node.attribute("id").unwrap_or("").to_string();
                    if id.is_empty() {
                        continue;
                    }

                    // Label from <name><text> or the `name` attribute.
                    let label = node
                        .children()
                        .find(|n| n.tag_name().name() == "name")
                        .and_then(|name_node| text_of(name_node))
                        .or_else(|| node.attribute("name").map(|s| s.to_string()))
                        .unwrap_or_else(|| id.clone());

                    // A transition with no label (label == id and no <name>) is
                    // considered invisible / silent.
                    let has_name_child = node.children().any(|n| n.tag_name().name() == "name");
                    let has_name_attr = node.attribute("name").is_some();
                    let is_invisible = if (!has_name_child && !has_name_attr) || label.is_empty() {
                        Some(true)
                    } else {
                        None
                    };

                    net.transitions.push(PetriNetTransition {
                        id,
                        label,
                        is_invisible,
                    });
                }
                "arc" => {
                    let source = node.attribute("source").unwrap_or("").to_string();
                    let target = node.attribute("target").unwrap_or("").to_string();
                    if source.is_empty() || target.is_empty() {
                        continue;
                    }

                    // Weight from <inscription><text>
                    let weight = node
                        .children()
                        .find(|n| n.tag_name().name() == "inscription")
                        .and_then(|inscr| text_of(inscr))
                        .and_then(|t| parse_usize(&t));

                    net.arcs.push(PetriNetArc {
                        from: source,
                        to: target,
                        weight,
                    });
                }
                _ => {}
            }
        }
    }

    // --- Initial marking (standalone <initialMarking> under <net>) ---
    for node in net_node.children() {
        if node.tag_name().name() == "initialMarking" {
            extract_marking(node, &mut net.initial_marking);
        }
    }

    // --- Final markings (<finalmarkings> under <net>) ---
    for node in net_node.children() {
        if node.tag_name().name() == "finalmarkings" {
            for marking_node in node.children() {
                if marking_node.tag_name().name() == "marking" {
                    let mut m: HashMap<String, usize> = HashMap::new();
                    extract_marking(marking_node, &mut m);
                    if !m.is_empty() {
                        net.final_markings.push(m);
                    }
                }
            }
        }
    }

    Ok(net)
}

/// Extract place-marking pairs from a container that has `<place idref="..."><text>N</text></place>` children.
fn extract_marking(container: roxmltree::Node, marking: &mut HashMap<String, usize>) {
    for node in container.children() {
        if node.tag_name().name() == "place" {
            if let Some(idref) = node.attribute("idref") {
                if let Some(text) = text_of(node) {
                    if let Some(tokens) = parse_usize(&text) {
                        if tokens > 0 {
                            marking.insert(idref.to_string(), tokens);
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// to_pnml
// ---------------------------------------------------------------------------

/// Serialize a [`PetriNet`] to a PNML XML string.
///
/// The output follows the PNML structure with `<net>`, `<page>`, `<place>`,
/// `<transition>`, `<arc>`, `<initialMarking>`, and `<finalmarkings>` elements.
pub fn to_pnml(net: &PetriNet) -> String {
    let mut xml = String::with_capacity(
        net.places.len() * 120 + net.transitions.len() * 120 + net.arcs.len() * 100,
    );

    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<pnml>\n");
    xml.push_str(
        "  <net id=\"net1\" type=\"http://www.pnml.org/version-2009/grammar/pnmlcoremodel\">\n",
    );
    xml.push_str("    <page id=\"page1\">\n");

    // Places
    for place in &net.places {
        xml.push_str("      <place id=\"");
        xml.push_str(&escape_xml(&place.id));
        xml.push_str("\">\n");
        xml.push_str("        <name><text>");
        xml.push_str(&escape_xml(&place.label));
        xml.push_str("</text></name>\n");
        if let Some(m) = place.marking {
            if m > 0 {
                xml.push_str("        <initialMarking><text>");
                xml.push_str(&m.to_string());
                xml.push_str("</text></initialMarking>\n");
            }
        }
        xml.push_str("      </place>\n");
    }

    // Transitions
    for transition in &net.transitions {
        xml.push_str("      <transition id=\"");
        xml.push_str(&escape_xml(&transition.id));
        xml.push_str("\">\n");
        xml.push_str("        <name><text>");
        xml.push_str(&escape_xml(&transition.label));
        xml.push_str("</text></name>\n");
        xml.push_str("      </transition>\n");
    }

    // Arcs
    for arc in &net.arcs {
        xml.push_str("      <arc id=\"");
        xml.push_str(&escape_xml(&format!("{}_{}", arc.from, arc.to)));
        xml.push_str("\" source=\"");
        xml.push_str(&escape_xml(&arc.from));
        xml.push_str("\" target=\"");
        xml.push_str(&escape_xml(&arc.to));
        xml.push_str("\">\n");
        xml.push_str("        <inscription><text>");
        xml.push_str(&arc.weight.unwrap_or(1).to_string());
        xml.push_str("</text></inscription>\n");
        xml.push_str("      </arc>\n");
    }

    xml.push_str("    </page>\n");

    // Initial marking (standalone)
    if !net.initial_marking.is_empty() {
        xml.push_str("    <initialMarking>\n");
        for (place_id, tokens) in &net.initial_marking {
            if *tokens > 0 {
                xml.push_str("      <place idref=\"");
                xml.push_str(&escape_xml(place_id));
                xml.push_str("\"><text>");
                xml.push_str(&tokens.to_string());
                xml.push_str("</text></place>\n");
            }
        }
        xml.push_str("    </initialMarking>\n");
    }

    // Final markings
    if !net.final_markings.is_empty() {
        xml.push_str("    <finalmarkings>\n");
        for marking in &net.final_markings {
            xml.push_str("      <marking>\n");
            for (place_id, tokens) in marking {
                if *tokens > 0 {
                    xml.push_str("        <place idref=\"");
                    xml.push_str(&escape_xml(place_id));
                    xml.push_str("\"><text>");
                    xml.push_str(&tokens.to_string());
                    xml.push_str("</text></place>\n");
                }
            }
            xml.push_str("      </marking>\n");
        }
        xml.push_str("    </finalmarkings>\n");
    }

    xml.push_str("  </net>\n");
    xml.push_str("</pnml>\n");

    xml
}

/// Minimal XML escape for attribute values and text content.
fn escape_xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// WASM exports
// ---------------------------------------------------------------------------

/// Parse a PNML XML string and store the resulting PetriNet in the handle-based
/// state system.  Returns a handle string on success.
#[wasm_bindgen]
pub fn from_pnml_wasm(pnml_string: &str) -> Result<JsValue, JsValue> {
    let net = from_pnml(pnml_string).map_err(|e| wasm_err(codes::PARSE_ERROR, e))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(net))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store PetriNet"))?;

    to_js(&serde_json::json!({ "handle": handle }))
}

/// Serialize a stored PetriNet (identified by handle) to PNML XML.
#[wasm_bindgen]
pub fn to_pnml_wasm(petri_net_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(net)) => {
            let pnml = to_pnml(net);
            to_js(&serde_json::json!({ "pnml": pnml }))
        }
        Some(_) => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("Handle '{}' does not refer to a PetriNet", petri_net_handle),
        )),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("PetriNet handle '{}' not found", petri_net_handle),
        )),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal helper to build a test PetriNet.
    fn make_simple_net() -> PetriNet {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "source".to_string(),
            label: "source".to_string(),
            marking: Some(1),
        });
        net.places.push(PetriNetPlace {
            id: "sink".to_string(),
            label: "sink".to_string(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "t1".to_string(),
            label: "A".to_string(),
            is_invisible: None,
        });
        net.arcs.push(PetriNetArc {
            from: "source".to_string(),
            to: "t1".to_string(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "t1".to_string(),
            to: "sink".to_string(),
            weight: Some(1),
        });
        net.initial_marking.insert("source".to_string(), 1);
        net.final_markings
            .push(vec![("sink".to_string(), 1)].into_iter().collect());
        net
    }

    #[test]
    fn test_to_pnml_contains_expected_elements() {
        let net = make_simple_net();
        let pnml = to_pnml(&net);

        assert!(pnml.contains("<?xml version=\"1.0\""));
        assert!(pnml.contains("<pnml>"));
        assert!(pnml.contains("<net id=\"net1\""));
        assert!(pnml.contains("<place id=\"source\">"));
        assert!(pnml.contains("<place id=\"sink\">"));
        assert!(pnml.contains("<transition id=\"t1\">"));
        assert!(pnml.contains("<name><text>A</text></name>"));
        assert!(pnml.contains("<arc "));
        assert!(pnml.contains("source=\"source\""));
        assert!(pnml.contains("target=\"t1\""));
        assert!(pnml.contains("<inscription><text>1</text></inscription>"));
        assert!(pnml.contains("<initialMarking>"));
        assert!(pnml.contains("<finalmarkings>"));
    }

    #[test]
    fn test_from_pnml_simple() {
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="Simple" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="source">
        <name><text>source</text></name>
        <initialMarking><text>1</text></initialMarking>
      </place>
      <place id="sink">
        <name><text>sink</text></name>
      </place>
      <transition id="t1">
        <name><text>A</text></name>
      </transition>
      <transition id="t_silent"/>
      <arc id="a1" source="source" target="t1">
        <inscription><text>1</text></inscription>
      </arc>
      <arc id="a2" source="t1" target="sink">
        <inscription><text>1</text></inscription>
      </arc>
    </page>
    <initialMarking>
      <place idref="source"><text>1</text></place>
    </initialMarking>
    <finalmarkings>
      <marking>
        <place idref="sink"><text>1</text></place>
      </marking>
    </finalmarkings>
  </net>
</pnml>"#;

        let net = from_pnml(pnml).unwrap();
        assert_eq!(net.places.len(), 2);
        assert_eq!(net.transitions.len(), 2);
        assert_eq!(net.arcs.len(), 2);

        // Check places
        assert_eq!(net.places[0].id, "source");
        assert_eq!(net.places[0].label, "source");
        assert_eq!(net.places[0].marking, Some(1));
        assert_eq!(net.places[1].id, "sink");

        // Check transitions
        assert_eq!(net.transitions[0].id, "t1");
        assert_eq!(net.transitions[0].label, "A");
        assert_eq!(net.transitions[0].is_invisible, None);
        assert_eq!(net.transitions[1].id, "t_silent");
        // Silent transition: no <name> child and no name attr
        assert_eq!(net.transitions[1].is_invisible, Some(true));

        // Check arcs
        assert_eq!(net.arcs[0].from, "source");
        assert_eq!(net.arcs[0].to, "t1");
        assert_eq!(net.arcs[0].weight, Some(1));
        assert_eq!(net.arcs[1].from, "t1");
        assert_eq!(net.arcs[1].to, "sink");

        // Check markings
        assert_eq!(net.initial_marking.get("source"), Some(&1));
        assert_eq!(net.final_markings.len(), 1);
        assert_eq!(net.final_markings[0].get("sink"), Some(&1));
    }

    #[test]
    fn test_pnml_roundtrip() {
        let original = make_simple_net();
        let pnml = to_pnml(&original);
        let restored = from_pnml(&pnml).unwrap();

        assert_eq!(restored.places.len(), original.places.len());
        assert_eq!(restored.transitions.len(), original.transitions.len());
        assert_eq!(restored.arcs.len(), original.arcs.len());

        // Verify place IDs round-trip
        for (orig, rest) in original.places.iter().zip(restored.places.iter()) {
            assert_eq!(orig.id, rest.id);
            assert_eq!(orig.label, rest.label);
        }

        // Verify transition IDs round-trip
        for (orig, rest) in original.transitions.iter().zip(restored.transitions.iter()) {
            assert_eq!(orig.id, rest.id);
            assert_eq!(orig.label, rest.label);
        }

        // Verify arcs round-trip
        for (orig, rest) in original.arcs.iter().zip(restored.arcs.iter()) {
            assert_eq!(orig.from, rest.from);
            assert_eq!(orig.to, rest.to);
        }

        // Verify initial marking round-trips
        assert_eq!(restored.initial_marking, original.initial_marking);

        // Verify final markings round-trip
        assert_eq!(restored.final_markings.len(), original.final_markings.len());
        for (orig_m, rest_m) in original
            .final_markings
            .iter()
            .zip(restored.final_markings.iter())
        {
            assert_eq!(orig_m, rest_m);
        }
    }

    #[test]
    fn test_from_pnml_empty_net() {
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="Empty" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1"/>
  </net>
</pnml>"#;

        let net = from_pnml(pnml).unwrap();
        assert_eq!(net.places.len(), 0);
        assert_eq!(net.transitions.len(), 0);
        assert_eq!(net.arcs.len(), 0);
        assert!(net.initial_marking.is_empty());
        assert!(net.final_markings.is_empty());
    }

    #[test]
    fn test_from_pnml_missing_net_element() {
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <foo/>
</pnml>"#;

        let result = from_pnml(pnml);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("missing <net>"));
    }

    #[test]
    fn test_to_pnml_empty_net() {
        let net = PetriNet::new();
        let pnml = to_pnml(&net);

        assert!(pnml.contains("<pnml>"));
        assert!(pnml.contains("<net id=\"net1\""));
        assert!(pnml.contains("<page id=\"page1\""));
        assert!(!pnml.contains("<place"));
        assert!(!pnml.contains("<transition"));
        assert!(!pnml.contains("<arc"));
        assert!(!pnml.contains("<initialMarking>"));
        assert!(!pnml.contains("<finalmarkings>"));
        assert!(pnml.contains("</pnml>"));
    }

    #[test]
    fn test_to_pnml_xml_escaping() {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p&<>'\"".to_string(),
            label: "label&<>".to_string(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "t1".to_string(),
            label: "A&B".to_string(),
            is_invisible: None,
        });

        let pnml = to_pnml(&net);

        // Verify special characters are escaped
        assert!(pnml.contains("p&amp;&lt;&gt;&apos;&quot;"));
        assert!(pnml.contains("label&amp;&lt;&gt;"));
        assert!(pnml.contains("A&amp;B"));
        // Verify raw characters do NOT appear in attribute / text context
        assert!(!pnml.contains("id=\"p&<>'\""));
    }

    #[test]
    fn test_from_pnml_arc_weight_default() {
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="WeightTest" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="p1"/>
      <transition id="t1"/>
      <arc id="a1" source="p1" target="t1"/>
    </page>
  </net>
</pnml>"#;

        let net = from_pnml(pnml).unwrap();
        assert_eq!(net.arcs.len(), 1);
        // Arc without inscription should have weight None
        assert_eq!(net.arcs[0].weight, None);
    }

    #[test]
    fn test_from_pnml_transition_name_attribute() {
        // Some PNML dialects put the label on the transition attribute instead of <name>
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="AttrTest" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="p1"/>
      <transition id="t1" name="Submit Order"/>
      <arc source="p1" target="t1"/>
    </page>
  </net>
</pnml>"#;

        let net = from_pnml(pnml).unwrap();
        assert_eq!(net.transitions.len(), 1);
        assert_eq!(net.transitions[0].label, "Submit Order");
        assert_eq!(net.transitions[0].is_invisible, None);
    }

    #[test]
    fn test_from_pnml_multiple_final_markings() {
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="MultiFinal" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="p1"/>
      <place id="p2"/>
      <place id="p3"/>
      <transition id="t1"/>
      <arc source="p1" target="t1"/>
    </page>
    <finalmarkings>
      <marking>
        <place idref="p2"><text>1</text></place>
      </marking>
      <marking>
        <place idref="p3"><text>1</text></place>
      </marking>
    </finalmarkings>
  </net>
</pnml>"#;

        let net = from_pnml(pnml).unwrap();
        assert_eq!(net.final_markings.len(), 2);
        assert_eq!(net.final_markings[0].get("p2"), Some(&1));
        assert_eq!(net.final_markings[1].get("p3"), Some(&1));
    }
}
