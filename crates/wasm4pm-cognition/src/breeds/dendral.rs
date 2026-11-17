//! DENDRAL-style generate-and-test (Feigenbaum 1971).
//!
//! Two layers, both real:
//!
//! **Layer 1 — candidate constraint elimination (monotonic).** Each `Fact`
//! with `key == "constraint"` defines a rule over candidate ids:
//! `forbid:<id>` (exact-match elimination), `require:<tok>` (substring
//! presence required), `max-score:<f32>` / `min-score:<f32>` (score gates).
//! Elimination is monotonic: once eliminated, never restored. Survivors are
//! scored unchanged; the highest-score survivor is selected. When no
//! `molecular-formula` fact is present, this layer is the whole behavior.
//!
//! **Layer 2 — constitutional-isomer generate-and-test.** When a
//! `molecular-formula` fact (e.g. `C5H10O`) is present, the breed actually
//! enumerates the isomer space, DENDRAL's entire point:
//!
//! 1. **GENERATE**: enumerate connected valence-respecting bond-order
//!    assignments (bond multiplicities 1=single, 2=double, 3=triple) over the
//!    heavy atoms implied by the formula (elements C, N, O; H implicit =
//!    residual valence). Hard caps, exceeded => typed refusal (never silent
//!    truncation): heavy atom count <= 8, deduplicated isomer count <= 10 000,
//!    raw bond-assignment nodes <= 500 000.
//! 2. **CANONICALIZE**: each candidate molecule is canonicalized (lex-min
//!    adjacency string over all element-preserving labelings) and duplicates
//!    are dropped via a `BTreeSet`, so identical constitutional isomers
//!    enumerate once. Deterministic: enumeration order, canonical ordering,
//!    ids and selection are all sorted/BTreeMap-based.
//! 3. **TEST**: recognized structural predicates (`ring`, `double-bond`,
//!    `triple-bond`, `carbonyl`, `hydroxyl`, `ether`, `amine`) are evaluated
//!    per structure; `require:<tok>` / `forbid:<tok>` constraints with
//!    structural tokens act as post-filters over generated structures (the
//!    same constraint facts still apply to candidate ids as in Layer 1 —
//!    string matching there, structure predicates here, both labeled
//!    honestly in the trace).
//! 4. **RANK/SELECT**: each survivor gets a stated plausibility score
//!    `1/(1 + DBE)` (DBE = rings + double bonds + 2*triple bonds), gated by
//!    the existing `min-score:`/`max-score:` constraints; the top-ranked
//!    survivor is emitted as the `selected-isomer` fact (output `selected`
//!    stays candidate-based for compatibility). No spectral-prediction model
//!    is claimed — the score is a documented unsaturation heuristic, not a
//!    simulated mass spectrum.
//!
//! Trace steps emitted by Layer 2: `generate-isomers`, `test-constraints`,
//! `select-solution` (with real counts).

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, Fact, TraceStep,
};
use tracing;

/// Alkyl substituent formula -> (carbon count, trivial group name). General
/// lookup table, not specific to any one candidate.
fn alkyl_group(formula: &str) -> Option<(u32, &'static str)> {
    match formula {
        "CH3" => Some((1, "methyl")),
        "C2H5" => Some((2, "ethyl")),
        "C3H7" => Some((3, "propyl")),
        "C4H9" => Some((4, "butyl")),
        "C5H11" => Some((5, "pentyl")),
        "C6H13" => Some((6, "hexyl")),
        _ => None,
    }
}

const ALKANE_ROOTS: [&str; 10] = [
    "", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non",
];

/// Derive a real organic-chemistry name for a DENDRAL candidate id of the
/// form `"<family>-F<n>-<R1>-<R2>"` (e.g. a ketone id with two ethyl-group
/// substituents), general over any recognized alkyl-group formula pair --
/// not hardcoded to one
/// candidate. Produces the trivial name (e.g. "diethyl ketone") and, for
/// ketones, the IUPAC substitutive name via standard lowest-locant numbering
/// (total chain carbons = R1 + R2 + 1 for the carbonyl carbon; carbonyl
/// locant = the shorter arm's carbon count + 1). Returns `None` for
/// unrecognized families, unrecognized substituent formulas, or a candidate
/// id carrying a trailing structural-variant suffix (e.g. "-branched",
/// "-iso") this simple two-substituent model can't name correctly -- refuses
/// rather than silently mis-naming a structure it can't actually derive.
fn derive_chemical_name(candidate_id: &str) -> Option<String> {
    let parts: Vec<&str> = candidate_id.split('-').collect();
    if parts.len() != 4 {
        return None;
    }
    let family = parts[0];
    let functional = match family {
        "ketone" => "ketone",
        "ether" => "ether",
        "amine" => "amine",
        _ => return None,
    };
    // parts[1] is the "F<n>" fragment tag (ignored); parts[2], parts[3] are
    // the two substituent groups.
    let (c1, name1) = alkyl_group(parts[2])?;
    let (c2, name2) = alkyl_group(parts[3])?;

    let (lo, hi) = if name1 <= name2 {
        (name1, name2)
    } else {
        (name2, name1)
    };
    let trivial = if name1 == name2 {
        format!("di{name1} {functional}")
    } else {
        format!("{lo} {hi} {functional}")
    };

    if family == "ketone" {
        let total_carbons = (c1 + c2 + 1) as usize;
        if let Some(root) = ALKANE_ROOTS.get(total_carbons).filter(|r| !r.is_empty()) {
            let locant = c1.min(c2) + 1;
            return Some(format!("{locant}-{root}anone ({trivial})"));
        }
    }

    Some(trivial)
}

// ============================================================================
// Layer 2 — constitutional-isomer generate-and-test
// ============================================================================

