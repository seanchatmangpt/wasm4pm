use super::{select,CandidatePlan,CandidateProvider,PortableRequest,Sa2aError};
#[derive(Debug,Clone,PartialEq)] pub struct Recovery { pub candidate:CandidatePlan,pub excluded:Vec<String>,pub attempts:usize }
pub fn recover(req:&PortableRequest,providers:&[&dyn CandidateProvider],max_attempts:usize)->Result<Recovery,Sa2aError>{
 req.admit()?; let mut excluded=Vec::new();
 for attempt in 0..max_attempts { let p=select(providers,&req.formalism,&excluded).ok_or(Sa2aError::ProviderUnavailable)?;
   match p.propose(req){Ok(c)=>{c.guard(&req.subject,&req.effect_id)?;return Ok(Recovery{candidate:c,excluded,attempts:attempt+1})},Err(_)=>excluded.push(p.id().to_string())}}
 Err(Sa2aError::AttemptBudgetExhausted)
}
