use pm4py_lsp::pm4py_bridge::{check_pm4py, set_runtime_mode, PM4PyStatus};

#[test]
fn test_check_pm4py_static_mode() {
    set_runtime_mode(false);
    let status = check_pm4py();
    assert_eq!(status, PM4PyStatus::Unknown);
}

#[test]
fn test_check_pm4py_runtime_mode() {
    set_runtime_mode(true);
    let status = check_pm4py();
    match status {
        PM4PyStatus::Available(version) => {
            println!("pm4py is available: version {}", version);
        }
        PM4PyStatus::Unknown => {
            println!("pm4py is not available in runtime mode");
        }
    }
    // Must complete without panicking
}
