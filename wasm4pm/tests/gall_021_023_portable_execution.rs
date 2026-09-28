//! GALL-021..023 executed qualification: real WASM modules produced by the
//! wasm4pm lowering, run on real engines (wasmtime/Cranelift, node/V8,
//! bun/JavaScriptCore), judged by the courts against reference semantics
//! (generative POWL language, Lean-transcribed GALL-015 process-tree
//! language, ex4pm GALL-017 OCPQ evaluator).
//!
//! No test doubles: every witness comes from an executed module. When fewer
//! than two engines are installed the executed tests print a named SKIP line
//! (ARD: "at least two ... where available") instead of substituting fakes.

#![cfg(not(target_arch = "wasm32"))]

use serde_json::Value;
use std::collections::BTreeSet;
use wasm4pm::correspondence::process_tree_semantics::{
    enumerate_trees, lean_language_exact, RestrictedTree,
};
use wasm4pm::gall_process_portability::{
    powl_language_equivalent_within, qualify_ocpq, qualify_portable_execution,
    verify_powl_preservation, PortabilityRefusal, PortableProcessSubject, RuntimeEngine,
};
use wasm4pm::gall_runtime_harness::{
    discover_runtimes, execute, witness_gall017, witness_powl_probe, witness_raw, RuntimeHost,
};
use wasm4pm::gall_wasm_lowering::{
    compiler_digest, encode_gall017_input, gall017_reference_evaluate, inspect_module,
    lower_gall017_query, lower_powl, Gall017Binding, Gall017Ocel, Gall017Query, LanguageProbe,
    PortableModule, PowlSkeleton, PowlSubject, TRACE_END,
};
use wasm4pm::powl_arena::{Operator, PowlArena};

const CORPUS: &[u8] = include_bytes!("../../fixtures/gall/ex4pm-gall-015-017-corpus-v26.9.18.json");

fn corpus() -> Value {
    serde_json::from_slice(CORPUS).expect("corpus json")
}

fn corpus_digest() -> String {
    use sha2::{Digest, Sha256};
    format!("sha256:{:x}", Sha256::digest(CORPUS))
}

fn sha(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("sha256:{:x}", Sha256::digest(bytes))
}

/// Engines available on this host, or a visible SKIP when < 2.
fn hosts(test: &str) -> Option<Vec<RuntimeHost>> {
    let hosts = discover_runtimes();
    if hosts.len() < 2 {
        eprintln!(
            "SKIP {test}: UNSUPPORTED on this host, {} WASM engine(s) found (need 2 of wasmtime/node/bun)",
            hosts.len()
        );
        return None;
    }
    eprintln!(
        "{test}: engines {:?}",
        hosts.iter().map(|h| h.version.as_str()).collect::<Vec<_>>()
    );
    Some(hosts)
}

fn accepted_words(
    subject: &PowlSubject,
    probe: &LanguageProbe,
    verdicts: &[u8],
) -> BTreeSet<Vec<String>> {
    probe
        .traces()
        .iter()
        .zip(verdicts)
        .filter(|(_, v)| **v == b'1')
        .map(|(t, _)| {
            t.iter()
                .map(|&s| subject.alphabet()[s as usize].clone())
                .collect()
        })
        .collect()
}

fn preserve(
    subject: &PowlSubject,
    hosts: &[RuntimeHost],
) -> (
    PortableModule,
    LanguageProbe,
    wasm4pm::gall_process_portability::PowlPreservationReceipt,
    Vec<u8>,
) {
    let module = lower_powl(subject).expect("lower");
    let probe = LanguageProbe::for_subject(subject);
    let witnesses: Vec<_> = hosts
        .iter()
        .map(|h| witness_powl_probe(h, &module, &probe).expect("execute"))
        .collect();
    let verdicts = witnesses[0].canonical_result().to_vec();
    let receipt = verify_powl_preservation(subject, &module, &probe, &witnesses)
        .unwrap_or_else(|e| panic!("preservation refused: {e:?}"));
    (module, probe, receipt, verdicts)
}

