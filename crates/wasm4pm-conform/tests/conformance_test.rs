use wasm4pm_conform::*;

#[test]
fn test_ocel_streaming_and_hypergraph() {
    let json = br#"{
        "events": [
            {
                "id": "e1",
                "activity": "Create Order",
                "relationships": [{"objectId": "o1"}]
            },
            {
                "id": "e2",
                "activity": "Pick Item",
                "relationships": [{"objectId": "o1"}, {"objectId": "i1"}]
            },
            {
                "id": "e3",
                "activity": "Ship",
                "relationships": [{"objectId": "o1"}]
            }
        ]
    }"#;

    let parser = OcelStreamParser::new();
    let events = parser.parse_events(json).expect("failed to parse OCEL 2.0");
    assert_eq!(events.len(), 3);
    assert_eq!(events[0].activity, "Create Order");

    let hypergraph = CausalHypergraph::from_events(&events);
    assert_eq!(hypergraph.event_hyperedges.len(), 3);
    let digest = hypergraph.compute_digest();
    assert_ne!(digest, [0u8; 32]);
}

#[test]
fn test_powl_compile_and_bitpacked_replayer() {
    let mut compiler = PowlTrajectoryCompiler::new();
    let activities = vec!["Create Order", "Pick Item", "Ship"];
    let (lattice, post_masks) = compiler.compile_sequence(&activities);

    assert_eq!(lattice.enabled_mask, 1); // bit 0

    let mut replayer = Dual64Replayer::new(lattice, ReductionBudget::new(100));

    let event_stream = vec![
        (1, "Create Order", compiler.register_activity("Create Order")),
        (2, "Pick Item", compiler.register_activity("Pick Item")),
        (3, "Ship", compiler.register_activity("Ship")),
    ];

    let result = replayer.replay_cooperative(&event_stream, &post_masks);
    match result {
        StepResult::Complete(final_lattice) => {
            assert!(final_lattice.marked_mask & 1 != 0);
            assert!(final_lattice.marked_mask & 2 != 0);
            assert!(final_lattice.marked_mask & 4 != 0);
        }
        other => panic!("expected Complete, got {:?}", other),
    }
}

#[test]
fn test_cooperative_reduction_yielding() {
    let mut compiler = PowlTrajectoryCompiler::new();
    let activities = vec!["Step1", "Step2", "Step3", "Step4"];
    let (lattice, post_masks) = compiler.compile_sequence(&activities);

    // Provide budget of only 2 steps
    let mut replayer = Dual64Replayer::new(lattice, ReductionBudget::new(2));

    let stream = vec![
        (1, "Step1", compiler.register_activity("Step1")),
        (2, "Step2", compiler.register_activity("Step2")),
        (3, "Step3", compiler.register_activity("Step3")),
        (4, "Step4", compiler.register_activity("Step4")),
    ];

    let step1_res = replayer.replay_cooperative(&stream, &post_masks);
    assert_eq!(step1_res, StepResult::Yielded { remaining_events: 2 });
    assert_eq!(replayer.current_event_index, 2);

    // Replenish quota and resume without loss of state
    replayer.reduction_budget.remaining = 10;
    let step2_res = replayer.replay_cooperative(&stream, &post_masks);
    assert!(matches!(step2_res, StepResult::Complete(_)));
    assert_eq!(replayer.current_event_index, 4);
}

#[test]
fn test_fail_closed_receipt_verification() {
    let signer = ReceiptSigner::new("node-01");
    let log_digest = [0xaa; 32];
    let model_digest = [0xbb; 32];

    let receipt = signer.sign(
        log_digest,
        model_digest,
        0b111,
        42,
        ConformanceVerdict::Sound,
    );

    assert!(receipt.verify(), "Valid receipt must verify");

    // Tampered receipt must fail closed
    let mut tampered = receipt.clone();
    tampered.verdict = ConformanceVerdict::Violation;
    assert!(!tampered.verify(), "Tampered receipt must fail-closed");
}
