use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Fast attribute extraction helpers
// ---------------------------------------------------------------------------

/// Extract the value of a `name="..."` attribute from an XES tag byte slice.
///
/// Returns `Some(&str)` pointing into `src` without any allocation.
/// Scans from the position of `name` forward using byte-level ops.
#[inline(always)]
fn extract_attr<'a>(src: &'a str, name: &[u8]) -> Option<&'a str> {
    let bytes = src.as_bytes();
    let name_len = name.len();
    // We need room for  name + `="` + at least `"`
    if bytes.len() < name_len + 3 {
        return None;
    }
    // Linear scan for the attribute name followed by `="`
    let limit = bytes.len() - name_len - 2;
    let mut i = 0;
    while i <= limit {
        if bytes[i..i + name_len] == *name
            && bytes[i + name_len] == b'='
            && bytes[i + name_len + 1] == b'"'
        {
            let value_start = i + name_len + 2;
            // Scan forward for closing quote
            let rest = &bytes[value_start..];

            #[cfg(feature = "bcinr")]
            {
                // Use branchless byte scanning via bcinr
                if let Some(pos) = bcinr::scan::find_byte(rest, b'"') {
                    return Some(&src[value_start..value_start + pos]);
                }
            }

            #[cfg(not(feature = "bcinr"))]
            {
                // Scalar fallback
                for (j, &byte) in rest.iter().enumerate() {
                    if byte == b'"' {
                        return Some(&src[value_start..value_start + j]);
                    }
                }
            }

            return None;
        }
        i += 1;
    }
    None
}

// Pre-computed indent strings to avoid per-call allocation in write_attribute.
const INDENT_2: &str = "    "; // 4 spaces  (indent level 2 → 2*2)
const INDENT_3: &str = "      "; // 6 spaces  (indent level 3 → 3*2)

// ---------------------------------------------------------------------------
// Attribute insertion helper — avoids code duplication across tag types
// ---------------------------------------------------------------------------

#[inline(always)]
fn insert_attr(
    current_event: &mut Option<Event>,
    current_trace: &mut Option<Trace>,
    key: String,
    value: AttributeValue,
) {
    if let Some(ref mut event) = current_event {
        event.attributes.insert(key, value);
    } else if let Some(ref mut trace) = current_trace {
        trace.attributes.insert(key, value);
    }
}

// ---------------------------------------------------------------------------
// Public parse entry point
// ---------------------------------------------------------------------------

/// Parse basic XES format - simplified XML parser
/// XES is the standard eXtensible Event Stream format for process logs
#[wasm_bindgen]
pub fn load_eventlog_from_xes(content: &str) -> Result<String, JsValue> {
    {
        // Estimate trace count from file size to pre-allocate (heuristic: ~500 bytes per trace)
        let estimated_traces = (content.len() / 500).max(16);
        let mut log = EventLog::new();
        log.traces.reserve(estimated_traces);

        let mut current_trace: Option<Trace> = None;
        let mut current_event: Option<Event> = None;

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.is_empty() {
                continue;
            }

            let bytes = trimmed.as_bytes();
            if bytes.is_empty() || bytes[0] != b'<' {
                continue;
            }

            let second = if bytes.len() > 1 { bytes[1] } else { 0 };

            match second {
                b't' if (trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ")) => {
                    current_trace = Some(Trace {
                        attributes: HashMap::new(),
                        events: Vec::with_capacity(20),
                    });
                }
                b'e' if (trimmed.starts_with("<event>") || trimmed.starts_with("<event ")) => {
                    current_event = Some(Event {
                        attributes: HashMap::new(),
                    });
                }
                b's' if trimmed.len() > 8 && &bytes[..8] == b"<string " && bytes[bytes.len() - 1] == b'>' => {
                    if let (Some(key), Some(value)) = (
                        extract_attr(trimmed, b"key"),
                        extract_attr(trimmed, b"value"),
                    ) {
                        insert_attr(
                            &mut current_event,
                            &mut current_trace,
                            key.to_string(),
                            AttributeValue::String(value.to_string()),
                        );
                    }
                }
                b'd' if trimmed.len() > 6 && &bytes[..6] == b"<date " => {
                    if let (Some(key), Some(value)) = (
                        extract_attr(trimmed, b"key"),
                        extract_attr(trimmed, b"value"),
                    ) {
                        insert_attr(
                            &mut current_event,
                            &mut current_trace,
                            key.to_string(),
                            AttributeValue::Date(value.to_string()),
                        );
                    }
                }
                b'i' if trimmed.len() > 5 && &bytes[..5] == b"<int " => {
                    if let (Some(key), Some(value_str)) = (
                        extract_attr(trimmed, b"key"),
                        extract_attr(trimmed, b"value"),
                    ) {
                        if let Ok(value) = value_str.parse::<i64>() {
                            insert_attr(
                                &mut current_event,
                                &mut current_trace,
                                key.to_string(),
                                AttributeValue::Int(value),
                            );
                        }
                    }
                }
                b'/' => {
                    let third = if bytes.len() > 2 { bytes[2] } else { 0 };
                    match third {
                        b't' => {
                            if let Some(trace) = current_trace.take() {
                                log.traces.push(trace);
                            }
                        }
                        b'e' => {
                            if let Some(event) = current_event.take() {
                                if let Some(ref mut trace) = current_trace {
                                    trace.events.push(event);
                                }
                            }
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        }

        let handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .map_err(|_e| crate::error::js_val("Failed to store EventLog"))?;

        Ok(handle)
    }
}

/// Parse XES format with parse cache — skips re-parsing if content hash matches.
#[wasm_bindgen]
pub fn load_eventlog_from_xes_cached(content: &str) -> Result<String, JsValue> {
    let hash = crate::cache::hash_xes_content(content);

    if let Some(cached_handle) = crate::cache::parse_cache_get(&hash) {
        let exists = get_or_init_state().with_object(&cached_handle, |obj| Ok(obj.is_some()))?;
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
pub fn export_eventlog_to_xes(eventlog_handle: &str) -> Result<String, JsValue> {
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
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
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