/// Hard cap on heavy atoms (C/N/O) per formula. Exceeded => typed refusal.
const MAX_HEAVY_ATOMS: usize = 8;
/// Hard cap on distinct (canonicalized) isomers. Exceeded => typed refusal,
/// never silent truncation.
const MAX_ISOMERS: usize = 10_000;
/// Raw bond-assignment recursion nodes before we refuse (bounds work, keeps
/// the refusal deterministic for a given formula).
const MAX_RAW_ASSIGNMENTS: u64 = 500_000;
/// How many per-isomer property facts are emitted into the output fact list.
const ISOMER_FACT_LIST_CAP: usize = 64;

const ELEMENT_C: u8 = 0;
const ELEMENT_N: u8 = 1;
const ELEMENT_O: u8 = 2;

fn valence(element: u8) -> u8 {
    match element {
        ELEMENT_C => 4,
        ELEMENT_N => 3,
        _ => 2,
    }
}

fn element_char(element: u8) -> char {
    match element {
        ELEMENT_C => 'C',
        ELEMENT_N => 'N',
        _ => 'O',
    }
}

/// A constitutional (isomer) structure: heavy-atom skeleton with bond orders.
/// H atoms are implicit (residual valence).
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Debug)]
struct Molecule {
    elements: Vec<u8>,
    /// bond[i][j] = bond order (0 = no bond, 1..=3). Only i<j meaningful.
    bonds: Vec<Vec<u8>>,
}

impl Molecule {
    fn n(&self) -> usize {
        self.elements.len()
    }

    /// Bond order between heavy atoms i and j (order-insensitive; the matrix
    /// stores only the i<j upper triangle).
    fn bond(&self, i: usize, j: usize) -> u8 {
        if i < j {
            self.bonds[i][j]
        } else {
            self.bonds[j][i]
        }
    }

    fn residual_valence(&self, i: usize) -> u32 {
        let n = self.n();
        let used: u32 = (0..n).filter(|&j| j != i).map(|j| self.bond(i, j) as u32).sum();
        valence(self.elements[i]) as u32 - used
    }

    fn connectivity_ok(&self) -> bool {
        let n = self.n();
        if n <= 1 {
            return true;
        }
        let mut seen = vec![false; n];
        let mut stack = vec![0usize];
        seen[0] = true;
        let mut count = 1;
        while let Some(v) = stack.pop() {
            for u in 0..n {
                if u != v && self.bond(v, u) > 0 && !seen[u] {
                    seen[u] = true;
                    count += 1;
                    stack.push(u);
                }
            }
        }
        count == n
    }

    /// Canonical form: lex-min over all element-preserving labelings of the
    /// string "elements in label order" ++ "sorted edge list in label order".
    /// Two molecules are constitutionally identical iff their canonical forms
    /// are equal (exact for these graph representations).
    fn canonical_form(&self) -> String {
        let n = self.n();
        // Element classes in fixed element order; positions assigned per class.
        let mut classes: Vec<Vec<usize>> = Vec::new();
        for e in [ELEMENT_C, ELEMENT_N, ELEMENT_O] {
            let cls: Vec<usize> = (0..n).filter(|&i| self.elements[i] == e).collect();
            if !cls.is_empty() {
                classes.push(cls);
            }
        }
        let mut label = vec![0usize; n];
        let mut used = vec![false; n];
        let mut best: Option<String> = None;
        // DFS over labelings: positions are filled class by class (all C
        // labels first, then N, then O), permuting atoms within each class.
        fn rec(
            mol: &Molecule,
            classes: &[Vec<usize>],
            used: &mut [bool],
            label: &mut [usize],
            pos: usize,
            group: usize,
            group_left: &mut [usize],
            best: &mut Option<String>,
        ) {
            let n = mol.n();
            if pos == n {
                let mut s = String::with_capacity(2 + 4 * n);
                for i in 0..n {
                    s.push(element_char(mol.elements[label[i]]));
                }
                for a in 0..n {
                    for b in a + 1..n {
                        let o = mol.bond(label[a], label[b]);
                        if o > 0 {
                            s.push(char::from_digit(a as u32, 10).unwrap_or('?'));
                            s.push(char::from_digit(b as u32, 10).unwrap_or('?'));
                            s.push(char::from_digit(o as u32, 10).unwrap_or('?'));
                        }
                    }
                }
                if best.as_ref().map_or(true, |b| s < *b) {
                    *best = Some(s);
                }
                return;
            }
            if group_left[group] == 0 {
                rec(mol, classes, used, label, pos, group + 1, group_left, best);
                return;
            }
            for &atom in &classes[group] {
                if used[atom] {
                    continue;
                }
                label[pos] = atom;
                used[atom] = true;
                group_left[group] -= 1;
                rec(mol, classes, used, label, pos + 1, group, group_left, best);
                group_left[group] += 1;
                used[atom] = false;
            }
        }
        let mut group_left: Vec<usize> = classes.iter().map(|c| c.len()).collect();
        rec(
            self,
            &classes,
            &mut used,
            &mut label,
            0,
            0,
            &mut group_left,
            &mut best,
        );
        best.unwrap_or_default()
    }

