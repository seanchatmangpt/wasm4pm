use wasm4pm_cognition::breeds::{dispatch_breed_test, BreedInput, Fact};

#[test]
fn test_version_space_mitchell_1982() {
    let mut input = BreedInput {
        intent: "Enjoy Sport Mitchell 1982".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "attribute".into(), value: "Sky: Sunny, Cloudy, Rainy".into() },
            Fact { key: "attribute".into(), value: "AirTemp: Warm, Cold".into() },
            Fact { key: "attribute".into(), value: "Humidity: Normal, High".into() },
            Fact { key: "attribute".into(), value: "Wind: Strong, Weak".into() },
            Fact { key: "attribute".into(), value: "Water: Warm, Cool".into() },
            Fact { key: "attribute".into(), value: "Forecast: Same, Change".into() },
            // 1. (Sunny, Warm, Normal, Strong, Warm, Same), +
            Fact { key: "example".into(), value: "Sky=Sunny, AirTemp=Warm, Humidity=Normal, Wind=Strong, Water=Warm, Forecast=Same, positive".into() },
            // 2. (Sunny, Warm, High, Strong, Warm, Same), +
            Fact { key: "example".into(), value: "Sky=Sunny, AirTemp=Warm, Humidity=High, Wind=Strong, Water=Warm, Forecast=Same, positive".into() },
            // 3. (Rainy, Cold, High, Strong, Warm, Change), -
            Fact { key: "example".into(), value: "Sky=Rainy, AirTemp=Cold, Humidity=High, Wind=Strong, Water=Warm, Forecast=Change, negative".into() },
            // 4. (Sunny, Warm, High, Strong, Cool, Change), +
            Fact { key: "example".into(), value: "Sky=Sunny, AirTemp=Warm, Humidity=High, Wind=Strong, Water=Cool, Forecast=Change, positive".into() },
            Fact { key: "classify".into(), value: "Sky=Sunny, AirTemp=Warm, Humidity=Normal, Wind=Strong, Water=Warm, Forecast=Same".into() },
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
    
    assert_eq!(output.selected.as_deref(), Some("positive"));
}
