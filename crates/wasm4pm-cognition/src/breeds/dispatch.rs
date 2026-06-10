use crate::breeds::{
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    cbr::Cbr, dendral::Dendral, frame::Eliza, gps::Gps, hearsay::Hearsay, production_rules::Mycin,
    prolog::Prolog, soar::Soar, strips::Strips, BreedInput, BreedOutput, CognitionBreed, BreedId
};

/// Run a breed through its full lifecycle: preconditions → run → postconditions.
///
/// Enforces the `CognitionBreed` contract:
/// - `preconditions` must pass before execution begins (TPS fail-fast).
/// - `postconditions` must pass after execution (FM-5 fraud guard: empty
///   inference_trace is rejected as proof that real work did not occur).
pub fn run_breed(b: &dyn CognitionBreed, input: &BreedInput) -> Result<BreedOutput, String> {
    b.preconditions(input)
        .map_err(|e| format!("{}: precondition failed: {}", b.id(), e))?;
    let mut output = b
        .run(input)
        .map_err(|e| format!("{}: {}", e.breed, e.message))?;
    b.postconditions(&output)
        .map_err(|e| format!("{}: postcondition failed: {}", b.id(), e))?;

    // Derive OCEL and validate conformance (van der Aalst doctrine)
    let breed_id = format!("{}", b.id());
    let trace_str = serde_json::to_string(&output.inference_trace).unwrap_or_default();
    let tmp_run_id = blake3::hash(trace_str.as_bytes()).to_hex().to_string();
    let ocel_log = crate::ocel::derive_ocel(&breed_id, &tmp_run_id, &output.inference_trace);

    if let Some(model) = crate::ocel::lifecycle_model_for(&breed_id) {
        let conformance = crate::ocel::validate_ocel_alignment(&ocel_log, model);
        if !conformance.is_conforming {
            return Err(format!(
                "{}: OCEL conformance failure (fitness={:.3}): {}",
                breed_id,
                conformance.fitness,
                conformance.refusals.join("; ")
            ));
        }
    }

    output.ocel_log = Some(serde_json::to_value(&ocel_log).unwrap_or(serde_json::Value::Null));

    Ok(output)
}

/// Dispatch to the correct breed's `run()` method.
///
/// Each branch delegates to `run_breed`, which enforces pre- and post-conditions
/// so the empty-trace fraud signal is caught at the WASM boundary.
pub fn dispatch_breed(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    match breed {
        "eliza" => run_breed(&Eliza, input),
        "cbr" => run_breed(&Cbr, input),
        "dendral" => run_breed(&Dendral, input),
        "strips" => run_breed(&Strips, input),
        "prolog" => run_breed(&Prolog, input),
        "mycin" => run_breed(&Mycin, input),
        "gps" => run_breed(&Gps, input),
        "soar" => run_breed(&Soar, input),
        "hearsay" => run_breed(&Hearsay, input),
        "autoinstinct_neurosis" => run_breed(&AutoinstinctNeurosis, input),
        "autoinstinct_semantics" => run_breed(&AutoinstinctSemantics, input),
        "autoinstinct_vision" => run_breed(&AutoinstinctVision, input),
        "autoinstinct_learning" => run_breed(&AutoinstinctLearning, input),
        other => Err(format!("unknown breed: {}", other)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dispatch_exhaustiveness() {
        let input = crate::breeds::BreedInput {
            intent: "".to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        for breed in BreedId::ALL {
            let breed_str = breed.to_string();
            let res_dispatch = dispatch_breed(&breed_str, &input);
            let res_test = crate::breeds::dispatch_breed_test(&breed_str, &input);
            
            if let Err(e) = &res_dispatch {
                assert!(!e.starts_with("unknown breed"), "Breed missing from dispatch_breed: {}", breed_str);
            }
            if let Err(e) = &res_test {
                assert!(!e.starts_with("unknown breed"), "Breed missing from dispatch_breed_test: {}", breed_str);
            }
        }
    }
}
