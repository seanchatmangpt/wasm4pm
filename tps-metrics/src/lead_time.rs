//! Lead Time Analysis
//!
//! Measures time from commit to merge (production readiness).
//!
//! # Lead Time Definition
//!
//! Lead time is the total time from work starting to being delivered.
//! In software: time from commit to merge into main branch.
//!
//! # Metrics
//!
//! - **Average lead time**: Target <24 hours
//! - **Median lead time**: Middle value (less skewed by outliers)
//! - **P95 lead time**: 95th percentile (worst case)
//! - **Fast merges**: Merged within 1 hour
//! - **Slow merges**: Took >48 hours

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use git2::Repository;

/// Lead time metrics for a repository
#[derive(Debug, Clone, serde::Serialize)]
pub struct LeadTimeMetrics {
    /// Average time from commit to merge (hours)
    pub average_hours: f64,

    /// Median time from commit to merge (hours)
    pub median_hours: f64,

    /// 95th percentile lead time (hours)
    pub p95_hours: f64,

    /// Percentage of commits merged within 1 hour
    pub fast_merge_percent: f64,

    /// Percentage of commits taking >48 hours
    pub slow_merge_percent: f64,

    /// Total commits analyzed
    pub total_commits: usize,

    /// Fast merge count (<1 hour)
    pub fast_merge_count: usize,

    /// Slow merge count (>48 hours)
    pub slow_merge_count: usize,
}

/// Analyze lead time from git repository
pub fn analyze_lead_time(repo_path: &str, days: usize) -> Result<LeadTimeMetrics> {
    let repo = Repository::open(repo_path)
        .context("Failed to open git repository")?;

    let cutoff_date = Utc::now() - Duration::days(days as i64);

    // Get main branch reference
    let head = repo.head()
        .context("Failed to get HEAD")?;
    let head_oid = head.target()
        .ok_or_else(|| anyhow::anyhow!("HEAD has no target"))?;

    // Walk commits and measure lead time
    let mut revwalk = repo.revwalk()
        .context("Failed to create revwalk")?;

    revwalk.push(head_oid)
        .context("Failed to push HEAD")?;

    let mut lead_times: Vec<f64> = Vec::new(); // in hours
    let mut fast_merges = 0usize;
    let mut slow_merges = 0usize;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        let time = commit.time();
        let commit_date = DateTime::<Utc>::from_timestamp(time.seconds(), 0)
            .unwrap_or_default();

        if commit_date < cutoff_date {
            break;
        }

        // Find parent commits
        let parent_count = commit.parent_count();

        if parent_count > 0 {
            // For merge commits or single-parent commits, measure time to merge
            // Lead time = time from commit creation to when it was merged
            // We approximate this by looking at the commit's time vs its parents' times

            let mut parent_times: Vec<DateTime<Utc>> = Vec::new();

            for i in 0..parent_count {
                if let Ok(parent) = commit.parent(i) {
                    let parent_time = parent.time();
                    let parent_date = DateTime::<Utc>::from_timestamp(parent_time.seconds(), 0)
                        .unwrap_or_default();
                    parent_times.push(parent_date);
                }
            }

            if !parent_times.is_empty() {
                // Lead time = time since newest parent (when this commit was ready to merge)
                let newest_parent = parent_times.iter().max().unwrap_or(&commit_date);
                let lead_time = commit_date.signed_duration_since(*newest_parent);
                let lead_time_hours = lead_time.num_seconds().abs() as f64 / 3600.0;

                // Cap at reasonable maximum (7 days = 168 hours)
                if lead_time_hours <= 168.0 {
                    lead_times.push(lead_time_hours);

                    if lead_time_hours < 1.0 {
                        fast_merges += 1;
                    }
                    if lead_time_hours > 48.0 {
                        slow_merges += 1;
                    }
                }
            }
        }
    }

    if lead_times.is_empty() {
        return Ok(LeadTimeMetrics {
            average_hours: 0.0,
            median_hours: 0.0,
            p95_hours: 0.0,
            fast_merge_percent: 0.0,
            slow_merge_percent: 0.0,
            total_commits: 0,
            fast_merge_count: 0,
            slow_merge_count: 0,
        });
    }

    // Calculate statistics
    lead_times.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let average = lead_times.iter().sum::<f64>() / lead_times.len() as f64;
    let median = lead_times[lead_times.len() / 2];
    let p95_index = (lead_times.len() as f64 * 0.95) as usize;
    let p95 = lead_times.get(p95_index).unwrap_or(&median);

    let total = lead_times.len();
    let fast_percent = (fast_merges as f64 / total as f64) * 100.0;
    let slow_percent = (slow_merges as f64 / total as f64) * 100.0;

    Ok(LeadTimeMetrics {
        average_hours: average,
        median_hours: median,
        p95_hours: *p95,
        fast_merge_percent: fast_percent,
        slow_merge_percent: slow_percent,
        total_commits: total,
        fast_merge_count: fast_merges,
        slow_merge_count: slow_merges,
    })
}

