// RDTSC validation — ARM64 compatible using performance counter
// On x86_64: rdtsc returns CPU cycles directly
// On ARM64: use std::time::Instant for wall-clock nanoseconds

#[cfg(target_arch = "x86_64")]
pub fn rdtsc() -> u64 {
    unsafe { std::arch::x86_64::_rdtsc() }
}

#[cfg(target_arch = "aarch64")]
pub fn rdtsc() -> u64 {
    // ARM64: use wall-clock nanoseconds as proxy for cycles
    // Conversion: cycles ≈ nanos * (cpu_ghz / 1000)
    // At 3.5 GHz: cycles ≈ nanos * 3.5
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
pub fn rdtsc() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

#[inline(never)]
fn measure_autoprocess_cycles() -> u64 {
    // Flush caches and establish baseline
    let start = rdtsc();

    // Dummy operation - will be replaced with actual AutoProcessKernel::run_cycle
    // For now, just a simple computation to measure baseline overhead
    let state: u32 = 42;
    let _result = state.wrapping_mul(73).wrapping_add(17);

    let end = rdtsc();
    end - start
}

fn validate_cycle_budget() {
    // Warmup: 1000 iterations to stabilize caches
    for _ in 0..1000 {
        let _ = measure_autoprocess_cycles();
    }

    // Measurement: 100,000 iterations for statistical power
    let mut cycles = Vec::with_capacity(100_000);
    for _ in 0..100_000 {
        cycles.push(measure_autoprocess_cycles());
    }

    // Statistics
    cycles.sort_unstable();
    let mean = cycles.iter().sum::<u64>() as f64 / cycles.len() as f64;
    let median = cycles[cycles.len() / 2] as f64;
    let p95 = cycles[(cycles.len() * 95) / 100] as f64;
    let p99 = cycles[(cycles.len() * 99) / 100] as f64;

    // Compute variance
    let variance: f64 = cycles
        .iter()
        .map(|&c| {
            let diff = c as f64 - mean;
            diff * diff
        })
        .sum::<f64>()
        / cycles.len() as f64;
    let std_dev = variance.sqrt();
    let cv = std_dev / mean; // Coefficient of variation

    // Convert cycles to nanoseconds @ 3.5 GHz CPU (typical)
    let cpu_ghz = 3.5;
    let mean_ns = mean / cpu_ghz;
    let std_dev_ns = std_dev / cpu_ghz;
    let p95_ns = p95 / cpu_ghz;
    let p99_ns = p99 / cpu_ghz;

    println!("\n=== RDTSC Cycle Counter Validation ===");
    println!("Iterations: {}", cycles.len());
    println!(
        "Mean: {:.2} cycles ({:.2}ns @ {}GHz)",
        mean, mean_ns, cpu_ghz
    );
    println!("Std Dev: {:.2} cycles ({:.2}ns)", std_dev, std_dev_ns);
    println!("CV (Coefficient of Variation): {:.2}%", cv * 100.0);
    println!("Median: {:.0} cycles ({:.2}ns)", median, median / cpu_ghz);
    println!("P95: {:.0} cycles ({:.2}ns)", p95, p95_ns);
    println!("P99: {:.0} cycles ({:.2}ns)", p99, p99_ns);
    println!("Min: {} cycles", cycles[0]);
    println!("Max: {} cycles", cycles[cycles.len() - 1]);
    println!();

    // Print histogram
    println!("Distribution:");
    let buckets = vec![
        (5, "<=5 cycles"),
        (10, "<=10 cycles"),
        (15, "<=15 cycles"),
        (20, "<=20 cycles"),
        (50, "<=50 cycles"),
        (u64::MAX, ">50 cycles"),
    ];

    let mut prev_limit = 0;
    for (limit, label) in buckets {
        let count = cycles
            .iter()
            .filter(|&&c| c > prev_limit && c <= limit)
            .count();
        let pct = count as f64 / cycles.len() as f64 * 100.0;
        println!("  {}: {} ({:.1}%)", label, count, pct);
        prev_limit = limit;
    }
}

fn main() {
    validate_cycle_budget();
}
