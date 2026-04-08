//! Base case handling for POWL discovery.
//!
//! Handles empty logs and single-activity logs.

use crate::powl_arena::PowlArena;

/// Handle empty event log (no traces)
pub fn handle_empty_log(arena: &mut PowlArena) -> Result<u32, String> {
    // Return an empty model (silent transition)
    let tau = arena.add_silent_transition();
    Ok(tau)
}

/// Handle log with only one unique activity
pub fn handle_single_activity(arena: &mut PowlArena, activity: &str) -> Result<u32, String> {
    // Single activity → Transition with that label
    let idx = arena.add_transition(Some(activity.to_string()));
    Ok(idx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_empty_log_creates_tau() {
        let mut arena = PowlArena::new();
        let root = handle_empty_log(&mut arena).unwrap();
        // Should create a silent transition
        assert_eq!(arena.nodes.len(), 1);
    }

    #[test]
    fn test_handle_single_activity_creates_transition() {
        let mut arena = PowlArena::new();
        let root = handle_single_activity(&mut arena, "A").unwrap();
        assert_eq!(arena.nodes.len(), 1);
        // Should have a labeled transition
        match arena.get(root) {
            Some(crate::powl_arena::PowlNode::Transition(t)) => {
                assert_eq!(t.label.as_deref(), Some("A"));
            }
            _ => panic!("Expected Transition node"),
        }
    }
}
