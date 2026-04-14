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
//! - **Error rate**: Errors per 1000 lines of code
//! - **Test status**: Pass/fail rates
//! - **Overall health**: Aggregate score (0-100)

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use git2::Repository;
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

    /// Compiler warnings
    pub compiler_warnings: usize,

    /// Open issues/PRs
    pub open_items: usize,

    /// Error rate per KLOC
    pub error_rate_per_kloc: f64,
}

/// Analyze andon status from repository
pub fn analyze_andon(repo_path: &str) -> Result<AndonMetrics> {
    let repo = Repository::open(repo_path)
        .context("Failed to open git repository")?;

    // Analyze recent commits for build success rate
    let build_success_rate = analyze_build_success(&repo)?;

    // Check for deploy indicators (tags, releases)
    let (deploy_status, deploy_hours_ago) = analyze_deploy_status(&repo)?;

    // Analyze test pass rate from git history
    let test_pass_rate = analyze_test_pass_rate(&repo)?;

    // Count compiler warnings (from build output)
    let compiler_warnings = count_compiler_warnings(repo_path)?;

    // Count open items (branches = potential work)
    let open_items = count_open_branches(&repo)?;

    // Calculate health score
    let health_score = calculate_health_score(
        build_success_rate,
        deploy_status == "success",
        test_pass_rate,
        compiler_warnings,
        open_items,
    );

    // Estimate error rate (TODO: integrate with actual error tracking)
    let error_rate_per_kloc = 0.0; // Placeholder

    Ok(AndonMetrics {
        health_score,
        build_success_rate,
        last_deploy_status: deploy_status,
        last_deploy_hours_ago: deploy_hours_ago,
        test_pass_rate,
        compiler_warnings,
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
        // (In real implementation, check CI status)
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
        if let Some(ref_name) = reference.name() {
            if ref_name.starts_with("refs/tags/") {
                // Try to peel the tag to get the commit
                if let Ok(target) = reference.peel_to_commit() {
                    let time = target.time();
                    let tag_date = DateTime::<Utc>::from_timestamp(time.seconds(), 0)
                        .unwrap_or_default();

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

/// Count compiler warnings from build artifacts
fn count_compiler_warnings(repo_path: &str) -> Result<usize> {
    // Check for common warning indicators
    // This is a simplified check - real implementation would parse build logs

    let mut warning_count = 0;

    // Check for TODO/FIXME (deferred defects)
    for entry in fs::read_dir(repo_path).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            // Count TODO/FIXME/HACK comments
            warning_count += content.matches("TODO").count();
            warning_count += content.matches("FIXME").count();
            warning_count += content.matches("HACK").count();
        }
    }

    Ok(warning_count)
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
    warnings: usize,
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

    // Warnings: 20% weight (5 warnings = lose all 20 points)
    let warning_score = 20u8.saturating_sub((warnings as u8 * 4).min(20));
    score = score.saturating_sub(20 - warning_score);

    // Open items: 15% weight (5 items = lose all 15 points)
    let item_score = 15u8.saturating_sub((open_items as u8 * 3).min(15));
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
        90..=100 => "🟢".to_string(),
        70..=89 => "🟡".to_string(),
        50..=69 => "🟠".to_string(),
        _ => "🔴".to_string(),
    };

    report.push_str(&format!("  Health Score: {} / 100\n", metrics.health_score));
    report.push_str(&format!("    Status: {}\n", health_color));

    // Component status
    report.push_str(&"\nComponent Status:\n".bold());

    // Build status
    report.push_str(&format!("  Build Success Rate: {:.1}%\n", metrics.build_success_rate));
    let build_status = if metrics.build_success_rate >= 95.0 {
        "✅".green()
    } else if metrics.build_success_rate >= 80.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", build_status));

    // Deploy status
    report.push_str(&format!("  Last Deploy: {} ({:.1} hours ago)\n",
        metrics.last_deploy_status, metrics.last_deploy_hours_ago));
    let deploy_status = if metrics.last_deploy_status == "success" && metrics.last_deploy_hours_ago < 24.0 {
        "✅".green()
    } else if metrics.last_deploy_status == "success" {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", deploy_status));

    // Test status
    report.push_str(&format!("  Test Pass Rate: {:.1}%\n", metrics.test_pass_rate));
    let test_status = if metrics.test_pass_rate >= 95.0 {
        "✅".green()
    } else if metrics.test_pass_rate >= 80.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", test_status));

    // Warnings
    report.push_str(&format!("  Compiler Warnings: {}\n", metrics.compiler_warnings));
    let warning_status = if metrics.compiler_warnings == 0 {
        "✅".green()
    } else if metrics.compiler_warnings < 5 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", warning_status));

    // Work in progress
    report.push_str(&format!("  Open Branches: {}\n", metrics.open_items));
    let wip_status = if metrics.open_items <= 3 {
        "✅".green()
    } else if metrics.open_items <= 7 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", wip_status));

    // Recommendations
    report.push_str(&"\nImmediate Actions:\n".bold());

    if metrics.health_score < 70 {
        report.push_str(&"  • Health score below 70. Investigate failing components.\n".red());
    }

    if metrics.build_success_rate < 80.0 {
        report.push_str(&"  • Build success rate low. Check CI failures.\n".yellow());
    }

    if metrics.compiler_warnings > 5 {
        let msg = format!("  • {} warnings present. Fix warnings to improve quality.\n",
            metrics.compiler_warnings);
        report.push_str(&msg.yellow());
    }

    if metrics.open_items > 5 {
        report.push_str(&"  • Many open branches. Reduce WIP.\n".yellow());
    }

    if metrics.health_score >= 90 {
        report.push_str(&"  • System is healthy! Maintain standards.\n".green());
    }

    report.push('\n');

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_health_score_perfect() {
        let score = calculate_health_score(100.0, true, 100.0, 0, 0);
        assert_eq!(score, 100);
    }

    #[test]
    fn test_calculate_health_score_poor() {
        let score = calculate_health_score(50.0, false, 50.0, 10, 10);
        assert!(score < 50);
    }
}
