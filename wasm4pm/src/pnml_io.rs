//! PNML (Petri Net Markup Language) import/export for wasm4pm.
//!
//! Supports the PNML standard for exchanging Petri nets between tools.
//! Uses `quick-xml` for XML parsing (two-pass algorithm ported from rust4pm).
//!
//! # Public API
//!
//! - [`from_pnml`] -- parse a PNML XML string into a [`PetriNet`](crate::models::PetriNet)
//! - [`to_pnml`] -- serialize a [`PetriNet`](crate::models::PetriNet) to PNML XML
//! - [`from_pnml_wasm`] / [`to_pnml_wasm`] -- WASM-exported wrappers

use crate::error::{codes, wasm_err};
use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::{BTreeMap, HashMap};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Try to parse a string as `usize`.
fn parse_usize(s: &str) -> Option<usize> {
    s.trim().parse::<usize>().ok()
}

// ---------------------------------------------------------------------------
// from_pnml  (two-pass quick-xml parser, ported from rust4pm)
// ---------------------------------------------------------------------------

/// Parser state for the two-pass SAX-style parser.
#[derive(Debug, Clone, PartialEq)]
enum ParseState {
    Root,
    /// Inside a <place id="..."> element
    Place,
    /// Inside <place> > <name>
    PlaceName,
    /// Inside <place> > <name> > <text>  (ready to capture label)
    PlaceNameText,
    /// Inside <place> > <initialMarking>
    PlaceInitialMarking,
    /// Inside <place> > <initialMarking> > <text>
    PlaceInitialMarkingText,
    /// Inside a <transition id="..."> element
    Transition,
    /// Inside <transition> > <name>
    TransitionName,
    /// Inside <transition> > <name> > <text>
    TransitionNameText,
    /// Inside an <arc ...> element
    Arc,
    /// Inside <arc> > <inscription>
    ArcInscription,
    /// Inside <arc> > <inscription> > <text>
    ArcInscriptionText,
    /// Inside a top-level <initialMarking> (standalone, not inside a place)
    InitialMarking,
    /// Inside <initialMarking> > <place idref="...">
    InitialMarkingPlace,
    /// Inside <initialMarking> > <place> > <text>
    InitialMarkingPlaceText,
    /// Inside <finalmarkings>
    FinalMarkings,
    /// Inside <finalmarkings> > <marking>
    FinalMarkingsMarking,
    /// Inside <finalmarkings> > <marking> > <place idref="...">
    FinalMarkingsMarkingPlace,
    /// Inside <finalmarkings> > <marking> > <place> > <text>
    FinalMarkingsMarkingPlaceText,
}

/// Intermediate place data collected in pass 1.
struct PlaceData {
    id: String,
    label: Option<String>,
    marking: Option<usize>,
    /// Whether a <name> child was seen at all
    has_name: bool,
}

/// Intermediate transition data collected in pass 1.
struct TransitionData {
    id: String,
    label: Option<String>,
    /// Label from `name` attribute (fallback)
    name_attr: Option<String>,
    /// Whether a <name> child was seen at all
    has_name: bool,
    is_silent: bool,
}

/// Intermediate arc data collected in pass 1.
struct ArcData {
    source: String,
    target: String,
    weight: Option<usize>,
}

