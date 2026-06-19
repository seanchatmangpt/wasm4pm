use wasm4pm_cognition::breeds::{dispatch::dispatch_breed_test, BreedInput, Fact};

#[test]
fn test_version_space_mitchell_1982() {
    let input = BreedInput {
        intent: "EnjoySport".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "vs:attrs".into(),
                value: "Sky, AirTemp, Humidity, Wind, Water, Forecast".into(),
            },
            // 1. (Sunny, Warm, Normal, Strong, Warm, Same), +
            Fact {
                key: "vs:example:1".into(),
                value: "Sunny, Warm, Normal, Strong, Warm, Same:+".into(),
            },
            // 2. (Sunny, Warm, High, Strong, Warm, Same), +
            Fact {
                key: "vs:example:2".into(),
                value: "Sunny, Warm, High, Strong, Warm, Same:+".into(),
            },
            // 3. (Rainy, Cold, High, Strong, Warm, Change), -
            Fact {
                key: "vs:example:3".into(),
                value: "Rainy, Cold, High, Strong, Warm, Change:-".into(),
            },
            // 4. (Sunny, Warm, High, Strong, Cool, Change), +
            Fact {
                key: "vs:example:4".into(),
                value: "Sunny, Warm, High, Strong, Cool, Change:+".into(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = dispatch_breed_test("version_space", &input).expect("VS run failed");

    for step in &output.inference_trace {
        println!("{:?}", step.detail);
    }

    let s = output.facts.iter().find(|f| f.key == "vs:S").unwrap();
    assert_eq!(s.value, "Sunny,Warm,?,Strong,?,?");
}
