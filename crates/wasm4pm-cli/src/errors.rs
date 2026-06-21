use colored::*;
use std::process;

/// Custom error types for the wasm4pm (wpm) CLI
#[derive(thiserror::Error, Debug)]
pub enum Wasm4pmError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Execution error: {0}")]
    Execution(String),
}

/// A trait for reporting errors to the user in a pretty format
pub trait Report {
    /// Prints the error to stderr and exits with a non-zero code
    fn die(&self) -> !;
    /// Prints the error to stderr
    fn report(&self);
}

impl Report for anyhow::Error {
    fn report(&self) {
        eprintln!("{} {}", "error:".red().bold(), self);

        let mut chain = self.chain().skip(1).peekable();
        if chain.peek().is_some() {
            eprintln!("\n{}", "Caused by:".yellow().bold());
            for (i, cause) in chain.enumerate() {
                eprintln!("  {:>2}: {}", i, cause);
            }
        }

        // Only show backtrace if RUST_BACKTRACE=1 is set
        if std::env::var("RUST_BACKTRACE")
            .map(|v| v == "1")
            .unwrap_or(false)
        {
            let backtrace = self.backtrace();
            if let std::backtrace::BacktraceStatus::Captured = backtrace.status() {
                eprintln!("\n{}", "Stack Backtrace:".cyan().bold());
                eprintln!("{}", backtrace);
            }
        }
    }

    fn die(&self) -> ! {
        self.report();
        process::exit(1);
    }
}

// Context helpers have been removed in favour of `anyhow::Context::with_context`,
// which is lazy (closure runs only on Err) and ships with anyhow:
//
//   use anyhow::Context as _;
//   some_result.with_context(|| format!("Failed IO operation: {path}"))?;

pub type Result<T> = anyhow::Result<T>;
