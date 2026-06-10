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
        "tableaux" => Some(include_str!("../../../../ocel/models/l1/tableaux.ocpn.json")),
        "construction_grammar" => Some(include_str!("../../../../ocel/models/l1/construction_grammar.ocpn.json")),
        "markov_logic" => Some(include_str!("../../../../ocel/models/l1/markov_logic.ocpn.json")),
        "pomdp" => Some(include_str!("../../../../ocel/models/l1/pomdp.ocpn.json")),
        "contingent_plan" => Some(include_str!("../../../../ocel/models/l1/contingent_plan.ocpn.json")),
        "meta_reasoning" => Some(include_str!("../../../../ocel/models/l1/meta_reasoning.ocpn.json")),
        _ => None,
    }
}
