use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::error::{Result, err, codes};
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
// XES Importer (State-machine based)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
enum XesMode {
    Log,
    Trace,
    Event,
    Global,
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
    let mut current_global_scope: Option<String> = None;
    let mut buf = Vec::new();

    // Stack to handle nested attributes: (key, base_value, nested_attributes_map)
    let mut attr_stack: Vec<(String, AttributeValue, HashMap<String, AttributeValue>)> = Vec::new();

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
                        current_mode = XesMode::Global;
                        if let Ok(Some(scope)) = e.try_get_attribute("scope") {
                            current_global_scope = Some(scope.unescape_value().unwrap_or_default().to_string());
                        }
                    }
                    b"extension" => {
                        let mut ext = HashMap::new();
                        for attr in e.attributes().flatten() {
                            let k = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let v = attr.unescape_value().unwrap_or_default().to_string();
                            ext.insert(k, v);
                        }
                        log.extensions.push(ext);
                    }
                    b"classifier" => {
                        let name = e.try_get_attribute("name").ok().flatten()
                            .and_then(|a| a.unescape_value().ok())
                            .map(|v| v.to_string())
                            .unwrap_or_default();
                        let keys = e.try_get_attribute("keys").ok().flatten()
                            .and_then(|a| a.unescape_value().ok())
                            .map(|v| v.to_string())
                            .unwrap_or_default()
                            .split(' ')
                            .map(|s| s.to_string())
                            .collect();
                        log.classifiers.insert(name, keys);
                    }
                    _ => {
                        if let Some((key, val)) = parse_xes_attribute(&e) {
                            attr_stack.push((key, val, HashMap::new()));
                        }
                    }
                }
            }
            Ok(QEvent::Empty(e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"extension" => {
                        let mut ext = HashMap::new();
                        for attr in e.attributes().flatten() {
                            let k = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let v = attr.unescape_value().unwrap_or_default().to_string();
                            ext.insert(k, v);
                        }
                        log.extensions.push(ext);
                    }
                    b"classifier" => {
                        let name = e.try_get_attribute("name").ok().flatten()
                            .and_then(|a| a.unescape_value().ok())
                            .map(|v| v.to_string())
                            .unwrap_or_default();
                        let keys = e.try_get_attribute("keys").ok().flatten()
                            .and_then(|a| a.unescape_value().ok())
                            .map(|v| v.to_string())
                            .unwrap_or_default()
                            .split(' ')
                            .map(|s| s.to_string())
                            .collect();
                        log.classifiers.insert(name, keys);
                    }
                    b"log" | b"trace" | b"event" | b"global" => {
                        // These are usually not empty, but if they are, handle transitions
                        match name.as_ref() {
                            b"trace" => log.traces.push(Trace::new()),
                            b"event" => if let Some(ref mut tr) = current_trace { tr.events.push(Event::new()); },
                            _ => {}
                        }
                    }
                    _ => {
                        if let Some((key, val)) = parse_xes_attribute(&e) {
                            add_attribute_to_current(
                                &mut log,
                                &mut current_trace,
                                &mut current_event,
                                &mut current_global_scope,
                                &mut attr_stack,
                                &current_mode,
                                key,
                                val,
                            );
                        }
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
                    b"global" => {
                        current_mode = XesMode::Log;
                        current_global_scope = None;
                    }
                    _ => {
                        if let Some((key, val, nested)) = attr_stack.pop() {
                            let final_val = if !nested.is_empty() {
                                match val {
                                    AttributeValue::Container(_) => AttributeValue::Container(nested),
                                    AttributeValue::List(_) => {
                                        let mut vals: Vec<AttributeValue> = nested.into_values().collect();
                                        // Sort by key if possible? No, XES order is usually enough.
                                        AttributeValue::List(vals)
                                    }
                                    _ => AttributeValue::Nested(Box::new(val), nested),
                                }
                            } else {
                                val
                            };
                            add_attribute_to_current(
                                &mut log,
                                &mut current_trace,
                                &mut current_event,
                                &mut current_global_scope,
                                &mut attr_stack,
                                &current_mode,
                                key,
                                final_val,
                            );
                        }
                    }
                }
            }
            Ok(QEvent::Eof) => break,
            Err(e) => return Err(err(codes::PARSE_ERROR, format!("XES Parse Error at position {}: {:?}", reader.buffer_position(), e))),
            _ => {}
        }
        buf.clear();
    }

    Ok(log)
}

fn add_attribute_to_current(
    log: &mut EventLog,
    current_trace: &mut Option<Trace>,
    current_event: &mut Option<Event>,
    current_global_scope: &mut Option<String>,
    attr_stack: &mut Vec<(String, AttributeValue, HashMap<String, AttributeValue>)>,
    mode: &XesMode,
    key: String,
    val: AttributeValue,
) {
    if let Some((_, _, ref mut nested)) = attr_stack.last_mut() {
        nested.insert(key, val);
    } else {
        match mode {
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
            XesMode::Global => {
                if let Some(ref scope) = current_global_scope {
                    log.globals.entry(scope.clone()).or_insert_with(HashMap::new).insert(key, val);
                }
            }
            _ => {}
        }
    }
}

