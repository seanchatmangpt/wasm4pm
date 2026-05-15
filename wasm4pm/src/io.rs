use crate::models::{
    AttributeValue, EventLog, OCELAttributeValue, OCELEvent, OCELObject, OCELObjectRelation,
    OCELRelationship, OCEL,
};
use crate::state::{get_or_init_state, StoredObject};
use quick_xml::events::Event as QEvent;
use quick_xml::Reader;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use crate::error::{err, codes};

// ---------------------------------------------------------------------------
// OCEL XML Importer (Inlined from process_mining patterns)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
enum OcelMode {
    Objects,
    Events,
    Object,
    Event,
    ObjectTypes,
    EventTypes,
    Log,
    None,
}

/// Load an EventLog from JSON string
#[wasm_bindgen]
pub fn load_eventlog_from_json(content: &str) -> std::result::Result<String, JsValue> {
    let log: EventLog = serde_json::from_str(content)
        .map_err(|e| JsValue::from(err(codes::INVALID_JSON, format!("Failed to parse EventLog JSON: {}", e))))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|e| JsValue::from(e))?;

    Ok(handle)
}

/// Load an OCEL from JSON string
#[wasm_bindgen]
pub fn load_ocel_from_json(content: &str) -> std::result::Result<String, JsValue> {
    let mut ocel: OCEL = serde_json::from_str(content)
        .map_err(|e| JsValue::from(err(codes::INVALID_JSON, format!("Failed to parse OCEL JSON: {}", e))))?;

    ocel.normalize_relations();

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|e| JsValue::from(e))?;

    Ok(handle)
}

/// Export EventLog to JSON string
#[wasm_bindgen]
pub fn export_eventlog_to_json(handle: &str) -> std::result::Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => serde_json::to_string(log)
            .map_err(|e| err(codes::INTERNAL_ERROR, format!("Failed to serialize EventLog: {}", e))),
        Some(_) => Err(err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(err(codes::INVALID_HANDLE, "EventLog not found")),
    }).map_err(|e| JsValue::from(e))
}

/// Export OCEL to JSON string
#[wasm_bindgen]
pub fn export_ocel_to_json(handle: &str) -> std::result::Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => serde_json::to_string(ocel)
            .map_err(|e| err(codes::INTERNAL_ERROR, format!("Failed to serialize OCEL: {}", e))),
        Some(_) => Err(err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(err(codes::INVALID_HANDLE, "OCEL not found")),
    }).map_err(|e| JsValue::from(e))
}

/// Load an OCEL from XML string using an inlined state-machine parser with quick-xml.
#[wasm_bindgen]
pub fn load_ocel_from_xml(content: &str) -> std::result::Result<String, JsValue> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut ocel = OCEL::new();
    let mut current_mode = OcelMode::None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(QEvent::Start(e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"log" => current_mode = OcelMode::Log,
                    b"object-types" => current_mode = OcelMode::ObjectTypes,
                    b"event-types" => current_mode = OcelMode::EventTypes,
                    b"objects" => current_mode = OcelMode::Objects,
                    b"events" => current_mode = OcelMode::Events,
                    b"object-type" => {
                        if let Some(n) = get_attr(&e, "name") {
                            ocel.object_types.push(n);
                        }
                    }
                    b"event-type" => {
                        if let Some(n) = get_attr(&e, "name") {
                            ocel.event_types.push(n);
                        }
                    }
                    b"object" => {
                        let id = get_attr(&e, "id").unwrap_or_default();
                        let obj_type = get_attr(&e, "type").unwrap_or_default();
                        ocel.objects.push(OCELObject {
                            id,
                            object_type: obj_type,
                            attributes: HashMap::new(),
                            changes: Vec::new(),
                            embedded_relations: Vec::new(),
                        });
                        current_mode = OcelMode::Object;
                    }
                    b"event" => {
                        let id = get_attr(&e, "id").unwrap_or_default();
                        let ev_type = get_attr(&e, "type").unwrap_or_default();
                        let time = get_attr(&e, "time").unwrap_or_default();
                        ocel.events.push(OCELEvent {
                            id,
                            event_type: ev_type,
                            timestamp: time,
                            attributes: HashMap::new(),
                            object_ids: Vec::new(),
                            relationships: Vec::new(),
                        });
                        current_mode = OcelMode::Event;
                    }
                    b"attribute" => {
                        if let (Some(k), Some(v)) = (get_attr(&e, "name"), get_attr(&e, "value")) {
                            let val = OCELAttributeValue::String(v);
                            match current_mode {
                                OcelMode::Object => {
                                    if let Some(obj) = ocel.objects.last_mut() {
                                        obj.attributes.insert(k, val);
                                    }
                                }
                                OcelMode::Event => {
                                    if let Some(ev) = ocel.events.last_mut() {
                                        ev.attributes.insert(k, val);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    b"relationship" | b"object-ref" => {
                        if let (Some(oid), Some(qual)) =
                            (get_attr(&e, "object-id"), get_attr(&e, "qualifier"))
                        {
                            match current_mode {
                                OcelMode::Event => {
                                    if let Some(ev) = ocel.events.last_mut() {
                                        ev.object_ids.push(oid.clone());
                                        ev.relationships.push(OCELRelationship {
                                            object_id: oid,
                                            qualifier: qual,
                                        });
                                    }
                                }
                                OcelMode::Object => {
                                    if let Some(obj) = ocel.objects.last_mut() {
                                        obj.embedded_relations.push(OCELRelationship {
                                            object_id: oid,
                                            qualifier: qual,
                                        });
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(QEvent::End(e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"object" => current_mode = OcelMode::Objects,
                    b"event" => current_mode = OcelMode::Events,
                    b"object-types" | b"event-types" | b"objects" | b"events" => {
                        current_mode = OcelMode::Log
                    }
                    b"log" => current_mode = OcelMode::None,
                    _ => {}
                }
            }
            Ok(QEvent::Eof) => break,
            Err(e) => {
                return Err(JsValue::from(err(codes::PARSE_ERROR, format!(
                    "OCEL XML Parse Error: {:?}",
                    e
                ))))
            }
            _ => {}
        }
        buf.clear();
    }

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|e| JsValue::from(e))?;
    Ok(handle)
}

fn get_attr(e: &quick_xml::events::BytesStart, name: &str) -> Option<String> {
    e.try_get_attribute(name)
        .ok()??
        .unescape_value()
        .ok()
        .map(|s| s.to_string())
}

/// Get the number of events in an OCEL
#[wasm_bindgen]
pub fn get_ocel_event_count(ocel_handle: &str) -> std::result::Result<usize, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.event_count()),
        _ => Err(err(codes::INVALID_HANDLE, "OCEL not found")),
    }).map_err(|e| JsValue::from(e))
}

/// Get the number of objects in an OCEL
#[wasm_bindgen]
pub fn get_ocel_object_count(ocel_handle: &str) -> std::result::Result<usize, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.object_count()),
        _ => Err(err(codes::INVALID_HANDLE, "OCEL not found")),
    }).map_err(|e| JsValue::from(e))
}
