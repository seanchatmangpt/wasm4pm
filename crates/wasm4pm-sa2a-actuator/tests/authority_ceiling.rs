use std::fs;

#[test]
fn actuator_source_has_no_signer_or_shell_surface() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut text = String::new();
    for entry in fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|x| x.to_str()) == Some("rs") {
            text.push_str(&fs::read_to_string(path).unwrap());
        }
    }
    assert!(!text.contains("SigningKey"));
    assert!(!text.contains("Command::new"));
    assert!(!text.contains("std::process"));
}
