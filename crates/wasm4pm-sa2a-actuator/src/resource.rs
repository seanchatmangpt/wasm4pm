use serde::{Deserialize,Serialize};
use crate::error::ActuatorRefusal;

#[derive(Debug,Clone,Copy,PartialEq,Eq,Serialize,Deserialize,Default)]
#[serde(deny_unknown_fields)]
pub struct ResourceBudget { pub cpu_micros:u64, pub memory_bytes:u64, pub io_bytes:u64, pub fuel:u64 }

impl ResourceBudget {
 pub fn contains(&self,c:&Self)->bool { c.cpu_micros<=self.cpu_micros && c.memory_bytes<=self.memory_bytes && c.io_bytes<=self.io_bytes && c.fuel<=self.fuel }
 pub fn checked_add(self,o:Self)->Result<Self,ActuatorRefusal>{
  Ok(Self{cpu_micros:self.cpu_micros.checked_add(o.cpu_micros).ok_or(ActuatorRefusal::ResourceAmplification)?,
  memory_bytes:self.memory_bytes.checked_add(o.memory_bytes).ok_or(ActuatorRefusal::ResourceAmplification)?,
  io_bytes:self.io_bytes.checked_add(o.io_bytes).ok_or(ActuatorRefusal::ResourceAmplification)?,
  fuel:self.fuel.checked_add(o.fuel).ok_or(ActuatorRefusal::ResourceAmplification)?})
 }
}
#[derive(Debug,Clone,PartialEq,Eq,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResourceEnvelope {
 pub version:String, pub allocation_id:String, pub effect_digest:String, pub replay_key:String,
 pub generation:u64, pub parent_allocation_id:Option<String>, pub budget:ResourceBudget, pub authority:String,
}
impl ResourceEnvelope {
 pub fn validate(&self)->Result<(),ActuatorRefusal>{
  if self.version!="sa2a/resource-envelope/v1" || self.allocation_id.is_empty() || self.effect_digest.is_empty() || self.replay_key.is_empty() || self.authority!="none" { return Err(ActuatorRefusal::ResourceEnvelopeInvalid); }
  Ok(())
 }
 pub fn admit_child(&self,child:&Self)->Result<(),ActuatorRefusal>{
  self.validate()?; child.validate()?;
  if child.parent_allocation_id.as_deref()!=Some(self.allocation_id.as_str()) { return Err(ActuatorRefusal::ResourceParentMismatch); }
  if child.effect_digest!=self.effect_digest || child.replay_key!=self.replay_key { return Err(ActuatorRefusal::ResourceIdentityMismatch); }
  if child.generation!=self.generation { return Err(ActuatorRefusal::ResourceGenerationMismatch); }
  if !self.budget.contains(&child.budget) { return Err(ActuatorRefusal::ResourceAmplification); }
  Ok(())
 }
}
