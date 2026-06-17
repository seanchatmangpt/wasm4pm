fn main() {}

#[test]
fn test_debug() {
    let input: wasm4pm_cognition::breeds::BreedInput = serde_json::from_str(r#"{
      "intent": "Jaffar & Lassez 1987 - Constraint Logic Programming core propagation",
      "candidates": [],
      "facts": [
        { "key": "domain:X", "value": "1..3" },
        { "key": "domain:Y", "value": "1..3" },
        { "key": "domain:Z", "value": "1..3" },
        { "key": "constraint:X:<:Y", "value": "" },
        { "key": "constraint:Y:<:Z", "value": "" }
      ],
      "cases": [],
      "rules": [],
      "goals": [],
      "state": []
    }"#).unwrap();
    let breed = wasm4pm_cognition::breeds::clp::Clp;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let out = breed.run(&input).unwrap();
    println!("{:#?}", out);
}
