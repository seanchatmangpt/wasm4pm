//! Andon (Signal Cord) - Real-Time Status Monitoring
//!
//! Provides real-time visibility into system health and problems.
//!
//! # Andon Definition
//!
//! Andon is a visual signal that alerts workers to problems.
//! In software: dashboard showing build status, deploy health, error rates.
//!
//! # Metrics
//!
//! - **Build success rate**: Percentage of successful builds
//! - **Deploy health**: Last deploy status and time
//! - **Deferred defect markers**: TODO / FIXME / HACK annotations in top-level files
//! - **Test status**: Pass/fail rates
//! - **Overall health**: Aggregate score (0-100)

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use git2::Repository;
use std::fmt::Write as _;
use std::fs;

/// Andon status metrics
#[derive(Debug, Clone, serde::Serialize)]
pub struct AndonMetrics {
    /// Overall health score (0-100)
    pub health_score: u8,

    /// Build success rate (percentage)
    pub build_success_rate: f64,

    /// Last deploy status
    pub last_deploy_status: String,

    /// Last deploy time (hours ago)
    pub last_deploy_hours_ago: f64,

    /// Test pass rate
    pub test_pass_rate: f64,

    /// Count of deferred-defect markers (TODO / FIXME / HACK) in top-level repo files.
    ///
    /// These are NOT compiler warnings from rustc/tsc. They are code annotations
    /// that signal deferred work — a meaningful TPS quality signal distinct from
    /// build-time diagnostics. This was previously misnamed `compiler_warnings`.
    pub deferred_defect_markers: usize,

    /// Open issues/PRs
    pub open_items: usize,

    /// Error rate per KLOC (currently 0.0 — requires integration with an external
    /// error-tracking backend such as Sentry, Datadog, or a parsed build log).
    pub error_rate_per_kloc: f64,
}

/// Analyze andon status from repository
pub fn analyze_andon(repo_path: &str) -> Result<AndonMetrics> {
    let repo = Repository::open(repo_path).context("Failed to open git repository")?;

    // Analyze recent commits for build success rate
    let build_success_rate = analyze_build_success(&repo)?;

    // Check for deploy indicators (tags, releases)
    let (deploy_status, deploy_hours_ago) = analyze_deploy_status(&repo)?;

    // Analyze test pass rate from git history
    let test_pass_rate = analyze_test_pass_rate(&repo)?;

    // Count deferred-defect markers (TODO / FIXME / HACK) in top-level repo files.
    // These are NOT compiler warnings; see `count_deferred_defect_markers` for details.
    let deferred_defect_markers = count_deferred_defect_markers(repo_path)?;

    // Count open items (branches = potential work)
    let open_items = count_open_branches(&repo)?;

    // Calculate health score
    let health_score = calculate_health_score(
        build_success_rate,
        deploy_status == "success",
        test_pass_rate,
        deferred_defect_markers,
        open_items,
    );

    // error_rate_per_kloc requires an external error-tracking backend (Sentry,
    // Datadog, or a parsed build log). It cannot be estimated from git history.
    let error_rate_per_kloc = 0.0;

    Ok(AndonMetrics {
        health_score,
        build_success_rate,
        last_deploy_status: deploy_status,
        last_deploy_hours_ago: deploy_hours_ago,
        test_pass_rate,
        deferred_defect_markers,
        open_items,
        error_rate_per_kloc,
    })
}

/// Analyze build success rate from commit history
fn analyze_build_success(repo: &Repository) -> Result<f64> {
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;

    let mut total_commits = 0;
    let mut successful_commits = 0;

    // Analyze last 50 commits
    for _oid in revwalk.take(50) {
        total_commits += 1;

        // Assume commit exists = successful build
        // (In real implementation, check CI status via GitHub API or CI artifact)
        successful_commits += 1;
    }

    if total_commits == 0 {
        return Ok(100.0);
    }

    Ok((successful_commits as f64 / total_commits as f64) * 100.0)
}

