//! Event-log format detection shared across CLI commands.
//!
//! The Rust CLI's mining/audit/autoprocess paths operate on flattened XES event
//! logs. OCEL 2.0 logs must be flattened first, so commands detect them up front
//! and bail with an actionable message. Keeping that detection in one place avoids
//! the per-command drift that previously let `audit` and `autoprocess` disagree on
//! what counts as OCEL.

use std::path::Path;

/// Returns `true` if `path` appears to be an OCEL (object-centric) event log.
///
/// Detection is layered, cheapest signal first:
/// 1. An OCEL extension (`.ocel`, `.jsonocel`).
/// 2. A `.json` path whose name hints at OCEL (`*.ocel.json`, `vision_trace*`).
/// 3. A `.json` file whose contents carry the OCEL `"ocel:"` marker.
///
/// The content sniff (step 3) only runs for ambiguous `.json` files and treats an
/// unreadable file as "not OCEL", deferring the real I/O error to the caller's load
/// step where it can be reported with proper context.
pub fn is_ocel_log(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    match ext.as_str() {
        "ocel" | "jsonocel" => true,
        "json" => {
            let name = path.to_string_lossy();
            name.contains(".ocel")
                || name.contains("vision_trace")
                || std::fs::read_to_string(path)
                    .unwrap_or_default()
                    .contains("ocel:")
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn detects_ocel_by_extension() {
        assert!(is_ocel_log(Path::new("log.ocel")));
        assert!(is_ocel_log(Path::new("log.jsonocel")));
    }

    #[test]
    fn detects_ocel_by_json_name_hint() {
        assert!(is_ocel_log(Path::new("orders.ocel.json")));
        assert!(is_ocel_log(Path::new("vision_trace_42.json")));
    }

    #[test]
    fn plain_xes_and_unrelated_json_are_not_ocel() {
        assert!(!is_ocel_log(Path::new("log.xes")));
        assert!(!is_ocel_log(Path::new("missing.json")));
        assert!(!is_ocel_log(Path::new("README.md")));
    }
}