fn parse_xes_attribute(e: &quick_xml::events::BytesStart) -> Option<(String, AttributeValue)> {
    let key = e.try_get_attribute("key").ok()??.unescape_value().ok()?.to_string();
    let tag = e.name();
    
    let get_val = || {
        e.try_get_attribute("value").ok()??.unescape_value().ok()?.to_string()
    };

    let val = match tag.as_ref() {
        b"string" => AttributeValue::String(get_val()?),
        b"int" => AttributeValue::Int(get_val()?.parse().unwrap_or(0)),
        b"float" => AttributeValue::Float(get_val()?.parse().unwrap_or(0.0)),
        b"date" => AttributeValue::Date(get_val()?),
        b"boolean" => AttributeValue::Boolean(get_val()? == "true" || get_val()? == "1"),
        b"id" => AttributeValue::ID(get_val()?),
        b"list" => AttributeValue::List(Vec::new()),
        b"container" => AttributeValue::Container(HashMap::new()),
        _ => return None,
    };
    Some((key, val))
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
            let total_events = log.event_count();
            let mut xes = String::with_capacity(512 + total_events * 250);

            xes.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            xes.push_str("<log xes:version=\"1.0\" xmlns:xes=\"http://www.xes-standard.org/\">\n");

            // Extensions
            for ext in &log.extensions {
                xes.push_str("  <extension");
                for (k, v) in ext {
                    xes.push_str(&format!(" {}=\"{}\"", k, escape_xml(v)));
                }
                xes.push_str(" />\n");
            }

            // Globals
            for (scope, attrs) in &log.globals {
                xes.push_str(&format!("  <global scope=\"{}\">\n", scope));
                for (k, v) in attrs {
                    write_attribute(&mut xes, 2, k, v);
                }
                xes.push_str("  </global>\n");
            }

            // Classifiers
            for (name, keys) in &log.classifiers {
                xes.push_str(&format!("  <classifier name=\"{}\" keys=\"{}\" />\n", escape_xml(name), escape_xml(&keys.join(" "))));
            }

            // Log Attributes
            for (key, value) in &log.attributes {
                write_attribute(&mut xes, 1, key, value);
            }

            // Traces
            for trace in &log.traces {
                xes.push_str("  <trace>\n");
                for (key, value) in &trace.attributes {
                    write_attribute(&mut xes, 2, key, value);
                }
                for event in &trace.events {
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
        Some(_) => Err(err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(err(codes::INVALID_HANDLE, "EventLog not found")),
    }).map_err(|e| JsValue::from(e))
}

fn write_attribute(xes: &mut String, indent: usize, key: &str, value: &AttributeValue) {
    let spaces = "  ".repeat(indent);
    match value {
        AttributeValue::String(s) => {
            xes.push_str(&spaces);
            xes.push_str("<string key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            xes.push_str(&escape_xml(s));
            xes.push_str("\" />\n");
        }
        AttributeValue::Int(i) => {
            xes.push_str(&spaces);
            xes.push_str("<int key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            xes.push_str(&i.to_string());
            xes.push_str("\" />\n");
        }
        AttributeValue::Float(f) => {
            xes.push_str(&spaces);
            xes.push_str("<float key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            xes.push_str(&f.to_string());
            xes.push_str("\" />\n");
        }
        AttributeValue::Date(d) => {
            xes.push_str(&spaces);
            xes.push_str("<date key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            xes.push_str(&escape_xml(d));
            xes.push_str("\" />\n");
        }
        AttributeValue::Boolean(b) => {
            xes.push_str(&spaces);
            xes.push_str("<boolean key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            xes.push_str(if *b { "true" } else { "false" });
            xes.push_str("\" />\n");
        }
        AttributeValue::ID(id) => {
            xes.push_str(&spaces);
            xes.push_str("<id key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            xes.push_str(&escape_xml(id));
            xes.push_str("\" />\n");
        }
        AttributeValue::List(items) => {
            xes.push_str(&spaces);
            xes.push_str("<list key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\">\n");
            for item in items {
                write_attribute(xes, indent + 1, "item", item);
            }
            xes.push_str(&spaces);
            xes.push_str("</list>\n");
        }
        AttributeValue::Container(attrs) => {
            xes.push_str(&spaces);
            xes.push_str("<container key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\">\n");
            for (k, v) in attrs {
                write_attribute(xes, indent + 1, k, v);
            }
            xes.push_str(&spaces);
            xes.push_str("</container>\n");
        }
        AttributeValue::Nested(base, nested) => {
            let tag = match base.as_ref() {
                AttributeValue::String(_) => "string",
                AttributeValue::Int(_) => "int",
                AttributeValue::Float(_) => "float",
                AttributeValue::Date(_) => "date",
                AttributeValue::Boolean(_) => "boolean",
                AttributeValue::ID(_) => "id",
                _ => "container",
            };
            xes.push_str(&spaces);
            xes.push_str("<");
            xes.push_str(tag);
            xes.push_str(" key=\"");
            xes.push_str(&escape_xml(key));
            xes.push_str("\" value=\"");
            let val_str = match base.as_ref() {
                AttributeValue::String(s) => escape_xml(s),
                AttributeValue::Int(i) => i.to_string(),
                AttributeValue::Float(f) => f.to_string(),
                AttributeValue::Date(d) => escape_xml(d),
                AttributeValue::Boolean(b) => (if *b { "true" } else { "false" }).to_string(),
                AttributeValue::ID(id) => escape_xml(id),
                _ => String::new(),
            };
            xes.push_str(&val_str);
            xes.push_str("\">\n");
            for (k, v) in nested {
                write_attribute(xes, indent + 1, k, v);
            }
            xes.push_str(&spaces);
            xes.push_str("</");
            xes.push_str(tag);
            xes.push_str(">\n");
        }
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
        "note": "Fully supports XES structure with nested attributes, globals, extensions, and all standard value types"
    })
    .to_string()
}
