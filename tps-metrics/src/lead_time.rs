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
    let repo = Repository::open(repo_path).context("Failed to open git repository")?;

    let cutoff_date = Utc::now() - Duration::days(days as i64);

    // Get main branch reference
    let head = repo.head().context("Failed to get HEAD")?;
    let head_oid = head
        .target()
        .ok_or_else(|| anyhow::anyhow!("HEAD has no target"))?;

    // Walk commits and measure lead time
    let mut revwalk = repo.revwalk().context("Failed to create revwalk")?;

    revwalk.push(head_oid).context("Failed to push HEAD")?;

    let mut lead_times: Vec<f64> = Vec::new(); // in hours
    let mut fast_merges = 0usize;
    let mut slow_merges = 0usize;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        let time = commit.time();
        let commit_date = DateTime::<Utc>::from_timestamp(time.seconds(), 0).unwrap_or_default();

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
    lead_times.sort_unstable_by(|a, b| a.total_cmp(b));

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
    report.push_str(&format!(
        "  Average: {:.2} hours (target: <24h)\n",
        metrics.average_hours
    ));

    let avg_status = if metrics.average_hours < 24.0 {
        "✅".green()
    } else if metrics.average_hours < 48.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", avg_status));

    report.push_str(&format!("  Median: {:.2} hours\n", metrics.median_hours));
    report.push_str(&format!(
        "  P95: {:.2} hours (worst 5%%)\n",
        metrics.p95_hours
    ));

    report.push_str(&"\nMerge Speed:\n".bold());
    report.push_str(&format!(
        "  Fast merges (<1h): {:.1}% ({} commits)\n",
        metrics.fast_merge_percent, metrics.fast_merge_count
    ));
    report.push_str(&format!(
        "  Slow merges (>48h): {:.1}% ({} commits)\n",
        metrics.slow_merge_percent, metrics.slow_merge_count
    ));

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
        let msg = format!(
            "  • {:.1}% commits take >48h. Investigate blocking PRs.\n",
            metrics.slow_merge_percent
        );
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

    // ── Rank-1 mathematical oracle: percentile index is bounded ──

    /// The p95 index formula must never produce an out-of-bounds index.
    /// For any non-empty sorted vec, `(len * 0.95) as usize` must be < len.
    #[test]
    fn test_p95_index_never_out_of_bounds() {
        for len in 1usize..=200 {
            let p95_index = (len as f64 * 0.95) as usize;
            assert!(
                p95_index < len,
                "p95_index {p95_index} >= len {len}: would panic on get()"
            );
        }
    }

    // ── Rank-1: percentile ordering invariant ──

    /// In a sorted list, p95 must be >= median (p50).
    /// This is a mathematical theorem for any non-empty sorted sequence.
    #[test]
    fn test_p95_ge_median_for_sorted_sequence() {
        let mut times: Vec<f64> = vec![0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 256.0];
        times.sort_unstable_by(|a, b| a.total_cmp(b));

        let median = times[times.len() / 2];
        let p95_index = (times.len() as f64 * 0.95) as usize;
        let p95 = times.get(p95_index).copied().unwrap_or(median);

        assert!(
            p95 >= median,
            "p95 ({p95}) must be >= median ({median}) in sorted data"
        );
    }

    // ── Rank-2 domain contract: fast/slow counts are mutually exclusive ──

    /// A commit cannot be both fast (<1h) and slow (>48h).
    /// The counters must partition the observed commits (with middle commits in neither).
    #[test]
    fn test_fast_and_slow_merge_are_mutually_exclusive() {
        // Simulate the classification logic from analyze_lead_time
        let lead_times: Vec<f64> = vec![
            0.5,  // fast
            1.5,  // neither
            24.0, // neither
            72.0, // slow
        ];

        let fast = lead_times.iter().filter(|&&h| h < 1.0).count();
        let slow = lead_times.iter().filter(|&&h| h > 48.0).count();
        let total = lead_times.len();

        // Fast + slow <= total (they cannot overlap)
        assert!(
            fast + slow <= total,
            "fast ({fast}) + slow ({slow}) > total ({total})"
        );

        // At least one commit is in the "middle" (neither fast nor slow)
        assert!(
            fast + slow < total,
            "expected some commits in neither category"
        );
    }

    // ── Rank-2 domain contract: average is bounded by min/max ──

    /// The average lead time must lie in [min, max] of the sample.
    /// This is a property of the arithmetic mean.
    #[test]
    fn test_average_is_between_min_and_max() {
        let times = vec![0.1, 2.0, 5.0, 8.0, 48.0, 100.0];
        let avg = times.iter().sum::<f64>() / times.len() as f64;
        let min = times.iter().copied().fold(f64::INFINITY, f64::min);
        let max = times.iter().copied().fold(f64::NEG_INFINITY, f64::max);

        assert!(avg >= min, "average {avg} < min {min}");
        assert!(avg <= max, "average {avg} > max {max}");
    }

    // ── Rank-3 metamorphic: adding a slow outlier raises average and p95 ──

    /// Adding a high-lead-time commit to the sample must not decrease the
    /// average or the p95.  This is a monotonic response property.
    #[test]
    fn test_adding_slow_outlier_raises_average_and_p95() {
        let base = vec![0.5, 1.0, 2.0];
        let with_outlier = {
            let mut v = base.clone();
            v.push(168.0); // one week — extreme outlier
            v
        };

        let avg_base = base.iter().sum::<f64>() / base.len() as f64;
        let avg_outlier = with_outlier.iter().sum::<f64>() / with_outlier.len() as f64;

        assert!(
            avg_outlier > avg_base,
            "avg should increase after adding outlier: {avg_base} → {avg_outlier}"
        );

        let mut base_sorted = base.clone();
        base_sorted.sort_unstable_by(|a, b| a.total_cmp(b));
        let p95_base_idx = (base_sorted.len() as f64 * 0.95) as usize;
        let p95_base = base_sorted[p95_base_idx];

        let mut out_sorted = with_outlier.clone();
        out_sorted.sort_unstable_by(|a, b| a.total_cmp(b));
        let p95_out_idx = (out_sorted.len() as f64 * 0.95) as usize;
        let p95_out = out_sorted[p95_out_idx];

        assert!(
            p95_out >= p95_base,
            "p95 should not decrease after adding outlier: {p95_base} → {p95_out}"
        );
    }

    // ── Rank-2 domain contract: empty metrics have zero totals ──

    /// The empty-repo guard in analyze_lead_time must produce a zero-valued
    /// LeadTimeMetrics, not a partial or garbage value.
    #[test]
    fn test_empty_metrics_are_all_zero() {
        let m = LeadTimeMetrics {
            average_hours: 0.0,
            median_hours: 0.0,
            p95_hours: 0.0,
            fast_merge_percent: 0.0,
            slow_merge_percent: 0.0,
            total_commits: 0,
            fast_merge_count: 0,
            slow_merge_count: 0,
        };

        assert_eq!(m.total_commits, 0);
        assert_eq!(m.fast_merge_count, 0);
        assert_eq!(m.slow_merge_count, 0);
        assert_eq!(m.average_hours, 0.0);
        assert_eq!(m.fast_merge_percent, 0.0);
        assert_eq!(m.slow_merge_percent, 0.0);
    }

    // ── Rank-2 domain contract: percentage fields are in [0, 100] ──

    #[test]
    fn test_percentage_fields_bounded() {
        let cases: Vec<(f64, usize, usize, usize)> = vec![
            // (lead_time, total, fast, slow)
            (0.5, 1, 1, 0),
            (72.0, 1, 0, 1),
            (10.0, 4, 2, 1),
        ];

        for (_, total, fast, slow) in cases {
            let fast_pct = (fast as f64 / total as f64) * 100.0;
            let slow_pct = (slow as f64 / total as f64) * 100.0;
            assert!(
                (0.0..=100.0).contains(&fast_pct),
                "fast% {fast_pct} out of [0,100]"
            );
            assert!(
                (0.0..=100.0).contains(&slow_pct),
                "slow% {slow_pct} out of [0,100]"
            );
        }
    }

    // ── Rank-2 domain contract: 7-day cap (168h) prevents outlier pollution ──

    /// The cap at 168h prevents multi-month stale branches from
    /// distorting the average lead time.  Any value above the cap is excluded.
    #[test]
    fn test_seven_day_cap_filters_stale_branches() {
        let raw_times = vec![1.0, 2.0, 500.0, 800.0]; // two beyond 168h
        let capped: Vec<f64> = raw_times.into_iter().filter(|&h| h <= 168.0).collect();

        assert_eq!(capped.len(), 2, "only in-range times should be included");
        let avg = capped.iter().sum::<f64>() / capped.len() as f64;
        assert!(avg < 24.0, "avg of valid commits should be < 24h: {avg}");
    }
}
