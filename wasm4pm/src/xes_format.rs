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

// SECURITY: Maximum byte length for raw XES input (plain or decompressed).
// Mirrors io.rs MAX_INPUT_BYTES. The gz path enforces this on the
// DECOMPRESSED stream via `Read::take(cap + 1)` so a gzip bomb fails with a
// typed error instead of exhausting the WASM heap.
const MAX_XES_BYTES: usize = 512 * 1024 * 1024; // 512 MB

// ---------------------------------------------------------------------------
// Public parse entry point
// ---------------------------------------------------------------------------

/// Parse basic XES format - simplified XML parser
/// XES is the standard eXtensible Event Stream format for process logs
#[wasm_bindgen]
pub fn load_eventlog_from_xes(content: &str) -> Result<String, JsValue> {
    // SECURITY: Reject inputs larger than 512 MB to prevent WASM heap exhaustion.
    // See io.rs MAX_INPUT_BYTES for rationale.
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
        // Borrowed cursor — zero-copy; no full-buffer duplicate.
        let reader = std::io::BufReader::new(std::io::Cursor::new(content.as_bytes()));
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
/// Strip one optional namespace prefix from an XML tag name
/// (`"xes:trace"` → `"trace"`, `"trace"` → `"trace"`). Namespace-prefixed XES
/// is valid per the XES standard, so the fallback parser matches on local names.
#[inline]
fn strip_ns(tag: &str) -> &str {
    match tag.find(':') {
        Some(pos) if pos > 0 && pos < tag.len() - 1 => &tag[pos + 1..],
        _ => tag,
    }
}

/// Parse an XES `<boolean value="...">` literal.
///
/// Accepts `true`/`1`/`false`/`0` case-insensitively; anything else is an
/// error (never a silent `false`).
#[inline]
fn parse_xes_bool(value_str: &str) -> Result<bool, String> {
    match value_str.to_ascii_lowercase().as_str() {
        "true" | "1" => Ok(true),
        "false" | "0" => Ok(false),
        other => Err(format!(
            "<boolean> has invalid value '{}' (expected true/false/1/0)",
            other
        )),
    }
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

        // Local tag name (optional `prefix:` stripped), e.g. "trace" for both
        // `<trace>` and `<xes:trace>`. Namespace-prefixed XES is valid per the
        // XES standard, so all matching below is on local names.
        let local: &str = if second == b'/' {
            "" // closing tag — handled by extract_closing_tag_name
        } else {
            let name = &tag[1..];
            let end = name
                .find(|c: char| c == ' ' || c == '>' || c == '/')
                .unwrap_or(name.len());
            strip_ns(&name[..end])
        };

        // Check for self-closing tags (e.g., <string .../>, <date .../>)
        let is_self_closing = tag_bytes.len() > 2 && tag_bytes[tag_bytes.len() - 2] == b'/';

        // Dispatch on the first byte of the LOCAL tag name so namespace-
        // prefixed tags (`<xes:trace>`) hit the same arms as plain ones.
        let match_key: u8 = if second == b'/' {
            b'/'
        } else {
            *local.as_bytes().first().unwrap_or(&second)
        };

        match match_key {
            b'?' | b'!' => {
                // XML declaration or comment — skip
                continue;
            }
            b't' if local == "trace" => {
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
            b'e' if local == "event" => {
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
            b's' if local == "string" => {
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
            b'd' if local == "date" => {
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
            b'i' if local == "int" => {
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
            b'f' if local == "float" => {
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
            b'b' if local == "boolean" => {
                if let (Some(key), Some(value_str)) =
                    (extract_attr(tag, b"key"), extract_attr(tag, b"value"))
                {
                    let value = parse_xes_bool(value_str).map_err(|e| {
                        format!("Line {}: {} (found: {})", line_number, e, tag)
                    })?;
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
            b'l' if local == "log" => {
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

    if log.traces.is_empty() {
        return Err(
            "XES parsed 0 traces; input is not a usable event log (metadata-only or empty <log>)"
                .to_string(),
        );
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
            // Local name only — `</xes:trace>` closes `<trace>`/`<xes:trace>`
            return strip_ns(name).to_string();
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
    decompress_gz_bounded(bytes, MAX_XES_BYTES)
        .map_err(|e| crate::error::js_val(&e))
}

/// Shared bounded-decompression core. `take(cap + 1)` bounds BOTH time and
/// peak memory, so a gzip bomb fails with a typed error instead of exhausting
/// the WASM heap. cap+1 distinguishes "exceeds cap" from "exactly at cap".
fn decompress_gz_bounded(bytes: &[u8], cap: usize) -> Result<String, String> {
    use std::io::Read;
    if bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
        let mut decoder = flate2::read::GzDecoder::new(bytes).take(cap as u64 + 1);
        let mut s = String::with_capacity(1024 * 1024);
        decoder
            .read_to_string(&mut s)
            .map_err(|e| format!("gz decompress failed: {}", e))?;
        if s.len() > cap {
            return Err(format!(
                "XES input too large (decompressed): {}+ bytes (max {} bytes / 512 MB)",
                s.len(),
                cap
            ));
        }
        Ok(s)
    } else {
        // Plain UTF-8 XES — no decompression needed
        Ok(String::from_utf8_lossy(bytes).into_owned())
    }
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

    // ---- Namespace prefixes ----

    #[test]
    fn test_namespace_prefixed_xes_parses() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<xes:log xmlns:xes="http://www.xes-standard.org/">
  <xes:trace>
    <xes:string key="concept:name" value="case1"/>
    <xes:event>
      <xes:string key="concept:name" value="A"/>
      <xes:int key="cost" value="5"/>
      <xes:boolean key="ok" value="true"/>
    </xes:event>
  </xes:trace>
</xes:log>"#;

        let log = validate_and_parse_xes(content).expect("prefixed XES should parse");
        assert_eq!(log.traces.len(), 1);
        assert_eq!(log.traces[0].events.len(), 1);
    }

    #[test]
    fn test_mixed_default_and_prefixed_tags_parse() {
        let content = r#"<log xmlns:xes="http://www.xes-standard.org/">
  <xes:trace>
    <string key="concept:name" value="case1"/>
    <xes:event>
      <xes:string key="concept:name" value="A"/>
    </xes:event>
  </xes:trace>
</log>"#;

        let log = validate_and_parse_xes(content).expect("mixed ns XES should parse");
        assert_eq!(log.traces.len(), 1);
        assert_eq!(log.traces[0].events.len(), 1);
    }

    #[test]
    fn test_prefixed_closing_tag_matches() {
        let content = r#"<xes:log>
  <xes:trace>
    <xes:event>
      <xes:string key="k" value="v"/>
    </xes:event>
  </xes:trace>
</xes:log>"#;

        let log = validate_and_parse_xes(content).expect("prefixed closers should match");
        assert_eq!(log.traces.len(), 1);
    }

    #[test]
    fn test_zero_traces_rejected() {
        let content = r#"<log>
  <string key="creator" value="someone"/>
</log>"#;
        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "metadata-only <log> should be rejected");
        assert!(
            result.unwrap_err().contains("0 traces"),
            "Error should mention 0 traces"
        );
    }

    // ---- Boolean strictness ----

    #[test]
    fn test_boolean_values_parse_case_insensitive() {
        let mk = |v: &str| {
            format!(
                r#"<log><trace><event><boolean key="b" value="{}"/></event></trace></log>"#,
                v
            )
        };
        for (raw, expected) in [
            ("true", true),
            ("TRUE", true),
            ("True", true),
            ("1", true),
            ("false", false),
            ("FALSE", false),
            ("0", false),
        ] {
            let log = validate_and_parse_xes(&mk(raw))
                .unwrap_or_else(|e| panic!("'{}' should parse: {}", raw, e));
            let ev = &log.traces[0].events[0];
            assert_eq!(
                ev.attributes.get("b"),
                Some(&AttributeValue::Boolean(expected)),
                "value '{}' mismatch",
                raw
            );
        }
    }

    #[test]
    fn test_boolean_invalid_value_rejected() {
        let content = r#"<log><trace><event><boolean key="b" value="maybe"/></event></trace></log>"#;
        let result = validate_and_parse_xes(content);
        assert!(result.is_err(), "'maybe' must not silently become false");
        assert!(
            result.unwrap_err().contains("boolean"),
            "Error should mention boolean"
        );
    }

    // ---- Bounded gz decompression ----

    fn gz_compress(data: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
        enc.write_all(data).expect("gz write");
        enc.finish().expect("gz finish")
    }

    const VALID_SMALL_XES: &str =
        r#"<log><trace><event><string key="k" value="v"/></event></trace></log>"#;

    #[test]
    fn test_valid_gz_round_trips() {
        let gz = gz_compress(VALID_SMALL_XES.as_bytes());
        let out = decompress_gz_bounded(&gz, MAX_XES_BYTES).expect("small valid gz should parse");
        assert_eq!(out, VALID_SMALL_XES);
    }

    #[test]
    fn test_plain_bytes_passthrough() {
        let out = decompress_gz_bounded(VALID_SMALL_XES.as_bytes(), MAX_XES_BYTES)
            .expect("plain XES bytes should pass through");
        assert_eq!(out, VALID_SMALL_XES);
    }

    #[test]
    fn test_gz_bomb_bounded_abort() {
        // Small .gz whose decompressed stream vastly exceeds a tiny test cap.
        // Exercises the same take(cap+1) bound as the 512MB production cap
        // without allocating 512MB in the test.
        let bomb = "A".repeat(4 * 1024 * 1024); // 4 MB of 'A' -> tiny .gz
        let gz = gz_compress(bomb.as_bytes());
        let small_cap = 1024 * 1024; // 1 MB cap
        let result = decompress_gz_bounded(&gz, small_cap);
        assert!(result.is_err(), "4MB expansion vs 1MB cap must abort");
        assert!(
            result.unwrap_err().contains("too large"),
            "Error should be the typed 'too large' abort, not a heap trap"
        );
    }

    #[test]
    fn test_gz_exactly_at_cap_accepted() {
        let data = "B".repeat(64 * 1024);
        let gz = gz_compress(data.as_bytes());
        let result = decompress_gz_bounded(&gz, 64 * 1024);
        assert!(result.is_ok(), "decompressed size == cap must be accepted");
    }
}