// ---------------------------------------------------------------------------
// GALL-022
// ---------------------------------------------------------------------------

#[test]
fn gall_022_corpus_fixtures_compile_and_pass_executed_probes() {
    let Some(hosts) = hosts("gall_022_corpus_fixtures") else {
        return;
    };
    for fixture in corpus()["powl_fixtures"].as_array().unwrap() {
        let id = fixture["id"].as_str().unwrap();
        let spec = serde_json::to_vec(&fixture["semantic"]).unwrap();
        if fixture.get("expected_refusal").is_some() {
            assert_eq!(
                PowlSubject::from_gall016_json(&spec).unwrap_err(),
                PortabilityRefusal::MalformedPartialOrder("cycle".into()),
                "{id}"
            );
            continue;
        }
        let subject = PowlSubject::from_gall016_json(&spec).unwrap();
        let (module, probe, receipt, verdicts) = preserve(&subject, &hosts);
        assert_eq!(receipt.module_digest, module.digest());
        assert_eq!(receipt.source_digest, sha(&spec));
        assert_eq!(receipt.compiler_digest, compiler_digest());
        assert_eq!(receipt.runtimes.len(), hosts.len());
        let accepted = accepted_words(&subject, &probe, &verdicts);
        let expected: BTreeSet<Vec<String>> = fixture["traces"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| {
                t.as_array()
                    .unwrap()
                    .iter()
                    .map(|a| a.as_str().unwrap().to_string())
                    .collect()
            })
            .collect();
        assert!(
            expected.is_subset(&accepted),
            "{id}: {expected:?} not in {accepted:?}"
        );
        if fixture["language_complete"] == Value::Bool(true) {
            assert_eq!(accepted, expected, "{id}: executed language");
        }
        eprintln!(
            "{id}: module {} probe bound {} traces {} accepted {}",
            &module.digest()[..19],
            receipt.probe_bound,
            receipt.probe_traces,
            receipt.probe_accepted
        );
    }
}

#[test]
fn gall_022_parallel_admits_every_interleaving_and_hierarchy_keeps_boundary() {
    let Some(hosts) = hosts("gall_022_parallel_hierarchy") else {
        return;
    };
    let par = PowlSubject::from_gall016_json(
        br#"{"type":"partial_order","children":["a","b","c"],"order":[["a","c"]]}"#,
    )
    .unwrap();
    let (_, probe, _, verdicts) = preserve(&par, &hosts);
    let accepted = accepted_words(&par, &probe, &verdicts);
    let w = |s: &str| s.chars().map(|c| c.to_string()).collect::<Vec<_>>();
    let expected: BTreeSet<_> = ["abc", "bac", "acb"].into_iter().map(w).collect();
    assert_eq!(accepted, expected);

    let nested = PowlSubject::from_gall016_json(
        br#"{"type":"partial_order","children":["x",{"type":"hierarchy","id":"h","child":{"type":"partial_order","children":["a","b"],"order":[]}}],"order":[["x","h"]]}"#,
    )
    .unwrap();
    let (module, probe, _, verdicts) = preserve(&nested, &hosts);
    let skeleton = inspect_module(&module).unwrap().skeleton.unwrap();
    let PowlSkeleton::PartialOrder { children, .. } = &skeleton else {
        panic!("root kind");
    };
    assert!(children
        .iter()
        .any(|c| matches!(c, PowlSkeleton::Boundary { id, .. } if id == "h")));
    let accepted = accepted_words(&nested, &probe, &verdicts);
    let expected: BTreeSet<_> = ["xab", "xba"].into_iter().map(w).collect();
    assert_eq!(accepted, expected, "boundary h completes after x as a unit");
}