/// Analyze deploy status from tags and releases
fn analyze_deploy_status(repo: &Repository) -> Result<(String, f64)> {
    let mut latest_tag_time: Option<DateTime<Utc>> = None;

    // Iterate over all references and filter for tags
    let references = repo.references()?;
    for reference in references {
        let reference = reference?;
        // Check if this is a tag reference
        if let Ok(ref_name) = reference.name() {
            if ref_name.starts_with("refs/tags/") {
                // Try to peel the tag to get the commit
                if let Ok(target) = reference.peel_to_commit() {
                    let time = target.time();
                    let tag_date =
                        DateTime::<Utc>::from_timestamp(time.seconds(), 0).unwrap_or_default();

                    if latest_tag_time.is_none() || Some(tag_date) > latest_tag_time {
                        latest_tag_time = Some(tag_date);
                    }
                }
            }
        }
    }

    let hours_ago = if let Some(tag_time) = latest_tag_time {
        let now = Utc::now();
        let duration = now.signed_duration_since(tag_time);
        duration.num_hours().abs() as f64
    } else {
        999.9 // No recent deploy
    };

    let status = if latest_tag_time.is_some() {
        "success"
    } else {
        "unknown"
    };

    Ok((status.to_string(), hours_ago))
}

/// Analyze test pass rate from commit messages
fn analyze_test_pass_rate(repo: &Repository) -> Result<f64> {
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;

    let mut total_commits = 0;
    let mut passing_commits = 0;

    // Look for test-related commits
    for oid in revwalk.take(50) {
        let _oid = oid?;
        let commit = repo.find_commit(_oid)?;

        let msg = commit.message().unwrap_or("");

        // Look for "test", "fix", "pass" keywords
        if msg.contains("test") || msg.contains("Test") {
            total_commits += 1;
            // Check if commit message indicates passing tests
            if msg.contains("pass") || msg.contains("fix") {
                passing_commits += 1;
            }
        }
    }

    if total_commits == 0 {
        return Ok(100.0);
    }

    Ok((passing_commits as f64 / total_commits as f64) * 100.0)
}

/// Count deferred-defect markers (TODO / FIXME / HACK) in top-level repo files.
///
/// This function scans only the immediate children of `repo_path` (non-recursive)
/// to avoid scanning the entire repository on large monorepos. It counts occurrences
/// of `TODO`, `FIXME`, and `HACK` strings as a proxy for deferred technical debt.
///
/// This is intentionally NOT a count of rustc/tsc compiler warnings; those require
/// running the build toolchain. Use `cargo clippy --message-format=json` and parse
/// the JSON output if you need real compiler warnings.
fn count_deferred_defect_markers(repo_path: &str) -> Result<usize> {
    let mut marker_count = 0;

    let read_dir = fs::read_dir(repo_path)
        .map_err(|e| anyhow::anyhow!("Failed to read directory {}: {}", repo_path, e))?;

    for entry in read_dir {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            marker_count += content.matches("TODO").count();
            marker_count += content.matches("FIXME").count();
            marker_count += content.matches("HACK").count();
        }
    }

    Ok(marker_count)
}

/// Count open branches (work in progress)
fn count_open_branches(repo: &Repository) -> Result<usize> {
    let branches = repo.branches(Some(git2::BranchType::Local))?;
    let mut count = 0usize;

    for branch in branches {
        let _ = branch?;
        count += 1;
    }

    // Subtract main/master branch
    count = count.saturating_sub(1);

    Ok(count)
}

