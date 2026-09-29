use crate::{ActuatorRefusal,ResourceBudget,ResourceEnvelope};
pub struct ResourceAdmission;
impl ResourceAdmission {
 pub fn admit(e:&ResourceEnvelope,effect_digest:&str,generation:u64,requested:ResourceBudget)->Result<(),ActuatorRefusal>{
  e.validate()?;
  if e.effect_digest!=effect_digest { return Err(ActuatorRefusal::ResourceIdentityMismatch); }
  if e.generation!=generation { return Err(ActuatorRefusal::ResourceGenerationMismatch); }
  if !e.budget.contains(&requested) { return Err(ActuatorRefusal::ResourceBudgetExceeded); }
  Ok(())
 }
 pub fn admit_children(parent:&ResourceEnvelope,children:&[ResourceEnvelope])->Result<(),ActuatorRefusal>{
  let mut total=ResourceBudget::default();
  for child in children { parent.admit_child(child)?; total=total.checked_add(child.budget)?; }
  if !parent.budget.contains(&total) { return Err(ActuatorRefusal::ResourceAmplification); }
  Ok(())
 }
}
