use anyhow::{Context, Result};
use colored::*;
use std::fmt::Display;
use std::fs;
use std::path::Path;

/// IO Manager for wasm4pm (wpm) CLI
pub struct Io {
    verbose: bool,
}

impl Io {
    /// Create a new IO manager
    pub fn new(verbose: bool) -> Self {
        Self { verbose }
    }

    /// Print a stylized header
    pub fn header<D: Display>(&self, text: D) {
        println!("\n{}", text.to_string().bold().bright_cyan());
    }

    /// Print a success message
    pub fn success<D: Display>(&self, text: D) {
        println!("{} {}", "✔".green(), text);
    }

    /// Print an error message to stderr
    pub fn error<D: Display>(&self, text: D) {
        eprintln!("{} {}", "✘".red(), text);
    }

    /// Print a warning message
    pub fn warning<D: Display>(&self, text: D) {
        println!("{} {}", "!".yellow(), text);
    }

    /// Print an info message only if verbose is enabled
    pub fn info<D: Display>(&self, text: D) {
        if self.verbose {
            println!("{} {}", "ℹ".blue(), text);
        }
    }

    /// Read a file to string with consistent error wrapping
    pub fn read_file<P: AsRef<Path>>(&self, path: P) -> Result<String> {
        let path = path.as_ref();
        self.info(format!("Reading file: {}", path.display()));
        fs::read_to_string(path).with_context(|| format!("Failed to read file: {}", path.display()))
    }

    /// Write content to a file with consistent error wrapping
    pub fn write_file<P: AsRef<Path>>(&self, path: P, content: &str) -> Result<()> {
        let path = path.as_ref();
        self.info(format!("Writing file: {}", path.display()));
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("Failed to create directory: {}", parent.display()))?;
            }
        }
        fs::write(path, content)
            .with_context(|| format!("Failed to write file: {}", path.display()))
    }
}

/// A simple table formatter for CLI output
pub struct Table {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

impl Table {
    /// Create a new table with headers
    pub fn new(headers: Vec<&str>) -> Self {
        Self {
            headers: headers.into_iter().map(|s| s.to_string()).collect(),
            rows: Vec::new(),
        }
    }

    /// Add a row to the table
    pub fn add_row(&mut self, row: Vec<String>) {
        self.rows.push(row);
    }

    /// Print the table to stdout
    pub fn print(&self) {
        if self.headers.is_empty() && self.rows.is_empty() {
            return;
        }

        let mut col_widths = self.headers.iter().map(|h| h.len()).collect::<Vec<_>>();
        for row in &self.rows {
            for (i, cell) in row.iter().enumerate() {
                if i < col_widths.len() {
                    col_widths[i] = col_widths[i].max(cell.len());
                }
            }
        }

        // Print header
        println!();
        for (i, header) in self.headers.iter().enumerate() {
            print!(
                "{:<width$}  ",
                header.bold().underline(),
                width = col_widths[i]
            );
        }
        println!();

        // Print rows
        for row in &self.rows {
            for (i, cell) in row.iter().enumerate() {
                if i < col_widths.len() {
                    print!("{:<width$}  ", cell, width = col_widths[i]);
                }
            }
            println!();
        }
        println!();
    }
}
