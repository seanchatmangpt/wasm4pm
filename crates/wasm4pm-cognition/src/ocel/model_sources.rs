/// Return the hand-authored OCPN model JSON source for a breed id, if any.
pub fn model_source(breed_id: &str) -> Option<&'static str> {
    match breed_id {
        "mycin" => Some(include_str!("../../../../ocel/models/l1/mycin.ocpn.json")),
        "prolog" => Some(include_str!("../../../../ocel/models/l1/prolog.ocpn.json")),
        "strips" => Some(include_str!("../../../../ocel/models/l1/strips.ocpn.json")),
        "soar" => Some(include_str!("../../../../ocel/models/l1/soar.ocpn.json")),
        "hearsay" => Some(include_str!("../../../../ocel/models/l1/hearsay.ocpn.json")),
        "cbr" => Some(include_str!("../../../../ocel/models/l1/cbr.ocpn.json")),
        "gps" => Some(include_str!("../../../../ocel/models/l1/gps.ocpn.json")),
        "dendral" => Some(include_str!("../../../../ocel/models/l1/dendral.ocpn.json")),
        "eliza" => Some(include_str!("../../../../ocel/models/l1/eliza.ocpn.json")),
        "autoinstinct_vision" => Some(include_str!("../../../../ocel/models/l1/autoinstinct_vision.ocpn.json")),
        "autoinstinct_semantics" => Some(include_str!("../../../../ocel/models/l1/autoinstinct_semantics.ocpn.json")),
        "autoinstinct_neurosis" => Some(include_str!("../../../../ocel/models/l1/autoinstinct_neurosis.ocpn.json")),
        "autoinstinct_learning" => Some(include_str!("../../../../ocel/models/l1/autoinstinct_learning.ocpn.json")),
        "htn_planning" => Some(include_str!("../../../../ocel/models/l1/htn_planning.ocpn.json")),
        "ltl_monitor" => Some(include_str!("../../../../ocel/models/l1/ltl_monitor.ocpn.json")),
        "allen_temporal" => Some(include_str!("../../../../ocel/models/l1/allen_temporal.ocpn.json")),
        "fuzzy_logic" => Some(include_str!("../../../../ocel/models/l1/fuzzy_logic.ocpn.json")),
        "bayesian_network" => Some(include_str!("../../../../ocel/models/l1/bayesian_network.ocpn.json")),
        "dempster_shafer" => Some(include_str!("../../../../ocel/models/l1/dempster_shafer.ocpn.json")),
        "pomdp" => Some(include_str!("../../../../ocel/models/l1/pomdp.ocpn.json")),
        "markov_logic" => Some(include_str!("../../../../ocel/models/l1/markov_logic.ocpn.json")),
        _ => None,
    }
}
