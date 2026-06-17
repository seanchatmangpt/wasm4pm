//! Stop hook: block if ggen-generated surfaces have uncommitted changes.
//!
//! Read-only — never calls ggen sync. Uses `git diff --quiet HEAD` which
//! short-circuits on the first difference, avoiding a full index scan.

use serde_json::json;
use std::path::PathBuf;
use std::process::Command;

const GGEN_SURFACES: &[&str] = &[
    "crates/wasm4pm-cognition/src/breeds/registration.rs",
    "crates/wasm4pm-cognition/breeds/registry.json",
    "packages/cognition/src/breed-ids.ts",
    "crates/wasm4pm-cognition/tests/paper_pointers_generated.rs",
    "crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs",
];

fn main() {
    let project_dir = match std::env::var("CLAUDE_PROJECT_DIR") {
        Ok(d) => PathBuf::from(d),
        Err(_) => return,
    };

    // `git diff --quiet HEAD -- <files>` exits 1 if any surface differs from HEAD.
    // Faster than `git status` — no untracked-file scan, stops at first diff.
    let mut cmd = Command::new("git");
    cmd.current_dir(&project_dir)
        .arg("diff")
        .arg("--quiet")
        .arg("HEAD")
        .arg("--");
    for surface in GGEN_SURFACES {
        cmd.arg(surface);
    }

    match cmd.status() {
        Ok(status) if !status.success() => {
            let block = json!({
                "decision": "block",
                "reason": "ggen-generated surfaces have uncommitted changes. Run: just ggen-gate — then commit the regenerated files before stopping."
            });
            println!("{}", block);
        }
        _ => {}
    }
}
