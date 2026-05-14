//! Proof pack writer — writes machine-checkable evidence to disk.
//!
//! [`ProofPackWriter`] accumulates route evidence files into a structured
//! directory at `target/proof-packs/<run_id>/`. Call `finalize()` last:
//! it hashes all previously written files via BLAKE3 and writes
//! `ARTIFACT_PROOF/file-hashes.json` + `MANIFEST.json`.
//!
//! The hash chain is load-bearing: any file tampered after `finalize()` will
//! produce a different BLAKE3 digest than the one recorded, and the
//! independent `wpm proof verify` command will detect the mismatch.

use crate::testing::conformance::{ConformanceVerdict, ProofDimension, ReplayReport};

/// Writes machine-checkable proof evidence to `target/proof-packs/<run_id>/`.
///
/// # Directory layout
///
/// ```text
/// target/proof-packs/<run_id>/
///   MANIFEST.json                     ← file list (written by finalize)
///   OCEL/events.json                  ← recorded OCEL events
///   ROUTE_PROOF/report.json           ← ProofDimension values from replay
///   PLACEHOLDER_PROOF/proof-dimensions.json ← measured vs not_measured per dim
///   FINAL/verdict.json                ← final verdict (written by finalize)
///   ARTIFACT_PROOF/file-hashes.json  ← BLAKE3 hashes of all other files
/// ```
pub struct ProofPackWriter {
    run_id: String,
    dir: std::path::PathBuf,
}

impl ProofPackWriter {
    /// Create a writer rooted at `target/proof-packs/<run_id>/`.
    pub fn new(run_id: impl Into<String>) -> Self {
        let run_id = run_id.into();
        let dir = std::path::PathBuf::from("target/proof-packs").join(&run_id);
        std::fs::create_dir_all(&dir).unwrap_or(());
        Self { run_id, dir }
    }

    /// Create a writer rooted at `target/test-proof-packs/<run_id>/`.
    ///
    /// Use this in all test suites so test packs never contaminate the real
    /// `target/proof-packs/` directory that `wpm proof verify` scans.
    pub fn for_test(run_id: impl Into<String>) -> Self {
        let run_id = run_id.into();
        let dir = std::path::PathBuf::from("target/test-proof-packs").join(&run_id);
        std::fs::create_dir_all(&dir).unwrap_or(());
        Self { run_id, dir }
    }

    /// Return the root directory for this proof pack.
    pub fn dir(&self) -> &std::path::Path {
        &self.dir
    }

    /// Return the run ID.
    pub fn run_id(&self) -> &str {
        &self.run_id
    }

    /// Write OCEL event evidence to `OCEL/events.json`.
    pub fn write_ocel(&self, ocel: &serde_json::Value) -> std::io::Result<()> {
        let d = self.dir.join("OCEL");
        std::fs::create_dir_all(&d)?;
        std::fs::write(d.join("events.json"), serde_json::to_string_pretty(ocel).unwrap())
    }

    /// Write token-replay proof dimensions to `ROUTE_PROOF/report.json`.
    pub fn write_route_proof(&self, report: &ReplayReport) -> std::io::Result<()> {
        let d = self.dir.join("ROUTE_PROOF");
        std::fs::create_dir_all(&d)?;
        let json = serde_json::json!({
            "fitness": dim_to_json(report.fitness),
            "precision": dim_to_json(report.precision),
            "receipt_coverage": dim_to_json(report.receipt_coverage),
            "required_stage_coverage": dim_to_json(report.required_stage_coverage),
            "object_lifecycle_validity": dim_to_json(report.object_lifecycle_validity),
        });
        std::fs::write(d.join("report.json"), serde_json::to_string_pretty(&json).unwrap())
    }

    /// Write proof dimension status (measured vs not_measured) to
    /// `PLACEHOLDER_PROOF/proof-dimensions.json`.
    pub fn write_proof_dimensions(&self, report: &ReplayReport) -> std::io::Result<()> {
        let d = self.dir.join("PLACEHOLDER_PROOF");
        std::fs::create_dir_all(&d)?;
        let json = serde_json::json!({
            "dimensions": {
                "fitness": dim_status(report.fitness),
                "precision": dim_status(report.precision),
                "receipt_coverage": dim_status(report.receipt_coverage),
                "required_stage_coverage": dim_status(report.required_stage_coverage),
                "object_lifecycle_validity": dim_status(report.object_lifecycle_validity),
            }
        });
        std::fs::write(d.join("proof-dimensions.json"), serde_json::to_string_pretty(&json).unwrap())
    }

