//! eyerun_wasi — the dissertation's admission-gate binary, now real.
//!
//! Usage: `eyerun_wasi <ruleset.json> <candidate.json>`
//! Both files are read fully into memory (size-guarded), parsed, evaluated
//! under `catch_unwind`. Exit code is always 0; the JSON verdict on stdout is
//! the decision (trap -> typed refusal, fail-closed).

use std::process::ExitCode;

use eu_gate::{evaluate_checked, Verdict};

fn emit(v: &Verdict) {
    println!("{}", serde_json::to_string(v).unwrap_or_else(|_| {
        // Serialization of our own enum cannot fail, but the gate never
        // trusts that: fail closed even here.
        "{\"verdict\":\"REFUSED\",\"code\":\"REFUSED_INFRASTRUCTURE_FAULT\"}".to_string()
    }));
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        emit(&Verdict::infra_fault());
        return ExitCode::SUCCESS;
    }

    let read = std::panic::catch_unwind(|| -> Option<(Vec<u8>, Vec<u8>)> {
        let ruleset = std::fs::read(&args[1]).ok()?;
        let candidate = std::fs::read(&args[2]).ok()?;
        Some((ruleset, candidate))
    });

    let verdict = match read {
        Ok(Some((r, c))) => evaluate_checked(&r, &c),
        _ => Verdict::infra_fault(),
    };

    emit(&verdict);
    ExitCode::SUCCESS
}
