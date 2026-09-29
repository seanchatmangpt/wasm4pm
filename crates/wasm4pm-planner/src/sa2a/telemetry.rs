use serde::Serialize; #[derive(Debug,Clone,Serialize)] pub struct Event<'a>{pub kind:&'a str,pub subject:&'a str,pub effect_id:&'a str,pub provider:&'a str,pub attempt:usize}
