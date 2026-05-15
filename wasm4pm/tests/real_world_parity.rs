use wasm4pm::advanced::alphappp::{discover_alpha_ppp, AlphaPPPConfig};
use wasm4pm::advanced::oc_declare::{discover_oc_declare, OCDeclareOptions};
use wasm4pm::advanced::ocdfg::OCDirectlyFollowsGraph;
use wasm4pm::advanced::ocla::OCLanguageAbstraction;
use wasm4pm::models::{OCEL, EventLog};
use wasm4pm::xes_format::parse_xes;
use std::fs;

#[test]
fn test_real_world_xes_and_alphappp() {
    // 1. Load real XES dataset (BPI 2020 Travel)
    let xes_path = "bench_data/bpi2020_travel.xes";
    let xes_path_alt = "../bench_data/bpi2020_travel.xes";
    let path = if std::path::Path::new(xes_path).exists() {
        xes_path
    } else if std::path::Path::new(xes_path_alt).exists() {
        xes_path_alt
    } else {
        println!("Skipping real-world XES test: dataset not found");
        return;
    };
    
    let xes_content = fs::read_to_string(path).expect("Failed to read dataset");

    // Test the high-performance core parser
    let log = parse_xes(&xes_content).expect("Failed to parse XES natively");

    assert!(log.traces.len() > 0, "Log should have traces");

    // 2. Run Alpha+++ discovery
    let config = AlphaPPPConfig {
        absolute_df_clean_thresh: 5, // Filter out rare edges
        ..Default::default()
    };

    let petri_net = discover_alpha_ppp(&log, config, "concept:name");

    // Assert Alpha+++ produced a structurally sound model
    assert!(petri_net.transitions.len() > 0, "Should discover transitions");
    assert!(petri_net.places.len() > 0, "Should discover places");
    assert!(petri_net.arcs.len() > 0, "Should discover arcs");
}

#[test]
fn test_real_world_ocel_and_advanced_algorithms() {
    // 1. Load real OCEL JSON dataset (Order Management example)
    let json_path = "bench_data/ocel20_example.jsonocel";
    let json_path_alt = "../bench_data/ocel20_example.jsonocel";
    let path = if std::path::Path::new(json_path).exists() {
        json_path
    } else if std::path::Path::new(json_path_alt).exists() {
        json_path_alt
    } else {
        println!("Skipping real-world OCEL test: dataset not found");
        return;
    };

    let json_content = fs::read_to_string(path).expect("Failed to read OCEL dataset");

    // Test the robust OCEL JSON parser natively
    let ocel: OCEL = serde_json::from_str(&json_content).expect("Failed to parse OCEL JSON natively");

    assert!(ocel.events.len() > 0, "OCEL should have events");
    assert!(ocel.objects.len() > 0, "OCEL should have objects");

    // 2. Test OC-DFG Flattening and Discovery
    let oc_dfg = OCDirectlyFollowsGraph::discover(&ocel);
    assert!(oc_dfg.dfgs.len() > 0, "Should discover DFGs for object types");

    // 3. Test OCLA Abstraction
    let ocla = OCLanguageAbstraction::create_from_ocel(&ocel);
    assert!(!ocla.start_ev_types.is_empty(), "Should find start event types");

    // 4. Test OC-DECLARE Rule Discovery
    let options = OCDeclareOptions { noise_threshold: 0.1 };
    let rules = discover_oc_declare(&ocel, options);
    assert!(rules.len() > 0, "Should discover declarative rules");
}