/// Parse a PNML XML string into a [`PetriNet`].
///
/// Uses a two-pass algorithm (ported from rust4pm): pass 1 collects raw data
/// via quick-xml SAX events; pass 2 builds the PetriNet from the collected data.
///
/// # Errors
///
/// Returns a `String` describing the parse failure (malformed XML or missing
/// required `<net>` element).
pub fn from_pnml(pnml_string: &str) -> Result<PetriNet, String> {
    // -----------------------------------------------------------------------
    // Pass 1: collect raw data
    // -----------------------------------------------------------------------
    let mut reader = Reader::from_str(pnml_string);
    reader.config_mut().trim_text(true);

    let mut state = ParseState::Root;

    let mut places: Vec<PlaceData> = Vec::new();
    let mut transitions: Vec<TransitionData> = Vec::new();
    let mut raw_arcs: Vec<ArcData> = Vec::new();
    let mut initial_marking: BTreeMap<String, usize> = BTreeMap::new();
    let mut final_markings: Vec<HashMap<String, usize>> = Vec::new();

    // Scratch vars used while building the current element
    let mut cur_place_id = String::new();
    let mut cur_place_label: Option<String> = None;
    let mut cur_place_marking: Option<usize> = None;
    let mut cur_place_has_name = false;

    let mut cur_trans_id = String::new();
    let mut cur_trans_label: Option<String> = None;
    let mut cur_trans_name_attr: Option<String> = None;
    let mut cur_trans_has_name = false;
    let mut cur_trans_is_silent = false;

    let mut cur_arc_source = String::new();
    let mut cur_arc_target = String::new();
    let mut cur_arc_weight: Option<usize> = None;

    // For marking contexts
    let mut cur_marking_idref = String::new();
    let mut cur_im_place_idref = String::new();
    let mut cur_fm_marking: HashMap<String, usize> = HashMap::new();
    let mut cur_fm_place_idref = String::new();

    // Track whether we've seen a <net> element at all
    let mut found_net = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_string();

                match (state.clone(), tag.as_str()) {
                    // net / page — just mark found and stay at Root
                    (ParseState::Root, "net") => {
                        found_net = true;
                    }
                    (ParseState::Root, "page") => {}

                    // --- place ---
                    (ParseState::Root, "place") => {
                        cur_place_id = attr_value(e, b"id").unwrap_or_default();
                        cur_place_label = None;
                        cur_place_marking = None;
                        cur_place_has_name = false;
                        state = ParseState::Place;
                    }
                    (ParseState::Place, "name") => {
                        cur_place_has_name = true;
                        state = ParseState::PlaceName;
                    }
                    (ParseState::PlaceName, "text") => {
                        state = ParseState::PlaceNameText;
                    }
                    (ParseState::Place, "initialMarking") => {
                        state = ParseState::PlaceInitialMarking;
                    }
                    (ParseState::PlaceInitialMarking, "text") => {
                        state = ParseState::PlaceInitialMarkingText;
                    }

                    // --- transition ---
                    (ParseState::Root, "transition") => {
                        cur_trans_id = attr_value(e, b"id").unwrap_or_default();
                        cur_trans_label = None;
                        cur_trans_name_attr = attr_value(e, b"name");
                        cur_trans_has_name = false;
                        cur_trans_is_silent = false;
                        // Check toolspecific silent marker (not in Start — handled in Empty)
                        state = ParseState::Transition;
                    }
                    (ParseState::Transition, "name") => {
                        cur_trans_has_name = true;
                        state = ParseState::TransitionName;
                    }
                    (ParseState::TransitionName, "text") => {
                        state = ParseState::TransitionNameText;
                    }
                    (ParseState::Transition, "toolspecific") => {
                        // Check activity="$invisible$"
                        if attr_value(e, b"activity")
                            .map(|v| v == "$invisible$")
                            .unwrap_or(false)
                        {
                            cur_trans_is_silent = true;
                        }
                    }

                    // --- arc ---
                    (ParseState::Root, "arc") => {
                        cur_arc_source = attr_value(e, b"source").unwrap_or_default();
                        cur_arc_target = attr_value(e, b"target").unwrap_or_default();
                        cur_arc_weight = None;
                        state = ParseState::Arc;
                    }
                    (ParseState::Arc, "inscription") => {
                        state = ParseState::ArcInscription;
                    }
                    (ParseState::ArcInscription, "text") => {
                        state = ParseState::ArcInscriptionText;
                    }

                    // --- top-level initialMarking ---
                    (ParseState::Root, "initialMarking") => {
                        state = ParseState::InitialMarking;
                    }
                    (ParseState::InitialMarking, "place") => {
                        cur_im_place_idref = attr_value(e, b"idref").unwrap_or_default();
                        state = ParseState::InitialMarkingPlace;
                    }
                    (ParseState::InitialMarkingPlace, "text") => {
                        state = ParseState::InitialMarkingPlaceText;
                    }

                    // --- finalmarkings ---
                    (ParseState::Root, "finalmarkings") => {
                        state = ParseState::FinalMarkings;
                    }
                    (ParseState::FinalMarkings, "marking") => {
                        cur_fm_marking = HashMap::new();
                        state = ParseState::FinalMarkingsMarking;
                    }
                    (ParseState::FinalMarkingsMarking, "place") => {
                        cur_fm_place_idref = attr_value(e, b"idref").unwrap_or_default();
                        state = ParseState::FinalMarkingsMarkingPlace;
                    }
                    (ParseState::FinalMarkingsMarkingPlace, "text") => {
                        state = ParseState::FinalMarkingsMarkingPlaceText;
                    }

                    _ => {}
                }
            }

            Ok(Event::Empty(ref e)) => {
                // Self-closing tags like <place id="p1"/>  or <page id="page1"/>
                let tag = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_string();

                match (state.clone(), tag.as_str()) {
                    (ParseState::Root, "net") => {
                        found_net = true;
                    }
                    (ParseState::Root, "place") => {
                        let id = attr_value(e, b"id").unwrap_or_default();
                        if !id.is_empty() {
                            places.push(PlaceData {
                                label: None,
                                marking: None,
                                has_name: false,
                                id,
                            });
                        }
                    }
                    (ParseState::Root, "transition") => {
                        let id = attr_value(e, b"id").unwrap_or_default();
                        if !id.is_empty() {
                            let name_attr = attr_value(e, b"name");
                            transitions.push(TransitionData {
                                id,
                                label: None,
                                name_attr,
                                has_name: false,
                                is_silent: false,
                            });
                        }
                    }
                    (ParseState::Root, "arc") => {
                        let source = attr_value(e, b"source").unwrap_or_default();
                        let target = attr_value(e, b"target").unwrap_or_default();
                        if !source.is_empty() && !target.is_empty() {
                            raw_arcs.push(ArcData {
                                source,
                                target,
                                weight: None,
                            });
                        }
                    }
                    (ParseState::Transition, "toolspecific") => {
                        if attr_value(e, b"activity")
                            .map(|v| v == "$invisible$")
                            .unwrap_or(false)
                        {
                            cur_trans_is_silent = true;
                        }
                    }
                    _ => {}
                }
            }

            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().trim().to_string();
                if text.is_empty() {
                    buf.clear();
                    continue;
                }
                match state {
                    ParseState::PlaceNameText => {
                        cur_place_label = Some(text);
                    }
                    ParseState::PlaceInitialMarkingText => {
                        cur_place_marking = parse_usize(&text);
                    }
                    ParseState::TransitionNameText => {
                        cur_trans_label = Some(text);
                    }
                    ParseState::ArcInscriptionText => {
                        cur_arc_weight = parse_usize(&text);
                    }
                    ParseState::InitialMarkingPlaceText => {
                        if let Some(tokens) = parse_usize(&text) {
                            if tokens > 0 && !cur_im_place_idref.is_empty() {
                                initial_marking.insert(cur_im_place_idref.clone(), tokens);
                            }
                        }
                    }
                    ParseState::FinalMarkingsMarkingPlaceText => {
                        if let Some(tokens) = parse_usize(&text) {
                            if tokens > 0 && !cur_fm_place_idref.is_empty() {
                                cur_fm_marking.insert(cur_fm_place_idref.clone(), tokens);
                            }
                        }
                    }
                    _ => {}
                }
            }

            Ok(Event::End(ref e)) => {
                let tag = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_string();

                match (state.clone(), tag.as_str()) {
                    // --- place ---
                    (ParseState::PlaceNameText, "text") => {
                        state = ParseState::PlaceName;
                    }
                    (ParseState::PlaceName, "name") => {
                        state = ParseState::Place;
                    }
                    (ParseState::PlaceInitialMarkingText, "text") => {
                        state = ParseState::PlaceInitialMarking;
                    }
                    (ParseState::PlaceInitialMarking, "initialMarking") => {
                        state = ParseState::Place;
                    }
                    (ParseState::Place, "place") => {
                        if !cur_place_id.is_empty() {
                            places.push(PlaceData {
                                id: cur_place_id.clone(),
                                label: cur_place_label.clone(),
                                marking: cur_place_marking,
                                has_name: cur_place_has_name,
                            });
                        }
                        state = ParseState::Root;
                    }

                    // --- transition ---
                    (ParseState::TransitionNameText, "text") => {
                        state = ParseState::TransitionName;
                    }
                    (ParseState::TransitionName, "name") => {
                        state = ParseState::Transition;
                    }
                    (ParseState::Transition, "toolspecific") => {}
                    (ParseState::Transition, "transition") => {
                        if !cur_trans_id.is_empty() {
                            transitions.push(TransitionData {
                                id: cur_trans_id.clone(),
                                label: cur_trans_label.clone(),
                                name_attr: cur_trans_name_attr.clone(),
                                has_name: cur_trans_has_name,
                                is_silent: cur_trans_is_silent,
                            });
                        }
                        state = ParseState::Root;
                    }

                    // --- arc ---
                    (ParseState::ArcInscriptionText, "text") => {
                        state = ParseState::ArcInscription;
                    }
                    (ParseState::ArcInscription, "inscription") => {
                        state = ParseState::Arc;
                    }
                    (ParseState::Arc, "arc") => {
                        if !cur_arc_source.is_empty() && !cur_arc_target.is_empty() {
                            raw_arcs.push(ArcData {
                                source: cur_arc_source.clone(),
                                target: cur_arc_target.clone(),
                                weight: cur_arc_weight,
                            });
                        }
                        state = ParseState::Root;
                    }

                    // --- initialMarking ---
                    (ParseState::InitialMarkingPlaceText, "text") => {
                        state = ParseState::InitialMarkingPlace;
                    }
                    (ParseState::InitialMarkingPlace, "place") => {
                        state = ParseState::InitialMarking;
                    }
                    (ParseState::InitialMarking, "initialMarking") => {
                        state = ParseState::Root;
                    }

                    // --- finalmarkings ---
                    (ParseState::FinalMarkingsMarkingPlaceText, "text") => {
                        state = ParseState::FinalMarkingsMarkingPlace;
                    }
                    (ParseState::FinalMarkingsMarkingPlace, "place") => {
                        state = ParseState::FinalMarkingsMarking;
                    }
                    (ParseState::FinalMarkingsMarking, "marking") => {
                        if !cur_fm_marking.is_empty() {
                            final_markings.push(cur_fm_marking.clone());
                        }
                        state = ParseState::FinalMarkings;
                    }
                    (ParseState::FinalMarkings, "finalmarkings") => {
                        state = ParseState::Root;
                    }

                    // net / page end — stay at Root
                    (ParseState::Root, "net") | (ParseState::Root, "page") => {}

                    _ => {}
                }
            }

            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Failed to parse PNML XML: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    if !found_net {
        return Err("PNML: missing <net> element".to_string());
    }

    // -----------------------------------------------------------------------
    // Pass 2: build PetriNet from collected data
    // -----------------------------------------------------------------------
    let mut net = PetriNet::new();

    for p in places {
        let label = p.label.unwrap_or_else(|| p.id.clone());
        net.places.push(PetriNetPlace {
            id: p.id,
            label,
            marking: p.marking,
        });
    }

    for t in transitions {
        // Determine label: <name><text> wins, then `name` attribute, else id
        let label = t
            .label
            .or(t.name_attr.clone())
            .unwrap_or_else(|| t.id.clone());

        // Silent if explicitly marked, or no <name> child and no name attr, or label empty
        let is_invisible =
            if t.is_silent || (!t.has_name && t.name_attr.is_none()) || label.is_empty() {
                Some(true)
            } else {
                None
            };

        net.transitions.push(PetriNetTransition {
            id: t.id,
            label,
            is_invisible,
        });
    }

    for a in raw_arcs {
        net.arcs.push(PetriNetArc {
            from: a.source,
            to: a.target,
            weight: a.weight,
        });
    }

    net.initial_marking = initial_marking;
    net.final_markings = final_markings;

    Ok(net)
}

/// Extract an attribute value from a quick-xml BytesStart event.
fn attr_value(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == name)
        .and_then(|a| {
            std::str::from_utf8(a.value.as_ref())
                .ok()
                .map(|s| s.to_string())
        })
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

    to_js_str(&serde_json::json!({ "handle": handle }))
}

/// Serialize a stored PetriNet (identified by handle) to PNML XML.
#[wasm_bindgen]
pub fn to_pnml_wasm(petri_net_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(net)) => {
            let pnml = to_pnml(net);
            to_js_str(&serde_json::json!({ "pnml": pnml }))
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
