use anyhow::{anyhow, Context, Result};
use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

use wasm4pm::prefix_conformance::{
    OrderingLaw, PrefixEvent, PrefixFinding, PrefixOracle, PrefixVerdict,
};

/// Fixture fallback path used when the caller's `--law` argument doesn't
/// resolve to a file on disk (spec fixture from the prefix_conformance
/// implementation phase).
const FIXTURE_LAW_PATH: &str = "fixtures/real/ggen-oracle-law/living-loop-6link.law.json";

#[derive(Subcommand, Debug)]
pub enum OracleCommands {
    /// one-shot: classify all cases, print OracleReport, exit non-zero on AndonPull
    Check {
        /// The OCEL tape to verify
        tape: String,
        /// The law to verify against
        #[clap(long)]
        law: String,
        /// Output format (human or json)
        #[clap(short, long, default_value = "human")]
        format: String,
    },
    /// tail the tape; emit one EarlyStop JSON object per line per first-DEAD case
    Watch {
        /// The OCEL tape to watch
        tape: String,
        /// The law to verify against
        #[clap(long)]
        law: String,
    },
}

/// Batch report — spec §8.1 (`docs/archive/2026-06-09/ggen-oracle/
/// 04-prefix-and-online-conformance.md`).
#[derive(Debug, Serialize, Deserialize)]
pub struct OracleReport {
    pub report_version: String,
    pub law_id: String,
    pub verdict: OracleVerdict,
    pub total_cases: usize,
    pub alive_cases: usize,
    pub dead_cases: usize,
    pub terminal_cases: usize,
    pub findings: Vec<PrefixFinding>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OracleVerdict {
    Admitted,
    AndonPull,
}

/// Streaming early-STOP record — spec §8.2.
#[derive(Debug, Serialize, Deserialize)]
struct EarlyStop {
    kind: &'static str,
    report_version: &'static str,
    law_id: String,
    case_id: String,
    tape_index: usize,
    verdict: &'static str,
    finding: PrefixFinding,
}

const REPORT_VERSION: &str = "ggen-oracle/1";

/// Load an [`OrderingLaw`] from `path`, falling back to the fixture law
/// bundled with the prefix_conformance implementation when `path` doesn't
/// exist on disk.
fn load_law(path: &str) -> Result<OrderingLaw> {
    let resolved = if Path::new(path).exists() {
        path.to_string()
    } else if Path::new(FIXTURE_LAW_PATH).exists() {
        FIXTURE_LAW_PATH.to_string()
    } else {
        path.to_string()
    };
    let raw = std::fs::read_to_string(&resolved)
        .with_context(|| format!("failed to read law file '{resolved}'"))?;
    serde_json::from_str(&raw).with_context(|| format!("failed to parse law file '{resolved}'"))
}

/// Normalize a `case_key` entry / OCEL object `type` for matching, e.g.
/// `"diagnostic_code"` and `"DiagnosticCode"` both normalize to
/// `"diagnosticcode"`.
fn normalize(s: &str) -> String {
    s.chars()
        .filter(|c| *c != '_')
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Parse the `.ocel.jsonl` tape into an ordered list of [`PrefixEvent`]s.
///
/// The tape mixes OCEL object-declaration lines (`{"id","type",...}`, no
/// `"activity"`) with event lines
/// (`{"event_id","activity","timestamp","objects":[{"id","type"},...]}`).
/// Only event lines are folded; `tape_index` is the 0-based ordinal among
/// event lines only (matches spec §8.1's `$.events[N]` json_path
/// convention).
fn read_tape(tape_path: &str, case_key: &[String]) -> Result<Vec<PrefixEvent>> {
    let raw = std::fs::read_to_string(tape_path)
        .with_context(|| format!("failed to read tape file '{tape_path}'"))?;

    let normalized_case_key: Vec<String> = case_key.iter().map(|k| normalize(k)).collect();
    let mut events = Vec::new();
    let mut tape_index = 0usize;

    for (line_no, line) in raw.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let value: serde_json::Value = serde_json::from_str(line)
            .with_context(|| format!("invalid JSON at {tape_path}:{}", line_no + 1))?;

        let activity = match value.get("activity").or_else(|| value.get("event_type")) {
            Some(serde_json::Value::String(s)) => s.clone(),
            _ => continue, // object-declaration line, not an event
        };

        let time_ms = value
            .get("timestamp")
            .or_else(|| value.get("time"))
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp_millis())
            .unwrap_or(tape_index as i64);

        let objects = value
            .get("objects")
            .or_else(|| value.get("relationships"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut by_type: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for obj in &objects {
            let obj_type = obj
                .get("type")
                .or_else(|| obj.get("qualifier"))
                .and_then(|v| v.as_str());
            let obj_id = obj
                .get("id")
                .or_else(|| obj.get("objectId"))
                .or_else(|| obj.get("object_id"))
                .and_then(|v| v.as_str());
            if let (Some(t), Some(id)) = (obj_type, obj_id) {
                by_type.insert(normalize(t), id.to_string());
            }
        }

        let mut key_parts = Vec::with_capacity(normalized_case_key.len());
        for k in &normalized_case_key {
            match by_type.get(k) {
                Some(id) => key_parts.push(id.clone()),
                None => {
                    anyhow::bail!(
                        "tape event at {tape_path}:{} is missing an object of type '{k}' \
                         required by the law's case_key",
                        line_no + 1
                    );
                }
            }
        }
        let case_id = key_parts.join("|");

        events.push(PrefixEvent {
            activity,
            time_ms,
            case_id,
            tape_index,
        });
        tape_index += 1;
    }

    Ok(events)
}

pub fn handle_oracle_command(command: &OracleCommands) -> Result<()> {
    match command {
        OracleCommands::Check { tape, law, format } => check(tape, law, format),
        OracleCommands::Watch { tape, law } => watch(tape, law),
    }
}

fn check(tape: &str, law_path: &str, format: &str) -> Result<()> {
    let law = load_law(law_path)?;
    let events = read_tape(tape, &law.case_key)?;

    let mut oracle = PrefixOracle::new(&law);
    let mut findings = Vec::new();
    let mut case_ids: HashSet<String> = HashSet::new();
    for ev in &events {
        case_ids.insert(ev.case_id.clone());
        let (_, f) = oracle.observe(ev);
        findings.extend(f);
    }

    let snapshot = oracle.snapshot();
    let alive_cases = snapshot
        .iter()
        .filter(|c| c.verdict == PrefixVerdict::Alive)
        .count();
    let dead_cases = snapshot
        .iter()
        .filter(|c| c.verdict == PrefixVerdict::Dead)
        .count();
    let terminal_cases = snapshot
        .iter()
        .filter(|c| c.verdict == PrefixVerdict::Terminal)
        .count();

    let verdict = if dead_cases > 0 {
        OracleVerdict::AndonPull
    } else {
        OracleVerdict::Admitted
    };

    let report = OracleReport {
        report_version: REPORT_VERSION.to_string(),
        law_id: law.law_id.clone(),
        verdict,
        total_cases: case_ids.len(),
        alive_cases,
        dead_cases,
        terminal_cases,
        findings,
    };

    if format.eq_ignore_ascii_case("json") {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("=== ORACLE CHECK REPORT ===");
        println!("law_id:         {}", report.law_id);
        println!("verdict:        {:?}", report.verdict);
        println!("total_cases:    {}", report.total_cases);
        println!("alive_cases:    {}", report.alive_cases);
        println!("dead_cases:     {}", report.dead_cases);
        println!("terminal_cases: {}", report.terminal_cases);
        println!("findings:       {}", report.findings.len());
        for f in &report.findings {
            println!(
                "  [{:?}] {:?} case={} activity={} at={}",
                f.severity, f.code, f.case_id, f.activity, f.json_path
            );
        }
    }

    if report.verdict == OracleVerdict::AndonPull {
        anyhow::bail!("oracle check: AndonPull ({dead_cases} dead case(s))");
    }
    Ok(())
}

fn watch(tape: &str, law_path: &str) -> Result<()> {
    let law = load_law(law_path)?;
    let events = read_tape(tape, &law.case_key)?;

    let mut oracle = PrefixOracle::new(&law);
    let mut already_stopped: HashSet<String> = HashSet::new();
    let mut any_dead = false;

    for ev in &events {
        let (verdict, findings) = oracle.observe(ev);
        if verdict == PrefixVerdict::Dead && !already_stopped.contains(&ev.case_id) {
            already_stopped.insert(ev.case_id.clone());
            any_dead = true;
            let finding = findings
                .into_iter()
                .next()
                .ok_or_else(|| anyhow!("case {} went DEAD with no finding attached", ev.case_id))?;
            let stop = EarlyStop {
                kind: "EarlyStop",
                report_version: REPORT_VERSION,
                law_id: law.law_id.clone(),
                case_id: ev.case_id.clone(),
                tape_index: ev.tape_index,
                verdict: "DEAD",
                finding,
            };
            println!("{}", serde_json::to_string(&stop)?);
        }
    }

    if any_dead {
        anyhow::bail!("oracle watch: one or more cases reached DEAD");
    }
    Ok(())
}
