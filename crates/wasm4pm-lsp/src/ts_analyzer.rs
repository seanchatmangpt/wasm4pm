//! TypeScript file analysis for wasm4pm examples.
//!
//! Detects anti-patterns in `.ts` files that import from `@wasm4pm/` packages,
//! using the field contracts documented in `cognition-contracts.md`.

use crate::ConformanceIssue;

/// Detect wasm4pm anti-patterns in a TypeScript source file.
pub fn analyze_ts(content: &str) -> Vec<ConformanceIssue> {
    let mut issues = Vec::new();

    let has_wasm4pm = content.contains("@wasm4pm/") || content.contains("wasm4pm-cognition");
    if !has_wasm4pm {
        return issues;
    }

    let has_contract_call = content.contains("cognition_run(") || content.contains("cognition_verify(");

    // A2: WasmLoader used without reset between tests
    if content.contains("WasmLoader") && !content.contains("WasmLoader.reset()") && content.contains("describe(") {
        issues.push(ConformanceIssue {
            severity: "WARNING".to_string(),
            code: "WASM4PM-TS-A2".to_string(),
            message: "WasmLoader is a singleton — call WasmLoader.reset() between test suites".to_string(),
        });
    }

    // A3: missing await init() before API call
    if has_contract_call
        && !content.contains("await init(")
        && !content.contains("WasmLoader.getInstance")
    {
        issues.push(ConformanceIssue {
            severity: "ERROR".to_string(),
            code: "WASM4PM-TS-A3".to_string(),
            message: "Missing await init() before first wasm4pm WASM API call".to_string(),
        });
    }

    // A4: wrong field names on ContractResult
    // Always-wrong: wasm4pm-invented names that are never generic TypeScript
    for bad_field in &["exit_code", "receipt_chain"] {
        if content.contains(bad_field) {
            issues.push(ConformanceIssue {
                severity: "ERROR".to_string(),
                code: "WASM4PM-TS-A4".to_string(),
                message: format!(
                    "Field contract violation: `{}` does not exist on ContractResult — use status/output_hash/run_id/output",
                    bad_field
                ),
            });
        }
    }
    // Context-gated: common property names only flagged near a contract call
    if has_contract_call {
        let lines: Vec<&str> = content.lines().collect();
        let call_lines: Vec<usize> = lines.iter().enumerate()
            .filter(|(_, l)| l.contains("cognition_run(") || l.contains("cognition_verify("))
            .map(|(i, _)| i)
            .collect();
        for bad_field in &[".findings", ".decision", ".hash"] {
            for (i, line) in lines.iter().enumerate() {
                if line.contains(bad_field) {
                    let near = call_lines.iter().any(|&cl| i.abs_diff(cl) <= 5);
                    if near {
                        issues.push(ConformanceIssue {
                            severity: "WARNING".to_string(),
                            code: "WASM4PM-TS-A4".to_string(),
                            message: format!(
                                "Field contract violation: `{}` does not exist on ContractResult — use status/output_hash/run_id/output",
                                bad_field.trim_start_matches('.')
                            ),
                        });
                        break;
                    }
                }
            }
        }
    }

    // A5: FM-5 violation — mocking init.js in cognition tests
    if content.contains("vi.mock") && content.contains("init.js") {
        issues.push(ConformanceIssue {
            severity: "ERROR".to_string(),
            code: "WASM4PM-TS-FM5".to_string(),
            message: "FM-5 violation: never mock init.js in cognition tests — at least one integration test must use real WASM".to_string(),
        });
    }

    // A6: checking status === 'rejected' — only meaningful near cognition_verify
    let uses_cognition_verify = content.contains("cognition_verify(");
    if uses_cognition_verify
        && (content.contains("=== 'rejected'") || content.contains("=== \"rejected\""))
    {
        issues.push(ConformanceIssue {
            severity: "WARNING".to_string(),
            code: "WASM4PM-TS-A6".to_string(),
            message: "cognition_verify never emits status 'rejected' — check for 'has_findings' instead".to_string(),
        });
    }

    // LLM Cheat Detectors for TypeScript
    let is_test = content.contains("describe(") || content.contains("it(");
    
    // R1: Math.random() in production code
    if !is_test && content.contains("Math.random()") && !content.contains("@lint-allow-random") {
        issues.push(ConformanceIssue {
            severity: "ERROR".to_string(),
            code: "STRUCTURAL-FAKERY-R1".to_string(),
            message: "Math.random() in production source — non-deterministic, not cryptographic. Use crypto.getRandomValues().".to_string(),
        });
    }

    // R2: Short hashes
    // Basic heuristic: searching for `hash: "short"`
    // Using Regex in Rust would be better, but we do simple sub-string checks
    let short_hash_markers = ["hash: \"", "hash: '", "hash: `", "fingerprint: \"", "fingerprint: '", "fingerprint: `", "signature: \"", "signature: '", "signature: `", "_id: \"", "_id: '", "_id: `"];
    for marker in short_hash_markers.iter() {
        if let Some(idx) = content.find(marker) {
            let remainder = &content[idx + marker.len()..];
            let quote = marker.chars().last().unwrap();
            if let Some(end_idx) = remainder.find(quote) {
                let val = &remainder[..end_idx];
                if val.len() > 0 && val.len() < 64 && !val.contains("${") {
                    issues.push(ConformanceIssue {
                        severity: "ERROR".to_string(),
                        code: "STRUCTURAL-FAKERY-R2".to_string(),
                        message: format!("Short string ({} chars) assigned to hash/fingerprint/id field. BLAKE3 hashes must be 64 hex chars.", val.len()),
                    });
                }
            }
        }
    }

    // R3: Boolean Lies
    let bool_lies = ["optimal: true", "exact: true", "verified: true", "canonical: true"];
    let qualifies = ["simplified", "doesn't guarantee", "doesn\\'t guarantee", "approximat", "stub", "not optimal"];
    for lie in bool_lies.iter() {
        if content.contains(lie) {
            let lower_content = content.to_lowercase();
            for qual in qualifies.iter() {
                if lower_content.contains(qual) {
                    issues.push(ConformanceIssue {
                        severity: "ERROR".to_string(),
                        code: "STRUCTURAL-FAKERY-R3".to_string(),
                        message: format!("Boolean lie: '{}' with qualifying comment admitting it is not. Use computed value.", lie),
                    });
                    break;
                }
            }
        }
    }

    // R4: Stub Metrics
    let metrics = ["fitness:", "precision:", "generalization:", "simplicity:"];
    let stubs = ["fallback", "stub result", "not supported", "stub implementation"];
    if !is_test {
        for metric in metrics.iter() {
            if content.contains(metric) {
                let lower_content = content.to_lowercase();
                for stub in stubs.iter() {
                    if lower_content.contains(stub) {
                        issues.push(ConformanceIssue {
                            severity: "ERROR".to_string(),
                            code: "STRUCTURAL-FAKERY-R4".to_string(),
                            message: format!("Hardcoded quality metric '{}' in stub/fallback branch — this value is fabricated.", metric),
                        });
                        break;
                    }
                }
            }
        }
    }

    // Stub Markers in TS
    let ts_cheat_markers = ["TODO", "FIXME", "HACK", "STUB", "PLACEHOLDER", "XXX", "not implemented"];
    for marker in ts_cheat_markers.iter() {
        if content.contains(marker) {
            issues.push(ConformanceIssue {
                severity: "ERROR".to_string(),
                code: "STRUCTURAL-FAKERY-TS-MARKER".to_string(),
                message: format!("Forbidden placeholder token '{}' detected in TypeScript source.", marker),
            });
        }
    }

    // D2: TS command returns ok without calling kernel
    let is_command = content.contains("export async function main") || content.contains("export default async function") || content.contains("export const");
    if is_command && (content.contains("status: 'ok'") || content.contains("status: \"ok\"")) {
        let calls_kernel = content.contains("kernel.") || content.contains("wasm.") || content.contains("runAlgorithm") || content.contains(".run(");
        if !calls_kernel {
            issues.push(ConformanceIssue {
                severity: "ERROR".to_string(),
                code: "STRUCTURAL-FAKERY-D2".to_string(),
                message: "TS command returns 'ok' status but makes no kernel/WASM calls. This is a ghost implementation.".to_string(),
            });
        }
    }

    issues
}

