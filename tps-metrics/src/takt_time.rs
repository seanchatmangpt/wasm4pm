//! Takt Time (Production Rhythm) Analysis
//!
//! Measures commit rhythm and consistency to establish predictable delivery heartbeat.
//!
//! # Takt Time Definition
//!
//! Takt time is the rate at which products must be completed to meet demand.
//! In software: time between commits should be consistent (daily rhythm).
//!
//! # Metrics
//!
//! - **Commits per day**: Target ≥3/day
//! - **Commit consistency**: Standard deviation of inter-commit times
//! - **Commit droughts**: Days with zero commits (target: 0)

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Timelike, Utc};
use git2::Repository;
use std::collections::{BTreeMap, HashMap};

/// Takt time metrics for a repository
#[derive(Debug, Clone, serde::Serialize)]
pub struct TaktTimeMetrics {
    /// Commits per day (target: ≥3)
    pub commits_per_day: f64,

    /// Commit consistency (0-1, 1 = perfectly consistent)
    pub consistency_score: f64,

    /// Days with zero commits
    pub drought_days: usize,

    /// Total days analyzed
    pub total_days: usize,

    /// Average commits per weekday
    pub weekday_avg: HashMap<String, f64>,

    /// Commit distribution by hour
    pub hourly_distribution: BTreeMap<u32, usize>,
}

/// Analyze takt time from git repository
pub fn analyze_takt_time(repo_path: &str, days: usize) -> Result<TaktTimeMetrics> {
    let repo = Repository::open(repo_path).context("Failed to open git repository")?;

    let mut revwalk = repo.revwalk().context("Failed to create revwalk")?;

    revwalk.push_head().context("Failed to push HEAD")?;

    let cutoff_date = Utc::now() - Duration::days(days as i64);
    let mut commits_by_date: HashMap<String, usize> = HashMap::new();
    let mut commits_by_hour: BTreeMap<u32, usize> = BTreeMap::new();
    let mut commit_times: Vec<DateTime<Utc>> = Vec::new();
    let mut total_commits = 0usize;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        let time = commit.time();
        let commit_date = DateTime::<Utc>::from_timestamp(time.seconds(), 0).unwrap_or_default();

        if commit_date < cutoff_date {
            break;
        }

        let date_str = commit_date.format("%Y-%m-%d").to_string();
        *commits_by_date.entry(date_str).or_insert(0) += 1;

        let hour = commit_date.hour();
        *commits_by_hour.entry(hour).or_insert(0) += 1;

        commit_times.push(commit_date);
        total_commits += 1;
    }

    // Calculate commits per day
    let commits_per_day = if days > 0 {
        total_commits as f64 / days as f64
    } else {
        0.0
    };

    // Calculate consistency score (standard deviation of inter-commit times)
    let consistency_score = calculate_consistency(&commit_times);

    // Count drought days (days with zero commits)
    let drought_days = count_drought_days(&commits_by_date, days);

    // Calculate weekday averages
    let weekday_avg = calculate_weekday_averages(&commits_by_date);

    Ok(TaktTimeMetrics {
        commits_per_day,
        consistency_score,
        drought_days,
        total_days: days,
        weekday_avg,
        hourly_distribution: commits_by_hour,
    })
}

/// Calculate consistency score based on inter-commit time variance
/// Returns 0-1 score where 1 = perfectly consistent (same time between commits)
fn calculate_consistency(commit_times: &[DateTime<Utc>]) -> f64 {
    if commit_times.len() < 2 {
        return 1.0; // Single commit is trivially consistent
    }

    // Sort commits by time (descending - newest first)
    let mut sorted_times = commit_times.to_vec();
    sorted_times.sort_by(|a, b| b.cmp(a)); // Newest first

    // Calculate inter-commit durations in seconds
    let mut durations: Vec<i64> = Vec::new();
    for window in sorted_times.windows(2) {
        let duration = window[0].signed_duration_since(window[1]);
        durations.push(duration.num_seconds().abs());
    }

    if durations.is_empty() {
        return 1.0;
    }

    // Calculate mean and standard deviation
    let mean: f64 = durations.iter().map(|d| *d as f64).sum::<f64>() / durations.len() as f64;
    let variance = durations
        .iter()
        .map(|d| {
            let diff = *d as f64 - mean;
            diff * diff
        })
        .sum::<f64>()
        / durations.len() as f64;
    let std_dev = variance.sqrt();

    // Consistency score: 1 when std_dev is 0, decreases as std_dev increases
    // Use coefficient of variation: std_dev / mean
    if mean == 0.0 {
        return 1.0;
    }

    let cv = std_dev / mean;
    // Convert to 0-1 scale where 1 = perfectly consistent (CV = 0)
    // Use exponential decay: CV of 2.0 gives score of ~0.14, CV of 3.0 gives ~0.05
    (-cv / 2.0).exp()
}

