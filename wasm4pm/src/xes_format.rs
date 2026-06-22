use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use std::collections::{BTreeMap, HashMap};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Conversion from wasm4pm_compat::event_log::EventLog (parser output) → models::EventLog
// ---------------------------------------------------------------------------
//
// The wasm4pm-compat crate carries a port of the `process_mining` crate's
// real XES parser (handles <global>, non-self-closing typed tags, etc.).
// Its data model uses `Vec<Attribute>` keyed by name; our in-crate model
// uses `HashMap<String, AttributeValue>`. The conversions below flatten
// one into the other.

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
                if let Some(pos) = crate::bcinr_compat::scan::find_byte(rest, b'"') {
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
    // SECURITY: Reject inputs larger than 512 MB to prevent WASM heap exhaustion.
    // See io.rs MAX_INPUT_BYTES for rationale.
    const MAX_XES_BYTES: usize = 512 * 1024 * 1024;
    if content.len() > MAX_XES_BYTES {
        return Err(crate::error::js_val(&format!(
            "XES input too large: {} bytes (max {} bytes / 512 MB)",
            content.len(),
            MAX_XES_BYTES
        )));
    }
    #[cfg(feature = "import")]
    {
        use wasm4pm_compat::import::xes::{import_xes, XESImportOptions};
        let reader = std::io::BufReader::new(std::io::Cursor::new(content.as_bytes().to_vec()));
        match import_xes(reader, XESImportOptions::default()) {
            Ok(types_log) => {
                let log: EventLog = types_log.into();
                let handle = get_or_init_state()
                    .store_object(StoredObject::EventLog(log))
                    .map_err(|_e| crate::error::js_val("Failed to store EventLog"))?;
                Ok(handle)
            }
            Err(e) => Err(crate::error::js_val(&format!("XES Parse Error: {:?}", e))),
        }
    }

    #[cfg(not(feature = "import"))]
    {
        // Strict XML validation: parse and validate tag structure
        match validate_and_parse_xes(content) {
            Ok(log) => {
                let handle = get_or_init_state()
                    .store_object(StoredObject::EventLog(log))
                    .map_err(|_e| crate::error::js_val("Failed to store EventLog"))?;
                Ok(handle)
            }
            Err(e) => Err(crate::error::js_val(&e)),
        }
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
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
        let mut xes = String::with_capacity(512 + total_events * 200);

        xes.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xes.push_str("<log xes:version=\"1.0\" xmlns:xes=\"http://www.xes-standard.org/\">\n");

        for trace in log.traces.iter() {
            xes.push_str("  <trace>\n");
            let mut trace_attrs: Vec<_> = trace.attributes.iter().collect();
            trace_attrs.sort_by_key(|(k, _)| k.as_str());
            for (key, value) in trace_attrs {
                write_attribute(&mut xes, 2, key, value);
            }
            for event in trace.events.iter() {
                xes.push_str("    <event>\n");
                let mut event_attrs: Vec<_> = event.attributes.iter().collect();
                event_attrs.sort_by_key(|(k, _)| k.as_str());
                for (key, value) in event_attrs {
                    write_attribute(&mut xes, 3, key, value);
                }
                xes.push_str("    </event>\n");
            }
            xes.push_str("  </trace>\n");
        }
        xes.push_str("</log>");
        Ok(xes)
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

// ---------------------------------------------------------------------------
// Strict XES validation and parsing
// ---------------------------------------------------------------------------

/// XML tag stack entry for strict validation
#[derive(Debug, Clone)]
struct TagStackEntry {
    tag_name: String,
    line_number: usize,
}

/// Parse and strictly validate XES content
/// Returns detailed error messages with line numbers on validation failure
pub fn validate_and_parse_xes(content: &str) -> Result<EventLog, String> {
    // Estimate trace count from file size to pre-allocate (heuristic: ~500 bytes per trace)
    let estimated_traces = (content.len() / 500).max(16);
    let mut log = EventLog::new();
    log.traces.reserve(estimated_traces);

    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;
    let mut tag_stack: Vec<TagStackEntry> = Vec::new();
    let mut line_number = 1;

    // Walk every `<...>` tag in the document, in order.
    let bytes = content.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        // Track line numbers for better error messages
        if i > 0 && bytes[i - 1] == b'\n' {
            line_number += 1;
        }

        if bytes[i] != b'<' {
            i += 1;
            continue;
        }

        let mut j = i + 1;
        while j < bytes.len() && bytes[j] != b'>' {
            j += 1;
        }

        if j >= bytes.len() {
            // Unclosed tag at end of document
            return Err(format!(
                "Line {}: Unclosed tag starting at position {}. Expected '>'",
                line_number, i
            ));
        }

        let tag = &content[i..=j];
        let tag_bytes = tag.as_bytes();
        i = j + 1;

        if tag_bytes.len() < 2 {
            continue;
        }

        let second = tag_bytes[1];

        // Check for self-closing tags (e.g., <string .../>, <date .../>)
        let is_self_closing = tag_bytes.len() > 2 && tag_bytes[tag_bytes.len() - 2] == b'/';

        match second {
            b'?' | b'!' => {
                // XML declaration or comment — skip
                continue;
            }
            b't' if (tag.starts_with("<trace>") || tag.starts_with("<trace ")) => {
                if is_self_closing {
                    return Err(format!(
                        "Line {}: Invalid self-closing <trace .../> tag. Must use <trace>...</trace>",
                        line_number
                    ));
                }
                current_trace = Some(Trace {
                    attributes: BTreeMap::new(),
                    events: Vec::with_capacity(20),
                });
                tag_stack.push(TagStackEntry {
                    tag_name: "trace".to_string(),
                    line_number,
                });
            }
            b'e' if (tag.starts_with("<event>") || tag.starts_with("<event ")) => {
                if is_self_closing {
                    return Err(format!(
                        "Line {}: Invalid self-closing <event .../> tag. Must use <event>...</event>",
                        line_number
                    ));
                }
                current_event = Some(Event {
                    attributes: BTreeMap::new(),
                });
                tag_stack.push(TagStackEntry {
                    tag_name: "event".to_string(),
                    line_number,
                });
            }
            b's' if tag_bytes.len() > 8 && &tag_bytes[..8] == b"<string " => {
                let is_self_closing = tag.ends_with("/>");
                if let (Some(key), Some(value)) =
                    (extract_attr(tag, b"key"), extract_attr(tag, b"value"))
                {
                    if !is_self_closing {
                        return Err(format!(
                            "Line {}: <string> tag must be self-closing (/>). Found: {}",
                            line_number, tag
                        ));
                    }
                    insert_attr(
                        &mut current_event,
                        &mut current_trace,
                        key.to_string(),
                        AttributeValue::String(value.to_string()),
                    );
                } else {
                    return Err(format!(
                        "Line {}: <string> tag missing required 'key' or 'value' attribute. Found: {}",
                        line_number, tag
                    ));
                }
            }
            b'd' if tag_bytes.len() > 6 && &tag_bytes[..6] == b"<date " => {
                let is_self_closing = tag.ends_with("/>");
                if let (Some(key), Some(value)) =
                    (extract_attr(tag, b"key"), extract_attr(tag, b"value"))
                {
                    if !is_self_closing {
                        return Err(format!(
                            "Line {}: <date> tag must be self-closing (/>). Found: {}",
                            line_number, tag
                        ));
                    }
                    insert_attr(
                        &mut current_event,
                        &mut current_trace,
                        key.to_string(),
                        AttributeValue::Date(value.to_string()),
                    );
                } else {
                    return Err(format!(
                        "Line {}: <date> tag missing required 'key' or 'value' attribute. Found: {}",
                        line_number, tag
                    ));
                }
            }
            b'i' if tag_bytes.len() > 5 && &tag_bytes[..5] == b"<int " => {
                if let (Some(key), Some(value_str)) =
                    (extract_attr(tag, b"key"), extract_attr(tag, b"value"))
                {
                    if let Ok(value) = value_str.parse::<i64>() {
                        insert_attr(
                            &mut current_event,
                            &mut current_trace,
                            key.to_string(),
                            AttributeValue::Int(value),
                        );
                    } else {
                        return Err(format!(
                            "Line {}: <int> tag has invalid value '{}' (not a valid i64)",
                            line_number, value_str
                        ));
                    }
                } else {
                    return Err(format!(
                        "Line {}: <int> tag missing required 'key' or 'value' attribute",
                        line_number
                    ));
                }
            }
            b'f' if tag_bytes.len() > 7 && &tag_bytes[..7] == b"<float " => {
                if let (Some(key), Some(value_str)) =
                    (extract_attr(tag, b"key"), extract_attr(tag, b"value"))
                {
                    if let Ok(value) = value_str.parse::<f64>() {
                        insert_attr(
                            &mut current_event,
                            &mut current_trace,
                            key.to_string(),
                            AttributeValue::Float(value),
                        );
                    } else {
                        return Err(format!(
                            "Line {}: <float> tag has invalid value '{}' (not a valid f64)",
                            line_number, value_str
                        ));
                    }
                } else {
                    return Err(format!(
                        "Line {}: <float> tag missing required 'key' or 'value' attribute",
                        line_number
                    ));
                }
            }
            b'b' if tag_bytes.len() > 9 && &tag_bytes[..9] == b"<boolean " => {
                if let (Some(key), Some(value_str)) =
                    (extract_attr(tag, b"key"), extract_attr(tag, b"value"))
                {
                    let value = value_str == "true";
                    insert_attr(
                        &mut current_event,
                        &mut current_trace,
                        key.to_string(),
                        AttributeValue::Boolean(value),
                    );
                } else {
                    return Err(format!(
                        "Line {}: <boolean> tag missing required 'key' or 'value' attribute",
                        line_number
                    ));
                }
            }
            b'l' if tag.starts_with("<log") => {
                // <log> opening tag
                tag_stack.push(TagStackEntry {
                    tag_name: "log".to_string(),
                    line_number,
                });
            }
            b'/' if tag_bytes.len() > 2 => {
                // Closing tag — validate it matches the most recent opening tag
                let tag_name = extract_closing_tag_name(tag);

                if !matches!(tag_name.as_str(), "trace" | "event" | "log") {
                    continue; // Ignore closing tags for tags we don't track
                }

                if let Some(expected) = tag_stack.pop() {
                    if expected.tag_name != tag_name {
                        return Err(format!(
                            "Line {}: Mismatched closing tag </{}>. Expected </{}>. Opening tag was at line {}",
                            line_number, tag_name, expected.tag_name, expected.line_number
                        ));
                    }

                    // Handle closing tags
                    match tag_name.as_str() {
                        "trace" => {
                            if let Some(trace) = current_trace.take() {
                                log.traces.push(trace);
                            }
                        }
                        "event" => {
                            if let Some(event) = current_event.take() {
                                if let Some(ref mut trace) = current_trace {
                                    trace.events.push(event);
                                }
                            }
                        }
                        "log" => {
                            // End of log element
                        }
                        _ => {
                            // Ignore unknown closing tags
                        }
                    }
                } else {
                    return Err(format!(
                        "Line {}: Unexpected closing tag </{}>. No matching opening tag",
                        line_number, tag_name
                    ));
                }
            }
            _ => {
                // Unknown tag — could be valid but unsupported
            }
        }
    }

    // Check for unclosed tags at end of document
    if !tag_stack.is_empty() {
        let unclosed = &tag_stack[tag_stack.len() - 1];
        return Err(format!(
            "Line {}: Unclosed <{}> tag. Expected </{}>. Opening tag was at line {}",
            line_number, unclosed.tag_name, unclosed.tag_name, unclosed.line_number
        ));
    }

    Ok(log)
}

/// Extract tag name from a closing tag (e.g., "</trace>" -> "trace")
#[inline]
fn extract_closing_tag_name(tag: &str) -> String {
    let tag_bytes = tag.as_bytes();
    if tag_bytes.len() < 3 {
        return String::new();
    }

    let mut end = tag_bytes.len() - 1; // Position of '>'
    while end > 0 && (tag_bytes[end - 1] == b' ' || tag_bytes[end - 1] == b'\t') {
        end -= 1;
    }

    let name_start = 2; // Skip "</"
    if end > name_start {
        if let Ok(name) = std::str::from_utf8(&tag_bytes[name_start..end]) {
            return name.to_string();
        }
    }
    String::new()
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
        "note": "Supports basic XES structure with string, int, float, date, boolean attributes. Strict validation: all tags must be properly closed, attribute tags must be self-closing."
    })
    .to_string()
}

