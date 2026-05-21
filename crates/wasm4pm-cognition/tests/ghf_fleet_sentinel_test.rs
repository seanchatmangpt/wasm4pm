use wasm4pm_cognition::ghf::{check_fleet_drift, RefusalState8, ValidationResult};

#[test]
fn test_refuses_fleet_drift_detected() {
    // If SECURITY.md does not exist, it should return FleetDriftDetected
    let res = check_fleet_drift();
    if !std::path::Path::new("SECURITY.md").exists() && !std::path::Path::new("../../SECURITY.md").exists() {
        assert_eq!(res, ValidationResult::Refuse(RefusalState8::FleetDriftDetected, "SECURITY.md missing".into()));
    } else {
        assert_eq!(res, ValidationResult::Pass);
    }
}
