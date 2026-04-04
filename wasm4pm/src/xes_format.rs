use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use std::collections::HashMap;

/// Parse basic XES format - simplified XML parser
/// XES is the standard eXtensible Event Stream format for process logs
#[wasm_bindgen]
pub fn load_eventlog_from_xes(content: &str) -> Result<String, JsValue> {
    // Very simple XES parser - handles basic structure
    // Real implementation would use quick-xml properly

    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Parse log attributes
        if trimmed.starts_with("<log") && trimmed.contains("xes:extensions") {
            // Log element
            continue;
        }

        // Parse trace
        if trimmed.starts_with("<trace>") {
            current_trace = Some(Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            });
        }

        if trimmed.starts_with("</trace>") {
            if let Some(trace) = current_trace.take() {
                log.traces.push(trace);
            }
        }

        // Parse event
        if trimmed.starts_with("<event>") {
            current_event = Some(Event {
                attributes: HashMap::new(),
            });
        }

        if trimmed.starts_with("</event>") {
            if let Some(event) = current_event.take() {
                if let Some(ref mut trace) = current_trace {
                    trace.events.push(event);
                }
            }
        }

        // Parse string attributes
        if trimmed.starts_with("<string key=\"") && trimmed.ends_with("/>") {
            if let (Some(key_start), Some(key_end)) = (trimmed.find("key=\""), trimmed.find("\"")) {
                if let (Some(val_start), Some(val_end)) =
                    (trimmed.find("value=\""), trimmed.rfind("\""))
                {
                    let key = trimmed[key_start + 5..key_end].to_string();
                    let value = trimmed[val_start + 7..val_end].to_string();

                    if let Some(ref mut event) = current_event {
                        event
                            .attributes
                            .insert(key, AttributeValue::String(value));
                    } else if let Some(ref mut trace) = current_trace {
                        trace
                            .attributes
                            .insert(key, AttributeValue::String(value));
                    }
                }
            }
        }

        // Parse date attributes
        if trimmed.starts_with("<date key=\"") && trimmed.ends_with("/>") {
            if let (Some(key_start), Some(key_end)) = (trimmed.find("key=\""), trimmed.find("\"")) {
                if let (Some(val_start), Some(val_end)) =
                    (trimmed.find("value=\""), trimmed.rfind("\""))
                {
                    let key = trimmed[key_start + 5..key_end].to_string();
                    let value = trimmed[val_start + 7..val_end].to_string();

                    if let Some(ref mut event) = current_event {
                        event.attributes.insert(key, AttributeValue::Date(value));
                    } else if let Some(ref mut trace) = current_trace {
                        trace.attributes.insert(key, AttributeValue::Date(value));
                    }
                }
            }
        }

        // Parse int attributes
        if trimmed.starts_with("<int key=\"") && trimmed.ends_with("/>") {
            if let (Some(key_start), Some(key_end)) = (trimmed.find("key=\""), trimmed.find("\"")) {
                if let (Some(val_start), Some(val_end)) =
                    (trimmed.find("value=\""), trimmed.rfind("\""))
                {
                    let key = trimmed[key_start + 5..key_end].to_string();
                    let value_str = &trimmed[val_start + 7..val_end];
                    if let Ok(value) = value_str.parse::<i64>() {
                        if let Some(ref mut event) = current_event {
                            event.attributes.insert(key, AttributeValue::Int(value));
                        } else if let Some(ref mut trace) = current_trace {
                            trace.attributes.insert(key, AttributeValue::Int(value));
                        }
                    }
                }
            }
        }
    }

    // Store the log
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|_e| JsValue::from_str("Failed to store EventLog"))?;

    Ok(handle)
}

/// Export EventLog to XES format (generates valid XES XML)
#[wasm_bindgen]
pub fn export_eventlog_to_xes(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut xes = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            xes.push_str("<log xes:version=\"1.0\" xmlns:xes=\"http://www.xes-standard.org/\">\n");

            // Write traces
            for trace in log.traces.iter() {
                xes.push_str("  <trace>\n");

                // Write trace attributes
                for (key, value) in &trace.attributes {
                    write_attribute(&mut xes, 2, key, value);
                }

                // Write events
                for event in trace.events.iter() {
                    xes.push_str("    <event>\n");

                    // Write event attributes
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
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

fn write_attribute(xes: &mut String, indent: usize, key: &str, value: &AttributeValue) {
    let spaces = " ".repeat(indent * 2);
    match value {
        AttributeValue::String(s) => {
            xes.push_str(&format!(
                "{}<string key=\"{}\" value=\"{}\" />\n",
                spaces, key, escape_xml(s)
            ));
        }
        AttributeValue::Int(i) => {
            xes.push_str(&format!("{}<int key=\"{}\" value=\"{}\" />\n", spaces, key, i));
        }
        AttributeValue::Float(f) => {
            xes.push_str(&format!("{}<float key=\"{}\" value=\"{}\" />\n", spaces, key, f));
        }
        AttributeValue::Date(d) => {
            xes.push_str(&format!(
                "{}<date key=\"{}\" value=\"{}\" />\n",
                spaces, key, escape_xml(d)
            ));
        }
        AttributeValue::Boolean(b) => {
            xes.push_str(&format!("{}<boolean key=\"{}\" value=\"{}\" />\n", spaces, key, b));
        }
        _ => {} // Skip complex types for basic XES
    }
}

fn escape_xml(s: &str) -> String {
    s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
}

#[wasm_bindgen]
pub fn xes_format_info() -> String {
    serde_json::json!({
        "status": "xes_format_supported",
        "format": "XES 1.0",
        "description": "eXtensible Event Stream - industry standard for process logs",
        "functions": [
            "load_eventlog_from_xes",
            "export_eventlog_to_xes"
        ],
        "note": "Supports basic XES structure with string, int, float, date, boolean attributes"
    })
    .to_string()
}
