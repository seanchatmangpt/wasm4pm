use wasm4pm::gall_portable_execution::{
    certify_portable_execution, GallPortableIdentity, PortableExecutionObservation,
    PortableExecutionRefusal, SemanticAuthority,
};

fn digest(seed: char) -> String {
    format!("sha256:{}", seed.to_string().repeat(64))
}

fn identity() -> GallPortableIdentity {
    GallPortableIdentity {
        work_order_iri: "urn:gall:work-order:wasm:001".into(),
        checkpoint_iri: "urn:gall:checkpoint:wasm:001".into(),
        graph_digest: digest('a'),
        repository_identity: "seanchatmangpt/wasm4pm".into(),
        base_sha: "b".repeat(40),
    }
}

fn observation(runtime: &str) -> PortableExecutionObservation {
    PortableExecutionObservation {
        identity: identity(),
        runtime_identity: runtime.into(),
        process_digest: digest('c'),
        powl_language_digest: digest('d'),
        ocpq_binding_digest: digest('e'),
        input_digest: digest('f'),
        output_digest: digest('1'),
        authority: SemanticAuthority::None,
    }
}

#[test]
fn exact_cross_runtime_equivalence_issues_portability_receipt_without_authority() {
    let receipt = certify_portable_execution(
        &observation("wasm32-wasmtime"),
        &observation("wasm32-browser"),
    )
    .expect("portable execution");

    assert_eq!(receipt.identity, identity());
    assert_eq!(receipt.authority, SemanticAuthority::None);
    assert!(receipt.receipt_digest.starts_with("sha256:"));
}

#[test]
fn output_divergence_refuses_portability() {
    let source = observation("wasm32-wasmtime");
    let mut target = observation("wasm32-browser");
    target.output_digest = digest('2');

    assert_eq!(
        certify_portable_execution(&source, &target),
        Err(PortableExecutionRefusal::OutputMismatch)
    );
}

#[test]
fn powl_language_drift_is_not_hidden_by_equal_outputs() {
    let source = observation("wasm32-wasmtime");
    let mut target = observation("wasm32-browser");
    target.powl_language_digest = digest('2');

    assert_eq!(
        certify_portable_execution(&source, &target),
        Err(PortableExecutionRefusal::PowlLanguageMismatch)
    );
}

#[test]
fn ocpq_binding_drift_is_refused() {
    let source = observation("wasm32-wasmtime");
    let mut target = observation("wasm32-browser");
    target.ocpq_binding_digest = digest('2');

    assert_eq!(
        certify_portable_execution(&source, &target),
        Err(PortableExecutionRefusal::OcpqBindingMismatch)
    );
}

#[test]
fn moved_work_order_subject_is_refused() {
    let source = observation("wasm32-wasmtime");
    let mut target = observation("wasm32-browser");
    target.identity.work_order_iri = "urn:gall:work-order:other".into();

    assert_eq!(
        certify_portable_execution(&source, &target),
        Err(PortableExecutionRefusal::SubjectMismatch)
    );
}

#[test]
fn same_runtime_is_not_cross_runtime_portability_evidence() {
    let source = observation("wasm32-wasmtime");
    let target = observation("wasm32-wasmtime");

    assert_eq!(
        certify_portable_execution(&source, &target),
        Err(PortableExecutionRefusal::SameRuntime)
    );
}
