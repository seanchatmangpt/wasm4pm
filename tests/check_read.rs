use std::fs;
use std::path::Path;

#[test]
fn check_file_read() {
    let path = "tests/fixtures/BPI_2020_Travel_Permits_Actual.xes";
    println!("Path exists: {}", Path::new(path).exists());
    
    match fs::read_to_string(path) {
        Ok(content) => println!("File read successfully, size: {} bytes", content.len()),
        Err(e) => println!("Failed to read file: {}", e),
    }
}
