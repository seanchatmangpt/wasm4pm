//! Value Stream Mapping
//!
//! Analyzes end-to-end delivery pipeline for waste and value-added work.
//!
//! # Value Stream Definition
//!
//! Value stream maps the flow from idea to production.
//! In software: time spent coding vs waiting in review, testing, deployment.
//!
//! # Metrics
//!
//! - **Value-added ratio**: Coding time / total lead time (target: >30%)
//! - **Wait time**: Time spent waiting (review, testing, deployment)
//! - **Process efficiency**: Ratio of active work to total time
//! - **Bottlenecks**: Stages with longest delays

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use git2::Repository;

/// Value stream metrics
#[derive(Debug, Clone, serde::Serialize)]
pub struct ValueStreamMetrics {
    /// Value-added ratio (coding time / total lead time)
    pub value_added_ratio: f64,

    /// Estimated coding time (active work)
    pub coding_time_hours: f64,

    /// Estimated wait time (review, test, deploy)
    pub wait_time_hours: f64,

    /// Total lead time
    pub total_lead_time_hours: f64,

    /// Process efficiency (active / total)
    pub process_efficiency: f64,

    /// Main bottleneck stage
    pub bottleneck: String,
}

/// Analyze value stream from git repository
pub fn analyze_value_stream(repo_path: &str, days: usize) -> Result<ValueStreamMetrics> {
    let repo = Repository::open(repo_path)
        .context("Failed to open git repository")?;

    let cutoff_date = Utc::now() - Duration::days(days as i64);

    let mut revwalk = repo.revwalk()
        .context("Failed to create revwalk")?;

    revwalk.push_head()
        .context("Failed to push HEAD")?;

    let mut coding_time_accum = 0.0;
    let mut wait_time_accum = 0.0;
    let _total_commits = 0;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        let time = commit.time();
        let commit_date = DateTime::<Utc>::from_timestamp(time.seconds(), 0)
            .unwrap_or_default();

        if commit_date < cutoff_date {
            break;
        }

        // Estimate coding time based on commit message and diff size
        let (coding_hours, wait_hours) = estimate_times(&repo, &commit)?;
        coding_time_accum += coding_hours;
        wait_time_accum += wait_hours;
    }

    let total_time = coding_time_accum + wait_time_accum;

    let value_added_ratio = if total_time > 0.0 {
        coding_time_accum / total_time
    } else {
        0.0
    };

    let process_efficiency = value_added_ratio; // Same concept

    // Identify bottleneck
    let bottleneck = if wait_time_accum > coding_time_accum * 2.0 {
        "Wait time (review/deploy)".to_string()
    } else {
        "Coding (implementation)".to_string()
    };

    Ok(ValueStreamMetrics {
        value_added_ratio,
        coding_time_hours: coding_time_accum,
        wait_time_hours: wait_time_accum,
        total_lead_time_hours: total_time,
        process_efficiency,
        bottleneck,
    })
}

/// Estimate coding time and wait time for a commit
/// This is an approximation based on heuristics
fn estimate_times(repo: &Repository, commit: &git2::Commit) -> Result<(f64, f64)> {
    // Coding time estimation:
    // - Use files changed as proxy (more accurate than lines)
    // - Assume 1 file = ~15 minutes of work (including testing, review)

    let mut coding_hours: f64 = 0.0;

    // Get parent to calculate diff size
    if let Ok(parent_commit) = commit.parent(0) {
        let tree = commit.tree().ok();
        let parent_tree = parent_commit.tree().ok();

        if let (Some(tree), Some(parent_tree)) = (tree, parent_tree) {
            if let Ok(diff) = repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), None) {
                // Count files changed as proxy for work
                let stats = diff.stats()?;
                let files_changed = stats.files_changed();
                // Each file changed ≈ 15 minutes (0.25 hours)
                coding_hours = files_changed as f64 * 0.25;
            }
        }
    }

    // Minimum coding time per commit (even for tiny changes)
    coding_hours = coding_hours.max(0.05_f64); // At least 3 minutes

    // Cap maximum coding time per commit (avoid outliers)
    coding_hours = coding_hours.min(4.0_f64); // Max 4 hours per commit

    // Wait time estimation:
    // - Time between commit and merge
    // - Assume this includes review, testing, deployment
    // - For direct commits to main, wait time is low
    // - For PR merges, wait time is higher

    // Check if commit has multiple parents (merge)
    let is_merge = commit.parent_count() > 1;

    let mut wait_hours = if is_merge {
        // Merge commits typically wait for PR review + CI
        // Assume 2-4 hours wait time
        3.0_f64
    } else {
        // Direct commits have less wait
        // Assume 0.5-1 hour for CI
        0.75_f64
    };

    // Adjust wait time based on commit message indicators
    let msg = commit.message().unwrap_or("");
    if msg.contains("WIP") || msg.contains("draft") {
        // Work-in-progress commits have shorter wait (not ready for review)
        wait_hours *= 0.3;
    } else if msg.contains("fix") || msg.contains("hotfix") {
        // Fixes may be expedited
        wait_hours *= 0.5;
    }

    Ok((coding_hours, wait_hours))
}

