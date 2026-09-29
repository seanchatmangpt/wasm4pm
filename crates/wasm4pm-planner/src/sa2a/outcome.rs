use super::Sa2aError;
#[derive(Debug,Clone,Copy,PartialEq,Eq)] pub enum Outcome{Succeeded,Failed,Unknown}
pub fn classify(s:&str)->Result<Outcome,Sa2aError>{match s{"succeeded"|"success"=>Ok(Outcome::Succeeded),"failed"|"refused"=>Ok(Outcome::Failed),"unknown"|"timeout"|"lost"=>Ok(Outcome::Unknown),_=>Err(Sa2aError::UnknownOutcome)}}