/// Hover documentation for known wasm4pm TypeScript API functions.
pub fn hover_for_api_fn(fn_name: &str) -> Option<String> {
    match fn_name {
        "cognition_run" => Some(
            "**cognition_run(input)** → `ContractResult`\n\
             Input: `{ breed: string, contract: BreedInput, options?: { profile? } }`\n\
             Output fields: `status`, `breed`, `run_id`, `output_hash`, `replay_pointer`, `options_profile`, `output`\n\
             Success check: `status === 'ok'`".to_string()
        ),
        "cognition_verify" => Some(
            "**cognition_verify(input)** → `VerifyResult`\n\
             Output fields: `findings`, `status`\n\
             Status values: `'verified'` or `'has_findings'` (never `'rejected'`)".to_string()
        ),
        "system_build" => Some(
            "**system_build(input)** → `SystemBuildResult`\n\
             Output fields: `pareto_front`, `dominated`\n\
             Note: `.candidates` does not exist on this result.".to_string()
        ),
        "to_js_str" => Some(
            "**to_js_str(value)** — Preferred WASM output serializer.\n\
             `to_js()` returns `{}` on wasm32; use `to_js_str()` for all wasm32-compatible output.".to_string()
        ),
        _ => None,
    }
}

/// Extract exported symbol names from a TypeScript file for `documentSymbol`.
pub fn extract_ts_symbols(content: &str) -> Vec<(String, u32)> {
    let mut symbols = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("export const ")
            || trimmed.starts_with("export function ")
            || trimmed.starts_with("export class ")
            || trimmed.starts_with("export async function ")
            || trimmed.starts_with("export default function ")
            || trimmed.starts_with("export type ")
            || trimmed.starts_with("export interface ")
        {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let name_idx = parts.iter().position(|w| {
                !matches!(*w, "export" | "async" | "default" | "const" | "function" | "class" | "type" | "interface")
            });
            if let Some(ni) = name_idx {
                let raw = parts[ni];
                let name = raw.trim_end_matches(|c: char| !c.is_alphanumeric() && c != '_');
                if !name.is_empty() {
                    symbols.push((name.to_string(), line_idx as u32));
                }
            }
        }
    }
    symbols
}
