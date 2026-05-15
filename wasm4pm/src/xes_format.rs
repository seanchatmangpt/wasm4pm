use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::error::Result;
use wasm_bindgen::prelude::*;
use quick_xml::Reader;
use quick_xml::events::Event as QEvent;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Constants for XES Export
// ---------------------------------------------------------------------------

const INDENT_2: &str = "    ";
const INDENT_3: &str = "      ";

// ---------------------------------------------------------------------------
// XES Importer (Inlined from process_mining patterns)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
enum XesMode {
    Log,
    Trace,
    Event,
    Attribute,
    GlobalTrace,
    GlobalEvent,
    None,
}

/// Parse XES format using a state-machine approach with quick-xml (Internal Core).
pub fn parse_xes(content: &str) -> crate::error::Result<EventLog> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut log = EventLog::new();
    let mut current_mode = XesMode::None;
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;
    let mut buf = Vec::new();

    let mut attr_stack: Vec<(String, AttributeValue)> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(QEvent::Start(e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"log" => current_mode = XesMode::Log,
                    b"trace" => {
                        current_mode = XesMode::Trace;
                        current_trace = Some(Trace::new());
                    }
                    b"event" => {
                        current_mode = XesMode::Event;
                        current_event = Some(Event::new());
                    }
                    b"global" => {
                        if let Ok(Some(scope)) = e.try_get_attribute("scope") {
                            match scope.value.as_ref() {
                                b"trace" => current_mode = XesMode::GlobalTrace,
                                b"event" => current_mode = XesMode::GlobalEvent,
                                _ => {}
                            }
                        }
                    }
                    _ => {
                        if let Some((key, val)) = parse_xes_attribute(&e) {
                            attr_stack.push((key, val));
                            current_mode = XesMode::Attribute;
                        }
                    }
                }
            }
            Ok(QEvent::Empty(e)) => {
                if let Some((key, val)) = parse_xes_attribute(&e) {
                    match current_mode {
                        XesMode::Event => {
                            if let Some(ref mut ev) = current_event {
                                ev.attributes.insert(key, val);
                            }
                        }
                        XesMode::Trace => {
                            if let Some(ref mut tr) = current_trace {
                                tr.attributes.insert(key, val);
                            }
                        }
                        XesMode::Log => {
                            log.attributes.insert(key, val);
                        }
                        _ => {}
                    }
                }
            }
            Ok(QEvent::End(e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"event" => {
                        if let Some(ev) = current_event.take() {
                            if let Some(ref mut tr) = current_trace {
                                tr.events.push(ev);
                            }
                        }
                        current_mode = XesMode::Trace;
                    }
                    b"trace" => {
                        if let Some(tr) = current_trace.take() {
                            log.traces.push(tr);
                        }
                        current_mode = XesMode::Log;
                    }
                    b"log" => current_mode = XesMode::None,
                    b"global" => current_mode = XesMode::Log,
                    _ => {
                        if let Some((_key, _val)) = attr_stack.pop() {
                        }
                        if attr_stack.is_empty() {
                           if current_event.is_some() { current_mode = XesMode::Event; }
                           else if current_trace.is_some() { current_mode = XesMode::Trace; }
                           else { current_mode = XesMode::Log; }
                        }
                    }
                }
            }
            Ok(QEvent::Eof) => break,
            Err(e) => return Err(crate::error::err(crate::error::codes::PARSE_ERROR, format!("XES Parse Error at position {}: {:?}", reader.buffer_position(), e))),
            _ => {}
        }
        buf.clear();
    }

    Ok(log)
}

/// Parse XES format using a state-machine approach with quick-xml (WASM API).
#[wasm_bindgen]
pub fn load_eventlog_from_xes(content: &str) -> std::result::Result<String, JsValue> {
    match parse_xes(content) {
        Ok(log) => {
            let handle = get_or_init_state()
                .store_object(StoredObject::EventLog(log))
                .map_err(|e| JsValue::from(e))?;
            Ok(handle)
        }
        Err(err) => Err(JsValue::from(err))
    }
}

fn parse_xes_attribute(e: &quick_xml::events::BytesStart) -> Option<(String, AttributeValue)> {
    let key = e.try_get_attribute("key").ok()??.unescape_value().ok()?.to_string();
    let val_str = e.try_get_attribute("value").ok()??.unescape_value().ok()?.to_string();
    
    let tag = e.name();
    let val = match tag.as_ref() {
        b"string" => AttributeValue::String(val_str),
        b"int" => AttributeValue::Int(val_str.parse().unwrap_or(0)),
        b"float" => AttributeValue::Float(val_str.parse().unwrap_or(0.0)),
        b"date" => AttributeValue::Date(val_str),
        b"boolean" => AttributeValue::Boolean(val_str == "true" || val_str == "1"),
        _ => return None,
    };
    Some((key, val))
}

