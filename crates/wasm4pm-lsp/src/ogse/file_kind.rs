//! Classifies URIs/paths into OGSE substrate kinds.

use lsp_max::lsp_types::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OgseFileKind {
    OcelJson,
    Receipt,
    Registry,
    OntologyTtl,
    OcelReport,
    Falsifier,
    GeneratedRust,
    GeneratedTs,
    Unknown,
}

impl OgseFileKind {
    /// Classify a path string into an OGSE substrate kind.
    pub fn from_path(path: &str) -> Self {
        // Match both real receipts (.wasm4pm/receipts/) and test fixtures (wasm4pm/receipts/)
        if (path.contains(".wasm4pm/receipts/") || path.contains("wasm4pm/receipts/"))
            && path.ends_with(".json")
        {
            return Self::Receipt;
        }
        if path.ends_with("registry.json") && path.contains("algorithms") {
            return Self::Registry;
        }
        if path.contains("ggen/ontology/") && (path.ends_with(".ttl") || path.ends_with(".nt")) {
            return Self::OntologyTtl;
        }
        if path.contains("ocel/reports/") && path.ends_with(".json") {
            return Self::OcelReport;
        }
        if path.ends_with("algorithm_paper_grounded.rs") {
            return Self::Falsifier;
        }
        if path.ends_with("algorithm_registry.rs") || path.contains("breeds/registration.rs") {
            return Self::GeneratedRust;
        }
        if path.ends_with("algorithm-ids.ts") || path.ends_with("breed-ids.ts") {
            return Self::GeneratedTs;
        }
        if path.ends_with(".ocel.json") {
            return Self::OcelJson;
        }
        Self::Unknown
    }

    /// Classify a `lsp_types::Url` into an OGSE substrate kind.
    pub fn from_uri(uri: &Url) -> Self {
        Self::from_path(uri.as_str())
    }

    /// Returns `true` for every kind except `Unknown`.
    pub fn is_ogse_substrate(self) -> bool {
        !matches!(self, Self::Unknown)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipt_classification() {
        assert_eq!(
            OgseFileKind::from_path("/home/user/.wasm4pm/receipts/abc123.json"),
            OgseFileKind::Receipt
        );
    }

    #[test]
    fn registry_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/src/algorithms/registry.json"),
            OgseFileKind::Registry
        );
    }

    #[test]
    fn ontology_ttl_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/ggen/ontology/breeds.ttl"),
            OgseFileKind::OntologyTtl
        );
        assert_eq!(
            OgseFileKind::from_path("/project/ggen/ontology/breeds.nt"),
            OgseFileKind::OntologyTtl
        );
    }

    #[test]
    fn ocel_report_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/ocel/reports/alpha.json"),
            OgseFileKind::OcelReport
        );
    }

    #[test]
    fn falsifier_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/tests/algorithm_paper_grounded.rs"),
            OgseFileKind::Falsifier
        );
    }

    #[test]
    fn generated_rust_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/src/algorithm_registry.rs"),
            OgseFileKind::GeneratedRust
        );
        assert_eq!(
            OgseFileKind::from_path("/project/src/breeds/registration.rs"),
            OgseFileKind::GeneratedRust
        );
    }

    #[test]
    fn generated_ts_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/src/algorithm-ids.ts"),
            OgseFileKind::GeneratedTs
        );
        assert_eq!(
            OgseFileKind::from_path("/project/src/breed-ids.ts"),
            OgseFileKind::GeneratedTs
        );
    }

    #[test]
    fn ocel_json_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/data/running-example.ocel.json"),
            OgseFileKind::OcelJson
        );
    }

    #[test]
    fn unknown_classification() {
        assert_eq!(
            OgseFileKind::from_path("/project/src/main.rs"),
            OgseFileKind::Unknown
        );
    }

    #[test]
    fn is_ogse_substrate_unknown_is_false() {
        assert!(!OgseFileKind::Unknown.is_ogse_substrate());
    }

    #[test]
    fn is_ogse_substrate_known_kinds_are_true() {
        let known = [
            OgseFileKind::OcelJson,
            OgseFileKind::Receipt,
            OgseFileKind::Registry,
            OgseFileKind::OntologyTtl,
            OgseFileKind::OcelReport,
            OgseFileKind::Falsifier,
            OgseFileKind::GeneratedRust,
            OgseFileKind::GeneratedTs,
        ];
        for kind in known {
            assert!(kind.is_ogse_substrate(), "{kind:?} should be a substrate");
        }
    }
}
