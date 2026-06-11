use std::collections::HashMap;

fn main() {
    let min_val = 0.0_f32;
    let max_val = 90.0_f32;
    let num_points = 101;
    let step = (max_val - min_val) / (num_points - 1) as f32;
    let mut sum_x_mu = 0.0_f32;
    let mut sum_mu = 0.0_f32;

    for i in 0..num_points {
        let x = min_val + i as f32 * step;
        
        let mut mu1 = 0.0;
        if x > 0.0 && x < 60.0 {
            if x >= 20.0 && x <= 40.0 { mu1 = 1.0; }
            else if x < 20.0 { mu1 = x / 20.0; }
            else { mu1 = (60.0 - x) / 20.0; }
        }
        mu1 = mu1.min(1.0); // rule 1 strength
        
        let mut mu2 = 0.0;
        if x > 30.0 && x < 90.0 {
            if x >= 50.0 && x <= 70.0 { mu2 = 1.0; }
            else if x < 50.0 { mu2 = (x - 30.0) / 20.0; }
            else { mu2 = (90.0 - x) / 20.0; }
        }
        mu2 = mu2.min(0.5); // rule 2 strength
        
        let max_mu = mu1.max(mu2);
        
        sum_x_mu += x * max_mu;
        sum_mu += max_mu;
    }
    
    let centroid = sum_x_mu / sum_mu;
    let centroid = (centroid * 1e5).round() / 1e5;
    println!("Centroid: {}", centroid);
}
