pub const fn compute_table() -> [[u16; 13]; 13] {
    let mut t = [[0u16; 13]; 13];
    let mut x_s = 1; while x_s <= 6 {
    let mut x_e = x_s + 1; while x_e <= 6 {
    let mut y_s = 1; while y_s <= 6 {
    let mut y_e = y_s + 1; while y_e <= 6 {
    let mut z_s = 1; while z_s <= 6 {
    let mut z_e = z_s + 1; while z_e <= 6 {
        let r1 = rel(x_s, x_e, y_s, y_e);
        let r2 = rel(y_s, y_e, z_s, z_e);
        let r3 = rel(x_s, x_e, z_s, z_e);
        t[r1][r2] |= (1 << r3);
        z_e += 1; } z_s += 1; }
        y_e += 1; } y_s += 1; }
        x_e += 1; } x_s += 1; }
    t
}
const fn rel(s1: i32, e1: i32, s2: i32, e2: i32) -> usize {
    if e1 < s2 { 0 } // p
    else if e2 < s1 { 1 } // pi
    else if e1 == s2 { 2 } // m
    else if e2 == s1 { 3 } // mi
    else if s1 < s2 && e1 > s2 && e1 < e2 { 4 } // o
    else if s2 < s1 && e2 > s1 && e2 < e1 { 5 } // oi
    else if s1 > s2 && e1 < e2 { 6 } // d
    else if s1 < s2 && e1 > e2 { 7 } // di
    else if s1 == s2 && e1 < e2 { 8 } // s
    else if s1 == s2 && e1 > e2 { 9 } // si
    else if e1 == e2 && s1 > s2 { 10 } // f
    else if e1 == e2 && s1 < s2 { 11 } // fi
    else { 12 } // eq
}
