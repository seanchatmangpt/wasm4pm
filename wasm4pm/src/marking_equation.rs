//! Marking equation LP solver for Petri net alignment heuristics.

//! Two-phase simplex LP solver for the marking equation used in Petri net
//! alignment heuristics.  Solves `min c^T x  s.t.  A x = b, x >= 0` where
//! `A` is the incidence matrix, `c` the cost vector, and `b = final -
//! current marking`.  Pure f64 arithmetic -- no external LP dependencies.

/// Error types returned by the marking-equation solver.
#[derive(Debug, Clone, PartialEq)]
pub enum LpError {
    /// Phase 1 could not drive artificial variables to zero.
    Infeasible,
    /// Objective can decrease without limit.
    Unbounded,
    /// Dimension mismatch in the inputs.
    InvalidDimensions {
        expected_rows: usize,
        expected_cols: usize,
        actual: String,
    },
    /// Pivots exhausted without convergence.
    NumericalInstability,
}

impl std::fmt::Display for LpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Infeasible => write!(f, "LP is infeasible"),
            Self::Unbounded => write!(f, "LP is unbounded"),
            Self::InvalidDimensions {
                expected_rows,
                expected_cols,
                actual,
            } => {
                write!(
                    f,
                    "dimension mismatch: expected {}x{}, got {}",
                    expected_rows, expected_cols, actual
                )
            }
            Self::NumericalInstability => {
                write!(f, "numerical instability: max iterations exceeded")
            }
        }
    }
}

impl std::error::Error for LpError {}

const MAX_PIVOTS: usize = 10_000;
const EPS: f64 = 1e-9;