/// Count days with zero commits (droughts)
fn count_drought_days(commits_by_date: &HashMap<String, usize>, total_days: usize) -> usize {
    total_days.saturating_sub(commits_by_date.len())
}

/// Calculate average commits per weekday
fn calculate_weekday_averages(commits_by_date: &HashMap<String, usize>) -> HashMap<String, f64> {
    let mut weekday_counts: HashMap<String, Vec<usize>> = HashMap::new();

    for (date_str, count) in commits_by_date {
        // Parse date to get weekday
        if let Ok(parsed) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            let weekday = parsed.format("%A").to_string(); // Monday, Tuesday, etc.
            weekday_counts.entry(weekday).or_default().push(*count);
        }
    }

    // Calculate average for each weekday
    weekday_counts
        .into_iter()
        .map(|(weekday, counts)| {
            let avg = counts.iter().map(|c| *c as f64).sum::<f64>() / counts.len() as f64;
            (weekday, avg)
        })
        .collect()
}

/// Generate takt time report
pub fn generate_report(metrics: &TaktTimeMetrics) -> String {
    use colored::*;

    let mut report = String::new();

    report.push_str(&"\n".bold());
    report.push_str(&"=== TAKT TIME ANALYSIS ===\n".bold());
    report.push('\n');

    // Overall metrics
    report.push_str(&"Overall Metrics:\n".bold());
    report.push_str(&format!(
        "  Commits per Day: {:.2} (target: ≥3)\n",
        metrics.commits_per_day
    ));

    let commits_status = if metrics.commits_per_day >= 3.0 {
        "✅".green()
    } else if metrics.commits_per_day >= 1.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", commits_status));

    report.push_str(&format!(
        "  Consistency Score: {:.2}% (target: >80%)\n",
        metrics.consistency_score * 100.0
    ));

    let consistency_status = if metrics.consistency_score >= 0.8 {
        "✅".green()
    } else if metrics.consistency_score >= 0.5 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", consistency_status));

    report.push_str(&format!(
        "  Drought Days: {} (target: 0)\n",
        metrics.drought_days
    ));

    let drought_status = if metrics.drought_days == 0 {
        "✅".green()
    } else if metrics.drought_days <= 2 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", drought_status));

    // Weekday breakdown
    report.push_str(&"\nWeekday Averages:\n".bold());
    let weekdays = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];
    for day in weekdays {
        if let Some(avg) = metrics.weekday_avg.get(day) {
            report.push_str(&format!("  {}: {:.2} commits/day\n", day, avg));
        }
    }

    // Hourly distribution
    report.push_str(&"\nHourly Distribution (UTC):\n".bold());
    for (hour, count) in &metrics.hourly_distribution {
        if *count > 0 {
            report.push_str(&format!("  {:02}:00 — {} commits\n", hour, count));
        }
    }

    // Recommendations
    report.push_str(&"\nKaizen Recommendations:\n".bold());

    if metrics.commits_per_day < 3.0 {
        report.push_str(&"  • Commit frequency too low. Target: ≥3 commits/day\n".yellow());
    }

    if metrics.consistency_score < 0.8 {
        report
            .push_str(&"  • Commit rhythm inconsistent. Aim for regular daily commits\n".yellow());
    }

    if metrics.drought_days > 0 {
        report.push_str(
            &format!(
                "  • {} day(s) with no commits. Maintain daily rhythm\n",
                metrics.drought_days
            )
            .yellow(),
        );
    }

    if metrics.commits_per_day >= 3.0
        && metrics.consistency_score >= 0.8
        && metrics.drought_days == 0
    {
        report.push_str(&"  • Takt time is optimal! Maintain consistent daily rhythm\n".green());
    }

    report.push('\n');

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_consistency_single_commit() {
        let times = vec![Utc::now()];
        let score = calculate_consistency(&times);
        assert_eq!(score, 1.0);
    }

    #[test]
    fn test_calculate_consistency_perfect_rhythm() {
        let base = Utc::now();
        let times = vec![base, base - Duration::hours(24), base - Duration::hours(48)];
        let score = calculate_consistency(&times);
        // Perfect rhythm (24h between commits)
        assert!(score > 0.9);
    }

    #[test]
    fn test_calculate_consistency_variable_rhythm() {
        let base = Utc::now();
        let times = vec![base, base - Duration::hours(1), base - Duration::hours(48)];
        let score = calculate_consistency(&times);
        // Variable rhythm
        assert!(score < 0.8);
    }
}
