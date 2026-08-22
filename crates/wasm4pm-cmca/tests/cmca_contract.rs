use wasm4pm_cmca::{
    allocate_native, replay_receipt, CmcaAllocationRequest, CmcaLens, CmcaSemanticState,
    AUTHORITY, BCINR_CMCA_PACKAGE, BCINR_CMCA_VERSION,
};

fn request() -> CmcaAllocationRequest {
    CmcaAllocationRequest {
        states: std::array::from_fn(|index| CmcaSemanticState {
            id: index as u32,
            factors_q16: [65_536; 10],
        }),
        lenses: [
            CmcaLens { id: 0, q_q16: 131_072 },
            CmcaLens { id: 1, q_q16: 65_536 },
            CmcaLens { id: 2, q_q16: 0 },
            CmcaLens { id: 3, q_q16: -65_536 },
        ],
        measure: 0,
        lens_index: 1,
        parent: [-1; 8],
        weights_q16: [[65_536; 8]; 8],
    }
}

#[test]
fn exact_bcinr_kernel_produces_replayable_construct_only_receipt() {
    let response = allocate_native(&request()).expect("flat CMCA request should allocate");

    assert_eq!(response.standing, "ALIVE");
    assert!(response.result.shares_q16.iter().any(|share| *share > 0));
    assert_eq!(response.receipt.bcinr_package, BCINR_CMCA_PACKAGE);
    assert_eq!(response.receipt.bcinr_version, BCINR_CMCA_VERSION);
    assert_eq!(response.receipt.authority, AUTHORITY);
    assert!(!response.receipt.actuation_performed);
    assert!(replay_receipt(&response));
}

#[test]
fn cyclic_hierarchy_is_a_typed_refusal_not_a_false_success() {
    let mut request = request();
    request.parent[0] = 1;
    request.parent[1] = 0;

    let refusal = allocate_native(&request).expect_err("cycle must refuse");

    assert_eq!(refusal.code, "CMCA_HIERARCHY_CYCLE_REFUSED");
    assert_eq!(refusal.authority, AUTHORITY);
    assert!(!refusal.actuation_performed);
    assert!(!refusal.request_blake3.is_empty());
}

#[test]
fn out_of_range_measure_preserves_bcinr_refusal_semantics() {
    let mut request = request();
    request.measure = 4;

    let refusal = allocate_native(&request).expect_err("measure 4 is outside K=4");
    assert_eq!(refusal.code, "CMCA_MEASURE_INDEX_REFUSED");
}

#[test]
fn receipt_mutation_fails_replay() {
    let mut response = allocate_native(&request()).expect("flat CMCA request should allocate");
    response.receipt.result_blake3.push('0');
    assert!(!replay_receipt(&response));
}