fn tree_to_arena(t: &RestrictedTree, arena: &mut PowlArena) -> u32 {
    match t {
        RestrictedTree::Leaf(a) => arena.add_transition(Some(format!("{a}"))),
        RestrictedTree::Seq(l, r) => {
            let (l, r) = (tree_to_arena(l, arena), tree_to_arena(r, arena));
            arena.add_sequence(vec![l, r])
        }
        RestrictedTree::Xor(l, r) => {
            let (l, r) = (tree_to_arena(l, arena), tree_to_arena(r, arena));
            arena.add_operator(Operator::Xor, vec![l, r])
        }
        RestrictedTree::Par(l, r) => {
            let (l, r) = (tree_to_arena(l, arena), tree_to_arena(r, arena));
            arena.add_strict_partial_order(vec![l, r])
        }
    }
}

#[test]
fn gall_022_gall015_lean_process_tree_languages_are_preserved_by_executed_modules() {
    let Some(hosts) = hosts("gall_022_gall015_lean") else {
        return;
    };
    let trees = enumerate_trees(3);
    assert_eq!(trees.len(), 158);
    for tree in &trees {
        let mut arena = PowlArena::new();
        let root = tree_to_arena(tree, &mut arena);
        let subject = PowlSubject::from_arena(arena, root).unwrap();
        let (_, probe, _, verdicts) = preserve(&subject, &hosts);
        assert!(probe.bound() >= 3, "bound covers every 3-leaf trace");
        let executed: BTreeSet<Vec<String>> = accepted_words(&subject, &probe, &verdicts);
        let lean: BTreeSet<Vec<String>> = lean_language_exact(tree)
            .into_iter()
            .map(|t| t.iter().map(|a| a.to_string()).collect())
            .collect();
        assert_eq!(executed, lean, "{tree:?}");
    }
}

#[test]
fn gall_022_pm4py_ingress_rebuild_determinism_and_unsupported() {
    let pm = PowlSubject::from_pm4py_string("PO=(nodes={a, b}, order={})").unwrap();
    let json = PowlSubject::from_gall016_json(
        br#"{"type":"partial_order","children":["a","b"],"order":[]}"#,
    )
    .unwrap();
    assert!(powl_language_equivalent_within(&pm, &json, 6).unwrap());
    assert_eq!(pm.skeleton(), json.skeleton());
    // Source provenance differs, so module identity differs.
    assert_ne!(pm.source_digest(), json.source_digest());
    assert_ne!(lower_powl(&pm).unwrap(), lower_powl(&json).unwrap());
    // Recompiling the same subject reproduces the module bytes.
    assert_eq!(lower_powl(&json).unwrap(), lower_powl(&json).unwrap());
    let mut arena = PowlArena::new();
    let a = arena.add_transition(Some("a".into()));
    let f = arena.add_frequent_transition("b".into(), 0, None);
    let root = arena.add_sequence(vec![a, f]);
    assert_eq!(
        PowlSubject::from_arena(arena, root).unwrap_err(),
        PortabilityRefusal::UnsupportedPowlConstruct("frequent_transition".into())
    );
    if let Some(hosts) = hosts("gall_022_pm4py_ingress") {
        preserve(&pm, &hosts);
        let loop_tau = PowlSubject::from_pm4py_string("* ( a, tau )").unwrap();
        let (_, probe, _, verdicts) = preserve(&loop_tau, &hosts);
        let accepted = accepted_words(&loop_tau, &probe, &verdicts);
        assert!(accepted.contains(&vec!["a".to_string(); 3]));
        assert!(!accepted.contains(&Vec::<String>::new()));
    }
}

// ---------------------------------------------------------------------------
// GALL-021
// ---------------------------------------------------------------------------

