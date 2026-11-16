use crate::automation::{automate_discovery};
use std::time::Instant;

pub fn run_contest_benchmark() {
    println!("Starting contest performance benchmark...");
    let start = Instant::now();
    
    // Run the automated pipeline
    automate_discovery("./data/pdc2025/");
    
    let duration = start.elapsed();
    println!("Time to reach convergence: {:?} seconds", duration.as_secs_f64());
}