    /// Write `FINAL/verdict.json`, `ARTIFACT_PROOF/file-hashes.json`, and `MANIFEST.json`.
    ///
    /// Must be called last. Hashes all previously written `.json` files using BLAKE3.
    /// The hash chain is load-bearing: tampering any file after this call will produce
    /// a mismatch detectable by `wpm proof verify`.
    pub fn finalize(&self, verdict: &ConformanceVerdict) -> std::io::Result<()> {
        let verdict_label = match verdict {
            ConformanceVerdict::Passed => "Accepted".to_string(),
            ConformanceVerdict::Andon(a) => format!("{a:?}"),
        };

        // Write FINAL/verdict.json first so it is included in the hash set.
        let final_dir = self.dir.join("FINAL");
        std::fs::create_dir_all(&final_dir)?;
        let verdict_json = serde_json::json!({ "run_id": self.run_id, "verdict": verdict_label });
        std::fs::write(
            final_dir.join("verdict.json"),
            serde_json::to_string_pretty(&verdict_json).unwrap(),
        )?;

        // Hash every .json file present (excluding ARTIFACT_PROOF to avoid circularity).
        let hashes = self.compute_artifact_hashes()?;
        let artifact_dir = self.dir.join("ARTIFACT_PROOF");
        std::fs::create_dir_all(&artifact_dir)?;
        std::fs::write(
            artifact_dir.join("file-hashes.json"),
            serde_json::to_string_pretty(&hashes).unwrap(),
        )?;

        // MANIFEST: list all files with their sizes.
        let manifest = self.build_manifest()?;
        std::fs::write(self.dir.join("MANIFEST.json"), serde_json::to_string_pretty(&manifest).unwrap())
    }

    /// BLAKE3-hash every `.json` file in the pack directory, excluding
    /// `ARTIFACT_PROOF/` (which is written after hashing).
    fn compute_artifact_hashes(&self) -> std::io::Result<serde_json::Value> {
        let mut map = serde_json::Map::new();
        self.visit_json_files(&self.dir, &self.dir, "ARTIFACT_PROOF", &mut map)?;
        Ok(serde_json::Value::Object(map))
    }

    fn visit_json_files(
        &self,
        base: &std::path::Path,
        current: &std::path::Path,
        skip_dir: &str,
        out: &mut serde_json::Map<String, serde_json::Value>,
    ) -> std::io::Result<()> {
        for entry in std::fs::read_dir(current)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                // Skip the excluded directory.
                if path.file_name().and_then(|n| n.to_str()) == Some(skip_dir) {
                    continue;
                }
                self.visit_json_files(base, &path, skip_dir, out)?;
            } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let rel = path.strip_prefix(base).unwrap_or(&path);
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                let contents = std::fs::read(&path)?;
                let hash = blake3::hash(&contents);
                out.insert(rel_str, serde_json::Value::String(hash.to_hex().to_string()));
            }
        }
        Ok(())
    }

    fn build_manifest(&self) -> std::io::Result<serde_json::Value> {
        let mut files = Vec::new();
        self.collect_files(&self.dir, &self.dir, &mut files)?;
        files.sort();
        let file_list: Vec<serde_json::Value> = files
            .into_iter()
            .map(|f| serde_json::json!({ "path": f }))
            .collect();
        Ok(serde_json::json!({
            "run_id": self.run_id,
            "files": file_list,
        }))
    }

    fn collect_files(
        &self,
        base: &std::path::Path,
        current: &std::path::Path,
        out: &mut Vec<String>,
    ) -> std::io::Result<()> {
        for entry in std::fs::read_dir(current)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                self.collect_files(base, &path, out)?;
            } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let rel = path.strip_prefix(base).unwrap_or(&path);
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
        Ok(())
    }
}

fn dim_to_json(d: ProofDimension) -> serde_json::Value {
    match d {
        ProofDimension::Measured(v) => serde_json::json!(v),
        ProofDimension::NotMeasured => serde_json::Value::Null,
    }
}

fn dim_status(d: ProofDimension) -> &'static str {
    match d {
        ProofDimension::Measured(_) => "measured",
        ProofDimension::NotMeasured => "not_measured",
    }
}
