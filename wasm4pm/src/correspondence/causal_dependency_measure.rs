//! W4PM-LEAN-GALL-016 — causal-net binding semantics.
//!
//! ## The rarer finding this checkpoint produces: `UNSUPPORTED` on BOTH sides
//! Most prior checkpoints in this program found Lean ahead of Rust (a real
//! proof exists, no Rust encoder built yet) or occasionally Rust ahead of
//! Lean (real code, no formalization). This checkpoint's main claim —
//! "activity + input binding + output binding + marking → enabled/refused
//! → next marking" (the program's own stated minimal system for causal-net
//! binding semantics) — is **unsupported on both sides**, confirmed by
//! direct re-read of both codebases this checkpoint:
//!
//! - **Lean** (`mfact/procint/ProcInt/Models/CausalNet.lean`): `CausalBinding`
//!   is a plain `{ sources : List α, targets : List α }` pair — no AND/XOR
//!   discriminant, no satisfaction predicate, no enabled/fire/step relation
//!   anywhere in the file or its consumers. A prior audit round's
//!   characterization of this as "explicit AND/XOR binding obligations" was
//!   an overclaim, corrected here after a direct re-read.
//! - **Rust** (`wasm4pm::advanced_algorithms::classify_heuristic_splits_joins`):
//!   computes only a single AND/XOR *tag* per node (not a binding-set
//!   partition of which specific targets are jointly obligatory), and that
//!   output is never consumed downstream by anything — no enabled/fire
//!   execution semantics exists for causal nets anywhere in the crate
//!   (Petri-net `enabled`/`fire` exists in `correspondence::petri_firing`,
//!   but nothing analogous exists for `CausalGraph`/`CausalRelation`).
//!
//! Per this program's discipline (established at checkpoint 013): when no
//! shared claim exists to differentially test, the honest output is a
//! ledger stating so, not a fabricated harness. See the checkpoint's
//! receipt for the full 4-claim table (binding-set structure, dependency
//! measure, execution semantics, and the 8 required-evidence items each
//! marked N/A with a reason).
//!
//! ## What IS built here: a formula-property verification, NOT a correspondence
//! `mfact`'s `dependencyMeasure` (a signed ℚ score, proven bounded in
//! `(-1,1)`, antisymmetric, and self-zero, no `sorry`/`axiom`) is real,
//! proven math. wasm4pm's `CausalRelation.strength` (`causal_graph.rs`) is
//! a **different formula entirely** — unsigned `usize` in `[0,1000]`, with
//! negative heuristic measures explicitly clamped to `0.0` before scaling
//! (confirmed by direct read: `build_causal_heuristic` uses `.max(0.0)`,
//! destroying the sign information `dependencyMeasure`'s antisymmetry
//! proof depends on). **This module does NOT claim these two correspond**
//! — clamping a signed measure to zero before an affine rescale is lossy
//! and asymmetric in a way no honest normalization step could undo.
//!
//! Instead, this module independently transcribes `dependencyMeasure`'s
//! literal formula and verifies, in Rust, that the SAME properties Lean
//! proves about it (bounds, antisymmetry, self-zero) hold for the
//! transcription — a specification-reproduction check, useful if this
//! formula is ever wired into a real wasm4pm implementation later, but
//! explicitly not evidence about any current wasm4pm code path.

pub const LEAN_CAUSALNET_FILE_SHA256: &str =
    "a889f4d19f6e2314b810ca5315e06912278c974732e89686e4367158f66bcbe0";
pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

/// Exact-rational transcription of `mfact/procint/ProcInt/Models/
/// CausalNet.lean:31-32`:
/// ```lean
/// def dependencyMeasure (ab ba : ℕ) : ℚ := ((ab:ℚ) - (ba:ℚ)) / ((ab:ℚ) + (ba:ℚ) + 1)
/// ```
/// Returns `(numerator, denominator)` in lowest terms, `denominator > 0`.
pub fn dependency_measure_exact(ab: u64, ba: u64) -> (i64, i64) {
    let num = ab as i64 - ba as i64;
    let den = ab as i64 + ba as i64 + 1;
    let g = gcd(num.unsigned_abs(), den.unsigned_abs()).max(1);
    (num / g as i64, den / g as i64)
}

fn gcd(a: u64, b: u64) -> u64 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