#[test]
fn gall_021_same_module_same_canonical_result_across_engines_and_permutation() {
    let Some(hosts) = hosts("gall_021_cross_engine") else {
        return;
    };
    let c = corpus();
    let ocel = Gall017Ocel::from_value(&c["ocel"]).unwrap();
    let query = Gall017Query::from_json(&serde_json::to_vec(&c["ocpq_cases"][0]["query"]).unwrap())
        .unwrap();
    let module = lower_gall017_query(&query).unwrap();
    let params = sha(b"{}");

    let run = |ocel: &Gall017Ocel| {
        let input = encode_gall017_input(&query, ocel);
        let ws: Vec<_> = hosts
            .iter()
            .map(|h| witness_gall017(h, &module, &query, ocel, &input).unwrap())
            .collect();
        let subject = PortableProcessSubject::new(&query.digest(), &module, &input, &params);
        (
            qualify_portable_execution(&subject, &module, &ws).unwrap(),
            ws,
        )
    };
    let (receipt, ws) = run(&ocel);
    assert_eq!(receipt.verify_digest(), Ok(()));
    let engines: BTreeSet<RuntimeEngine> = receipt.runtimes.iter().map(|r| r.engine).collect();
    assert_eq!(engines.len(), hosts.len());
    assert_eq!(
        receipt.host_imports,
        vec![
            ("wasi_snapshot_preview1".to_string(), "fd_read".to_string()),
            ("wasi_snapshot_preview1".to_string(), "fd_write".to_string())
        ]
    );
    // Performance is observed per engine and excluded from identity.
    assert!(ws.iter().all(|w| w.wall_nanos() > 0));

    let mut permuted = ocel.clone();
    permuted.events.reverse();
    for e in &mut permuted.events {
        e.objects.reverse();
    }
    let (permuted_receipt, _) = run(&permuted);
    assert_ne!(permuted_receipt.input_digest, receipt.input_digest);
    assert_ne!(permuted_receipt.subject_digest, receipt.subject_digest);
    assert_eq!(
        permuted_receipt.semantic_result_digest,
        receipt.semantic_result_digest
    );

    // Raw outputs differ under permutation; only the canonical result is equal.
    let raw = |o: &Gall017Ocel| {
        execute(
            &hosts[0],
            &module,
            &encode_gall017_input(&query, o),
            &BTreeSet::new(),
        )
        .unwrap()
        .stdout
    };
    assert_ne!(raw(&ocel), raw(&permuted));
}

