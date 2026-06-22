//! Mura (Unevenness) Detection
//!
//! Measures workflow variability and irregular patterns.
//!
//! # Mura Definition
//!
//! Mura is unevenness in workflow - irregularity that causes waste.
//! In software: bursty commits, irregular timing, uneven distribution.
//!
//! # Metrics
//!
//! - **Commit variance**: Standard deviation of commits per day
//! - **Hour variance**: Standard deviation of commits per hour
//! - **Burst score**: Measure of commit clustering (0-1)
//! - **Distribution evenness**: Are commits spread evenly?

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Timelike, Utc};
use git2::Repository;
use std::collections::{BTreeMap, HashMap};

/// Mura (unevenness) metrics
#[derive(Debug, Clone, serde::Serialize)]
pub struct MuraMetrics {
    /// Standard deviation of commits per day (lower = more even)
    pub daily_variance: f64,

    /// Standard deviation of commits per hour (lower = more even)
    pub hourly_variance: f64,

    /// Burst score (0-1, 1 = highly clustered)
    pub burst_score: f64,

    /// Evenness score (0-1, 1 = perfectly even distribution)
    pub evenness_score: f64,

    /// Days with abnormal commit counts (>2x average)
    pub abnormal_days: usize,

    /// Total days analyzed
    pub total_days: usize,
}

/// Analyze mura (unevenness) from git repository
pub fn analyze_mura(repo_path: &str, days: usize) -> Result<MuraMetrics> {
    let repo = Repository::open(repo_path).context("Failed to open git repository")?;

    let cutoff_date = Utc::now() - Duration::days(days as i64);

    let mut revwalk = repo.revwalk().context("Failed to create revwalk")?;

    revwalk.push_head().context("Failed to push HEAD")?;

    let mut commits_by_date: HashMap<String, usize> = HashMap::new();
    let mut commits_by_hour: BTreeMap<u32, usize> = BTreeMap::new();
    let mut commit_times: Vec<DateTime<Utc>> = Vec::new();

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        let time = commit.time();
        let commit_date = DateTime::<Utc>::from_timestamp(time.seconds(), 0).unwrap_or_default();

        if commit_date < cutoff_date {
            break;
        }

        let date_str = commit_date.format("%Y-%m-%d").to_string();
        *commits_by_date.entry(date_str).or_default() += 1;

        let hour: u32 = commit_date.hour();
        *commits_by_hour.entry(hour).or_default() += 1;

        commit_times.push(commit_date);
    }

    // Calculate variance metrics
    let daily_variance = calculate_variance(&commits_by_date);
    let hourly_variance = calculate_variance_map(&commits_by_hour);

    // Calculate burst score (how clustered commits are in time)
    let burst_score = calculate_burst_score(&commit_times);

    // Calculate evenness score (Gini coefficient of distribution)
    let evenness_score = calculate_evenness(&commits_by_date);

    // Count abnormal days (>2x average)
    let avg_commits: f64 = commits_by_date.values().map(|v| *v as f64).sum::<f64>()
        / commits_by_date.len().max(1) as f64;
    let abnormal_days = commits_by_date
        .values()
        .filter(|&&count| count as f64 > avg_commits * 2.0)
        .count();

    Ok(MuraMetrics {
        daily_variance,
        hourly_variance,
        burst_score,
        evenness_score,
        abnormal_days,
        total_days: days,
    })
}

/// Calculate standard deviation of values in a map
fn calculate_variance<K>(data: &HashMap<K, usize>) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    let values: Vec<f64> = data.values().map(|v| *v as f64).collect();
    let mean = values.iter().sum::<f64>() / values.len() as f64;

    let variance = values
        .iter()
        .map(|v| {
            let diff = v - mean;
            diff * diff
        })
        .sum::<f64>()
        / values.len() as f64;

    variance.sqrt()
}

/// Calculate standard deviation of values in a BTreeMap
fn calculate_variance_map(data: &BTreeMap<u32, usize>) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    let values: Vec<f64> = data.values().map(|v| *v as f64).collect();
    let mean = values.iter().sum::<f64>() / values.len() as f64;

    let variance = values
        .iter()
        .map(|v| {
            let diff = v - mean;
            diff * diff
        })
        .sum::<f64>()
        / values.len() as f64;

    variance.sqrt()
}

/// Calculate burst score (how clustered commits are)
/// Returns 0-1 where 1 = highly clustered (uneven), 0 = perfectly spread out
fn calculate_burst_score(commit_times: &[DateTime<Utc>]) -> f64 {
    if commit_times.len() < 3 {
        return 0.0; // Not enough data to detect bursts
    }

    let mut sorted_times = commit_times.to_vec();
    sorted_times.sort_by(|a, b| b.cmp(a)); // Newest first

    // Calculate inter-commit gaps (in hours)
    let mut gaps: Vec<f64> = Vec::new();
    for window in sorted_times.windows(2) {
        let duration = window[0].signed_duration_since(window[1]);
        let gap_hours = duration.num_seconds().abs() as f64 / 3600.0;
        if gap_hours > 0.0 {
            gaps.push(gap_hours);
        }
    }

    if gaps.is_empty() {
        return 0.0;
    }

    // Calculate mean and coefficient of variation
    let mean_gap: f64 = gaps.iter().sum::<f64>() / gaps.len() as f64;
    let variance = gaps
        .iter()
        .map(|g| {
            let diff = g - mean_gap;
            diff * diff
        })
        .sum::<f64>()
        / gaps.len() as f64;
    let std_dev = variance.sqrt();

    // High CV = bursty (some gaps tiny, some huge)
    // Normalize: CV of 0 = no burst, CV of 2+ = high burst
    let cv = if mean_gap > 0.0 {
        std_dev / mean_gap
    } else {
        0.0
    };

    (cv / 2.0).min(1.0)
}