/// Parse XES format with parse cache — skips re-parsing if content hash matches.
#[wasm_bindgen]
pub fn load_eventlog_from_xes_cached(content: &str) -> std::result::Result<String, JsValue> {
    let hash = crate::cache::hash_xes_content(content);

    if let Some(cached_handle) = crate::cache::parse_cache_get(&hash) {
        let exists = get_or_init_state().with_object(&cached_handle, |obj| Ok(obj.is_some())).unwrap_or(false);
        if exists {
            return Ok(cached_handle);
        }
    }

    let handle = load_eventlog_from_xes(content)?;
    crate::cache::parse_cache_insert(hash, handle.clone());
    Ok(handle)
}

/// Export EventLog to XES format (generates valid XES XML)
#[wasm_bindgen]
pub fn export_eventlog_to_xes(eventlog_handle: &str) -> std::result::Result<String, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
            let mut xes = String::with_capacity(512 + total_events * 200);

            xes.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            xes.push_str("<log xes:version=\"1.0\" xmlns:xes=\"http://www.xes-standard.org/\">\n");

            for trace in log.traces.iter() {
                xes.push_str("  <trace>\n");
                for (key, value) in &trace.attributes {
                    write_attribute(&mut xes, 2, key, value);
                }
                for event in trace.events.iter() {
                    xes.push_str("    <event>\n");
                    for (key, value) in &event.attributes {
                        write_attribute(&mut xes, 3, key, value);
                    }
                    xes.push_str("    </event>\n");
                }
                xes.push_str("  </trace>\n");
            }
            xes.push_str("</log>");
            Ok(xes)
        }
        Some(_) => Err(crate::error::err(crate::error::codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(crate::error::err(crate::error::codes::INVALID_HANDLE, "EventLog not found")),
    }).map_err(|e| JsValue::from(e))
}

fn write_attribute(xes: &mut String, indent: usize, key: &str, value: &AttributeValue) {
    let spaces: &str = match indent {
        2 => INDENT_2,
        3 => INDENT_3,
        _ => {
            let s = " ".repeat(indent * 2);
            return write_attribute_with_indent(xes, &s, key, value);
        }
    };
    write_attribute_with_indent(xes, spaces, key, value);
}

#[inline(always)]
fn write_attribute_with_indent(xes: &mut String, spaces: &str, key: &str, value: &AttributeValue) {
    match value {
        AttributeValue::String(s) => {
            xes.push_str(spaces);
            xes.push_str("<string key=\"");
            xes.push_str(key);
            xes.push_str("\" value=\"");
            xes.push_str(&escape_xml(s));
            xes.push_str("\" />\n");
        }
        AttributeValue::Int(i) => {
            xes.push_str(spaces);
            xes.push_str("<int key=\"");
            xes.push_str(key);
            xes.push_str("\" value=\"");
            xes.push_str(&i.to_string());
            xes.push_str("\" />\n");
        }
        AttributeValue::Float(f) => {
            xes.push_str(spaces);
            xes.push_str("<float key=\"");
            xes.push_str(key);
            xes.push_str("\" value=\"");
            xes.push_str(&f.to_string());
            xes.push_str("\" />\n");
        }
        AttributeValue::Date(d) => {
            xes.push_str(spaces);
            xes.push_str("<date key=\"");
            xes.push_str(key);
            xes.push_str("\" value=\"");
            xes.push_str(&escape_xml(d));
            xes.push_str("\" />\n");
        }
        AttributeValue::Boolean(b) => {
            xes.push_str(spaces);
            xes.push_str("<boolean key=\"");
            xes.push_str(key);
            xes.push_str("\" value=\"");
            xes.push_str(if *b { "true" } else { "false" });
            xes.push_str("\" />\n");
        }
        _ => {}
    }
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[wasm_bindgen]
pub fn xes_format_info() -> String {
    serde_json::json!({
        "status": "xes_format_supported",
        "format": "XES 1.0",
        "description": "eXtensible Event Stream - industry standard for process logs",
        "functions": [
            "load_eventlog_from_xes",
            "load_eventlog_from_xes_cached",
            "export_eventlog_to_xes"
        ],
        "note": "Supports basic XES structure with string, int, float, date, boolean attributes"
    })
    .to_string()
}
