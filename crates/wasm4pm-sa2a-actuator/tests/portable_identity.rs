use serde_json::json;
use wasm4pm_sa2a_actuator::PreparedEffect;

#[test]
fn jcs_identity_ignores_object_key_order() {
    let a = PreparedEffect {
        version: 1,
        principal: "principal:alice".into(),
        capability: "fs.write_utf8".into(),
        subject: json!({"kind":"file","id":42}),
        payload: json!({"relative_path":"a.txt","content":"hello"}),
    };
    let b = PreparedEffect {
        subject: json!({"id":42,"kind":"file"}),
        payload: json!({"content":"hello","relative_path":"a.txt"}),
        ..a.clone()
    };
    assert_eq!(a.digest().unwrap(), b.digest().unwrap());
}
