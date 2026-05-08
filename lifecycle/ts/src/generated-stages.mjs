// GENERATED — DO NOT EDIT — source: schema/domain.ttl
// Run `ggen sync` in lifecycle/ to regenerate.

/** Lifecycle stages in declared order. Mirrors Rust `LifecycleStage` enum. */
export const STAGES = Object.freeze({

  Spec: { order: 1, spanName: 'lifecycle.spec', xesActivity: 'Spec', description: 'Define the system in RDF ontology (source of truth).' },

  Generate: { order: 2, spanName: 'lifecycle.generate', xesActivity: 'Generate', description: 'Run ggen sync (Rust) and unrdf sync (TypeScript) to precipitate code from the ontology.' },

  Test: { order: 3, spanName: 'lifecycle.test', xesActivity: 'Test', description: 'Execute tests, SHACL validation, and conformance checks against generated artifacts.' },

  Deploy: { order: 4, spanName: 'lifecycle.deploy', xesActivity: 'Deploy', description: 'Publish WASM packages, Rust crates, and TypeScript libraries.' },

  Monitor: { order: 5, spanName: 'lifecycle.monitor', xesActivity: 'Monitor', description: 'Collect OTel traces, convert to XES event logs, store in unrdf RDF graph.' },

  Improve: { order: 6, spanName: 'lifecycle.improve', xesActivity: 'Improve', description: 'Run wasm4pm DFG / AlphaMiner / InductiveMiner on event log; discover drift vs. intended process; produce improvement spec.' },

});

/** Ordered array of stage names. */
export const STAGE_NAMES = Object.freeze([

  'Spec',

  'Generate',

  'Test',

  'Deploy',

  'Monitor',

  'Improve',

]);
