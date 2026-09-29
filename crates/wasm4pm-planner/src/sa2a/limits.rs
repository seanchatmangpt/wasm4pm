#[derive(Debug,Clone,Copy,PartialEq,Eq)] pub struct Limits{pub attempts:usize,pub payload_bytes:usize} impl Default for Limits{fn default()->Self{Self{attempts:3,payload_bytes:1_048_576}}}
