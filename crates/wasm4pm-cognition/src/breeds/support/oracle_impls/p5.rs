//! [`BreedOracle`] implementations for the P5-tier breeds: Morphological
//! (Zwicky GMA), OcpmRouteDiscoverer, Triz.
//!
//! All novel content uses fresh `uo_*` names that appear in no public fixture
//! (defeats A1/A2). Every `novel_input()` here is routed through
//! `dispatch_breed_id` (full lawful path: preconditions → run →
//! postconditions → OCEL gate against the P5 lifecycle models in
//! `ocel/models_p5.rs`), so inputs are also verified to satisfy the breeds'
//! own lifecycle contracts.

use crate::breeds::morphological::Morphological;
use crate::breeds::ocpm_route_discoverer::OcpmRouteDiscoverer;
use crate::breeds::triz::Triz;
use crate::breeds::support::oracle::{BreedAdversary, BreedOracle};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{BreedId, BreedInput, BreedOutput, Fact, Rule};

use super::base;
use super::rule_fact::cheat_output;

fn fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.to_string(),
        value: value.to_string(),
    }
}

fn rule(id: &str, premise: &[&str], conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.to_string(),
        premise: premise.iter().map(|p| p.to_string()).collect(),
        conclusion: conclusion.to_string(),
        certainty,
    }
}

// ---------------------------------------------------------------------------
// Morphological — Zwicky field construction + cross-consistency assessment
// ---------------------------------------------------------------------------

impl BreedOracle for Morphological {
    fn kind_vocabulary() -> &'static [&'static str] {
        &[
            "define-parameter",
            "compute-field-size",
            "cca-assess",
            "synthesize-solution-space",
        ]
    }

    fn breed_id() -> BreedId {
        BreedId::Morphological
    }

    /// 2x2 field with one CCA exclusion judgment (exercises the full
    /// define → field-size → cca → synthesize lifecycle).
    fn novel_input() -> BreedInput {
        let mut input = base("uo_morphological design");
        input.facts = vec![
            fact("morph:param:uo_alpha", "uo_a|uo_b"),
            fact("morph:param:uo_beta", "uo_x|uo_y"),
            fact("morph:exclude", "uo_alpha=uo_a|uo_beta=uo_x"),
        ];
        input
    }

    /// Exclusion present (3 of 4 consistent) vs absent (4 of 4) — outputs
    /// differ in synthesize detail, solution space, and reduction bp.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        (Self::novel_input(), {
            let mut without = base("uo_morphological design");
            without.facts = vec![
                fact("morph:param:uo_alpha", "uo_a|uo_b"),
                fact("morph:param:uo_beta", "uo_x|uo_y"),
            ];
            without
        })
    }

    /// One parameter violates "two or more parameters" (Ritchey 2011 §2.3).
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_morphological design");
        input.facts = vec![fact("morph:param:uo_alpha", "uo_a|uo_b")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("define-parameter", 1)?;
        trace.require_at_least("compute-field-size", 1)?;
        trace.require_at_least("synthesize-solution-space", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let size = trace
            .detail_of("compute-field-size")
            .ok_or_else(|| "missing compute-field-size step".to_string())?;
        if size != "2 x 2 = 4" {
            return Err(format!(
                "compute-field-size must be the exact product '2 x 2 = 4', got '{}'",
                size
            ));
        }
        let cca = trace
            .detail_of("cca-assess")
            .ok_or_else(|| "missing cca-assess step".to_string())?;
        if cca != "uo_alpha=uo_a x uo_beta=uo_x -> excluded in 1 configurations" {
            return Err(format!(
                "cca-assess must record the exclusion with its exact weed-out count, got '{}'",
                cca
            ));
        }
        let synth = trace
            .detail_of("synthesize-solution-space")
            .ok_or_else(|| "missing synthesize-solution-space step".to_string())?;
        if synth != "3 of 4 configurations internally consistent (2500 bp reduced)" {
            return Err(format!(
                "synthesize must record 3 of 4 consistent at 2500 bp reduced, got '{}'",
                synth
            ));
        }
        Ok(())
    }
}

