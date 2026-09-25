use crate::models::{EventLog, Trace, Event, AttributeValue};
use fastrand;

pub fn inject_noise(log: &EventLog, noise_level: f64) -> EventLog {
    let mut perturbed_traces = Vec::new();
    for trace in &log.traces {
        let mut events = trace.events.clone();
        if events.len() > 1 && fastrand::f64() < noise_level {
            // Adversarial perturbation: Swap two random events
            let i = fastrand::usize(..events.len());
            let j = fastrand::usize(..events.len());
            events.swap(i, j);
        }
        perturbed_traces.push(Trace {
            id: format!("{}_perturbed", trace.id),
            events,
            attributes: trace.attributes.clone(),
        });
    }
    EventLog {
        traces: perturbed_traces,
        attributes: log.attributes.clone(),
    }
}