/// Solve the marking equation LP via two-phase simplex.
///
/// # Arguments
///
/// * `incidence_matrix` -- `A` (places x transitions), entries typically -1/0/+1.
/// * `costs` -- Cost vector `c` (one per transition, non-negative).
/// * `rhs` -- Marking difference `b = final - current` (one per place, may be negative).
///
/// # Returns
///
/// `Ok((optimal_cost, solution_vector))` or `Err(LpError)`.
///
/// # Example
///
/// ```
/// let a = vec![vec![1, -1, 0], vec![0, 1, -1]];
/// let c = vec![1.0, 1.0, 1.0];
/// let b = vec![0, 1];
/// let (cost, _x) = pictl_wasm4pm::marking_equation::solve_marking_equation(&a, &c, &b).unwrap();
/// assert!((cost - 2.0).abs() < 1e-6);
/// ```
pub fn solve_marking_equation(
    incidence_matrix: &[Vec<i32>],
    costs: &[f64],
    rhs: &[i32],
) -> Result<(f64, Vec<f64>), LpError> {
    let m = incidence_matrix.len();
    if m == 0 {
        return Ok((0.0, vec![0.0; costs.len()]));
    }
    let n = incidence_matrix[0].len();

    // Validate dimensions
    if costs.len() != n {
        return Err(LpError::InvalidDimensions {
            expected_rows: 1,
            expected_cols: n,
            actual: format!("costs.len()={}", costs.len()),
        });
    }
    for row in incidence_matrix.iter() {
        if row.len() != n {
            return Err(LpError::InvalidDimensions {
                expected_rows: m,
                expected_cols: n,
                actual: format!("row of length {}", row.len()),
            });
        }
    }
    if rhs.len() != m {
        return Err(LpError::InvalidDimensions {
            expected_rows: m,
            expected_cols: 1,
            actual: format!("rhs.len()={}", rhs.len()),
        });
    }

    let a: Vec<Vec<f64>> = incidence_matrix
        .iter()
        .map(|r| r.iter().map(|&v| v as f64).collect())
        .collect();
    let b: Vec<f64> = rhs.iter().map(|&v| v as f64).collect();

    // --- Build Phase 1 tableau ---
    // Layout: m constraint rows + 1 objective row.  Columns: n original + m artificial + 1 RHS.
    let total_vars = n + m;
    let total_cols = total_vars + 1;
    let mut tab = vec![vec![0.0; total_cols]; m + 1];

    for i in 0..m {
        for j in 0..n {
            tab[i][j] = a[i][j];
        }
        tab[i][n + i] = 1.0; // artificial (identity)
        tab[i][total_cols - 1] = b[i];
        // Flip rows with negative RHS so initial BFS has non-negative values.
        if b[i] < 0.0 {
            for k in 0..total_cols {
                tab[i][k] *= -1.0;
            }
        }
    }

    // Phase 1 objective: maximise z1 = -sum(a_i).
    // Tableau stores negated maximisation cost: +1 per artificial, then zero basic columns.
    for i in 0..m {
        tab[m][n + i] = 1.0;
    }
    for i in 0..m {
        for k in 0..total_cols {
            tab[m][k] -= tab[i][k];
        }
    }

    let mut basis: Vec<usize> = (0..m).map(|i| n + i).collect();
    let is_art: Vec<bool> = (0..total_vars).map(|j| j >= n).collect();

    // --- Phase 1 ---
    match simplex(&mut tab, &mut basis, m, total_vars) {
        PivotResult::Optimal => {}
        PivotResult::Unbounded => return Err(LpError::Infeasible),
        PivotResult::MaxIterations => return Err(LpError::NumericalInstability),
    }

    // Check artificials left in basis
    let art_in_basis: Vec<usize> = basis
        .iter()
        .enumerate()
        .filter(|(_, &bv)| is_art[bv])
        .map(|(i, _)| i)
        .collect();
    for &ri in &art_in_basis {
        if tab[ri][total_cols - 1].abs() > EPS {
            return Err(LpError::Infeasible);
        }
        pivot_out_artificial(&mut tab, &mut basis, ri, n, total_vars);
    }

    // --- Phase 2: optimise original objective ---
    // Maximise z = -c^T x.  Tableau stores +c_j, then subtract basic contributions.
    for k in 0..total_cols {
        tab[m][k] = 0.0;
    }
    for j in 0..n {
        tab[m][j] = costs[j];
    }
    for (i, &bv) in basis.iter().enumerate() {
        if bv < n {
            let cj = costs[bv];
            for k in 0..total_cols {
                tab[m][k] -= cj * tab[i][k];
            }
        }
    }
    // Block artificials from re-entering.
    for j in n..total_vars {
        tab[m][j] = 0.0;
        for i in 0..m {
            tab[i][j] = 0.0;
        }
    }

    match simplex(&mut tab, &mut basis, m, n) {
        PivotResult::Optimal => {}
        PivotResult::Unbounded => return Err(LpError::Unbounded),
        PivotResult::MaxIterations => return Err(LpError::NumericalInstability),
    }

    // Extract: negate because we maximised -c^T x.
    let optimal_cost = -tab[m][total_cols - 1];
    let mut solution = vec![0.0; n];
    for (i, &bv) in basis.iter().enumerate() {
        if bv < n {
            solution[bv] = tab[i][total_cols - 1];
        }
    }
    for v in solution.iter_mut() {
        if *v < 0.0 && *v > -EPS {
            *v = 0.0;
        }
    }

    Ok((optimal_cost, solution))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

enum PivotResult {
    Optimal,
    Unbounded,
    MaxIterations,
}

/// Simplex pivoting loop.  Entering variable: most negative reduced cost.
/// Leaving variable: minimum ratio test with Bland's tie-breaking.
fn simplex(tab: &mut [Vec<f64>], basis: &mut [usize], m: usize, n_vars: usize) -> PivotResult {
    let ncols = tab[0].len();
    for _ in 0..MAX_PIVOTS {
        // Entering: most negative reduced cost
        let (enter_col, _) = (0..n_vars)
            .map(|j| (j, tab[m][j]))
            .filter(|&(_, rc)| rc < -EPS)
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .unzip();
        let ec = match enter_col {
            None => return PivotResult::Optimal,
            Some(c) => c,
        };

        // Leaving: minimum ratio test
        let (leave_row, _) = (0..m)
            .filter(|&i| tab[i][ec] > EPS)
            .map(|i| (i, tab[i][ncols - 1] / tab[i][ec]))
            .min_by(|a, b| {
                a.1.partial_cmp(&b.1)
                    .unwrap()
                    .then_with(|| basis[a.0].cmp(&basis[b.0])) // Bland's rule
            })
            .unzip();
        let lr = match leave_row {
            None => return PivotResult::Unbounded,
            Some(r) => r,
        };

        do_pivot(tab, lr, ec);
        basis[lr] = ec;
    }
    PivotResult::MaxIterations
}

/// Single pivot: scale pivot row, eliminate column from other rows.
fn do_pivot(tab: &mut [Vec<f64>], pr: usize, col: usize) {
    let ncols = tab[0].len();
    let piv = tab[pr][col];
    if piv.abs() < EPS {
        return;
    }
    let inv = 1.0 / piv;
    for k in 0..ncols {
        tab[pr][k] *= inv;
    }
    for i in 0..tab.len() {
        if i == pr {
            continue;
        }
        let f = tab[i][col];
        if f.abs() < EPS {
            continue;
        }
        for k in 0..ncols {
            tab[i][k] -= f * tab[pr][k];
        }
    }
}

/// Try to replace an artificial basic variable with a non-artificial in the same row.
fn pivot_out_artificial(
    tab: &mut [Vec<f64>],
    basis: &mut [usize],
    row: usize,
    n_orig: usize,
    total: usize,
) {
    for j in 0..n_orig {
        if tab[row][j].abs() > EPS {
            do_pivot(tab, row, j);
            basis[row] = j;
            return;
        }
    }
    // Try non-artificial columns beyond n_orig
    for j in n_orig..total {
        if tab[row][j].abs() > EPS && !basis.contains(&j) {
            do_pivot(tab, row, j);
            basis[row] = j;
            return;
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_feasible() {
        // A=[[1,-1,0],[0,1,-1]], c=[1,1,1], b=[0,1] => x=[1,1,0], cost=2
        let a = vec![vec![1, -1, 0], vec![0, 1, -1]];
        let (cost, x) = solve_marking_equation(&a, &[1.0, 1.0, 1.0], &[0, 1]).unwrap();
        assert!((cost - 2.0).abs() < 1e-6, "cost={}", cost);
        assert!((x[0] - 1.0).abs() < 1e-6);
        assert!((x[1] - 1.0).abs() < 1e-6);
        assert!(x[2].abs() < 1e-6);
    }

    #[test]
    fn test_infeasible() {
        // A=I(2x2), b=[-1,-1] => x must be negative => infeasible
        let a = vec![vec![1, 0], vec![0, 1]];
        assert_eq!(
            solve_marking_equation(&a, &[1.0, 1.0], &[-1, -1]),
            Err(LpError::Infeasible)
        );
    }

    #[test]
    fn test_equality_only() {
        // A=[[2,1,-1],[1,-1,2]], c=[1,2,3], b=[5,3] => cost=3.2
        let a = vec![vec![2, 1, -1], vec![1, -1, 2]];
        let (cost, x) = solve_marking_equation(&a, &[1.0, 2.0, 3.0], &[5, 3]).unwrap();
        assert!((cost - 3.2).abs() < 1e-4, "cost={}", cost);
        assert!((x[0] - 2.6).abs() < 1e-4);
        assert!(x[1].abs() < 1e-4);
    }

    #[test]
    fn test_empty_system() {
        let (cost, x) = solve_marking_equation(&[], &[1.0, 2.0], &[]).unwrap();
        assert!(cost.abs() < 1e-9);
        assert!(x.iter().all(|&v| v.abs() < 1e-9));
    }

    #[test]
    fn test_dimension_mismatch() {
        let a = vec![vec![1, 0, 0]];
        let res = solve_marking_equation(&a, &[1.0], &[1]);
        assert!(matches!(res, Err(LpError::InvalidDimensions { .. })));
    }

    #[test]
    fn test_negative_rhs_feasible() {
        // A=[[-1,2]], b=[-2] => x0=2, x1=0, cost=2
        let a = vec![vec![-1, 2]];
        let (cost, x) = solve_marking_equation(&a, &[1.0, 1.0], &[-2]).unwrap();
        assert!((cost - 2.0).abs() < 1e-6, "cost={}", cost);
        assert!((x[0] - 2.0).abs() < 1e-6);
    }

    #[test]
    fn test_zero_cost_vars() {
        // A=[[1,1,1]], c=[0,1,1], b=[2] => x0=2, cost=0
        let a = vec![vec![1, 1, 1]];
        let (cost, x) = solve_marking_equation(&a, &[0.0, 1.0, 1.0], &[2]).unwrap();
        assert!(cost.abs() < 1e-6, "cost={}", cost);
        assert!((x[0] - 2.0).abs() < 1e-6);
    }
}