    /// Structural properties evaluated on the actual bond graph.
    fn structure_props(&self) -> StructureProps {
        let n = self.n();
        let mut doubles = 0u32;
        let mut triples = 0u32;
        let mut carbonyl = false;
        let mut ether = false;
        let mut hydroxyl = false;
        let mut amine = false;
        for i in 0..n {
            for j in i + 1..n {
                match self.bonds[i][j] {
                    2 => doubles += 1,
                    3 => triples += 1,
                    _ => {}
                }
                if self.bonds[i][j] == 2 {
                    let (a, b) = (self.elements[i], self.elements[j]);
                    if (a == ELEMENT_C && b == ELEMENT_O) || (a == ELEMENT_O && b == ELEMENT_C) {
                        carbonyl = true;
                    }
                }
            }
        }
        for i in 0..n {
            let res = self.residual_valence(i);
            match self.elements[i] {
                ELEMENT_O => {
                    if res >= 1 {
                        hydroxyl = true; // O-H present
                    } else {
                        ether = true; // O fully bonded to heavy atoms
                    }
                }
                ELEMENT_N => {
                    if res >= 1 {
                        amine = true; // N-H present
                    }
                }
                _ => {}
            }
        }
        // Ring detection on the underlying simple graph: connected + edges >= n.
        let edges: u32 = (0..n)
            .map(|i| (i + 1..n).filter(|&j| self.bonds[i][j] > 0).count() as u32)
            .sum();
        let rings = self.connectivity_ok() && n > 0 && edges >= n as u32;
        StructureProps {
            rings,
            double_bonds: doubles,
            triple_bonds: triples,
            carbonyl,
            hydroxyl,
            ether,
            amine,
        }
    }
}

/// Real predicates computed from the bond graph of one generated structure.
#[derive(Debug)]
struct StructureProps {
    rings: bool,
    double_bonds: u32,
    triple_bonds: u32,
    carbonyl: bool,
    hydroxyl: bool,
    ether: bool,
    amine: bool,
}

impl StructureProps {
    fn dbe(&self) -> u32 {
        self.rings as u32 + self.double_bonds + 2 * self.triple_bonds
    }

    fn prop_string(&self) -> String {
        format!(
            "ring={} double_bonds={} triple_bonds={} carbonyl={} hydroxyl={} ether={} amine={} dbe={}",
            self.rings as u8,
            self.double_bonds,
            self.triple_bonds,
            self.carbonyl as u8,
            self.hydroxyl as u8,
            self.ether as u8,
            self.amine as u8,
            self.dbe()
        )
    }

    /// Is `token` a recognized structural predicate, and does this structure
    /// satisfy it?
    fn satisfies(&self, token: &str) -> Option<bool> {
        Some(match token {
            "ring" => self.rings,
            "double-bond" => self.double_bonds > 0,
            "triple-bond" => self.triple_bonds > 0,
            "carbonyl" => self.carbonyl,
            "hydroxyl" => self.hydroxyl,
            "ether" => self.ether,
            "amine" => self.amine,
            _ => return None,
        })
    }
}

/// Parse a molecular formula like `C5H10O` into [C, H, N, O] counts.
/// Any element outside {C, H, N, O} is a typed parse error (loud refusal
/// upstream, never a silent partial parse).
fn parse_formula(s: &str) -> Result<[u32; 4], String> {
    let chars: Vec<char> = s.chars().collect();
    let mut counts = [0u32; 4];
    let mut i = 0usize;
    if chars.is_empty() {
        return Err("empty formula".to_string());
    }
    while i < chars.len() {
        if !chars[i].is_ascii_uppercase() {
            return Err(format!("unexpected character '{}' at {}", chars[i], i));
        }
        let start = i;
        i += 1;
        while i < chars.len() && chars[i].is_ascii_lowercase() {
            i += 1;
        }
        let element: String = chars[start..i].iter().collect();
        let num_start = i;
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
        let count: u32 = if num_start == i {
            1
        } else {
            chars[num_start..i]
                .iter()
                .collect::<String>()
                .parse()
                .map_err(|_| format!("bad count in formula segment '{}'", element))?
        };
        match element.as_str() {
            "C" => counts[0] += count,
            "H" => counts[1] += count,
            "N" => counts[2] += count,
            "O" => counts[3] += count,
            other => return Err(format!("unsupported element '{}'", other)),
        }
    }
    Ok(counts)
}

/// Enumerate all distinct connected constitutional isomers of [C, H, N, O]
/// via valence-constrained bond-order assignment over the heavy-atom graph
/// (H implicit as residual valence). Deterministic; caps are refusals.
fn enumerate_isomers(formula: [u32; 4]) -> Result<Vec<Molecule>, String> {
    let [c, h, n_cnt, o] = formula;
    let heavy = (c + n_cnt + o) as usize;
    if heavy == 0 {
        return Err("formula contains no heavy atoms".to_string());
    }
    if heavy > MAX_HEAVY_ATOMS {
        return Err(format!(
            "formula needs {} heavy atoms, exceeds hard cap {} (refusal, not truncation)",
            heavy, MAX_HEAVY_ATOMS
        ));
    }
    // Elements in fixed order C..C N..N O..O.
    let mut elements = vec![ELEMENT_C; c as usize];
    elements.extend(std::iter::repeat(ELEMENT_N).take(n_cnt as usize));
    elements.extend(std::iter::repeat(ELEMENT_O).take(o as usize));

    let pairs: Vec<(usize, usize)> = (0..heavy)
        .flat_map(|i| (i + 1..heavy).map(move |j| (i, j)))
        .collect();
    let total_valence: u32 = elements.iter().map(|&e| valence(e) as u32).sum();
    // Necessary condition: total H must leave residual valence parity/amount
    // consistent; guaranteed by exact match at leaves — this is only a fast
    // rejection for absurd formulas.
    if h > total_valence {
        return Err(format!(
            "formula demands {} H but heavy-atom valence budget is {} (no valence-consistent structure)",
            h, total_valence
        ));
    }

    let mut bonds = vec![vec![0u8; heavy]; heavy];
    let mut res: Vec<u32> = elements.iter().map(|&e| valence(e) as u32).collect();
    let mut out: std::collections::BTreeMap<String, Molecule> = std::collections::BTreeMap::new();
    let mut raw: u64 = 0;

    fn rec(
        idx: usize,
        pairs: &[(usize, usize)],
        res: &mut Vec<u32>,
        bonds: &mut Vec<Vec<u8>>,
        elements: &[u8],
        h: u32,
        out: &mut std::collections::BTreeMap<String, Molecule>,
        raw: &mut u64,
    ) -> Result<(), String> {
        *raw += 1;
        if *raw > MAX_RAW_ASSIGNMENTS {
            return Err(format!(
                "raw bond-assignment count exceeded hard cap {} (refusal, not truncation)",
                MAX_RAW_ASSIGNMENTS
            ));
        }
        let p = pairs.len();
        if idx == p {
            if res.iter().sum::<u32>() != h {
                return Ok(());
            }
            let mol = Molecule {
                elements: elements.to_vec(),
                bonds: bonds.clone(),
            };
            if !mol.connectivity_ok() {
                return Ok(());
            }
            if out.len() >= MAX_ISOMERS {
                return Err(format!(
                    "isomer count exceeded hard cap {} (refusal, not truncation)",
                    MAX_ISOMERS
                ));
            }
            let canon = mol.canonical_form();
            out.entry(canon).or_insert(mol);
            return Ok(());
        }
        let s: u32 = res.iter().sum();
        // Residual never increases as bonds are added: once below H, dead.
        if s < h {
            return Ok(());
        }
        // Feasibility: remaining pairs must be able to absorb (s - h).
        let remaining_capacity: u32 = pairs[idx..]
            .iter()
            .map(|&(i, j)| 3u32.min(res[i]).min(res[j]))
            .sum();
        if remaining_capacity < s - h {
            return Ok(());
        }
        let (i, j) = pairs[idx];
        let max_order = 3u8.min(res[i] as u8).min(res[j] as u8);
        for order in 0..=max_order {
            bonds[i][j] = order;
            res[i] -= order as u32;
            res[j] -= order as u32;
            rec(idx + 1, pairs, res, bonds, elements, h, out, raw)?;
            res[i] += order as u32;
            res[j] += order as u32;
        }
        bonds[i][j] = 0;
        Ok(())
    }

    rec(0, &pairs, &mut res, &mut bonds, &elements, h, &mut out, &mut raw)?;
    Ok(out.into_values().collect())
}

