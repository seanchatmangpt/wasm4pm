import sys

p = "/Users/sac/.gemini/antigravity-cli/brain/513152de-e09f-49fa-a3d9-d7006bc76b0e/.system_generated/worktrees/subagent-P2-Constraints-Dev-self-25caf238/crates/wasm4pm-cognition/tests/breed_determinism.rs"

with open(p, "r") as f:
    content = f.read()

target = """        rules: vec![
            Rule {
                id: "r-burg".into(),
                premise: vec![],
                conclusion: "Burglary=true".into(),
                certainty: 0.001,
            },
            Rule {
                id: "r-eq".into(),
                premise: vec![],
                conclusion: "Earthquake=true".into(),
                certainty: 0.002,
            },
        ],"""

replacement = """        facts: vec![
            Fact { key: "cpt:Burglary".into(), value: "0.001".into() },
            Fact { key: "cpt:Earthquake".into(), value: "0.002".into() },
            Fact { key: "cpt:Alarm|Burglary,Earthquake".into(), value: "0.95,0.94,0.29,0.001".into() },
            Fact { key: "cpt:JohnCalls|Alarm".into(), value: "0.90,0.05".into() },
            Fact { key: "cpt:MaryCalls|Alarm".into(), value: "0.70,0.01".into() },
            Fact { key: "evidence:JohnCalls".into(), value: "true".into() },
            Fact { key: "evidence:MaryCalls".into(), value: "true".into() }
        ],
        rules: vec![],"""

if target in content:
    content = content.replace(target, replacement)
    with open(p, "w") as f:
        f.write(content)
    print("Patched bayesian network")
else:
    print("Target not found")