/// Calculate overall health score (0-100)
fn calculate_health_score(
    build_success_rate: f64,
    deploy_success: bool,
    test_pass_rate: f64,
    deferred_markers: usize,
    open_items: usize,
) -> u8 {
    let mut score = 100u8;

    // Build success rate: 25% weight
    let build_score = (build_success_rate / 100.0 * 25.0) as u8;
    score = score.saturating_sub(25 - build_score);

    // Deploy success: 15% weight
    if !deploy_success {
        score = score.saturating_sub(15);
    }

    // Test pass rate: 25% weight
    let test_score = (test_pass_rate / 100.0 * 25.0) as u8;
    score = score.saturating_sub(25 - test_score);

    // Deferred-defect markers: 20% weight (5 markers = lose all 20 points).
    // Cap at 5 before multiplying to prevent u8 overflow on large counts.
    let marker_penalty = (deferred_markers.min(5) as u8) * 4;
    let marker_score = 20u8.saturating_sub(marker_penalty);
    score = score.saturating_sub(20 - marker_score);

    // Open items: 15% weight (5 items = lose all 15 points)
    let item_penalty = (open_items.min(5) as u8) * 3;
    let item_score = 15u8.saturating_sub(item_penalty);
    score = score.saturating_sub(15 - item_score);

    score
}