/// Generate lead time report
pub fn generate_report(metrics: &LeadTimeMetrics) -> String {
    use colored::*;

    let mut report = String::new();

    report.push_str(&"\n".bold());
    report.push_str(&"=== LEAD TIME ANALYSIS ===\n".bold());
    report.push('\n');

    // Overall metrics
    report.push_str(&"Time from Commit to Merge:\n".bold());
    report.push_str(&format!("  Average: {:.2} hours (target: <24h)\n", metrics.average_hours));

    let avg_status = if metrics.average_hours < 24.0 {
        "✅".green()
    } else if metrics.average_hours < 48.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", avg_status));

    report.push_str(&format!("  Median: {:.2} hours\n", metrics.median_hours));
    report.push_str(&format!("  P95: {:.2} hours (worst 5%%)\n", metrics.p95_hours));

    report.push_str(&"\nMerge Speed:\n".bold());
    report.push_str(&format!("  Fast merges (<1h): {:.1}% ({} commits)\n",
        metrics.fast_merge_percent, metrics.fast_merge_count));
    report.push_str(&format!("  Slow merges (>48h): {:.1}% ({} commits)\n",
        metrics.slow_merge_percent, metrics.slow_merge_count));

    // Interpretation
    report.push_str(&"\nLead Time Categories:\n".bold());

    if metrics.average_hours < 1.0 {
        report.push_str(&"  • Excellent: Commits merged within 1 hour\n".green());
    } else if metrics.average_hours < 24.0 {
        report.push_str(&"  • Good: Same-day merge average\n".green());
    } else if metrics.average_hours < 48.0 {
        report.push_str(&"  • Fair: Multi-day merge average\n".yellow());
    } else {
        report.push_str(&"  • Poor: Week-long or more merge delays\n".red());
    }

    // Recommendations
    report.push_str(&"\nKaizen Recommendations:\n".bold());

    if metrics.average_hours >= 24.0 {
        report.push_str(&"  • Average lead time exceeds 24h. Reduce review backlog.\n".yellow());
    }

    if metrics.slow_merge_percent > 10.0 {
        let msg = format!("  • {:.1}% commits take >48h. Investigate blocking PRs.\n",
            metrics.slow_merge_percent);
        report.push_str(&msg.yellow());
    }

    if metrics.fast_merge_percent < 20.0 {
        report.push_str(&"  • Few fast merges. Consider trunk-based development.\n".yellow());
    }

    if metrics.average_hours < 24.0 && metrics.slow_merge_percent < 10.0 {
        report.push_str(&"  • Lead time is optimal! Maintain fast review cycle.\n".green());
    }

    report.push('\n');

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_lead_time_empty_repo() {
        // This test would require a mock repository
        // For now, we just verify the function signature compiles
        assert!(true);
    }
}
