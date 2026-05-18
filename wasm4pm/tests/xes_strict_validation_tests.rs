/// Strict XES XML validation tests
///
/// These tests verify that the XES parser rejects malformed/unclosed tags
/// with clear error messages instead of silently accepting them.
use wasm4pm::xes_format::validate_and_parse_xes;

// ============================================================================
// Test 1: Valid XES file should parse successfully
// ============================================================================

#[test]
fn test_valid_xes_parses_successfully() {
    let content = include_str!("fixtures/conformance/fixture_a_perfect.xes");
    let result = validate_and_parse_xes(content);

    assert!(
        result.is_ok(),
        "Valid XES should parse without error. Got: {:?}",
        result
    );

    let log = result.unwrap();
    assert_eq!(log.traces.len(), 1, "Expected 1 trace");
    assert_eq!(log.traces[0].events.len(), 2, "Expected 2 events");
}

// ============================================================================
// Test 2: Unclosed <trace> tag should error
// ============================================================================

#[test]
fn test_unclosed_trace_tag_rejected() {
    let content = include_str!("fixtures/dirty_data/unclosed_trace.xes");
    let result = validate_and_parse_xes(content);

    assert!(result.is_err(), "Unclosed <trace> should be rejected");
    let err = result.unwrap_err();
    assert!(
        err.contains("Unclosed") || err.contains("trace"),
        "Error message should mention unclosed trace. Got: {}",
        err
    );
    assert!(
        err.contains("Line"),
        "Error message should include line number. Got: {}",
        err
    );
}

// ============================================================================
// Test 3: Unclosed <event> tag should error
// ============================================================================

#[test]
fn test_unclosed_event_tag_rejected() {
    let content = include_str!("fixtures/dirty_data/unclosed_event.xes");
    let result = validate_and_parse_xes(content);

    assert!(result.is_err(), "Unclosed <event> should be rejected");
    let err = result.unwrap_err();
    assert!(
        err.contains("Mismatched") || err.contains("Unclosed"),
        "Error message should indicate tag mismatch. Got: {}",
        err
    );
    assert!(
        err.contains("Line"),
        "Error message should include line number. Got: {}",
        err
    );
}

// ============================================================================
// Test 4: Mismatched closing tags should error
// ============================================================================

#[test]
fn test_mismatched_tags_rejected() {
    let content = include_str!("fixtures/dirty_data/mismatched_tags.xes");
    let result = validate_and_parse_xes(content);

    assert!(result.is_err(), "Mismatched tags should be rejected");
    let err = result.unwrap_err();
    assert!(
        err.contains("Mismatched"),
        "Error message should mention mismatched tags. Got: {}",
        err
    );
    assert!(
        err.contains("event") || err.contains("trace"),
        "Error message should identify the conflicting tags. Got: {}",
        err
    );
}

// ============================================================================
// Test 5: String tag without proper closing should error
// ============================================================================

#[test]
fn test_string_tag_not_self_closing_rejected() {
    let content = include_str!("fixtures/dirty_data/invalid_string_not_closed.xes");
    let result = validate_and_parse_xes(content);

    assert!(result.is_err(), "Non-self-closing <string> tag should be rejected");
    let err = result.unwrap_err();
    assert!(
        err.contains("string") || err.contains("self-closing"),
        "Error message should reference string tag or self-closing requirement. Got: {}",
        err
    );
}

// ============================================================================
// Test 6: Missing required attribute should error
// ============================================================================

#[test]
fn test_missing_required_attribute_rejected() {
    let content = include_str!("fixtures/dirty_data/missing_attribute.xes");
    let result = validate_and_parse_xes(content);

    assert!(result.is_err(), "Missing 'value' attribute should be rejected");
    let err = result.unwrap_err();
    assert!(
        err.contains("string") && (err.contains("missing") || err.contains("required")),
        "Error message should indicate missing attribute in string tag. Got: {}",
        err
    );
}

// ============================================================================
// Test 7: Unexpected closing tag (no opening) should error
// ============================================================================

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

    assert!(result.is_err(), "Unexpected closing </event> should be rejected");
    let err = result.unwrap_err();
    assert!(
        err.contains("Mismatched") || err.contains("Unexpected") || err.contains("matching"),
        "Error message should indicate mismatched/unexpected tag. Got: {}",
        err
    );
}

// ============================================================================
// Test 8: Error message contains line number
// ============================================================================

#[test]
fn test_error_message_includes_line_number() {
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

    // Verify line number is reasonable (should be >= 6)
    let line_part = err.split("Line").nth(1).unwrap_or("");
    let line_str = line_part.split(':').next().unwrap_or("");
    let line_num: usize = line_str
        .trim()
        .parse()
        .expect("Error message should contain parseable line number");
    assert!(
        line_num >= 5,
        "Line number should be >= 5, got: {}",
        line_num
    );
}

// ============================================================================
// Test 9: Valid XES with multiple traces parses correctly
// ============================================================================

#[test]
fn test_valid_xes_multiple_traces_parses() {
    let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T09:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00Z"/>
    </event>
  </trace>
</log>"#;

    let result = validate_and_parse_xes(content);
    assert!(result.is_ok(), "Valid XES with multiple traces should parse");

    let log = result.unwrap();
    assert_eq!(log.traces.len(), 2, "Expected 2 traces");
    assert_eq!(log.traces[0].events.len(), 1, "First trace has 1 event");
    assert_eq!(log.traces[1].events.len(), 1, "Second trace has 1 event");
}

// ============================================================================
// Test 10: Invalid float value is caught
// ============================================================================

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

// ============================================================================
// Test 11: Invalid int value is caught
// ============================================================================

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