/// Generate andon report
pub fn generate_report(metrics: &AndonMetrics) -> String {
    use colored::*;

    let mut report = String::new();

    report.push_str(&"\n".bold());
    report.push_str(&"=== ANDON (SIGNAL CORD) STATUS ===\n".bold());
    report.push('\n');

    // Overall health score
    report.push_str(&"Overall Health:\n".bold());

    let health_color = match metrics.health_score {
        90..=100 => "GREEN",
        70..=89 => "YELLOW",
        50..=69 => "ORANGE",
        _ => "RED",
    };

    let _ = write!(report, "  Health Score: {} / 100\n", metrics.health_score);
    let _ = write!(report, "    Status: {}\n", health_color);

    // Component status
    report.push_str(&"\nComponent Status:\n".bold());

    // Build status
    let _ = write!(
        report,
        "  Build Success Rate: {:.1}%\n",
        metrics.build_success_rate
    );
    let build_status = if metrics.build_success_rate >= 95.0 {
        "PASS".green()
    } else if metrics.build_success_rate >= 80.0 {
        "WARN".yellow()
    } else {
        "FAIL".red()
    };
    let _ = write!(report, "    Status: {}\n", build_status);

    // Deploy status
    let _ = write!(
        report,
        "  Last Deploy: {} ({:.1} hours ago)\n",
        metrics.last_deploy_status, metrics.last_deploy_hours_ago
    );
    let deploy_status =
        if metrics.last_deploy_status == "success" && metrics.last_deploy_hours_ago < 24.0 {
            "PASS".green()
        } else if metrics.last_deploy_status == "success" {
            "WARN".yellow()
        } else {
            "FAIL".red()
        };
    let _ = write!(report, "    Status: {}\n", deploy_status);

    // Test status
    let _ = write!(report, "  Test Pass Rate: {:.1}%\n", metrics.test_pass_rate);
    let test_status = if metrics.test_pass_rate >= 95.0 {
        "PASS".green()
    } else if metrics.test_pass_rate >= 80.0 {
        "WARN".yellow()
    } else {
        "FAIL".red()
    };
    let _ = write!(report, "    Status: {}\n", test_status);

    // Deferred defect markers (formerly mislabelled "Compiler Warnings")
    let _ = write!(
        report,
        "  Deferred-Defect Markers (TODO/FIXME/HACK): {}\n",
        metrics.deferred_defect_markers
    );
    let marker_status = if metrics.deferred_defect_markers == 0 {
        "PASS".green()
    } else if metrics.deferred_defect_markers < 5 {
        "WARN".yellow()
    } else {
        "FAIL".red()
    };
    let _ = write!(report, "    Status: {}\n", marker_status);

    // Work in progress
    let _ = write!(report, "  Open Branches: {}\n", metrics.open_items);
    let wip_status = if metrics.open_items <= 3 {
        "PASS".green()
    } else if metrics.open_items <= 7 {
        "WARN".yellow()
    } else {
        "FAIL".red()
    };
    let _ = write!(report, "    Status: {}\n", wip_status);

    // Recommendations
    report.push_str(&"\nImmediate Actions:\n".bold());

    if metrics.health_score < 70 {
        report.push_str(&"  * Health score below 70. Investigate failing components.\n".red());
    }

    if metrics.build_success_rate < 80.0 {
        report.push_str(&"  * Build success rate low. Check CI failures.\n".yellow());
    }

    if metrics.deferred_defect_markers > 5 {
        let msg = format!(
            "  * {} deferred-defect markers (TODO/FIXME/HACK). Address deferred work.\n",
            metrics.deferred_defect_markers
        );
        report.push_str(&msg.yellow());
    }

    if metrics.open_items > 5 {
        report.push_str(&"  * Many open branches. Reduce WIP.\n".yellow());
    }

    if metrics.health_score >= 90 {
        report.push_str(&"  * System is healthy! Maintain standards.\n".green());
    }

    report.push('\n');

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Rank-1 mathematical oracle: perfect inputs yield score 100 ──

    #[test]
    fn test_calculate_health_score_perfect() {
        let score = calculate_health_score(100.0, true, 100.0, 0, 0);
        assert_eq!(score, 100);
    }

    // ── Rank-1: poor inputs yield score < 50 ──

    #[test]
    fn test_calculate_health_score_poor() {
        let score = calculate_health_score(50.0, false, 50.0, 10, 10);
        assert!(
            score < 50,
            "poor inputs should give score < 50, got {score}"
        );
    }

    // ── Rank-1: score is always in [0, 100] — saturation must not panic ──

    /// The health score uses `saturating_sub` throughout, so extreme inputs
    /// (markers=1000, items=1000, build=0%) must never underflow below 0.
    #[test]
    fn test_calculate_health_score_never_underflows() {
        let score = calculate_health_score(0.0, false, 0.0, 1000, 1000);
        // saturating_sub prevents underflow; score must be 0 (all points lost).
        assert_eq!(score, 0, "all-worst inputs should yield 0, got {score}");
    }

    // ── Rank-1: marker penalty is capped at 20 points regardless of count ──

    /// Passing 5 markers vs 1000 markers should produce the same score because
    /// both saturate the 20-point bucket. This verifies the `min(5)` cap.
    #[test]
    fn test_large_marker_count_same_as_saturated() {
        let score_five = calculate_health_score(100.0, true, 100.0, 5, 0);
        let score_many = calculate_health_score(100.0, true, 100.0, 1000, 0);
        assert_eq!(
            score_five, score_many,
            "5 and 1000 markers should saturate identically: {score_five} vs {score_many}"
        );
    }

    // ── Rank-2 domain contract: health degrades monotonically with markers ──

    #[test]
    fn test_health_degrades_with_more_markers() {
        let score_zero = calculate_health_score(100.0, true, 100.0, 0, 0);
        let score_one = calculate_health_score(100.0, true, 100.0, 1, 0);
        let score_five = calculate_health_score(100.0, true, 100.0, 5, 0);

        assert!(
            score_zero > score_one,
            "0 markers ({score_zero}) should score higher than 1 marker ({score_one})"
        );
        assert!(
            score_one > score_five,
            "1 marker ({score_one}) should score higher than 5 markers ({score_five})"
        );
    }

    // ── Rank-2: deploy failure costs exactly 15 points ──

    #[test]
    fn test_deploy_failure_costs_fifteen_points() {
        let with_deploy = calculate_health_score(100.0, true, 100.0, 0, 0);
        let without_deploy = calculate_health_score(100.0, false, 100.0, 0, 0);

        assert_eq!(
            with_deploy - without_deploy,
            15,
            "deploy failure should cost exactly 15 points"
        );
    }

    // ── Rank-2: count_deferred_defect_markers runs without panicking ──

    /// Running against the current manifest directory (contains Cargo.toml,
    /// README.md) must return a count and must not panic or error.
    #[test]
    fn test_count_deferred_defect_markers_does_not_panic() {
        let path = env!("CARGO_MANIFEST_DIR");
        let result = count_deferred_defect_markers(path);
        assert!(
            result.is_ok(),
            "should not error on a valid directory: {:?}",
            result.err()
        );
        let _ = result.unwrap();
    }
}
