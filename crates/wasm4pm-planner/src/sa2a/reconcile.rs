use super::{Outcome,Sa2aError}; #[derive(Debug,Clone,Copy,PartialEq,Eq)] pub enum Reconcile{Close,Retry,Observe}
pub fn reconcile(o:Outcome)->Result<Reconcile,Sa2aError>{Ok(match o{Outcome::Succeeded=>Reconcile::Close,Outcome::Failed=>Reconcile::Retry,Outcome::Unknown=>Reconcile::Observe})}