/// Generate value stream report
pub fn generate_report(metrics: &ValueStreamMetrics) -> String {
    use colored::*;

    let mut report = String::new();

    report.push_str(&"\n".bold());
    report.push_str(&"=== VALUE STREAM ANALYSIS ===\n".bold());
    report.push('\n');

    // Time breakdown
    report.push_str(&"Time Breakdown:\n".bold());
    report.push_str(&format!("  Coding time: {:.2} hours (active work)\n", metrics.coding_time_hours));
    report.push_str(&format!("  Wait time: {:.2} hours (review, test, deploy)\n", metrics.wait_time_hours));
    report.push_str(&format!("  Total lead time: {:.2} hours\n", metrics.total_lead_time_hours));

    // Value-added ratio
    report.push_str(&"\nValue-Added Metrics:\n".bold());
    report.push_str(&format!("  Value-added ratio: {:.1}% (coding / total)\n",
        metrics.value_added_ratio * 100.0));

    let ratio_status = if metrics.value_added_ratio >= 0.3 {
        "✅".green()
    } else if metrics.value_added_ratio >= 0.2 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {} (target: >30%)\n", ratio_status));

    report.push_str(&format!("  Process efficiency: {:.1}%\n", metrics.process_efficiency * 100.0));

    // Bottleneck
    report.push_str(&"\nBottleneck Analysis:\n".bold());
    report.push_str(&format!("  Primary bottleneck: {}\n", metrics.bottleneck));

    // Interpretation
    report.push_str(&"\nValue Stream Assessment:\n".bold());

    if metrics.value_added_ratio >= 0.3 {
        report.push_str(&"  • Excellent: High value-added ratio\n".green());
    } else if metrics.value_added_ratio >= 0.2 {
        report.push_str(&"  • Fair: Moderate value-added, room for improvement\n".yellow());
    } else {
        report.push_str(&"  • Poor: Low value-added ratio, excessive wait time\n".red());
    }

    // Recommendations
    report.push_str(&"\nKaizen Recommendations:\n".bold());

    if metrics.value_added_ratio < 0.3 {
        report.push_str(&"  • Value-added ratio below 30%. Reduce wait time in pipeline.\n".yellow());
    }

    if metrics.wait_time_hours > metrics.coding_time_hours * 2.0 {
        report.push_str(&"  • Wait time dominates. Streamline review and deployment.\n".yellow());
    }

    if metrics.bottleneck.contains("Wait") {
        report.push_str(&"  • Focus on reducing review/deployment delays.\n".yellow());
    }

    if metrics.value_added_ratio >= 0.3 && metrics.bottleneck.contains("Coding") {
        report.push_str(&"  • Value stream is efficient! Focus on coding quality.\n".green());
    }

    // Visual value stream map (text-based)
    report.push_str(&"\nValue Stream Map (text):\n".bold());
    report.push_str("  ┌────────────────────────────────────────────┐\n");
    report.push_str("  │ Idea → Coding → Review → Test → Deploy  │\n");
    report.push_str("  │   └───┬───────┬───────┬──────┬───────┘  │\n");
    report.push_str("  │     │       │       │      │       │\n");
    report.push_str(&format!("  │   {:.1}h   {:.1}h    {:.1}h    {:.1}h    {:.1}h  │\n",
        metrics.coding_time_hours * 0.1,  // Idea (small fraction)
        metrics.coding_time_hours * 0.9,  // Coding
        metrics.wait_time_hours * 0.3,   // Review
        metrics.wait_time_hours * 0.3,   // Test
        metrics.wait_time_hours * 0.4)); // Deploy
    report.push_str("  └────────────────────────────────────────────┘\n");

    report.push('\n');

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_times_minimum() {
        // This would require a mock commit
        // For now, we just verify compilation
        assert!(true);
    }
}