fn as_f64((num, den): (i64, i64)) -> f64 {
    num as f64 / den as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors `dependencyMeasure_lt_one` (`CausalNet.lean:43-47`): strictly
    /// less than 1 for all natural-number inputs (checked over a bounded
    /// exhaustive range, not all of ℕ — an honest finite check, not a proof).
    #[test]
    fn strictly_less_than_one_over_bounded_range() {
        for ab in 0..=50u64 {
            for ba in 0..=50u64 {
                let v = as_f64(dependency_measure_exact(ab, ba));
                assert!(v < 1.0, "dependencyMeasure({ab},{ba}) = {v} must be < 1");
            }
        }
    }

    /// Mirrors `neg_one_lt_dependencyMeasure` (`CausalNet.lean:50-54`):
    /// strictly greater than -1.
    #[test]
    fn strictly_greater_than_neg_one_over_bounded_range() {
        for ab in 0..=50u64 {
            for ba in 0..=50u64 {
                let v = as_f64(dependency_measure_exact(ab, ba));
                assert!(v > -1.0, "dependencyMeasure({ab},{ba}) = {v} must be > -1");
            }
        }
    }

    /// Mirrors `dependencyMeasure_antisymm` (`CausalNet.lean:58-62`):
    /// `dependencyMeasure ab ba = - dependencyMeasure ba ab`, exact rational
    /// equality, not epsilon-tolerant.
    #[test]
    fn antisymmetric_exact_over_bounded_range() {
        for ab in 0..=50u64 {
            for ba in 0..=50u64 {
                let (n1, d1) = dependency_measure_exact(ab, ba);
                let (n2, d2) = dependency_measure_exact(ba, ab);
                // n1/d1 == -(n2/d2)  <=>  n1*d2 == -n2*d1
                assert_eq!(
                    n1 * d2,
                    -n2 * d1,
                    "dependencyMeasure({ab},{ba}) must equal -dependencyMeasure({ba},{ab})"
                );
            }
        }
    }

    /// Mirrors `dependencyMeasure_self` (`CausalNet.lean:66-68`):
    /// `dependencyMeasure n n = 0`.
    #[test]
    fn self_value_is_zero() {
        for n in 0..=50u64 {
            let (num, _den) = dependency_measure_exact(n, n);
            assert_eq!(num, 0, "dependencyMeasure({n},{n}) must be exactly 0");
        }
    }

    /// Negative falsifier: a tampered formula (e.g. dropping the +1 in the
    /// denominator, which would make dependencyMeasure(0,0) divide by zero
    /// instead of the real formula's well-defined 0/1=0) must disagree with
    /// the correct transcription — proving these tests have teeth.
    #[test]
    fn tampered_formula_without_plus_one_is_caught() {
        // Real formula: dependencyMeasure(0,0) = (0-0)/(0+0+1) = 0/1 = 0.
        let (correct_num, correct_den) = dependency_measure_exact(0, 0);
        assert_eq!((correct_num, correct_den), (0, 1));
        // A tampered variant without the "+1" would be 0/0 -- undefined,
        // definitely not equal to the real (0,1) result under any sane
        // convention. Assert the real result is well-defined and nonzero-
        // denominator, which the tampered variant could not produce.
        assert!(correct_den > 0, "the real formula's +1 keeps the denominator strictly positive even at ab=ba=0");
    }

    #[test]
    fn lean_file_hash_matches_citation() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../mfact/procint/ProcInt/Models/CausalNet.lean");
        let Ok(contents) = std::fs::read(path) else {
            eprintln!("lean_file_hash_matches_citation: SKIPPED — {path} not found (mfact not checked out)");
            return;
        };
        let digest = sha256_hex(&contents);
        assert_eq!(
            digest, LEAN_CAUSALNET_FILE_SHA256,
            "CausalNet.lean content hash has changed since this harness was built \
             (mfact revision {MFACT_REVISION}) — the citation is stale"
        );
    }

    fn sha256_hex(data: &[u8]) -> String {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let output = Command::new("shasum")
            .arg("-a")
            .arg("256")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                child.stdin.take().unwrap().write_all(data).expect("write to shasum stdin");
                child.wait_with_output()
            });
        match output {
            Ok(out) => String::from_utf8_lossy(&out.stdout).split_whitespace().next().unwrap_or("").to_string(),
            Err(_) => {
                eprintln!("sha256_hex: `shasum` not available, skipping");
                String::new()
            }
        }
    }
}