/// Calculate evenness score using Gini coefficient
/// Returns 0-1 where 1 = perfectly even distribution, 0 = highly uneven
fn calculate_evenness(commits_by_date: &HashMap<String, usize>) -> f64 {
    if commits_by_date.is_empty() {
        return 1.0;
    }

    let mut values: Vec<f64> = commits_by_date.values().map(|v| *v as f64).collect();
    if values.len() == 1 {
        return 1.0; // Single day is trivially even
    }

    values.sort_unstable_by(f64::total_cmp);

    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;

    // Gini coefficient: mean absolute difference / (2 * mean * n)
    let mut sum_abs_diff = 0.0;
    for i in 0..values.len() {
        for j in 0..values.len() {
            sum_abs_diff += (values[i] - values[j]).abs();
        }
    }

    let gini = sum_abs_diff / (2.0 * mean * n * n);

    // Convert to evenness score (1 - gini)
    (1.0 - gini).max(0.0)
}

/// Generate mura report
pub fn generate_report(metrics: &MuraMetrics) -> String {
    use colored::*;

    let mut report = String::new();

    report.push_str(&"\n".bold());
    report.push_str(&"=== MURA (UNEVENESS) ANALYSIS ===\n".bold());
    report.push('\n');

    // Variance metrics
    report.push_str(&"Workflow Variability:\n".bold());
    report.push_str(&format!(
        "  Daily variance: {:.2} (target: <2.0)\n",
        metrics.daily_variance
    ));

    let daily_status = if metrics.daily_variance < 2.0 {
        "✅".green()
    } else if metrics.daily_variance < 4.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", daily_status));

    report.push_str(&format!(
        "  Hourly variance: {:.2} (target: <3.0)\n",
        metrics.hourly_variance
    ));

    let hourly_status = if metrics.hourly_variance < 3.0 {
        "✅".green()
    } else if metrics.hourly_variance < 6.0 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", hourly_status));

    // Burst and evenness
    report.push_str(&"\nDistribution Quality:\n".bold());
    report.push_str(&format!(
        "  Burst score: {:.2} (0=even, 1=clustered)\n",
        metrics.burst_score
    ));

    let burst_status = if metrics.burst_score < 0.3 {
        "✅".green()
    } else if metrics.burst_score < 0.6 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", burst_status));

    report.push_str(&format!(
        "  Evenness score: {:.2} (1=perfect evenness)\n",
        metrics.evenness_score
    ));

    let evenness_status = if metrics.evenness_score > 0.7 {
        "✅".green()
    } else if metrics.evenness_score > 0.4 {
        "⚠️".yellow()
    } else {
        "❌".red()
    };
    report.push_str(&format!("    Status: {}\n", evenness_status));

    report.push_str(&format!(
        "  Abnormal days: {} (days with >2x average commits)\n",
        metrics.abnormal_days
    ));

    // Interpretation
    report.push_str(&"\nUnevenness Assessment:\n".bold());

    if metrics.daily_variance < 2.0 && metrics.evenness_score > 0.7 {
        report.push_str(&"  • Excellent: Consistent, even workflow\n".green());
    } else if metrics.daily_variance < 4.0 && metrics.evenness_score > 0.4 {
        report.push_str(&"  • Good: Mostly even with minor variation\n".yellow());
    } else {
        report.push_str(&"  • Poor: Highly variable workflow\n".red());
    }

    // Recommendations
    report.push_str(&"\nKaizen Recommendations:\n".bold());

    if metrics.daily_variance >= 4.0 {
        report.push_str(&"  • High daily variance. Commit more consistently each day.\n".yellow());
    }

    if metrics.burst_score >= 0.6 {
        report.push_str(
            &"  • High burst score. Spread commits evenly instead of clustering.\n".yellow(),
        );
    }

    if metrics.evenness_score < 0.4 {
        report
            .push_str(&"  • Low evenness. Distribute commits more evenly across days.\n".yellow());
    }

    if metrics.abnormal_days > 0 {
        let msg = format!(
            "  • {} abnormal day(s) detected. Avoid \"fire drill\" commits.\n",
            metrics.abnormal_days
        );
        report.push_str(&msg.yellow());
    }

    if metrics.daily_variance < 2.0 && metrics.evenness_score > 0.7 {
        report.push_str(&"  • Workflow is smooth and even. Maintain consistent rhythm!\n".green());
    }

    report.push('\n');

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_variance_empty() {
        let map: HashMap<String, usize> = HashMap::new();
        let variance = calculate_variance(&map);
        assert_eq!(variance, 0.0);
    }

    #[test]
    fn test_calculate_variance_perfect_even() {
        let mut map = HashMap::new();
        map.insert("day1".to_string(), 5);
        map.insert("day2".to_string(), 5);
        map.insert("day3".to_string(), 5);
        let variance = calculate_variance(&map);
        assert_eq!(variance, 0.0);
    }

    #[test]
    fn test_calculate_evenness_perfect() {
        let mut map = HashMap::new();
        map.insert("day1".to_string(), 5);
        map.insert("day2".to_string(), 5);
        map.insert("day3".to_string(), 5);
        let evenness = calculate_evenness(&map);
        assert_eq!(evenness, 1.0);
    }

    #[test]
    fn test_calculate_evenness_highly_uneven() {
        let mut map = HashMap::new();
        map.insert("day1".to_string(), 10);
        map.insert("day2".to_string(), 1);
        map.insert("day3".to_string(), 1);
        let evenness = calculate_evenness(&map);
        assert!(evenness <= 0.5);
    }
}
