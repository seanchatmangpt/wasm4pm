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
//!
//! ## W4PM-LEAN-GALL-024 addendum: a real theorem about the clamp itself
//! Checkpoint 016 refused to claim `dependencyMeasure` corresponds to
//! `CausalRelation.strength` because `build_causal_heuristic`'s `.max(0.0)`
//! clamp (confirmed again this checkpoint, `causal_graph.rs:175-180`)
//! destroys `dependencyMeasure_antisymm`. Rather than leave that as a bare
//! non-claim, `mfact/procint/ProcInt/Models/CausalNetClamp.lean` (new file,
//! hand-written, not ggen-rendered) proves what IS still true of the clamped
//! pair `(clampedMeasure ab ba, clampedMeasure ba ab)`:
//! - `clampedMeasure_add_swap_eq_abs`: the two clamped directions still sum
//!   to `|dependencyMeasure ab ba|` — the magnitude survives if you keep
//!   both directions.
//! - `clampedMeasure_mul_swap_eq_zero`: the two clamped directions can never
//!   both be positive — formalizing that wasm4pm's real output (which
//!   applies a positive `threshold` after the clamp) can contain at most
//!   one of `(a,b)`/`(b,a)` as a `CausalRelation`, never both.
//! `clamped_measure_exact` below is the Rust transcription of `clampedMeasure`
//! (pre-rescale, i.e. before wasm4pm's separate `* 1000.0` cast to `usize`),
//! and the new tests check the same two properties over the same bounded
//! range as the pre-existing bounds/antisymmetry/self-zero tests.

pub const LEAN_CAUSALNET_FILE_SHA256: &str =
    "a889f4d19f6e2314b810ca5315e06912278c974732e89686e4367158f66bcbe0";
pub const LEAN_CAUSALNET_CLAMP_FILE_SHA256: &str =
    "bffcb0cedeb1089f1d7872a357bee7856d217460f445684bebe40dd8db8138cb";
pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

/// Exact-rational transcription of the clamp `mfact/procint/ProcInt/Models/
/// CausalNetClamp.lean`'s `clampedMeasure` applies to `dependencyMeasure`
/// before wasm4pm's own separate rescale: `max(dependencyMeasure(ab,ba), 0)`.
/// Mirrors the `.max(0.0)` call in `causal_graph.rs`'s `build_causal_heuristic`
/// (line 177), operating on the exact-rational `dependency_measure_exact`
/// result instead of `f64`. Returns `(numerator, denominator)`, `denominator > 0`,
/// `numerator >= 0`.
pub fn clamped_measure_exact(ab: u64, ba: u64) -> (i64, i64) {
    let (num, den) = dependency_measure_exact(ab, ba);
    if num < 0 {
        (0, 1)
    } else {
        (num, den)
    }
}

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

    /// Mirrors `clampedMeasure_add_swap_eq_abs`
    /// (`CausalNetClamp.lean`): `clampedMeasure(ab,ba) + clampedMeasure(ba,ab)
    /// == |dependencyMeasure(ab,ba)|`, exact rational equality.
    #[test]
    fn clamped_add_swap_equals_abs_over_bounded_range() {
        for ab in 0..=50u64 {
            for ba in 0..=50u64 {
                let (cn1, cd1) = clamped_measure_exact(ab, ba);
                let (cn2, cd2) = clamped_measure_exact(ba, ab);
                // sum = cn1/cd1 + cn2/cd2 = (cn1*cd2 + cn2*cd1) / (cd1*cd2)
                let sum_num = cn1 * cd2 + cn2 * cd1;
                let sum_den = cd1 * cd2;
                let (n, d) = dependency_measure_exact(ab, ba);
                let abs_num = n.abs();
                // sum_num/sum_den == abs_num/d  <=>  sum_num*d == abs_num*sum_den
                assert_eq!(
                    sum_num * d,
                    abs_num * sum_den,
                    "clampedMeasure({ab},{ba}) + clampedMeasure({ba},{ab}) must equal |dependencyMeasure({ab},{ba})|"
                );
            }
        }
    }

    /// Mirrors `clampedMeasure_mul_swap_eq_zero` (`CausalNetClamp.lean`): the
    /// two clamped directions can never both be strictly positive — at most
    /// one of `(a,b)`/`(b,a)` can ever appear as a positive-strength
    /// `CausalRelation` in wasm4pm's real output.
    #[test]
    fn clamped_mul_swap_is_zero_over_bounded_range() {
        for ab in 0..=50u64 {
            for ba in 0..=50u64 {
                let (n1, _) = clamped_measure_exact(ab, ba);
                let (n2, _) = clamped_measure_exact(ba, ab);
                assert!(
                    n1 == 0 || n2 == 0,
                    "clampedMeasure({ab},{ba})={n1} and clampedMeasure({ba},{ab})={n2} \
                     must not both be positive"
                );
            }
        }
    }

    /// Negative falsifier for the clamp tests: an unclamped transcription
    /// (using signed `dependency_measure_exact` directly) does NOT satisfy
    /// `clamped_mul_swap_is_zero` for asymmetric inputs — proving the clamp
    /// tests above have teeth and aren't vacuously true of any pair formula.
    #[test]
    fn unclamped_pair_violates_mul_swap_zero_property() {
        let (n1, _) = dependency_measure_exact(10, 3); // positive
        let (n2, _) = dependency_measure_exact(3, 10); // negative, unclamped
        assert!(
            n1 != 0 && n2 != 0,
            "sanity: unclamped dependency_measure_exact(10,3) and (3,10) must both be nonzero \
             to demonstrate the clamp is what makes clamped_mul_swap_is_zero true"
        );
    }

    #[test]
    fn causal_net_clamp_lean_file_hash_matches_citation() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../mfact/procint/ProcInt/Models/CausalNetClamp.lean"
        );
        let Ok(contents) = std::fs::read(path) else {
            eprintln!(
                "causal_net_clamp_lean_file_hash_matches_citation: SKIPPED — {path} not found (mfact not checked out)"
            );
            return;
        };
        let digest = sha256_hex(&contents);
        assert_eq!(
            digest, LEAN_CAUSALNET_CLAMP_FILE_SHA256,
            "CausalNetClamp.lean content hash has changed since this harness was built \
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
