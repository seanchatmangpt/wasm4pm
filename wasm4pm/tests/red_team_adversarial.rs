#![cfg(feature = "poc_gate_validator")]
use wasm4pm::autoprocess::AutoProcessAgent;
use wasm4pm::pattern_dispatch::{PatternDispatcher, PatternContext, PatternType};
use wasm4pm::gate_validator::{UnverifiedRun, VerifiedRun};
use wasm4pm::proof_gate_registry::ProofGate;

#[cfg(test)]
mod red_team {
    use super::*;

    /// RED TEAM SIMULATION: Attempt to bypass RL bounds via massive state IDs.
    /// Expected outcome: Runtime panic due to strict assertions.
    #[test]
    #[should_panic(expected = "Q-table bounds check failed for next_state_id")]
    fn test_red_team_rl_oob_next_state() {
        let mut agent = AutoProcessAgent::new();
        // 999999 is way beyond QTABLE_SIZE
        agent.bellman_update_direct(0, 0, 1.0, 999999, false);
    }

    /// RED TEAM SIMULATION: Attempt to bypass RL bounds via massive current state ID.
    /// Expected outcome: Runtime panic due to strict assertions.
    #[test]
    #[should_panic(expected = "Q-table bounds check failed for q_idx")]
    fn test_red_team_rl_oob_current_state() {
        let mut agent = AutoProcessAgent::new();
        // 999999 is way beyond QTABLE_SIZE
        agent.bellman_update_direct(999999, 0, 1.0, 0, false);
    }

    /// RED TEAM SIMULATION: Attempt to bypass pattern dispatch bounds.
    /// Expected outcome: Runtime panic due to strict assertions.
    #[test]
    #[should_panic(expected = "Pattern dispatch table bounds check failed")]
    fn test_red_team_dispatch_oob() {
        let dispatcher = PatternDispatcher::new();
        let context = PatternContext {
            // PatternType is an enum, but if an attacker manages to force an invalid value
            // (e.g. via unsafe transmute or corrupted memory), we should catch it.
            pattern_type: unsafe { std::mem::transmute(99u8) },
            ..Default::default()
        };
        dispatcher.dispatch(&context);
    }

    /// RED TEAM SIMULATION: Attempt to bypass gate validation typestate.
    /// Contract: It is impossible to obtain a VerifiedRun without passing through UnverifiedRun::verify().
    #[test]
    fn test_red_team_gate_typestate_enforcement() {
        let run = UnverifiedRun::new();
        
        // This fails to compile if uncommented, proving the typestate works:
        // let verified: VerifiedRun = run; 
        
        // This also fails because VerifiedRun has no public constructor:
        // let verified = VerifiedRun { passed_gates: HashSet::new() };

        let result = run.verify();
        assert!(result.is_err(), "Should not be able to verify without required gates");
    }

    /// RED TEAM SIMULATION: Successful passage after fulfilling requirements.
    #[test]
    fn test_red_team_lawful_passage() {
        let mut run = UnverifiedRun::new();
        run.mark_gate_passed(ProofGate::gate_test_suite_passes);
        
        let verified = run.verify().expect("Should pass after fulfilling requirements");
        let output = verified.export_results();
        assert!(output.contains("Exporting results verified with 1 gates"));
    }
}