/// AC-FLAT: emits the full morphological lifecycle kinds with hollow values.
pub struct CheatMorphological;
impl BreedAdversary for CheatMorphological {
    type Target = Morphological;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Morphological,
            &[
                ("define-parameter", "uo_flat"),
                ("compute-field-size", "uo_flat"),
                ("cca-assess", "uo_flat"),
                ("synthesize-solution-space", "uo_flat"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

// ---------------------------------------------------------------------------
// OcpmRouteDiscoverer — object-centric lifecycle route discovery
// ---------------------------------------------------------------------------

impl BreedOracle for OcpmRouteDiscoverer {
    fn breed_id() -> BreedId {
        BreedId::OcpmRouteDiscoverer
    }

    fn kind_vocabulary() -> &'static [&'static str] {
        &["process-event", "discover-route", "discover-route-empty"]
    }

    /// Two objects sharing events; routes discovered in BTreeMap order, so
    /// the FIRST discover-route step is `uo_i1` (sorts before `uo_o1`).
    fn novel_input() -> BreedInput {
        let mut input = base("uo_ocpm discover routes");
        input.facts = vec![
            fact("event", "id=uo_e1|activity=uo_create|objects=uo_o1,uo_i1"),
            fact("event", "id=uo_e2|activity=uo_pay|objects=uo_o1"),
            fact("event", "id=uo_e3|activity=uo_ship|objects=uo_i1"),
        ];
        input
    }

    /// Second event changes uo_o1's route (uo_pay vs uo_cancel) — outputs
    /// differ in the route facts and discover-route details.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        (Self::novel_input(), {
            let mut variant = base("uo_ocpm discover routes");
            variant.facts = vec![
                fact("event", "id=uo_e1|activity=uo_create|objects=uo_o1,uo_i1"),
                fact("event", "id=uo_e2|activity=uo_cancel|objects=uo_o1"),
                fact("event", "id=uo_e3|activity=uo_ship|objects=uo_i1"),
            ];
            variant
        })
    }

    /// Empty facts violates "requires at least one event fact".
    fn refusal_input() -> BreedInput {
        base("uo_ocpm discover routes")
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("process-event", 1)?;
        trace.require_at_least("discover-route", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let route = trace
            .detail_of("discover-route")
            .ok_or_else(|| "missing discover-route step".to_string())?;
        // BTreeMap ordering: uo_i1 < uo_o1, so the first discovered route is
        // uo_i1's — pinning this catches cheats that emit unordered routes.
        if route != "Discovered route for uo_i1: uo_create->uo_ship" {
            return Err(format!(
                "first discover-route must be uo_i1's lifecycle in BTreeMap order, got '{}'",
                route
            ));
        }
        Ok(())
    }
}

/// AC-FLAT: emits process-event/discover-route kinds with hollow values.
pub struct CheatOcpmRouteDiscoverer;
impl BreedAdversary for CheatOcpmRouteDiscoverer {
    type Target = OcpmRouteDiscoverer;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::OcpmRouteDiscoverer,
            &[
                ("process-event", "uo_flat"),
                ("discover-route", "uo_flat"),
            ],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-FLAT"
    }
}

// ---------------------------------------------------------------------------
// Triz — contradiction matrix + inventive principles
// ---------------------------------------------------------------------------