#[test]
fn gall_021_module_bytes_or_parameters_change_subject_identity() {
    let q1 = Gall017Query::from_json(br#"{"activity":"ship"}"#).unwrap();
    let q2 = Gall017Query::from_json(br#"{"activity":"ship","require_match":false}"#).unwrap();
    let (m1, m2) = (
        lower_gall017_query(&q1).unwrap(),
        lower_gall017_query(&q2).unwrap(),
    );
    assert_ne!(m1.digest(), m2.digest());
    let input = b"x";
    let s1 = PortableProcessSubject::new(&q1.digest(), &m1, input, &sha(b"p1"));
    let s2 = PortableProcessSubject::new(&q1.digest(), &m2, input, &sha(b"p1"));
    let s3 = PortableProcessSubject::new(&q1.digest(), &m1, input, &sha(b"p2"));
    assert_ne!(s1.digest(), s2.digest());
    assert_ne!(s1.digest(), s3.digest());
    // One changed byte in the module is a different artifact.
    let mut bytes = m1.bytes().to_vec();
    let last = bytes.len() - 1;
    bytes[last] ^= 1;
    assert_ne!(PortableModule::from_bytes(bytes).digest(), m1.digest());
}

/// A real module that imports `clock_time_get` (plus the GALL subject
/// section), built with the same encoder the lowering uses.
fn clock_module() -> PortableModule {
    use wasm_encoder::*;
    let mut types = TypeSection::new();
    types
        .ty()
        .function([ValType::I32, ValType::I64, ValType::I32], [ValType::I32]);
    types.ty().function([], []);
    let mut imports = ImportSection::new();
    imports.import(
        "wasi_snapshot_preview1",
        "clock_time_get",
        EntityType::Function(0),
    );
    let mut functions = FunctionSection::new();
    functions.function(1);
    let mut memories = MemorySection::new();
    memories.memory(MemoryType {
        minimum: 1,
        maximum: Some(1),
        memory64: false,
        shared: false,
        page_size_log2: None,
    });
    let mut exports = ExportSection::new();
    exports.export("memory", ExportKind::Memory, 0);
    exports.export("_start", ExportKind::Func, 1);
    let mut code = CodeSection::new();
    let mut f = Function::new([]);
    f.instructions()
        .i32_const(0)
        .i64_const(0)
        .i32_const(0)
        .call(0)
        .drop()
        .end();
    code.function(&f);
    let section = serde_json::json!({
        "schema": "gall.wasm-lowering/1",
        "kind": "clock-probe",
        "source_digest": sha(b"clock"),
        "compiler_digest": sha(b"test"),
        "symbols": []
    });
    let mut module = Module::new();
    module
        .section(&types)
        .section(&imports)
        .section(&functions)
        .section(&memories)
        .section(&exports)
        .section(&code)
        .section(&CustomSection {
            name: "gall.subject".into(),
            data: serde_json::to_vec(&section).unwrap().into(),
        });
    PortableModule::from_bytes(module.finish())
}

#[test]
fn gall_021_unbound_clock_import_is_refused_before_execution() {
    let module = clock_module();
    let fence = inspect_module(&module).unwrap().host_fence;
    assert!(fence.clock);
    let subject = PortableProcessSubject::new(&sha(b"clock"), &module, b"", &sha(b"{}"));
    assert_eq!(
        qualify_portable_execution(&subject, &module, &[]),
        Err(PortabilityRefusal::UnboundHostCapability("clock".into()))
    );
    for host in discover_runtimes() {
        assert_eq!(
            execute(&host, &module, b"", &BTreeSet::new()),
            Err(PortabilityRefusal::UnboundHostCapability("clock".into())),
            "{}",
            host.version
        );
    }
    // Explicitly binding the clock lets the fence pass; the restricted JS host
    // still offers no clock, so V8/JSC fail to instantiate rather than run it.
    let bound: BTreeSet<String> = ["clock".to_string()].into_iter().collect();
    for host in discover_runtimes() {
        if host.engine != RuntimeEngine::Cranelift {
            assert!(matches!(
                execute(&host, &module, b"", &bound),
                Err(PortabilityRefusal::RuntimeFailure(_))
            ));
        }
    }
}

#[test]
fn gall_021_raw_witnesses_detect_nothing_but_real_divergence() {
    let Some(hosts) = hosts("gall_021_raw") else {
        return;
    };
    let subject =
        PowlSubject::from_gall016_json(br#"{"type":"choice","children":["a","b"]}"#).unwrap();
    let module = lower_powl(&subject).unwrap();
    let input = [0u8, TRACE_END, 1, TRACE_END, 0, 1, TRACE_END];
    let ws = witness_raw(&hosts, &module, &input, &BTreeSet::new()).unwrap();
    assert!(ws.iter().all(|w| w.canonical_result() == b"110"));
    let s = PortableProcessSubject::new(subject.source_digest(), &module, &input, &sha(b"{}"));
    assert!(qualify_portable_execution(&s, &module, &ws).is_ok());
    // Oversized input traps in-module (never truncated silently).
    let huge = vec![0u8; 1 << 20];
    assert!(matches!(
        execute(&hosts[0], &module, &huge, &BTreeSet::new()),
        Err(PortabilityRefusal::RuntimeFailure(_))
    ));
}

// ---------------------------------------------------------------------------
// GALL-023
// ---------------------------------------------------------------------------

#[test]
fn gall_023_reference_matches_ex4pm_expected_verdicts() {
    let c = corpus();
    let ocel = Gall017Ocel::from_value(&c["ocel"]).unwrap();
    for case in c["ocpq_cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let query = Gall017Query::from_json(&serde_json::to_vec(&case["query"]).unwrap()).unwrap();
        let result = gall017_reference_evaluate(&ocel, &query);
        assert_eq!(result.standing, case["expected_standing"], "{id}");
        let ids: Vec<&str> = result
            .bindings
            .iter()
            .map(|b| b.event_id.as_str())
            .collect();
        let expected: Vec<&str> = case["expected_bindings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(ids, expected, "{id}");
        if result.standing == "violation" {
            assert_eq!(result.violations[0].class, "missing_required_binding");
        }
    }
    let e2 = gall017_reference_evaluate(
        &ocel,
        &Gall017Query::from_json(&serde_json::to_vec(&c["ocpq_cases"][0]["query"]).unwrap())
            .unwrap(),
    );
    assert!(e2.bindings[0]
        .objects
        .contains(&("item:1".into(), "item".into(), "contains".into())));
}

#[test]
fn gall_023_corpus_executed_on_engines_matches_reference() {
    let Some(hosts) = hosts("gall_023_corpus") else {
        return;
    };
    let c = corpus();
    let ocel = Gall017Ocel::from_value(&c["ocel"]).unwrap();
    let mut permuted = ocel.clone();
    permuted.events.reverse();
    for case in c["ocpq_cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let query = Gall017Query::from_json(&serde_json::to_vec(&case["query"]).unwrap()).unwrap();
        let module = lower_gall017_query(&query).unwrap();
        let mut digests = BTreeSet::new();
        for subject in [&ocel, &permuted] {
            let input = encode_gall017_input(&query, subject);
            let ws: Vec<_> = hosts
                .iter()
                .map(|h| witness_gall017(h, &module, &query, subject, &input).unwrap())
                .collect();
            let receipt = qualify_ocpq(&query, subject, &corpus_digest(), &module, &input, &ws)
                .unwrap_or_else(|e| panic!("{id}: {e:?}"));
            assert_eq!(receipt.corpus_digest, corpus_digest());
            assert_eq!(receipt.module_digest, module.digest());
            assert_eq!(
                receipt.reference_result_digest,
                receipt.portable_result_digest
            );
            digests.insert(receipt.portable_result_digest);
        }
        assert_eq!(
            digests.len(),
            1,
            "{id}: permutation changed the canonical result"
        );
    }
}

#[test]
fn gall_023_unsupported_operator_is_unsupported() {
    assert_eq!(
        Gall017Query::from_json(br#"{"activity":"ship","within_seconds":5}"#),
        Err(PortabilityRefusal::UnsupportedOcpqOperator(
            "within_seconds".into()
        ))
    );
}

/// Regression bound (bench receipt): sorting canonical bindings by their
/// total order must stay >= 5x faster than the pre-hardening digest-keyed
/// comparison sort at n = 10000.
#[test]
fn gall_023_canonical_sort_regression_bound_vs_digest_key_sort() {
    let make = || -> Vec<Gall017Binding> {
        (0..10_000u32)
            .rev()
            .map(|i| Gall017Binding {
                event_id: format!("e{i:06}"),
                activity: Some("ship".into()),
                sequence: Some(i64::from(i)),
                objects: vec![(format!("o{i}"), "order".into(), "target".into())],
            })
            .collect()
    };
    let digest = |b: &Gall017Binding| sha(&serde_json::to_vec(b).unwrap());
    let mut ord = make();
    let t = std::time::Instant::now();
    ord.sort();
    let ord_time = t.elapsed();
    let mut keyed = make();
    let t = std::time::Instant::now();
    keyed.sort_by_key(digest);
    let keyed_time = t.elapsed();
    assert!(ord.windows(2).all(|w| w[0] < w[1]));
    let ratio = keyed_time.as_secs_f64() / ord_time.as_secs_f64().max(1e-9);
    eprintln!("ord_sort {ord_time:?} digest_key_sort {keyed_time:?} ratio {ratio:.1}x");
    assert!(ratio >= 5.0, "ratio {ratio:.2}x < 5x");
}
