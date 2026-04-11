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
            let mut j = 0;
            while j < rest.len() {
                if rest[j] == b'"' {
                    // SAFETY: value_start and value_start+j are both within `src`
                    // and on valid UTF-8 boundaries (we only skip ASCII quote chars).
                    return Some(&src[value_start..value_start + j]);
                }
                j += 1;
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
    // Estimate trace count from file size to pre-allocate (heuristic: ~500 bytes per trace)
    let estimated_traces = (content.len() / 500).max(16);
    let mut log = EventLog::new();
    log.traces.reserve(estimated_traces);

    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Fast early exit for empty lines and XML prologue / closing tags
        if trimmed.is_empty() {
            continue;
        }

        // Dispatch on the second byte (first byte is always '<' for tags we care about).
        // Non-tag lines and comments fall through to the default arm and are skipped cheaply.
        let bytes = trimmed.as_bytes();
        if bytes.is_empty() || bytes[0] != b'<' {
            continue;
        }

        // Second byte disambiguates the tag family:
        //   b't' → <trace> / </trace>
        //   b'e' → <event> / </event>
        //   b's' → <string …/>
        //   b'd' → <date …/>
        //   b'i' → <int …/>
        //   b'/' → closing tag handled by sub-byte (third byte)
        //   b'l' → <log …>  (ignored)
        //   _   → skip
        let second = if bytes.len() > 1 { bytes[1] } else { 0 };

        match second {
            b't' => {
                // <trace> or </trace> — the </trace> case has second byte '/'
                // We reach here only for <trace…>
                if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
                    current_trace = Some(Trace {
                        attributes: HashMap::new(),
                        // Pre-allocate for a typical trace length to avoid reallocations
                        events: Vec::with_capacity(20),
                    });
                }
            }
            b'e' => {
                if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
                    current_event = Some(Event {
                        attributes: HashMap::new(),
                    });
                }
            }
            b's' => {
                // <string key="…" value="…"/>
                if trimmed.len() > 8 && &bytes[..8] == b"<string " && bytes[bytes.len() - 1] == b'>'
                {
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
            }
            b'd' => {
                // <date key="…" value="…"/>
                if trimmed.len() > 6 && &bytes[..6] == b"<date " {
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
            }
            b'i' => {
                // <int key="…" value="…"/>
                if trimmed.len() > 5 && &bytes[..5] == b"<int " {
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
            }
            b'/' => {
                // Closing tags: </trace> or </event>
                // Third byte tells us which
                let third = if bytes.len() > 2 { bytes[2] } else { 0 };
                match third {
                    b't' => {
                        // </trace>
                        if let Some(trace) = current_trace.take() {
                            log.traces.push(trace);
                        }
                    }
                    b'e' => {
                        // </event>
                        if let Some(event) = current_event.take() {
                            if let Some(ref mut trace) = current_trace {
                                trace.events.push(event);
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {
                // <log …>, comments, processing instructions — skip
            }
        }
    }

    // Store the log
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|_e| JsValue::from_str("Failed to store EventLog"))?;

    Ok(handle)
}

/// Parse XES format with parse cache — skips re-parsing if content hash matches.
///
/// Uses `crate::cache::hash_xes_content` to fingerprint the raw XES string and
/// `crate::cache::parse_cache_get` / `parse_cache_insert` to avoid redundant
/// XML parsing.  Falls back to the normal parse path on cache miss.
#[wasm_bindgen]
pub fn load_eventlog_from_xes_cached(content: &str) -> Result<String, JsValue> {
    let hash = crate::cache::hash_xes_content(content);

    if let Some(cached_handle) = crate::cache::parse_cache_get(&hash) {
        // Verify the handle still exists in state (it may have been evicted).
        let exists = get_or_init_state().with_object(&cached_handle, |obj| Ok(obj.is_some()))?;
        if exists {
            return Ok(cached_handle);
        }
        // Handle was evicted — fall through to re-parse and re-insert.
    }

    // Cache miss (or evicted) — delegate to the normal parse path.
    let handle = load_eventlog_from_xes(content)?;
    crate::cache::parse_cache_insert(hash, handle.clone());
    Ok(handle)
}

/// Export EventLog to XES format (generates valid XES XML)
#[wasm_bindgen]
pub fn export_eventlog_to_xes(eventlog_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Pre-allocate output buffer. Rough estimate: 200 bytes per event average.
            let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
            let mut xes = String::with_capacity(512 + total_events * 200);

            xes.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
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
    })
}

fn write_attribute(xes: &mut String, indent: usize, key: &str, value: &AttributeValue) {
    // Use pre-computed indent strings; fall back to runtime repeat only for unusual depths.
    let spaces: &str = match indent {
        2 => INDENT_2,
        3 => INDENT_3,
        _ => {
            // Rare path — avoid polluting the common case with a branch on a heap String.
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
            // Avoid format! allocation for integers
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
        _ => {} // Skip complex types for basic XES
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