// ============================================================================
// GZ DECOMPRESSION ENTRY POINT
// ============================================================================

/// Accept raw bytes, auto-detect gzip (magic bytes 0x1f 0x8b), decompress if
/// needed, then delegate to the string-based `load_eventlog_from_xes` parser.
///
/// This allows callers to pass either a plain `.xes` file or a `.xes.gz` file
/// without knowing ahead of time which format it is.
#[wasm_bindgen]
pub fn load_eventlog_from_xes_gz(bytes: &[u8]) -> Result<String, JsValue> {
    use std::io::Read;
    let content = if bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
        let mut decoder = flate2::read::GzDecoder::new(bytes);
        let mut s = String::new();
        decoder
            .read_to_string(&mut s)
            .map_err(|e| crate::error::js_val(&format!("gz decompress failed: {}", e)))?;
        s
    } else {
        // Plain UTF-8 XES — no decompression needed
        String::from_utf8_lossy(bytes).into_owned()
    };
    load_eventlog_from_xes(&content)
}

// ============================================================================
// INLINE UNIT TESTS: XES Strict Validation
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_xes_parses_successfully() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T09:00:00Z"/>
    </event>
  </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(
            result.is_ok(),
            "Valid XES should parse without error. Got: {:?}",
            result
        );

        let log = result.unwrap();
        assert_eq!(log.traces.len(), 1, "Expected 1 trace");
        assert_eq!(log.traces[0].events.len(), 1, "Expected 1 event");
    }

    #[test]
    fn test_unclosed_trace_tag_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
    </event>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "Unclosed <trace> should be rejected");

        let err = result.unwrap_err();
        assert!(
            err.contains("Unclosed") || err.contains("trace"),
            "Error should mention unclosed trace. Got: {}",
            err
        );
        assert!(
            err.contains("Line"),
            "Error should include line number. Got: {}",
            err
        );
    }

    #[test]
    fn test_unclosed_event_tag_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
    </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "Unclosed <event> should be rejected");

        let err = result.unwrap_err();
        assert!(
            err.contains("Mismatched") || err.contains("event"),
            "Error should mention event/trace mismatch. Got: {}",
            err
        );
    }

    #[test]
    fn test_mismatched_tags_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
    </trace>
  </event>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "Mismatched tags should be rejected");

        let err = result.unwrap_err();
        assert!(
            err.contains("Mismatched"),
            "Error should mention mismatched tags. Got: {}",
            err
        );
    }

    #[test]
    fn test_string_tag_not_self_closing_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1">
    <event>
      <string key="concept:name" value="A"/>
    </event>
    </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(
            result.is_err(),
            "Non-self-closing <string> should be rejected"
        );

        let err = result.unwrap_err();
        assert!(
            err.contains("self-closing"),
            "Error should mention self-closing requirement. Got: {}",
            err
        );
    }

    #[test]
    fn test_unexpected_closing_tag_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    </event>
  </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(
            result.is_err(),
            "Unexpected closing </event> should be rejected"
        );

        let err = result.unwrap_err();
        assert!(
            err.contains("Mismatched") || err.contains("Unexpected") || err.contains("matching"),
            "Error should indicate mismatched/unexpected tag. Got: {}",
            err
        );
    }

    #[test]
    fn test_error_includes_line_number() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
"#;

        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "Unclosed tag should be rejected");

        let err = result.unwrap_err();
        assert!(
            err.contains("Line"),
            "Error message must include line number. Got: {}",
            err
        );
    }

    #[test]
    fn test_invalid_int_value_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <int key="priority" value="not_an_integer"/>
    </event>
    </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "Invalid int value should be rejected");

        let err = result.unwrap_err();
        assert!(
            err.contains("int") && err.contains("invalid"),
            "Error should indicate invalid int value. Got: {}",
            err
        );
    }

    #[test]
    fn test_invalid_float_value_rejected() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <float key="duration" value="not_a_number"/>
    </event>
    </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "Invalid float value should be rejected");

        let err = result.unwrap_err();
        assert!(
            err.contains("float") && err.contains("invalid"),
            "Error should indicate invalid float value. Got: {}",
            err
        );
    }

    #[test]
    fn test_multiple_traces_parses() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event>
      <string key="concept:name" value="B"/>
    </event>
  </trace>
</log>"#;

        let result = validate_and_parse_xes(content);
        assert!(
            result.is_ok(),
            "Valid XES with multiple traces should parse"
        );

        let log = result.unwrap();
        assert_eq!(log.traces.len(), 2, "Expected 2 traces");
    }
}