/// DENDRAL generate-and-test breed.
pub struct Dendral;

/// Validate a constraint value's syntax. Returns `Err` for malformed inputs
/// so DENDRAL fails loudly (TPS Andon) instead of silently no-opping.
///
/// Recognized prefixes: `forbid:`, `require:`, `max-score:<f32>`, `min-score:<f32>`.
/// Any other prefix is rejected as a malformed constraint.
fn validate_constraint(constraint_value: &str) -> Result<(), String> {
    if let Some(rest) = constraint_value.strip_prefix("max-score:") {
        rest.parse::<f32>()
            .map(|_| ())
            .map_err(|_| format!("max-score requires f32 threshold, got '{}'", rest))
    } else if let Some(rest) = constraint_value.strip_prefix("min-score:") {
        rest.parse::<f32>()
            .map(|_| ())
            .map_err(|_| format!("min-score requires f32 threshold, got '{}'", rest))
    } else if constraint_value.starts_with("forbid:") || constraint_value.starts_with("require:") {
        Ok(())
    } else {
        Err(format!(
            "unknown constraint prefix in '{}' (expected forbid:, require:, max-score:, min-score:)",
            constraint_value
        ))
    }
}

fn violates(candidate: &Candidate, constraint_value: &str) -> Option<String> {
    if let Some(rest) = constraint_value.strip_prefix("forbid:") {
        if candidate.id == rest {
            return Some(format!("forbidden by constraint forbid:{}", rest));
        }
    } else if let Some(rest) = constraint_value.strip_prefix("require:") {
        if !candidate.id.contains(rest) {
            return Some(format!("missing required token {}", rest));
        }
    } else if let Some(rest) = constraint_value.strip_prefix("max-score:") {
        // validate_constraint() has already gated the parse — unwrap is sound.
        if let Ok(thresh) = rest.parse::<f32>() {
            if candidate.score > thresh {
                return Some(format!("score {} exceeds {}", candidate.score, thresh));
            }
        }
    } else if let Some(rest) = constraint_value.strip_prefix("min-score:") {
        if let Ok(thresh) = rest.parse::<f32>() {
            if candidate.score < thresh {
                return Some(format!("score {} below {}", candidate.score, thresh));
            }
        }
    }
    None
}