impl BreedOracle for Triz {
    fn kind_vocabulary() -> &'static [&'static str] {
        &[
            "physical-contradiction",
            "technical-contradiction",
            "no-matrix-entry",
        ]
    }

    fn breed_id() -> BreedId {
        BreedId::Triz
    }

    /// Technical contradiction resolved by a caller-supplied matrix rule
    /// (not the embedded Altshuller subset — the pair is fresh `uo_*`).
    fn novel_input() -> BreedInput {
        let mut input = base("uo_triz resolve");
        input.facts = vec![
            fact("improving", "uo_weight"),
            fact("worsening", "uo_strength"),
        ];
        input.rules = vec![rule(
            "uo_m1",
            &["improving=uo_weight", "worsening=uo_strength"],
            "principles=uo_p40,uo_p26",
            1.0,
        )];
        input
    }

    /// Caller-supplied rule present (resolves to principles) vs absent
    /// (no-matrix-entry, empty selection) — outputs differ.
    fn boundary_pair() -> (BreedInput, BreedInput) {
        (Self::novel_input(), {
            let mut unresolved = base("uo_triz resolve");
            unresolved.facts = vec![
                fact("improving", "uo_weight"),
                fact("worsening", "uo_strength"),
            ];
            unresolved
        })
    }

    /// Missing 'worsening' fact violates TRIZ preconditions.
    fn refusal_input() -> BreedInput {
        let mut input = base("uo_triz resolve");
        input.facts = vec![fact("improving", "uo_weight")];
        input
    }

    fn assert_intermediate(_k: usize, trace: &TraceQuery<'_>) -> Result<(), String> {
        trace.require_at_least("technical-contradiction", 1)?;
        Ok(())
    }

    fn assert_trace_values(trace: &TraceQuery<'_>) -> Result<(), String> {
        let detail = trace
            .detail_of("technical-contradiction")
            .ok_or_else(|| "missing technical-contradiction step".to_string())?;
        if detail != "matrix lookup (caller-supplied): uo_weight vs uo_strength -> \
                      principles=uo_p40,uo_p26"
        {
            return Err(format!(
                "technical-contradiction must record the caller-supplied matrix lookup of \
                 uo_weight vs uo_strength, got '{}'",
                detail
            ));
        }
        Ok(())
    }
}

/// AC-TABLE: canned technical-contradiction step — no improving/worsening
/// values, no resolution.
pub struct CheatTriz;
impl BreedAdversary for CheatTriz {
    type Target = Triz;
    fn run_cheat(_input: &BreedInput) -> BreedOutput {
        cheat_output(
            BreedId::Triz,
            &[("technical-contradiction", "uo_flat")],
        )
    }
    fn cheat_code() -> &'static str {
        "AC-TABLE"
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use crate::breeds::dispatch::dispatch_breed_id;
    use crate::breeds::support::oracle::run_adversary_check;

    /// Run the real breed on its novel input and assert the Surface-3
    /// value-level assertions accept the genuine trace.
    fn assert_real_trace_ok<B: BreedOracle>() {
        let output = dispatch_breed_id(B::breed_id(), &B::novel_input())
            .unwrap_or_else(|e| panic!("{:?} novel_input run failed: {}", B::breed_id(), e));
        let tq = TraceQuery::new(&output.inference_trace);
        B::assert_trace_values(&tq).unwrap_or_else(|e| {
            panic!(
                "{:?} assert_trace_values rejected real trace: {}",
                B::breed_id(),
                e
            )
        });
    }

    macro_rules! oracle_pair_test {
        ($name:ident, $breed:ty, $cheat:ty) => {
            #[test]
            fn $name() {
                assert_real_trace_ok::<$breed>();
                let r = run_adversary_check::<$cheat>();
                assert!(
                    r.is_pass(),
                    "{} cheat was not rejected by the oracle",
                    <$cheat as BreedAdversary>::cheat_code()
                );
            }
        };
    }

    oracle_pair_test!(
        morphological_values_and_adversary,
        Morphological,
        CheatMorphological
    );
    oracle_pair_test!(
        ocpm_route_discoverer_values_and_adversary,
        OcpmRouteDiscoverer,
        CheatOcpmRouteDiscoverer
    );
    oracle_pair_test!(triz_values_and_adversary, Triz, CheatTriz);
}
