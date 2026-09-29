use serde_json::json;
use wasm4pm_sa2a_actuator::{ActuatorRefusal, Effector, PreparedEffect, Utf8FileWriteEffector};

fn effect(path: &str) -> PreparedEffect {
    PreparedEffect {
        version: 1,
        principal: "principal:alice".into(),
        capability: "fs.write_utf8".into(),
        subject: json!({"kind":"file"}),
        payload: json!({"relative_path":path,"content":"hello"}),
    }
}

#[test]
fn writes_only_below_fixed_root() {
    let dir = tempfile::tempdir().unwrap();
    let effector = Utf8FileWriteEffector::new(dir.path()).unwrap();
    effector.perform(&effect("nested/a.txt")).unwrap();
    assert_eq!(std::fs::read_to_string(dir.path().join("nested/a.txt")).unwrap(), "hello");
    assert_eq!(effector.perform(&effect("../escape.txt")).unwrap_err(), ActuatorRefusal::PathRefused);
}