impl CognitionBreed for Dendral {
    fn id(&self) -> BreedId {
        BreedId::Dendral
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "constraint_enumeration".to_string(),
            "monotonic_elimination".to_string(),
            "isomer_generation".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.candidates.is_empty() {
            return Err("DENDRAL requires at least one candidate".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut candidates = input.candidates.clone();
        let mut trace: Vec<TraceStep> = Vec::new();

        let constraints: Vec<&str> = input
            .facts
            .iter()
            .filter(|f| f.key == "constraint")
            .map(|f| f.value.as_str())
            .collect();

        // Stop-the-line: validate every constraint syntactically up front.
        // A malformed constraint (e.g. `max-score:abc` or `unknown:foo`) that
        // silently no-ops would let candidates which should have been
        // eliminated slip through — a Rank-2 contract violation.
        for constraint in &constraints {
            if let Err(reason) = validate_constraint(constraint) {
                return Err(BreedError {
                    breed: BreedId::Dendral,
                    message: format!("malformed constraint: {}", reason),
                });
            }
        }

        for c in candidates.iter_mut() {
            tracing::debug!(
                breed.step = "candidate_enumerated",
                breed = "dendral",
                "L1 inference step"
            );
            if c.eliminated {
                continue;
            }
            for constraint in &constraints {
                tracing::debug!(
                    breed.step = "constraint_checked",
                    breed = "dendral",
                    "L1 inference step"
                );
                if let Some(reason) = violates(c, constraint) {
                    c.eliminated = true;
                    c.elimination_reason = Some(reason.clone());
                    tracing::debug!(
                        breed.step = "candidate_eliminated",
                        breed = "dendral",
                        "L1 inference step"
                    );
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "eliminate".to_string(),
                        detail: format!("{} by {}: {}", c.id, constraint, reason),
                        depth: 0,
                        objects: vec![],
                    });
                    break;
                }
            }
            if !c.eliminated {
                tracing::debug!(
                    breed.step = "hypothesis_retained",
                    breed = "dendral",
                    "L1 inference step"
                );
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "survive".to_string(),
                    detail: c.id.clone(),
                    depth: 0,
                    objects: vec![],
                });
            }
        }

        let selected = candidates
            .iter()
            .filter(|c| !c.eliminated)
            .max_by(|a, b| {
                a.score
                    .partial_cmp(&b.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.id.cmp(&a.id))
            })
            .map(|c| c.id.clone());

        let survivors = candidates.iter().filter(|c| !c.eliminated).count();
        let mut explanation = format!(
            "DENDRAL applied {} constraints; {}/{} candidates survived",
            constraints.len(),
            survivors,
            candidates.len()
        );

        // Layer 2 — generate-and-test over the isomer space. Additive: runs
        // only when a `molecular-formula` fact is present; never alters the
        // Layer-1 candidate results above.
        let mut facts = input.facts.clone();
        let formula_fact = input
            .facts
            .iter()
            .find(|f| f.key == "molecular-formula")
            .map(|f| f.value.clone());
        let mut generated_summary: Option<String> = None;
        if let Some(formula_str) = formula_fact {
            let counts = parse_formula(&formula_str).map_err(|e| BreedError {
                breed: BreedId::Dendral,
                message: format!("malformed molecular-formula fact '{}': {}", formula_str, e),
            })?;
            let isomers = enumerate_isomers(counts).map_err(|e| BreedError {
                breed: BreedId::Dendral,
                message: format!("isomer generation refused for '{}': {}", formula_str, e),
            })?;

            // Structural post-filters: constraint facts whose token is a
            // recognized structural predicate apply to generated structures
            // (labeled honestly in the trace as structure post-filters, not
            // string matching over isomer ids).
            let structural_constraints: Vec<(&str, &str)> = constraints
                .iter()
                .filter_map(|c| {
                    if let Some(tok) = c.strip_prefix("require:") {
                        Some(("require", tok))
                    } else if let Some(tok) = c.strip_prefix("forbid:") {
                        Some(("forbid", tok))
                    } else {
                        None
                    }
                })
                .filter(|(_, tok)| {
                    isomers
                        .first()
                        .map_or(false, |m| m.structure_props().satisfies(tok).is_some())
                })
                .collect();

            let mut survivors: Vec<(String, &Molecule, StructureProps, f32)> = Vec::new();
            for mol in &isomers {
                let props = mol.structure_props();
                let ok = structural_constraints.iter().all(|&(mode, tok)| {
                    let holds = props.satisfies(tok).unwrap_or(false);
                    if mode == "require" {
                        holds
                    } else {
                        !holds
                    }
                });
                if ok {
                    let score = 1.0 / (1.0 + props.dbe() as f32);
                    survivors.push((formula_str.clone(), mol, props, score));
                }
            }

            trace.push(TraceStep {
                step: trace.len(),
                kind: "generate-isomers".to_string(),
                detail: format!(
                    "formula {}: generated {} distinct constitutional isomers (canonicalized, deduplicated)",
                    formula_str,
                    isomers.len()
                ),
                depth: 0,
                objects: vec![],
            });
            trace.push(TraceStep {
                step: trace.len(),
                kind: "test-constraints".to_string(),
                detail: format!(
                    "structural post-filters ({}): {}/{} isomers survived",
                    structural_constraints.len(),
                    survivors.len(),
                    isomers.len()
                ),
                depth: 0,
                objects: vec![],
            });

            // Rank survivors by the plausibility score gated by existing
            // score thresholds; tie-break mirrors the legacy candidate rule
            // (smaller id wins) for determinism.
            let score_constraints: Vec<(&str, f32)> = constraints
                .iter()
                .filter_map(|c| {
                    if let Some(rest) = c.strip_prefix("min-score:") {
                        rest.parse::<f32>().ok().map(|t| ("min", t))
                    } else if let Some(rest) = c.strip_prefix("max-score:") {
                        rest.parse::<f32>().ok().map(|t| ("max", t))
                    } else {
                        None
                    }
                })
                .collect();
            let mut ranked: Vec<&(String, &Molecule, StructureProps, f32)> = survivors
                .iter()
                .filter(|(.., score)| {
                    score_constraints
                        .iter()
                        .all(|(mode, t)| if *mode == "min" { *score >= *t } else { *score <= *t })
                })
                .collect();
            // Stable sort by score desc: ties keep the canonical (BTreeSet)
            // ordering of the isomer set, so the result is deterministic.
            ranked.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));

            let mut facts_new: Vec<Fact> = Vec::new();
            if ranked.is_empty() {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "select-solution".to_string(),
                    detail: format!(
                        "no generated isomer of {} satisfies the structural constraints",
                        formula_str
                    ),
                    depth: 0,
                    objects: vec![],
                });
                facts_new.push(Fact {
                    key: "selected-isomer".to_string(),
                    value: "none".to_string(),
                });
                generated_summary = Some(format!(
                    "generated {} isomers of {}; 0 satisfied structural constraints",
                    isomers.len(),
                    formula_str
                ));
            } else {
                let (ref sel_formula, _sel_mol, ref sel_props, sel_score) = ranked[0];
                let sel_id = format!("{}#1", sel_formula);
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "select-solution".to_string(),
                    detail: format!(
                        "selected {} ({}), plausibility {:.3} = 1/(1+DBE), DBE={}",
                        sel_id,
                        sel_props.prop_string(),
                        sel_score,
                        sel_props.dbe()
                    ),
                    depth: 0,
                    objects: vec![],
                });
                facts_new.push(Fact {
                    key: "selected-isomer".to_string(),
                    value: format!("{} ({})", sel_id, sel_props.prop_string()),
                });
                facts_new.push(Fact {
                    key: "isomer-count".to_string(),
                    value: isomers.len().to_string(),
                });
                facts_new.push(Fact {
                    key: "isomer-survivor-count".to_string(),
                    value: ranked.len().to_string(),
                });
                for (k, (_, _mol, props, score)) in ranked.iter().enumerate() {
                    if k >= ISOMER_FACT_LIST_CAP {
                        facts_new.push(Fact {
                            key: "isomer-list-cap".to_string(),
                            value: format!(
                                "only the first {} of {} survivors listed",
                                ISOMER_FACT_LIST_CAP,
                                ranked.len()
                            ),
                        });
                        break;
                    }
                    facts_new.push(Fact {
                        key: format!("isomer:{}", formula_str),
                        value: format!(
                            "#{:03} dbe={} score={:.3} {}",
                            k + 1,
                            props.dbe(),
                            score,
                            props.prop_string()
                        ),
                    });
                }
                generated_summary = Some(format!(
                    "generated {} isomers of {}; {} survived structural constraints; top-ranked {} (DBE={})",
                    isomers.len(),
                    formula_str,
                    ranked.len(),
                    sel_id,
                    sel_props.dbe()
                ));
            }
            facts.extend(facts_new);
        }
        if let Some(summary) = &generated_summary {
            explanation.push_str("; generate-and-test: ");
            explanation.push_str(summary);
        }

        // Derive a real chemical name for every nameable candidate (fits
        // within BreedOutput's existing `facts` field -- no schema change):
        // the candidate id already encodes the structure
        // ("<family>-F<n>-<R1>-<R2>"), this was previously never decoded.
        for c in &candidates {
            if let Some(name) = derive_chemical_name(&c.id) {
                facts.push(Fact {
                    key: format!("chemical_name:{}", c.id),
                    value: name,
                });
            }
        }
        if let Some(sel_id) = &selected {
            if let Some(name) = derive_chemical_name(sel_id) {
                facts.push(Fact {
                    key: "selected_chemical_name".to_string(),
                    value: name,
                });
            }
        }

        Ok(BreedOutput {
            breed: BreedId::Dendral,
            candidates,
            facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn cand(id: &str, score: f32) -> Candidate {
        Candidate {
            id: id.to_string(),
            score,
            eliminated: false,
            elimination_reason: None,
        }
    }

    fn input_with(candidates: Vec<Candidate>, constraint_values: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "constraint_enumeration".to_string(),
            candidates,
            facts: constraint_values
                .into_iter()
                .map(|v| Fact {
                    key: "constraint".to_string(),
                    value: v.to_string(),
                })
                .collect(),
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    // Rank-2 (domain contract): the documented constraint grammar is
    // {forbid,require,max-score,min-score}. An unknown prefix must NOT
    // silently no-op — it must stop the line.
    #[test]
    fn unknown_constraint_prefix_is_rejected() {
        let input = input_with(vec![cand("alpha", 0.7)], vec!["weird:foo"]);
        let err = Dendral.run(&input).expect_err("unknown prefix should fail");
        assert_eq!(err.breed, BreedId::Dendral);
        assert!(
            err.message.contains("unknown constraint prefix"),
            "expected unknown-prefix error, got: {}",
            err.message
        );
    }

    // Rank-2: a malformed `max-score:abc` (non-parseable threshold) must
    // not silently let high-score candidates through.
    #[test]
    fn malformed_max_score_threshold_is_rejected() {
        let input = input_with(vec![cand("alpha", 99.0)], vec!["max-score:not-a-number"]);
        let err = Dendral
            .run(&input)
            .expect_err("malformed threshold should fail");
        assert!(
            err.message.contains("max-score"),
            "expected max-score parse error, got: {}",
            err.message
        );
    }

    // Rank-2: min-score parse failure must also be loud.
    #[test]
    fn malformed_min_score_threshold_is_rejected() {
        let input = input_with(vec![cand("alpha", 0.1)], vec!["min-score:NaNoNaN"]);
        let err = Dendral
            .run(&input)
            .expect_err("malformed threshold should fail");
        assert!(err.message.contains("min-score"), "got: {}", err.message);
    }

    // Rank-1 (mathematical theorem) — domain monotonicity:
    // For a well-formed `max-score:T`, a candidate with score == T must
    // SURVIVE (strict > means tied scores pass) and score > T must be
    // eliminated. This pins the boundary against off-by-one regressions.
    #[test]
    fn max_score_boundary_strict_greater() {
        let input = input_with(
            vec![cand("at_thresh", 5.0), cand("above", 5.5)],
            vec!["max-score:5.0"],
        );
        let out = Dendral.run(&input).expect("well-formed run");
        let at = out.candidates.iter().find(|c| c.id == "at_thresh").unwrap();
        let above = out.candidates.iter().find(|c| c.id == "above").unwrap();
        assert!(!at.eliminated, "score==threshold must survive max-score");
        assert!(above.eliminated, "score>threshold must be eliminated");
    }

    // Regression: well-formed constraints still work after up-front validation.
    #[test]
    fn well_formed_constraints_still_work() {
        let input = input_with(
            vec![cand("alpha", 0.7), cand("bravo", 0.8)],
            vec!["forbid:alpha"],
        );
        let out = Dendral.run(&input).expect("forbid is well-formed");
        assert_eq!(out.selected.as_deref(), Some("bravo"));
    }

    #[test]
    fn refuses_empty_candidates() {
        let input = input_with(vec![], vec!["forbid:alpha"]);
        assert!(Dendral.preconditions(&input).is_err());
    }

    #[test]
    fn falsification_gate_highest_scoring_survivor_selected() {
        // alpha: 10, beta: 5, gamma: 20
        // forbid gamma. alpha must be selected, not beta.
        let input = input_with(
            vec![cand("alpha", 10.0), cand("beta", 5.0), cand("gamma", 20.0)],
            vec!["forbid:gamma"],
        );
        let out = Dendral.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("alpha"));
    }

    #[test]
    fn falsification_fixture_ketone_elimination() {
        // Feigenbaum-Buchanan-Lederberg 1971 (AIM-131) ketone family example.
        // C5H10O / MW=86 / 3-pentanone alpha-cleavage at m/z 57 and 29.
        // Four candidates are forbidden by constraint; four must survive.
        // The highest-scoring survivor must be ketone-F1-C2H5-C2H5 (score=0.91).
        // Verbatim from tests/fixtures/papers/dendral.json.
        let input = BreedInput {
            intent: "identify molecular structure from mass-spectrometry fragmentation constraints"
                .into(),
            candidates: vec![
                cand("ketone-F1-C2H5-C2H5", 0.91),
                cand("ketone-F2-CH3-C3H7", 0.84),
                cand("ketone-F3-CH3-C3H7-branched", 0.78),
                cand("ketone-F4-C4H9-CH3", 0.72),
                cand("ether-F5-C2H5-O-C2H5", 0.45),
                cand("amine-F6-C2H5-NH-C2H5", 0.38),
                cand("ketone-F7-C4H9-CH3-iso", 0.66),
                cand("ketone-F8-CH3-CH3-C2H4", 0.55),
            ],
            facts: vec![
                Fact {
                    key: "molecular-formula".into(),
                    value: "C5H10O".into(),
                },
                Fact {
                    key: "molecular-weight".into(),
                    value: "86".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:ether-F5-C2H5-O-C2H5".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:amine-F6-C2H5-NH-C2H5".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:ketone-F7-C4H9-CH3-iso".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:ketone-F8-CH3-CH3-C2H4".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "57".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "29".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "86".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "71".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "43".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = Dendral.run(&input).expect("fixture run must succeed");

        // Correct structure must be selected (highest-scoring survivor).
        assert_eq!(
            out.selected.as_deref(),
            Some("ketone-F1-C2H5-C2H5"),
            "diethyl ketone (3-pentanone) must rank first (Feigenbaum 1971 Table 4)"
        );

        // All four forbidden candidates must be eliminated.
        for forbidden in &[
            "ether-F5-C2H5-O-C2H5",
            "amine-F6-C2H5-NH-C2H5",
            "ketone-F7-C4H9-CH3-iso",
            "ketone-F8-CH3-CH3-C2H4",
        ] {
            let c = out
                .candidates
                .iter()
                .find(|c| c.id == *forbidden)
                .unwrap_or_else(|| panic!("candidate {} must be present", forbidden));
            assert!(c.eliminated, "candidate {} must be eliminated", forbidden);
        }

        // All four ketone survivors must NOT be eliminated.
        for survivor in &[
            "ketone-F1-C2H5-C2H5",
            "ketone-F2-CH3-C3H7",
            "ketone-F3-CH3-C3H7-branched",
            "ketone-F4-C4H9-CH3",
        ] {
            let c = out
                .candidates
                .iter()
                .find(|c| c.id == *survivor)
                .unwrap_or_else(|| panic!("candidate {} must be present", survivor));
            assert!(!c.eliminated, "candidate {} must survive", survivor);
        }

        // The selected candidate's real chemical name (derived from its id,
        // not looked up from any input the fixture provides -- no fact in
        // this fixture states it) must match Feigenbaum 1971's stated answer.
        let name = out
            .facts
            .iter()
            .find(|f| f.key == "selected_chemical_name")
            .unwrap_or_else(|| panic!("selected_chemical_name fact must be present"));
        assert_eq!(
            name.value, "3-pentanone (diethyl ketone)",
            "Feigenbaum 1971 Table 4: the correct ketone-family answer is diethyl ketone (3-pentanone)"
        );
    }

    #[test]
    fn derive_chemical_name_general_over_asymmetric_and_other_families() {
        // Asymmetric ketone: methyl + propyl, IUPAC locant favors the shorter arm.
        assert_eq!(
            derive_chemical_name("ketone-F2-CH3-C3H7").as_deref(),
            Some("2-pentanone (methyl propyl ketone)")
        );
        // Ether family: trivial name only (no "-one" IUPAC suffix applies).
        assert_eq!(
            derive_chemical_name("ether-F5-C2H5-C2H5").as_deref(),
            Some("diethyl ether")
        );
        // A trailing structural-variant suffix must refuse rather than mis-name.
        assert_eq!(derive_chemical_name("ketone-F3-CH3-C3H7-branched"), None);
        // Unrecognized family must refuse.
        assert_eq!(derive_chemical_name("unknown-F1-CH3-CH3"), None);
    }

    #[test]
    fn invariant_monotonicity() {
        let cands = vec![cand("A", 1.0), cand("B", 1.0), cand("C", 1.0)];
        let in1 = input_with(cands.clone(), vec!["forbid:A"]);
        let in2 = input_with(cands, vec!["forbid:A", "forbid:B"]);

        let out1 = Dendral.run(&in1).unwrap();
        let out2 = Dendral.run(&in2).unwrap();

        let s1 = out1.candidates.iter().filter(|c| !c.eliminated).count();
        let s2 = out2.candidates.iter().filter(|c| !c.eliminated).count();
        assert!(s2 <= s1, "Adding constraints cannot increase survivors");
    }

    // =========================================================================
    // Layer 2 — generate-and-test over the isomer space
    // =========================================================================

    fn formula_input(formula: &str, constraint_values: Vec<&str>) -> BreedInput {
        let mut input = input_with(
            vec![cand("legacy-candidate", 0.5)],
            constraint_values,
        );
        input.facts.insert(
            0,
            Fact {
                key: "molecular-formula".to_string(),
                value: formula.to_string(),
            },
        );
        input
    }

    // Rank-1 (mathematical theorem): alkane constitutional-isomer counts are
    // known chemistry. n=1: 1; C3H8: 1; C4H10: 2 (n-butane, isobutane);
    // C5H12: 3 (n-pentane, isopentane, neopentane). Canonicalization must
    // dedupe relabelings to exactly these counts.
    #[test]
    fn alkane_isomer_counts_match_chemistry() {
        assert_eq!(enumerate_isomers(parse_formula("CH4").unwrap()).unwrap().len(), 1);
        assert_eq!(enumerate_isomers(parse_formula("C3H8").unwrap()).unwrap().len(), 1);
        assert_eq!(enumerate_isomers(parse_formula("C4H10").unwrap()).unwrap().len(), 2);
        assert_eq!(enumerate_isomers(parse_formula("C5H12").unwrap()).unwrap().len(), 3);
    }

    // C5H10O has DBE=1: at least one generated isomer must carry a real
    // carbonyl (the Feigenbaum ketone family), derived from the bond graph.
    #[test]
    fn c5h10o_generation_finds_carbonyl_isomers() {
        let isomers = enumerate_isomers(parse_formula("C5H10O").unwrap()).unwrap();
        assert!(!isomers.is_empty(), "C5H10O must generate isomers");
        assert!(
            isomers
                .iter()
                .any(|m| m.structure_props().carbonyl),
            "C5H10O isomer space must include carbonyl structures (ketone/aldehyde)"
        );
        // DBE=1 formula cannot contain a triple bond (costs DBE 2).
        assert!(
            isomers.iter().all(|m| m.structure_props().triple_bonds == 0),
            "no isomer of C5H10O may contain a triple bond (DBE budget)"
        );
    }

    // Full breed run: trace steps and facts with real counts.
    #[test]
    fn formula_input_emits_generate_test_select_trace() {
        let input = formula_input("C5H10O", vec![]);
        let out = Dendral.run(&input).expect("formula run");
        let kinds: Vec<&str> = out.inference_trace.iter().map(|t| t.kind.as_str()).collect();
        assert!(kinds.contains(&"generate-isomers"), "kinds: {:?}", kinds);
        assert!(kinds.contains(&"test-constraints"), "kinds: {:?}", kinds);
        assert!(kinds.contains(&"select-solution"), "kinds: {:?}", kinds);

        let count = out
            .facts
            .iter()
            .find(|f| f.key == "isomer-count")
            .expect("isomer-count fact");
        assert!(count.value.parse::<usize>().unwrap() > 0);
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "selected-isomer" && f.value != "none"));
        // Legacy candidate layer untouched.
        assert_eq!(out.selected.as_deref(), Some("legacy-candidate"));
    }

    // Structural post-filter: require:carbonyl keeps only carbonyl isomers.
    #[test]
    fn require_carbonyl_post_filters_generated_structures() {
        let unfiltered = formula_input("C5H10O", vec![]);
        let filtered = formula_input("C5H10O", vec!["require:carbonyl"]);
        let out_u = Dendral.run(&unfiltered).unwrap();
        let out_f = Dendral.run(&filtered).unwrap();
        let survivors = |o: &BreedOutput| {
            o.facts
                .iter()
                .find(|f| f.key == "isomer-survivor-count")
                .and_then(|f| f.value.parse::<usize>().ok())
                .expect("isomer-survivor-count fact")
        };
        let s_u = survivors(&out_u);
        let s_f = survivors(&out_f);
        assert!(s_f > 0, "C5H10O carbonyl isomers exist");
        assert!(s_f < s_u, "carbonyl filter must reduce survivors ({} -> {})", s_u, s_f);
        for f in out_f.facts.iter().filter(|f| f.key == "isomer:C5H10O") {
            assert!(f.value.contains("carbonyl=1"), "survivor must be carbonyl: {}", f.value);
        }
    }

    // Refusal, not truncation: oversized formula is a typed error.
    #[test]
    fn oversized_formula_is_typed_refusal() {
        let input = formula_input("C9H20", vec![]);
        let err = Dendral.run(&input).expect_err("oversize must refuse");
        assert!(
            err.message.contains("refusal"),
            "refusal-style message expected, got: {}",
            err.message
        );
    }

    // Malformed formula fact is a loud typed error, never a silent skip.
    #[test]
    fn malformed_formula_is_typed_refusal() {
        let input = formula_input("C5X10Y", vec![]);
        let err = Dendral.run(&input).expect_err("bad formula must refuse");
        assert!(
            err.message.contains("malformed molecular-formula"),
            "got: {}",
            err.message
        );
    }

    // Determinism: identical inputs produce byte-identical outputs.
    #[test]
    fn generate_and_test_is_deterministic() {
        let a = Dendral.run(&formula_input("C5H10O", vec!["require:carbonyl"])).unwrap();
        let b = Dendral.run(&formula_input("C5H10O", vec!["require:carbonyl"])).unwrap();
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn parse_formula_parses_counts_and_refuses_unknown_elements() {
        assert_eq!(parse_formula("C5H10O").unwrap(), [5, 10, 0, 1]);
        assert_eq!(parse_formula("CH4").unwrap(), [1, 4, 0, 0]);
        assert_eq!(parse_formula("C2H5NO").unwrap(), [2, 5, 1, 1]);
        assert!(parse_formula("C5S").is_err());
        assert!(parse_formula("").is_err());
    }
}
