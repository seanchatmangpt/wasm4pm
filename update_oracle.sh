sed -i.bak '/fn default_logic_hidden_extension() {/,/^}/c\
#[test]\
fn default_logic_hidden_extension() {\
    // Positive control: derivation succeeds without blocker.\
    let mut input_pos = base("Default logic bird example (positive)");\
    input_pos.facts = vec![\
        fact("bird", "tweety"),\
    ];\
    input_pos.rules = vec![\
        rule("r_default", vec!["bird", "unless:non_flying"], "flies", 1.0),\
    ];\
    let output_pos = dispatch_breed_test("default_logic", &input_pos)\
        .expect("default_logic positive run must succeed");\
    assert!(!output_pos.inference_trace.is_empty(), "Trace must not be empty");\
    let selected_pos = output_pos.selected.as_ref().unwrap();\
    assert!(selected_pos.contains("flies"), "Positive control must derive flies");\
\
    // Negative control (the blocker): justification defeated mid-derivation.\
    let mut input_neg = base("Default logic bird example (blocked)");\
    input_neg.facts = vec![\
        fact("bird", "tux"),\
        fact("penguin", "tux"),\
    ];\
    input_neg.rules = vec![\
        rule("r_default", vec!["bird", "unless:non_flying"], "flies", 1.0),\
        rule("r_penguin", vec!["penguin"], "non_flying", 1.0),\
    ];\
\
    let output_neg = dispatch_breed_test("default_logic", &input_neg)\
        .expect("default_logic blocked run must succeed");\
\
    assert!(!output_neg.inference_trace.is_empty(), "Trace must not be empty");\
    let selected_neg = output_neg.selected.as_ref().unwrap();\
    assert!(selected_neg.contains("non_flying"), "Blocked run must derive non_flying");\
    assert!(!selected_neg.contains("flies"), "Blocked run must EXCLUDE flies");\
\
    // Trace must contain a `default-block` step naming the blocking fact.\
    let has_block = output_neg.inference_trace.iter().any(|t| {\
        t.kind == "default-block" && t.detail.contains("non_flying")\
    });\
    assert!(has_block, "Trace must contain default-block step naming non_flying");\
}\
' crates/wasm4pm-cognition/tests/oracle_hidden.rs
sh update_oracle.sh
