//! GALL-022 / GALL-023 lowering: admitted process subjects -> deterministic
//! WASM modules.
//!
//! * POWL (the canonical [`crate::powl_arena::PowlArena`], reached from the
//!   GALL-016 JSON dialect or from pm4py model strings) is lowered to a
//!   language acceptor. The lowering IR is the residual-configuration automaton
//!   of the POWL term (partial orders stay concurrent: every admitted
//!   interleaving is a path), determinized and minimized, then emitted as a
//!   WASI command whose data segment is the transition table.
//! * GALL-017 OCPQ queries (the ex4pm reference dialect) are lowered to a WASI
//!   command whose code evaluates the query predicates over an encoded OCEL.
//!
//! Every module imports exactly `wasi_snapshot_preview1.fd_read` and
//! `fd_write` (stdin/stdout); no clock, randomness, filesystem or network
//! import is ever emitted. Module identity is the SHA-256 of its bytes; the
//! `gall.subject` custom section binds source digest and compiler digest, and
//! POWL modules also carry the `gall.powl.skeleton` hierarchy section.
//!
//! Authority: COMPILE/COMPUTE only. This module performs no I/O.

use crate::gall_process_portability::{
    digest_json, sha256, HostCapabilityFence, PortabilityRefusal, MAX_POWL_DEPTH,
};
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use wasm_encoder::{
    BlockType, CodeSection, ConstExpr, CustomSection, DataSection, EntityType, ExportKind,
    ExportSection, Function, FunctionSection, ImportSection, MemArg, MemorySection, MemoryType,
    Module, TypeSection, ValType,
};

/// Lowering schema identifier, part of the compiler identity.
pub const LOWERING_SCHEMA: &str = "gall.wasm-lowering/1";
/// Maximum admitted DFA size; larger state spaces are refused, never truncated.
pub const MAX_DFA_STATES: usize = 4096;
/// Maximum number of distinct POWL activity labels (symbol bytes 0..250).
pub const MAX_ALPHABET: usize = 250;
/// Trace separator byte in POWL acceptor input.
pub const TRACE_END: u8 = 0xFF;
/// Symbol byte used by probes for an activity outside the model alphabet.
pub const UNKNOWN_SYMBOL: u8 = 0xFE;

const COMPILER_SOURCE: &[u8] = include_bytes!("gall_wasm_lowering.rs");
const IN_CAP: u32 = 1 << 20;
const OUT_CAP: u32 = 1 << 20;
const PAGE: u32 = 65_536;
const DEAD: u32 = u32::MAX;
/// OCEL string code for a value that equals no query constant.
const OTHER_CODE: u32 = 0x7FFF_FFFF;

/// Compiler identity: lowering schema, crate version and the exact bytes of
/// this lowering source. Changing any of them changes every module digest.
pub fn compiler_digest() -> String {
    let mut bytes = Vec::with_capacity(COMPILER_SOURCE.len() + 64);
    bytes.extend_from_slice(LOWERING_SCHEMA.as_bytes());
    bytes.push(b'\n');
    bytes.extend_from_slice(env!("CARGO_PKG_VERSION").as_bytes());
    bytes.push(b'\n');
    bytes.extend_from_slice(COMPILER_SOURCE);
    sha256(&bytes)
}

// ---------------------------------------------------------------------------
// Portable module + inspection
// ---------------------------------------------------------------------------

/// A WASM artifact, content-addressed by its exact bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortableModule {
    bytes: Vec<u8>,
    digest: String,
}

impl PortableModule {
    pub fn from_bytes(bytes: Vec<u8>) -> Self {
        let digest = sha256(&bytes);
        Self { bytes, digest }
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub fn digest(&self) -> &str {
        &self.digest
    }
}

/// Contents of the `gall.subject` custom section.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModuleSubjectSection {
    pub schema: String,
    pub kind: String,
    pub source_digest: String,
    pub compiler_digest: String,
    /// POWL acceptor: activity label per symbol byte. OCPQ: query constants
    /// per code (code = index + 1).
    pub symbols: Vec<String>,
}

pub const KIND_POWL_ACCEPTOR: &str = "powl-acceptor";
pub const KIND_GALL017_OCPQ: &str = "gall017-ocpq";

/// Facts read back from module bytes (never from the compiler's memory).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleInspection {
    pub subject: ModuleSubjectSection,
    pub skeleton: Option<PowlSkeleton>,
    pub host_fence: HostCapabilityFence,
    pub imports: Vec<(String, String)>,
}

/// Validate module bytes and derive its host-capability fence and GALL
/// sections. The fence is a property of the imports actually present.
pub fn inspect_module(module: &PortableModule) -> Result<ModuleInspection, PortabilityRefusal> {
    wasmparser::Validator::new()
        .validate_all(module.bytes())
        .map_err(|e| PortabilityRefusal::InvalidModule(e.to_string()))?;

    let mut imports = Vec::new();
    let mut subject = None;
    let mut skeleton = None;
    for payload in wasmparser::Parser::new(0).parse_all(module.bytes()) {
        let payload = payload.map_err(|e| PortabilityRefusal::InvalidModule(e.to_string()))?;
        match payload {
            wasmparser::Payload::ImportSection(reader) => {
                for import in reader.into_imports() {
                    let import =
                        import.map_err(|e| PortabilityRefusal::InvalidModule(e.to_string()))?;
                    imports.push((import.module.to_string(), import.name.to_string()));
                }
            }
            wasmparser::Payload::CustomSection(reader) => match reader.name() {
                "gall.subject" => {
                    if subject.is_some() {
                        return Err(PortabilityRefusal::InvalidModule(
                            "duplicate gall.subject section".into(),
                        ));
                    }
                    subject = Some(
                        serde_json::from_slice::<ModuleSubjectSection>(reader.data())
                            .map_err(|e| PortabilityRefusal::InvalidModule(e.to_string()))?,
                    );
                }
                "gall.powl.skeleton" => {
                    if skeleton.is_some() {
                        return Err(PortabilityRefusal::InvalidModule(
                            "duplicate gall.powl.skeleton section".into(),
                        ));
                    }
                    skeleton = Some(
                        serde_json::from_slice::<PowlSkeleton>(reader.data())
                            .map_err(|e| PortabilityRefusal::InvalidModule(e.to_string()))?,
                    );
                }
                _ => {}
            },
            _ => {}
        }
    }
    let subject = subject
        .ok_or_else(|| PortabilityRefusal::InvalidModule("missing gall.subject section".into()))?;
    let host_fence = fence_from_imports(&imports)?;
    Ok(ModuleInspection {
        subject,
        skeleton,
        host_fence,
        imports,
    })
}

/// Classify WASI imports into host capabilities. Stdio reads/writes are the
/// subject's own input/output channel; anything unknown is refused.
pub fn fence_from_imports(
    imports: &[(String, String)],
) -> Result<HostCapabilityFence, PortabilityRefusal> {
    let mut fence = HostCapabilityFence::default();
    for (module, name) in imports {
        if module != "wasi_snapshot_preview1" {
            return Err(PortabilityRefusal::UnsupportedHostImport(format!(
                "{module}::{name}"
            )));
        }
        match name.as_str() {
            "fd_read" | "fd_write" => {}
            "clock_time_get" | "clock_res_get" | "poll_oneoff" => fence.clock = true,
            "random_get" => fence.randomness = true,
            n if n.starts_with("path_") || n.starts_with("fd_") => fence.filesystem = true,
            n if n.starts_with("sock_") => fence.network = true,
            other => {
                return Err(PortabilityRefusal::UnsupportedHostImport(format!(
                    "{module}::{other}"
                )))
            }
        }
    }
    Ok(fence)
}

// ---------------------------------------------------------------------------
// POWL subject (ingress into the canonical arena)
// ---------------------------------------------------------------------------

/// Canonical structural form of a POWL model: construct kinds, labels,
/// hierarchy boundaries and transitively closed partial orders. Children of
/// order-insensitive constructs are sorted; sequence is a total partial order.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PowlSkeleton {
    Task {
        label: String,
    },
    Silent,
    PartialOrder {
        children: Vec<PowlSkeleton>,
        order: Vec<(usize, usize)>,
    },
    Choice {
        children: Vec<PowlSkeleton>,
    },
    Loop {
        body: Box<PowlSkeleton>,
        redo: Box<PowlSkeleton>,
    },
    Boundary {
        id: String,
        child: Box<PowlSkeleton>,
    },
}

/// An admitted POWL subject: the canonical arena plus its exact source digest.
#[derive(Debug, Clone)]
pub struct PowlSubject {
    source_digest: String,
    arena: PowlArena,
    root: u32,
    boundaries: BTreeMap<u32, String>,
    skeleton: PowlSkeleton,
    alphabet: Vec<String>,
}

impl PowlSubject {
    /// Admit an arena model; the source digest is the digest of its skeleton.
    pub fn from_arena(arena: PowlArena, root: u32) -> Result<Self, PortabilityRefusal> {
        Self::admit(None, arena, root, BTreeMap::new())
    }

    /// Admit a pm4py POWL model string via the existing wasm4pm parser.
    pub fn from_pm4py_string(model: &str) -> Result<Self, PortabilityRefusal> {
        let mut arena = PowlArena::new();
        let root = crate::powl_parser::parse_powl_model_string(model, &mut arena)
            .map_err(|e| PortabilityRefusal::InvalidPowlInput(format!("{e:?}")))?;
        Self::admit(Some(sha256(model.as_bytes())), arena, root, BTreeMap::new())
    }

    /// Admit the GALL-016 semantic JSON dialect (ex4pm `Powl.from_semantic`):
    /// `task | sequence | partial_order | choice | loop | hierarchy`. Unknown
    /// kinds and unknown fields (e.g. choice conditions) are typed-refused.
    pub fn from_gall016_json(bytes: &[u8]) -> Result<Self, PortabilityRefusal> {
        // Nesting beyond what a MAX_POWL_DEPTH model can produce is a typed
        // depth refusal, not an opaque serde recursion error.
        if json_nesting(bytes) > 2 * MAX_POWL_DEPTH - 1 {
            return Err(PortabilityRefusal::PowlDepthExceeded);
        }
        let value: Value = serde_json::from_slice(bytes)
            .map_err(|e| PortabilityRefusal::InvalidPowlInput(e.to_string()))?;
        let mut arena = PowlArena::new();
        let mut boundaries = BTreeMap::new();
        let root = ingest_gall016(&value, &mut arena, &mut boundaries, 1)?;
        Self::admit(Some(sha256(bytes)), arena, root, boundaries)
    }

    fn admit(
        source_digest: Option<String>,
        arena: PowlArena,
        root: u32,
        boundaries: BTreeMap<u32, String>,
    ) -> Result<Self, PortabilityRefusal> {
        validate_arena(&arena, root)?;
        let skeleton = skeleton_of(&arena, root, &boundaries);
        let mut labels = BTreeSet::new();
        collect_labels(&arena, root, &mut labels);
        if labels.len() > MAX_ALPHABET {
            return Err(PortabilityRefusal::UnsupportedPowlConstruct(format!(
                "alphabet of {} labels exceeds {MAX_ALPHABET}",
                labels.len()
            )));
        }
        let source_digest = source_digest.unwrap_or_else(|| digest_json(&skeleton));
        Ok(Self {
            source_digest,
            arena,
            root,
            boundaries,
            skeleton,
            alphabet: labels.into_iter().collect(),
        })
    }

    pub fn source_digest(&self) -> &str {
        &self.source_digest
    }

    pub fn skeleton(&self) -> &PowlSkeleton {
        &self.skeleton
    }

    pub fn alphabet(&self) -> &[String] {
        &self.alphabet
    }

    pub fn arena(&self) -> &PowlArena {
        &self.arena
    }

    pub fn root(&self) -> u32 {
        self.root
    }

    /// Symbol byte for an activity label, if it is in the alphabet.
    pub fn symbol(&self, label: &str) -> Option<u8> {
        self.alphabet
            .binary_search_by(|l| l.as_str().cmp(label))
            .ok()
            .map(|i| i as u8)
    }
}

/// Maximum `{`/`[` nesting of JSON text, ignoring brackets inside strings.
/// Linear and non-recursive, so it is safe on adversarial input.
fn json_nesting(bytes: &[u8]) -> usize {
    let (mut depth, mut max) = (0usize, 0usize);
    let (mut in_string, mut escaped) = (false, false);
    for &b in bytes {
        if in_string {
            match (escaped, b) {
                (true, _) => escaped = false,
                (false, b'\\') => escaped = true,
                (false, b'"') => in_string = false,
                _ => {}
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'{' | b'[' => {
                depth += 1;
                max = max.max(depth);
            }
            b'}' | b']' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    max
}

fn identity_of(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Object(map) => match map.get("type").and_then(Value::as_str) {
            Some("task") | Some("hierarchy") => {
                map.get("id").and_then(Value::as_str).map(str::to_string)
            }
            _ => None,
        },
        _ => None,
    }
}

fn ingest_gall016(
    value: &Value,
    arena: &mut PowlArena,
    boundaries: &mut BTreeMap<u32, String>,
    depth: usize,
) -> Result<u32, PortabilityRefusal> {
    if depth > MAX_POWL_DEPTH {
        return Err(PortabilityRefusal::PowlDepthExceeded);
    }
    let map = match value {
        Value::String(id) => {
            if id.is_empty() {
                return Err(PortabilityRefusal::InvalidPowlInput("empty task id".into()));
            }
            return Ok(arena.add_transition(Some(id.clone())));
        }
        Value::Object(map) => map,
        other => {
            return Err(PortabilityRefusal::InvalidPowlInput(format!(
                "POWL node must be a string or object, got {other}"
            )))
        }
    };
    let kind = map
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| PortabilityRefusal::InvalidPowlInput("node without string type".into()))?;
    let allowed: &[&str] = match kind {
        "task" => &["type", "id"],
        "sequence" | "choice" => &["type", "children"],
        "partial_order" => &["type", "children", "order"],
        "loop" => &["type", "body", "redo"],
        "hierarchy" => &["type", "id", "child"],
        other => return Err(PortabilityRefusal::UnsupportedPowlConstruct(other.into())),
    };
    if let Some(extra) = map.keys().find(|k| !allowed.contains(&k.as_str())) {
        return Err(PortabilityRefusal::UnsupportedPowlConstruct(format!(
            "{kind}.{extra}"
        )));
    }
    let string_field = |name: &str| -> Result<String, PortabilityRefusal> {
        match map.get(name).and_then(Value::as_str) {
            Some(s) if !s.is_empty() => Ok(s.to_string()),
            _ => Err(PortabilityRefusal::InvalidPowlInput(format!(
                "{kind}.{name} must be a non-empty string"
            ))),
        }
    };
    let children_field = || -> Result<&Vec<Value>, PortabilityRefusal> {
        match map.get("children") {
            Some(Value::Array(children)) if !children.is_empty() => Ok(children),
            _ => Err(PortabilityRefusal::InvalidPowlInput(format!(
                "{kind}.children must be a non-empty array"
            ))),
        }
    };
    let node_field = |name: &str| -> Result<&Value, PortabilityRefusal> {
        map.get(name).ok_or_else(|| {
            PortabilityRefusal::InvalidPowlInput(format!("{kind}.{name} is required"))
        })
    };
    match kind {
        "task" => Ok(arena.add_transition(Some(string_field("id")?))),
        "sequence" => {
            let children = children_field()?
                .iter()
                .map(|c| ingest_gall016(c, arena, boundaries, depth + 1))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(arena.add_sequence(children))
        }
        "choice" => {
            let children = children_field()?
                .iter()
                .map(|c| ingest_gall016(c, arena, boundaries, depth + 1))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(arena.add_operator(Operator::Xor, children))
        }
        "loop" => {
            let body = ingest_gall016(node_field("body")?, arena, boundaries, depth + 1)?;
            let redo = ingest_gall016(node_field("redo")?, arena, boundaries, depth + 1)?;
            Ok(arena.add_operator(Operator::Loop, vec![body, redo]))
        }
        "hierarchy" => {
            let id = string_field("id")?;
            let child = ingest_gall016(node_field("child")?, arena, boundaries, depth + 1)?;
            let idx = arena.add_strict_partial_order(vec![child]);
            boundaries.insert(idx, id);
            Ok(idx)
        }
        "partial_order" => {
            let raw_children = children_field()?;
            // Edge endpoints must name a DIRECT child (task id or hierarchy
            // id). Anything nested deeper is behind a boundary and cannot be
            // ordered from here.
            // Two direct children with one identity are fine until an edge
            // names that identity (then the endpoint is ambiguous).
            let mut index_of: BTreeMap<String, Option<usize>> = BTreeMap::new();
            for (i, child) in raw_children.iter().enumerate() {
                if let Some(id) = identity_of(child) {
                    index_of
                        .entry(id)
                        .and_modify(|slot| *slot = None)
                        .or_insert(Some(i));
                }
            }
            let mut edges = Vec::new();
            match map.get("order") {
                None => {}
                Some(Value::Array(pairs)) => {
                    for pair in pairs {
                        let (from, to) = match pair {
                            Value::Array(p) if p.len() == 2 => {
                                match (p[0].as_str(), p[1].as_str()) {
                                    (Some(a), Some(b)) => (a.to_string(), b.to_string()),
                                    _ => {
                                        return Err(PortabilityRefusal::InvalidPowlInput(
                                            "order pair must hold two strings".into(),
                                        ))
                                    }
                                }
                            }
                            _ => {
                                return Err(PortabilityRefusal::InvalidPowlInput(
                                    "order entries must be [from, to] pairs".into(),
                                ))
                            }
                        };
                        if from == to {
                            return Err(PortabilityRefusal::MalformedPartialOrder(format!(
                                "self-loop {from}"
                            )));
                        }
                        let lookup = |id: &str| match index_of.get(id) {
                            Some(Some(i)) => Ok(*i),
                            Some(None) => Err(PortabilityRefusal::MalformedPartialOrder(format!(
                                "ambiguous endpoint {id}"
                            ))),
                            None => Err(PortabilityRefusal::MalformedPartialOrder(format!(
                                "endpoint {id} is not a direct child"
                            ))),
                        };
                        edges.push((lookup(&from)?, lookup(&to)?));
                    }
                }
                Some(_) => {
                    return Err(PortabilityRefusal::InvalidPowlInput(
                        "partial_order.order must be an array".into(),
                    ))
                }
            }
            let children = raw_children
                .iter()
                .map(|c| ingest_gall016(c, arena, boundaries, depth + 1))
                .collect::<Result<Vec<_>, _>>()?;
            let idx = arena.add_strict_partial_order(children);
            for (from, to) in edges {
                arena
                    .add_order_edge(idx, from, to)
                    .map_err(PortabilityRefusal::InvalidPowlInput)?;
            }
            Ok(idx)
        }
        _ => unreachable!("kind checked above"),
    }
}

fn node(arena: &PowlArena, idx: u32) -> Result<&PowlNode, PortabilityRefusal> {
    arena
        .get(idx)
        .ok_or_else(|| PortabilityRefusal::InvalidPowlInput(format!("dangling node {idx}")))
}

fn validate_arena(arena: &PowlArena, root: u32) -> Result<(), PortabilityRefusal> {
    // Iterative so adversarial depth (or an arena reference cycle) is refused
    // without exhausting the stack.
    let mut stack = vec![(root, 1usize)];
    while let Some((idx, depth)) = stack.pop() {
        if depth > MAX_POWL_DEPTH {
            return Err(PortabilityRefusal::PowlDepthExceeded);
        }
        match node(arena, idx)? {
            PowlNode::Transition(_) => {}
            PowlNode::FrequentTransition(_) => {
                return Err(PortabilityRefusal::UnsupportedPowlConstruct(
                    "frequent_transition".into(),
                ))
            }
            PowlNode::DecisionGraph(_) => {
                return Err(PortabilityRefusal::UnsupportedPowlConstruct(
                    "decision_graph".into(),
                ))
            }
            PowlNode::ChoiceGraph(_) => {
                return Err(PortabilityRefusal::UnsupportedPowlConstruct(
                    "choice_graph".into(),
                ))
            }
            PowlNode::StrictPartialOrder(spo) => {
                if spo.order.n != spo.children.len() {
                    return Err(PortabilityRefusal::MalformedPartialOrder(
                        "order size differs from child count".into(),
                    ));
                }
                let mut closed = spo.order.clone();
                closed.add_transitive_edges();
                if !closed.is_irreflexive() {
                    return Err(PortabilityRefusal::MalformedPartialOrder("cycle".into()));
                }
                stack.extend(spo.children.iter().map(|&c| (c, depth + 1)));
            }
            PowlNode::OperatorPowl(op) => {
                match op.operator {
                    Operator::Xor if op.children.is_empty() => {
                        return Err(PortabilityRefusal::InvalidPowlInput(
                            "choice without children".into(),
                        ))
                    }
                    Operator::Loop if op.children.len() != 2 => {
                        return Err(PortabilityRefusal::UnsupportedPowlConstruct(format!(
                            "loop with {} children",
                            op.children.len()
                        )))
                    }
                    Operator::PartialOrder => {
                        return Err(PortabilityRefusal::UnsupportedPowlConstruct(
                            "operator_partial_order".into(),
                        ))
                    }
                    _ => {}
                }
                stack.extend(op.children.iter().map(|&c| (c, depth + 1)));
            }
        }
    }
    Ok(())
}

fn collect_labels(arena: &PowlArena, idx: u32, out: &mut BTreeSet<String>) {
    match arena.get(idx) {
        Some(PowlNode::Transition(t)) => {
            if let Some(label) = &t.label {
                out.insert(label.clone());
            }
        }
        Some(PowlNode::StrictPartialOrder(spo)) => {
            for &c in &spo.children {
                collect_labels(arena, c, out);
            }
        }
        Some(PowlNode::OperatorPowl(op)) => {
            for &c in &op.children {
                collect_labels(arena, c, out);
            }
        }
        _ => {}
    }
}

fn skeleton_of(arena: &PowlArena, idx: u32, boundaries: &BTreeMap<u32, String>) -> PowlSkeleton {
    match arena.get(idx) {
        Some(PowlNode::Transition(t)) => match &t.label {
            Some(label) => PowlSkeleton::Task {
                label: label.clone(),
            },
            None => PowlSkeleton::Silent,
        },
        Some(PowlNode::StrictPartialOrder(spo)) => {
            if let Some(id) = boundaries.get(&idx) {
                if spo.children.len() == 1 {
                    return PowlSkeleton::Boundary {
                        id: id.clone(),
                        child: Box::new(skeleton_of(arena, spo.children[0], boundaries)),
                    };
                }
            }
            let children: Vec<PowlSkeleton> = spo
                .children
                .iter()
                .map(|&c| skeleton_of(arena, c, boundaries))
                .collect();
            let mut perm: Vec<usize> = (0..children.len()).collect();
            perm.sort_by(|&a, &b| children[a].cmp(&children[b]).then(a.cmp(&b)));
            let mut position = vec![0usize; perm.len()];
            for (new, &old) in perm.iter().enumerate() {
                position[old] = new;
            }
            let mut closed = spo.order.clone();
            closed.add_transitive_edges();
            let mut order: Vec<(usize, usize)> = closed
                .edge_list()
                .into_iter()
                .map(|(a, b)| (position[a], position[b]))
                .collect();
            order.sort_unstable();
            PowlSkeleton::PartialOrder {
                children: perm.iter().map(|&i| children[i].clone()).collect(),
                order,
            }
        }
        Some(PowlNode::OperatorPowl(op)) => match op.operator {
            Operator::Loop => PowlSkeleton::Loop {
                body: Box::new(skeleton_of(arena, op.children[0], boundaries)),
                redo: Box::new(skeleton_of(arena, op.children[1], boundaries)),
            },
            _ => {
                let mut children: Vec<PowlSkeleton> = op
                    .children
                    .iter()
                    .map(|&c| skeleton_of(arena, c, boundaries))
                    .collect();
                children.sort();
                PowlSkeleton::Choice { children }
            }
        },
        // Unsupported kinds never pass validate_arena.
        _ => PowlSkeleton::Silent,
    }
}

// ---------------------------------------------------------------------------
// POWL lowering IR: residual-configuration automaton
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Res {
    Done,
    Pending(u32),
    Po { node: u32, parts: Vec<Part> },
    LoopDo { node: u32, inner: Box<Res> },
    LoopRedo { node: u32, inner: Box<Res> },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Part {
    Waiting,
    Active(Res),
    Finished,
}

fn loop_children(arena: &PowlArena, n: u32) -> (u32, u32) {
    match arena.get(n) {
        Some(PowlNode::OperatorPowl(op)) => (op.children[0], op.children[1]),
        _ => unreachable!("loop residual on non-loop node"),
    }
}

fn eps(arena: &PowlArena, res: &Res) -> Vec<Res> {
    match res {
        Res::Done => vec![],
        Res::Pending(n) => match arena.get(*n) {
            Some(PowlNode::Transition(t)) if t.label.is_none() => vec![Res::Done],
            Some(PowlNode::StrictPartialOrder(spo)) => vec![Res::Po {
                node: *n,
                parts: vec![Part::Waiting; spo.children.len()],
            }],
            Some(PowlNode::OperatorPowl(op)) => match op.operator {
                Operator::Loop => vec![Res::LoopDo {
                    node: *n,
                    inner: Box::new(Res::Pending(op.children[0])),
                }],
                _ => op.children.iter().map(|&c| Res::Pending(c)).collect(),
            },
            _ => vec![],
        },
        Res::Po { node, parts } => {
            let Some(PowlNode::StrictPartialOrder(spo)) = arena.get(*node) else {
                unreachable!("po residual on non-po node")
            };
            if parts.iter().all(|p| *p == Part::Finished) {
                return vec![Res::Done];
            }
            let mut out = Vec::new();
            for (i, part) in parts.iter().enumerate() {
                match part {
                    Part::Waiting => {
                        let ready = (0..parts.len())
                            .filter(|&j| spo.order.is_edge(j, i))
                            .all(|j| parts[j] == Part::Finished);
                        if ready {
                            let mut next = parts.clone();
                            next[i] = Part::Active(Res::Pending(spo.children[i]));
                            out.push(Res::Po {
                                node: *node,
                                parts: next,
                            });
                        }
                    }
                    Part::Active(Res::Done) => {
                        let mut next = parts.clone();
                        next[i] = Part::Finished;
                        out.push(Res::Po {
                            node: *node,
                            parts: next,
                        });
                    }
                    Part::Active(inner) => {
                        for r in eps(arena, inner) {
                            let mut next = parts.clone();
                            next[i] = Part::Active(r);
                            out.push(Res::Po {
                                node: *node,
                                parts: next,
                            });
                        }
                    }
                    Part::Finished => {}
                }
            }
            out
        }
        Res::LoopDo { node, inner } => {
            if **inner == Res::Done {
                let (_, redo) = loop_children(arena, *node);
                vec![
                    Res::Done,
                    Res::LoopRedo {
                        node: *node,
                        inner: Box::new(Res::Pending(redo)),
                    },
                ]
            } else {
                eps(arena, inner)
                    .into_iter()
                    .map(|r| Res::LoopDo {
                        node: *node,
                        inner: Box::new(r),
                    })
                    .collect()
            }
        }
        Res::LoopRedo { node, inner } => {
            if **inner == Res::Done {
                let (body, _) = loop_children(arena, *node);
                vec![Res::LoopDo {
                    node: *node,
                    inner: Box::new(Res::Pending(body)),
                }]
            } else {
                eps(arena, inner)
                    .into_iter()
                    .map(|r| Res::LoopRedo {
                        node: *node,
                        inner: Box::new(r),
                    })
                    .collect()
            }
        }
    }
}

fn step(arena: &PowlArena, res: &Res, label: &str) -> Vec<Res> {
    match res {
        Res::Pending(n) => match arena.get(*n) {
            Some(PowlNode::Transition(t)) if t.label.as_deref() == Some(label) => vec![Res::Done],
            _ => vec![],
        },
        Res::Po { node, parts } => {
            let mut out = Vec::new();
            for (i, part) in parts.iter().enumerate() {
                if let Part::Active(inner) = part {
                    for r in step(arena, inner, label) {
                        let mut next = parts.clone();
                        next[i] = Part::Active(r);
                        out.push(Res::Po {
                            node: *node,
                            parts: next,
                        });
                    }
                }
            }
            out
        }
        Res::LoopDo { node, inner } => step(arena, inner, label)
            .into_iter()
            .map(|r| Res::LoopDo {
                node: *node,
                inner: Box::new(r),
            })
            .collect(),
        Res::LoopRedo { node, inner } => step(arena, inner, label)
            .into_iter()
            .map(|r| Res::LoopRedo {
                node: *node,
                inner: Box::new(r),
            })
            .collect(),
        Res::Done => vec![],
    }
}

const MAX_CLOSURE: usize = 200_000;

fn closure(
    arena: &PowlArena,
    seed: impl IntoIterator<Item = Res>,
) -> Result<BTreeSet<Res>, PortabilityRefusal> {
    let mut seen = BTreeSet::new();
    let mut queue: VecDeque<Res> = VecDeque::new();
    for r in seed {
        if seen.insert(r.clone()) {
            queue.push_back(r);
        }
    }
    while let Some(r) = queue.pop_front() {
        for next in eps(arena, &r) {
            if seen.insert(next.clone()) {
                if seen.len() > MAX_CLOSURE {
                    return Err(PortabilityRefusal::PowlStateSpaceExceeded);
                }
                queue.push_back(next);
            }
        }
    }
    Ok(seen)
}

/// Minimal complete-alphabet DFA (dead state implicit as [`u32::MAX`]),
/// states numbered in BFS order from the start state (state 0).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PowlDfa {
    pub symbols: usize,
    pub transitions: Vec<u32>,
    pub accepting: Vec<bool>,
}

impl PowlDfa {
    pub fn states(&self) -> usize {
        self.accepting.len()
    }

    /// Host-side membership (used only for diagnostics; the court's oracle is
    /// the generative reference language, not this automaton).
    pub fn accepts(&self, trace: &[u8]) -> bool {
        let mut state = 0u32;
        for &sym in trace {
            if sym as usize >= self.symbols {
                return false;
            }
            state = self.transitions[state as usize * self.symbols + sym as usize];
            if state == DEAD {
                return false;
            }
        }
        self.accepting[state as usize]
    }
}

/// Lower a POWL subject to its minimal DFA (the lowering IR).
pub fn powl_dfa(subject: &PowlSubject) -> Result<PowlDfa, PortabilityRefusal> {
    let arena = &subject.arena;
    let nsym = subject.alphabet.len();
    let start = closure(arena, [Res::Pending(subject.root)])?;
    let mut index: BTreeMap<BTreeSet<Res>, u32> = BTreeMap::new();
    let mut states: Vec<BTreeSet<Res>> = Vec::new();
    index.insert(start.clone(), 0);
    states.push(start);
    let mut transitions: Vec<u32> = Vec::new();
    let mut i = 0;
    while i < states.len() {
        for label in &subject.alphabet {
            let moved: Vec<Res> = states[i]
                .iter()
                .flat_map(|r| step(arena, r, label))
                .collect();
            if moved.is_empty() {
                transitions.push(DEAD);
                continue;
            }
            let target = closure(arena, moved)?;
            let id = match index.get(&target) {
                Some(&id) => id,
                None => {
                    if states.len() >= MAX_DFA_STATES {
                        return Err(PortabilityRefusal::PowlStateSpaceExceeded);
                    }
                    let id = states.len() as u32;
                    index.insert(target.clone(), id);
                    states.push(target);
                    id
                }
            };
            transitions.push(id);
        }
        i += 1;
    }
    let accepting: Vec<bool> = states.iter().map(|s| s.contains(&Res::Done)).collect();
    Ok(minimize(nsym, &transitions, &accepting))
}

fn minimize(nsym: usize, transitions: &[u32], accepting: &[bool]) -> PowlDfa {
    let n = accepting.len();
    // Moore partition refinement; the implicit dead state is class u32::MAX.
    let mut class: Vec<u32> = accepting.iter().map(|&a| u32::from(a)).collect();
    loop {
        let mut signatures: BTreeMap<(u32, Vec<u32>), u32> = BTreeMap::new();
        let mut next = vec![0u32; n];
        for s in 0..n {
            let sig: Vec<u32> = (0..nsym)
                .map(|a| {
                    let t = transitions[s * nsym + a];
                    if t == DEAD {
                        DEAD
                    } else {
                        class[t as usize]
                    }
                })
                .collect();
            let key = (class[s], sig);
            let fresh = signatures.len() as u32;
            next[s] = *signatures.entry(key).or_insert(fresh);
        }
        let stable = signatures.len() == class.iter().collect::<BTreeSet<_>>().len();
        class = next;
        if stable {
            break;
        }
    }
    // Drop classes that can never accept (they behave as the dead state).
    let classes = class.iter().copied().max().map_or(0, |m| m as usize + 1);
    let mut can_accept = vec![false; classes];
    for s in 0..n {
        if accepting[s] {
            can_accept[class[s] as usize] = true;
        }
    }
    loop {
        let mut changed = false;
        for s in 0..n {
            if can_accept[class[s] as usize] {
                continue;
            }
            if (0..nsym).any(|a| {
                let t = transitions[s * nsym + a];
                t != DEAD && can_accept[class[t as usize] as usize]
            }) {
                can_accept[class[s] as usize] = true;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    let rep: BTreeMap<u32, usize> = (0..n).rev().map(|s| (class[s], s)).collect();
    let mut order: BTreeMap<u32, u32> = BTreeMap::new();
    let mut queue = VecDeque::new();
    let start_class = class[0];
    let mut out_trans = Vec::new();
    let mut out_acc = Vec::new();
    if can_accept[start_class as usize] {
        order.insert(start_class, 0);
        queue.push_back(start_class);
    }
    while let Some(c) = queue.pop_front() {
        let s = rep[&c];
        out_acc.push(accepting[s]);
        for a in 0..nsym {
            let t = transitions[s * nsym + a];
            let target = if t == DEAD || !can_accept[class[t as usize] as usize] {
                DEAD
            } else {
                let tc = class[t as usize];
                let len = order.len() as u32;
                *order.entry(tc).or_insert_with(|| {
                    queue.push_back(tc);
                    len
                })
            };
            out_trans.push(target);
        }
    }
    if out_acc.is_empty() {
        // Empty language: a single non-accepting start state.
        out_acc.push(false);
        out_trans.extend(std::iter::repeat_n(DEAD, nsym));
    }
    PowlDfa {
        symbols: nsym,
        transitions: out_trans,
        accepting: out_acc,
    }
}

/// Compile a POWL subject to a deterministic WASM acceptor module.
pub fn lower_powl(subject: &PowlSubject) -> Result<PortableModule, PortabilityRefusal> {
    let dfa = powl_dfa(subject)?;
    let section = ModuleSubjectSection {
        schema: LOWERING_SCHEMA.into(),
        kind: KIND_POWL_ACCEPTOR.into(),
        source_digest: subject.source_digest.clone(),
        compiler_digest: compiler_digest(),
        symbols: subject.alphabet.clone(),
    };
    emit_powl_module(&section, &subject.skeleton, &dfa)
}

/// Emit the acceptor for an explicit DFA/skeleton/section. Crate-visible so
/// mutation falsifiers can build forged modules from real compiler parts.
pub(crate) fn emit_powl_module(
    section: &ModuleSubjectSection,
    skeleton: &PowlSkeleton,
    dfa: &PowlDfa,
) -> Result<PortableModule, PortabilityRefusal> {
    let nsym = dfa.symbols as u32;
    let trans_base = 0u32;
    let accept_base = trans_base + 4 * dfa.transitions.len() as u32;
    let mut data = Vec::with_capacity(dfa.transitions.len() * 4 + dfa.states());
    for t in &dfa.transitions {
        data.extend_from_slice(&t.to_le_bytes());
    }
    data.extend(dfa.accepting.iter().map(|&a| u8::from(a)));
    let layout = Layout::after(accept_base + dfa.states() as u32);

    // locals: 0 len, 1 n, 2 i, 3 state, 4 b, 5 o, 6 w
    let mut f = Function::new([(7, ValType::I32)]);
    emit_read_stdin(&mut f, &layout, 0, 1);
    {
        let mut s = f.instructions();
        s.i32_const(0).local_set(2);
        s.i32_const(0).local_set(5);
        s.i32_const(0).local_set(3);
        s.block(BlockType::Empty).loop_(BlockType::Empty);
        s.local_get(2).local_get(0).i32_ge_u().br_if(1);
        s.i32_const(layout.in_base as i32)
            .local_get(2)
            .i32_add()
            .i32_load8_u(mem(0))
            .local_set(4);
        s.local_get(4).i32_const(TRACE_END as i32).i32_eq();
        s.if_(BlockType::Empty);
        {
            s.i32_const(layout.out_base as i32).local_get(5).i32_add();
            s.local_get(3).i32_const(-1).i32_eq();
            s.if_(BlockType::Result(ValType::I32));
            s.i32_const(b'0' as i32);
            s.else_();
            s.i32_const(accept_base as i32)
                .local_get(3)
                .i32_add()
                .i32_load8_u(mem(0))
                .i32_const(b'0' as i32)
                .i32_add();
            s.end();
            s.i32_store8(mem(0));
            s.local_get(5).i32_const(1).i32_add().local_set(5);
            s.i32_const(0).local_set(3);
        }
        s.else_();
        {
            s.local_get(3).i32_const(-1).i32_ne();
            s.if_(BlockType::Empty);
            s.local_get(4).i32_const(nsym as i32).i32_ge_u();
            s.if_(BlockType::Result(ValType::I32));
            s.i32_const(-1);
            s.else_();
            s.local_get(3)
                .i32_const(nsym as i32)
                .i32_mul()
                .local_get(4)
                .i32_add()
                .i32_const(4)
                .i32_mul()
                .i32_const(trans_base as i32)
                .i32_add()
                .i32_load(mem(2));
            s.end();
            s.local_set(3);
            s.end();
        }
        s.end();
        s.local_get(2).i32_const(1).i32_add().local_set(2);
        s.br(0);
        s.end().end();
    }
    emit_write_stdout(&mut f, &layout, 5, 6, 1);
    f.instructions().end();

    let custom = vec![
        (
            "gall.subject",
            serde_json::to_vec(section).expect("section json"),
        ),
        (
            "gall.powl.skeleton",
            serde_json::to_vec(skeleton).expect("skeleton json"),
        ),
    ];
    finish_module(&layout, Some(&data), f, &custom)
}

// ---------------------------------------------------------------------------
// Reference POWL language (generative, independent of the automaton)
// ---------------------------------------------------------------------------

/// Budget on words materialized by the generative oracle.
pub const ORACLE_BUDGET: usize = 2_000_000;

/// All words of the subject's language with length <= `k`, over symbol bytes,
/// computed compositionally from the textbook POWL semantics: task = one
/// symbol, silent = empty word, choice = union, loop = do (redo do)*, partial
/// order = interleavings of one word per child where an edge i->j forces every
/// symbol of child i before every symbol of child j.
pub fn powl_reference_language(
    subject: &PowlSubject,
    k: usize,
) -> Result<BTreeSet<Vec<u8>>, PortabilityRefusal> {
    let mut budget = ORACLE_BUDGET;
    lang(subject, subject.root, k, &mut budget)
}

fn spend(budget: &mut usize, n: usize) -> Result<(), PortabilityRefusal> {
    if n > *budget {
        return Err(PortabilityRefusal::PowlStateSpaceExceeded);
    }
    *budget -= n;
    Ok(())
}

fn lang(
    subject: &PowlSubject,
    idx: u32,
    k: usize,
    budget: &mut usize,
) -> Result<BTreeSet<Vec<u8>>, PortabilityRefusal> {
    let arena = &subject.arena;
    let out = match node(arena, idx)? {
        PowlNode::Transition(t) => {
            let mut s = BTreeSet::new();
            match &t.label {
                None => {
                    s.insert(Vec::new());
                }
                Some(label) => {
                    if k >= 1 {
                        s.insert(vec![subject.symbol(label).expect("label in alphabet")]);
                    }
                }
            }
            s
        }
        PowlNode::OperatorPowl(op) => match op.operator {
            Operator::Loop => {
                let body = lang(subject, op.children[0], k, budget)?;
                let redo = lang(subject, op.children[1], k, budget)?;
                let mut result = body.clone();
                let mut frontier = body.clone();
                loop {
                    let mut fresh = BTreeSet::new();
                    for w in &frontier {
                        for r in &redo {
                            if w.len() + r.len() > k {
                                continue;
                            }
                            for b in &body {
                                if w.len() + r.len() + b.len() > k {
                                    continue;
                                }
                                let mut word = w.clone();
                                word.extend_from_slice(r);
                                word.extend_from_slice(b);
                                if !result.contains(&word) {
                                    spend(budget, 1)?;
                                    fresh.insert(word);
                                }
                            }
                        }
                    }
                    if fresh.is_empty() {
                        break;
                    }
                    result.extend(fresh.iter().cloned());
                    frontier = fresh;
                }
                result
            }
            _ => {
                let mut s = BTreeSet::new();
                for &c in &op.children {
                    s.extend(lang(subject, c, k, budget)?);
                }
                s
            }
        },
        PowlNode::StrictPartialOrder(spo) => {
            let child_langs: Vec<Vec<Vec<u8>>> = spo
                .children
                .iter()
                .map(|&c| lang(subject, c, k, budget).map(|s| s.into_iter().collect()))
                .collect::<Result<_, _>>()?;
            let n = child_langs.len();
            let mut preds: Vec<Vec<usize>> = vec![Vec::new(); n];
            for (i, p) in preds.iter_mut().enumerate() {
                *p = (0..n).filter(|&j| spo.order.is_edge(j, i)).collect();
            }
            let mut result = BTreeSet::new();
            let mut choice = vec![0usize; n];
            if child_langs.iter().all(|l| !l.is_empty()) {
                loop {
                    let words: Vec<&Vec<u8>> = (0..n).map(|i| &child_langs[i][choice[i]]).collect();
                    if words.iter().map(|w| w.len()).sum::<usize>() <= k {
                        let mut pos = vec![0usize; n];
                        let mut acc = Vec::new();
                        interleave(&words, &preds, &mut pos, &mut acc, &mut result, budget)?;
                    }
                    // odometer over word choices
                    let mut d = 0;
                    loop {
                        if d == n {
                            return Ok(result);
                        }
                        choice[d] += 1;
                        if choice[d] < child_langs[d].len() {
                            break;
                        }
                        choice[d] = 0;
                        d += 1;
                    }
                }
            }
            result
        }
        _ => {
            return Err(PortabilityRefusal::UnsupportedPowlConstruct(
                "reference semantics".into(),
            ))
        }
    };
    Ok(out)
}

fn interleave(
    words: &[&Vec<u8>],
    preds: &[Vec<usize>],
    pos: &mut Vec<usize>,
    acc: &mut Vec<u8>,
    out: &mut BTreeSet<Vec<u8>>,
    budget: &mut usize,
) -> Result<(), PortabilityRefusal> {
    let complete = |i: usize, pos: &[usize]| pos[i] == words[i].len();
    if (0..words.len()).all(|i| complete(i, pos)) {
        spend(budget, 1)?;
        out.insert(acc.clone());
        return Ok(());
    }
    for i in 0..words.len() {
        if complete(i, pos) || !preds[i].iter().all(|&j| complete(j, pos)) {
            continue;
        }
        acc.push(words[i][pos[i]]);
        pos[i] += 1;
        interleave(words, preds, pos, acc, out, budget)?;
        pos[i] -= 1;
        acc.pop();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Language probe (bounded, exhaustive over alphabet + unknown symbol)
// ---------------------------------------------------------------------------

/// Maximum number of probe traces in one module input.
pub const MAX_PROBE_TRACES: usize = 60_000;

/// Every word of length <= `bound` over the subject alphabet plus
/// [`UNKNOWN_SYMBOL`], in length-then-lexicographic order, encoded as module
/// input. Its expected output is computed from the reference language.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanguageProbe {
    subject_digest: String,
    bound: usize,
    traces: Vec<Vec<u8>>,
    input: Vec<u8>,
}

impl LanguageProbe {
    pub fn for_subject(subject: &PowlSubject) -> Self {
        let letters = subject.alphabet.len() + 1;
        let mut bound = 0usize;
        let mut total = 1usize;
        loop {
            let next = total + letters.pow((bound + 1) as u32);
            if bound >= 8 || next > MAX_PROBE_TRACES {
                break;
            }
            total = next;
            bound += 1;
        }
        Self::with_bound(subject, bound)
    }

    pub fn with_bound(subject: &PowlSubject, bound: usize) -> Self {
        let mut symbols: Vec<u8> = (0..subject.alphabet.len() as u8).collect();
        symbols.push(UNKNOWN_SYMBOL);
        let mut traces = vec![Vec::new()];
        let mut layer = vec![Vec::new()];
        for _ in 0..bound {
            let mut next = Vec::with_capacity(layer.len() * symbols.len());
            for w in &layer {
                for &s in &symbols {
                    let mut x = w.clone();
                    x.push(s);
                    next.push(x);
                }
            }
            traces.extend(next.iter().cloned());
            layer = next;
        }
        let mut input = Vec::new();
        for t in &traces {
            input.extend_from_slice(t);
            input.push(TRACE_END);
        }
        Self {
            subject_digest: subject.source_digest.clone(),
            bound,
            traces,
            input,
        }
    }

    pub fn subject_digest(&self) -> &str {
        &self.subject_digest
    }

    pub fn bound(&self) -> usize {
        self.bound
    }

    pub fn traces(&self) -> &[Vec<u8>] {
        &self.traces
    }

    pub fn input(&self) -> &[u8] {
        &self.input
    }

    /// Expected acceptor output under the reference language.
    pub fn expected_output(&self, subject: &PowlSubject) -> Result<Vec<u8>, PortabilityRefusal> {
        let language = powl_reference_language(subject, self.bound)?;
        Ok(self
            .traces
            .iter()
            .map(|t| if language.contains(t) { b'1' } else { b'0' })
            .collect())
    }
}

/// Canonical POWL acceptor result: the raw verdict bytes must be one ASCII
/// `0`/`1` per probe trace.
pub fn canonical_powl_output(
    probe: &LanguageProbe,
    stdout: &[u8],
) -> Result<Vec<u8>, PortabilityRefusal> {
    if stdout.len() != probe.traces.len() || stdout.iter().any(|b| *b != b'0' && *b != b'1') {
        return Err(PortabilityRefusal::PortableOutputMalformed(format!(
            "expected {} verdict bytes, got {}",
            probe.traces.len(),
            stdout.len()
        )));
    }
    Ok(stdout.to_vec())
}

// ---------------------------------------------------------------------------
// GALL-017 OCPQ dialect (ex4pm reference) + lowering
// ---------------------------------------------------------------------------

/// Supported GALL-017 query operators (ex4pm `Ex4pm.Gall.Ocpq`).
pub const GALL017_OPERATORS: [&str; 5] = [
    "activity",
    "object_type",
    "qualifier",
    "after_activity",
    "require_match",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Gall017Query {
    pub activity: Option<String>,
    pub object_type: Option<String>,
    pub qualifier: Option<String>,
    pub after_activity: Option<String>,
    pub require_match: bool,
}

impl Gall017Query {
    pub fn from_json(bytes: &[u8]) -> Result<Self, PortabilityRefusal> {
        let value: Value = serde_json::from_slice(bytes)
            .map_err(|e| PortabilityRefusal::InvalidOcpqQuery(e.to_string()))?;
        let Value::Object(map) = value else {
            return Err(PortabilityRefusal::InvalidOcpqQuery(
                "query must be an object".into(),
            ));
        };
        let mut keys: Vec<&String> = map.keys().collect();
        keys.sort();
        if let Some(op) = keys
            .iter()
            .find(|k| !GALL017_OPERATORS.contains(&k.as_str()))
        {
            return Err(PortabilityRefusal::UnsupportedOcpqOperator((*op).clone()));
        }
        let text = |name: &str| -> Result<Option<String>, PortabilityRefusal> {
            match map.get(name) {
                None | Some(Value::Null) => Ok(None),
                Some(Value::String(s)) => Ok(Some(s.clone())),
                Some(_) => Err(PortabilityRefusal::InvalidOcpqQuery(format!(
                    "{name} must be a string"
                ))),
            }
        };
        let require_match = match map.get("require_match") {
            None => true,
            Some(Value::Bool(b)) => *b,
            Some(_) => {
                return Err(PortabilityRefusal::InvalidOcpqQuery(
                    "require_match must be a boolean".into(),
                ))
            }
        };
        Ok(Self {
            activity: text("activity")?,
            object_type: text("object_type")?,
            qualifier: text("qualifier")?,
            after_activity: text("after_activity")?,
            require_match,
        })
    }

    pub fn digest(&self) -> String {
        digest_json(self)
    }

    /// Distinct query constants; code of constant `i` is `i + 1`.
    pub fn constants(&self) -> Vec<String> {
        let set: BTreeSet<String> = [
            &self.activity,
            &self.object_type,
            &self.qualifier,
            &self.after_activity,
        ]
        .into_iter()
        .flatten()
        .cloned()
        .collect();
        set.into_iter().collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Gall017Event {
    pub id: String,
    pub activity: Option<String>,
    pub sequence: Option<i64>,
    pub objects: Vec<(String, String, String)>,
}

/// Exact OCEL subject in the GALL-015/017 corpus shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Gall017Ocel {
    pub events: Vec<Gall017Event>,
}

impl Gall017Ocel {
    pub fn from_json(bytes: &[u8]) -> Result<Self, PortabilityRefusal> {
        let value: Value = serde_json::from_slice(bytes)
            .map_err(|e| PortabilityRefusal::InvalidOcel(e.to_string()))?;
        Self::from_value(&value)
    }

    pub fn from_value(value: &Value) -> Result<Self, PortabilityRefusal> {
        let events = value
            .get("events")
            .and_then(Value::as_array)
            .ok_or_else(|| PortabilityRefusal::InvalidOcel("events array required".into()))?;
        let mut seen = BTreeSet::new();
        let mut out = Vec::with_capacity(events.len());
        for event in events {
            let Value::Object(map) = event else {
                return Err(PortabilityRefusal::InvalidOcel(
                    "event must be an object".into(),
                ));
            };
            let id = map
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| PortabilityRefusal::InvalidOcel("event id required".into()))?
                .to_string();
            if !seen.insert(id.clone()) {
                return Err(PortabilityRefusal::InvalidOcel(format!(
                    "duplicate event id {id}"
                )));
            }
            let activity = match map.get("activity") {
                None | Some(Value::Null) => None,
                Some(Value::String(s)) => Some(s.clone()),
                Some(_) => {
                    return Err(PortabilityRefusal::InvalidOcel(format!(
                        "event {id}: activity must be a string"
                    )))
                }
            };
            let sequence = match map.get("sequence") {
                None | Some(Value::Null) => None,
                Some(v) => Some(v.as_i64().ok_or_else(|| {
                    PortabilityRefusal::InvalidOcel(format!(
                        "event {id}: sequence must be an i64 integer"
                    ))
                })?),
            };
            let objects = match map.get("objects") {
                None => Vec::new(),
                Some(Value::Array(objs)) => objs
                    .iter()
                    .map(|o| match o {
                        Value::Array(t) if t.len() == 3 => {
                            match (t[0].as_str(), t[1].as_str(), t[2].as_str()) {
                                (Some(a), Some(b), Some(c)) => {
                                    Ok((a.to_string(), b.to_string(), c.to_string()))
                                }
                                _ => Err(()),
                            }
                        }
                        _ => Err(()),
                    })
                    .collect::<Result<Vec<_>, ()>>()
                    .map_err(|()| {
                        PortabilityRefusal::InvalidOcel(format!(
                            "event {id}: objects must be [id, type, qualifier] triples"
                        ))
                    })?,
                Some(_) => {
                    return Err(PortabilityRefusal::InvalidOcel(format!(
                        "event {id}: objects must be an array"
                    )))
                }
            };
            out.push(Gall017Event {
                id,
                activity,
                sequence,
                objects,
            });
        }
        Ok(Self { events: out })
    }

    /// Exact-subject digest (event order included).
    pub fn digest(&self) -> String {
        digest_json(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Gall017Binding {
    pub event_id: String,
    pub activity: Option<String>,
    pub sequence: Option<i64>,
    pub objects: Vec<(String, String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Gall017Violation {
    pub class: String,
    pub query_digest: String,
}

/// Canonical OCPQ result: bindings sorted by their total order (bag
/// semantics; event ids are unique so no binding can repeat), typed
/// violations, and standing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Gall017Result {
    pub bindings: Vec<Gall017Binding>,
    pub violations: Vec<Gall017Violation>,
    pub standing: String,
}

impl Gall017Result {
    pub fn canonicalized(mut self) -> Self {
        self.bindings.sort();
        self.violations.sort();
        self
    }

    pub fn digest(&self) -> String {
        digest_json(&self.clone().canonicalized())
    }

    pub fn canonical_bytes(&self) -> Vec<u8> {
        serde_json::to_vec(&self.clone().canonicalized()).expect("result json")
    }
}

fn binding_of(event: &Gall017Event) -> Gall017Binding {
    let mut objects = event.objects.clone();
    objects.sort();
    Gall017Binding {
        event_id: event.id.clone(),
        activity: event.activity.clone(),
        sequence: event.sequence,
        objects,
    }
}

fn assemble(query: &Gall017Query, bindings: Vec<Gall017Binding>) -> Gall017Result {
    let violations = if query.require_match && bindings.is_empty() {
        vec![Gall017Violation {
            class: "missing_required_binding".into(),
            query_digest: query.digest(),
        }]
    } else {
        Vec::new()
    };
    let standing = if violations.is_empty() {
        "pass"
    } else {
        "violation"
    };
    Gall017Result {
        bindings,
        violations,
        standing: standing.into(),
    }
    .canonicalized()
}

/// Host-side transcription of ex4pm `Ex4pm.Gall.Ocpq.evaluate/2`
/// (ex4pm gall/v26.9.18-final-specs @ b74753fd, lib/ex4pm/gall.ex): the
/// reference the portable module is compared against.
pub fn gall017_reference_evaluate(ocel: &Gall017Ocel, query: &Gall017Query) -> Gall017Result {
    let matches = |event: &Gall017Event| {
        let activity_ok = query
            .activity
            .as_ref()
            .is_none_or(|a| event.activity.as_ref() == Some(a));
        let object_ok = query
            .object_type
            .as_ref()
            .is_none_or(|t| event.objects.iter().any(|(_, ty, _)| ty == t));
        let qualifier_ok = query
            .qualifier
            .as_ref()
            .is_none_or(|q| event.objects.iter().any(|(_, _, qu)| qu == q));
        let after_ok = query.after_activity.as_ref().is_none_or(|b| {
            ocel.events.iter().any(|prior| {
                prior.activity.as_ref() == Some(b)
                    && matches!((prior.sequence, event.sequence), (Some(p), Some(e)) if p < e)
            })
        });
        activity_ok && object_ok && qualifier_ok && after_ok
    };
    let bindings = ocel
        .events
        .iter()
        .filter(|e| matches(e))
        .map(binding_of)
        .collect();
    assemble(query, bindings)
}

/// Canonical encoding of an OCEL subject for a lowered query: strings equal
/// to a query constant get that constant's code, all others one opaque code.
pub fn encode_gall017_input(query: &Gall017Query, ocel: &Gall017Ocel) -> Vec<u8> {
    let constants = query.constants();
    let code = |s: Option<&String>| -> u32 {
        match s {
            None => 0,
            Some(s) => constants
                .binary_search(s)
                .map(|i| i as u32 + 1)
                .unwrap_or(OTHER_CODE),
        }
    };
    let mut out = Vec::new();
    out.extend_from_slice(&(ocel.events.len() as u32).to_le_bytes());
    for e in &ocel.events {
        out.extend_from_slice(&code(e.activity.as_ref()).to_le_bytes());
        out.extend_from_slice(&u32::from(e.sequence.is_some()).to_le_bytes());
        out.extend_from_slice(&e.sequence.unwrap_or(0).to_le_bytes());
        out.extend_from_slice(&(e.objects.len() as u32).to_le_bytes());
        for (_, ty, qual) in &e.objects {
            out.extend_from_slice(&code(Some(ty)).to_le_bytes());
            out.extend_from_slice(&code(Some(qual)).to_le_bytes());
        }
    }
    out
}

/// Decode a lowered-query module's stdout (`P`/`V` then one `0`/`1` per
/// event, in input order) into the canonical result.
pub fn decode_gall017_output(
    query: &Gall017Query,
    ocel: &Gall017Ocel,
    stdout: &[u8],
) -> Result<Gall017Result, PortabilityRefusal> {
    if stdout.len() != ocel.events.len() + 1 {
        return Err(PortabilityRefusal::PortableOutputMalformed(format!(
            "expected {} bytes, got {}",
            ocel.events.len() + 1,
            stdout.len()
        )));
    }
    let mut bindings = Vec::new();
    for (event, flag) in ocel.events.iter().zip(&stdout[1..]) {
        match flag {
            b'1' => bindings.push(binding_of(event)),
            b'0' => {}
            other => {
                return Err(PortabilityRefusal::PortableOutputMalformed(format!(
                    "flag byte {other:#x}"
                )))
            }
        }
    }
    let result = assemble(query, bindings);
    let module_standing = match stdout[0] {
        b'P' => "pass",
        b'V' => "violation",
        other => {
            return Err(PortabilityRefusal::PortableOutputMalformed(format!(
                "standing byte {other:#x}"
            )))
        }
    };
    if module_standing != result.standing {
        // The module's own standing disagrees with its own bindings: report
        // what the module claimed so the court can classify it.
        return Ok(Gall017Result {
            standing: module_standing.into(),
            violations: if module_standing == "pass" {
                Vec::new()
            } else {
                result.violations.clone()
            },
            bindings: result.bindings,
        });
    }
    Ok(result)
}

/// Compile a GALL-017 query to a deterministic WASM evaluator module.
pub fn lower_gall017_query(query: &Gall017Query) -> Result<PortableModule, PortabilityRefusal> {
    let constants = query.constants();
    let code_of = |s: &Option<String>| -> Option<i32> {
        s.as_ref()
            .map(|v| constants.binary_search(v).expect("constant indexed") as i32 + 1)
    };
    let a = code_of(&query.activity);
    let t = code_of(&query.object_type);
    let q = code_of(&query.qualifier);
    let b = code_of(&query.after_activity);
    let section = ModuleSubjectSection {
        schema: LOWERING_SCHEMA.into(),
        kind: KIND_GALL017_OCPQ.into(),
        source_digest: query.digest(),
        compiler_digest: compiler_digest(),
        symbols: constants.clone(),
    };
    let layout = Layout::after(0);

    // i32 locals: 0 len,1 n,2 p,3 k,4 nev,5 act,6 hasseq,7 nobj,8 j,9 found,
    // 10 ok,11 anyT,12 anyQ,13 o,14 matches,15 w,16 endp ; i64: 17 seq, 18 minseq
    let mut f = Function::new([(17, ValType::I32), (2, ValType::I64)]);
    emit_read_stdin(&mut f, &layout, 0, 1);
    {
        let mut s = f.instructions();
        s.local_get(0).i32_const(4).i32_lt_u().if_(BlockType::Empty);
        s.unreachable().end();
        s.i32_const(layout.in_base as i32)
            .i32_load(mem(2))
            .local_set(4);
        s.i32_const(layout.in_base as i32)
            .local_get(0)
            .i32_add()
            .local_set(16);
        s.i32_const(0).local_set(9);
        s.i64_const(i64::MAX).local_set(18);
        s.i32_const(0).local_set(14);
    }
    let pass = |f: &mut Function, second: bool| {
        let mut s = f.instructions();
        s.i32_const(layout.in_base as i32 + 4).local_set(2);
        s.i32_const(0).local_set(3);
        s.block(BlockType::Empty).loop_(BlockType::Empty);
        s.local_get(3).local_get(4).i32_ge_u().br_if(1);
        // header bounds
        s.local_get(16)
            .local_get(2)
            .i32_sub()
            .i32_const(20)
            .i32_lt_u()
            .if_(BlockType::Empty)
            .unreachable()
            .end();
        s.local_get(2).i32_load(mem_at(0, 0)).local_set(5);
        s.local_get(2).i32_load(mem_at(4, 0)).local_set(6);
        s.local_get(2).i64_load(mem_at(8, 0)).local_set(17);
        s.local_get(2).i32_load(mem_at(16, 0)).local_set(7);
        s.local_get(2).i32_const(20).i32_add().local_set(2);
        // object bounds: nobj > (endp - p) >> 3 traps
        s.local_get(7)
            .local_get(16)
            .local_get(2)
            .i32_sub()
            .i32_const(3)
            .i32_shr_u()
            .i32_gt_u()
            .if_(BlockType::Empty)
            .unreachable()
            .end();
        if !second {
            if let Some(b) = b {
                s.local_get(5).i32_const(b).i32_eq();
                s.local_get(6).i32_const(0).i32_ne().i32_and();
                s.if_(BlockType::Empty);
                s.local_get(17)
                    .local_get(18)
                    .local_get(17)
                    .local_get(18)
                    .i64_lt_s()
                    .select()
                    .local_set(18);
                s.i32_const(1).local_set(9);
                s.end();
            }
            s.local_get(2)
                .local_get(7)
                .i32_const(8)
                .i32_mul()
                .i32_add()
                .local_set(2);
        } else {
            s.i32_const(1).local_set(10);
            s.i32_const(0).local_set(11);
            s.i32_const(0).local_set(12);
            if let Some(a) = a {
                s.local_get(10)
                    .local_get(5)
                    .i32_const(a)
                    .i32_eq()
                    .i32_and()
                    .local_set(10);
            }
            s.i32_const(0).local_set(8);
            s.block(BlockType::Empty).loop_(BlockType::Empty);
            s.local_get(8).local_get(7).i32_ge_u().br_if(1);
            if let Some(t) = t {
                s.local_get(11)
                    .local_get(2)
                    .i32_load(mem_at(0, 0))
                    .i32_const(t)
                    .i32_eq()
                    .i32_or()
                    .local_set(11);
            }
            if let Some(q) = q {
                s.local_get(12)
                    .local_get(2)
                    .i32_load(mem_at(4, 0))
                    .i32_const(q)
                    .i32_eq()
                    .i32_or()
                    .local_set(12);
            }
            s.local_get(2).i32_const(8).i32_add().local_set(2);
            s.local_get(8).i32_const(1).i32_add().local_set(8);
            s.br(0);
            s.end().end();
            if t.is_some() {
                s.local_get(10).local_get(11).i32_and().local_set(10);
            }
            if q.is_some() {
                s.local_get(10).local_get(12).i32_and().local_set(10);
            }
            if b.is_some() {
                s.local_get(10)
                    .local_get(9)
                    .i32_and()
                    .local_get(6)
                    .i32_const(0)
                    .i32_ne()
                    .i32_and()
                    .local_get(18)
                    .local_get(17)
                    .i64_lt_s()
                    .i32_and()
                    .local_set(10);
            }
            s.i32_const(layout.out_base as i32 + 1)
                .local_get(3)
                .i32_add()
                .local_get(10)
                .i32_const(b'0' as i32)
                .i32_add()
                .i32_store8(mem(0));
            s.local_get(14).local_get(10).i32_add().local_set(14);
        }
        s.local_get(3).i32_const(1).i32_add().local_set(3);
        s.br(0);
        s.end().end();
        if second {
            // trailing garbage is malformed input
            s.local_get(2)
                .local_get(16)
                .i32_ne()
                .if_(BlockType::Empty)
                .unreachable()
                .end();
        }
    };
    if b.is_some() {
        pass(&mut f, false);
    }
    pass(&mut f, true);
    {
        let mut s = f.instructions();
        s.i32_const(layout.out_base as i32);
        if query.require_match {
            s.local_get(14).i32_eqz();
            s.if_(BlockType::Result(ValType::I32));
            s.i32_const(b'V' as i32);
            s.else_();
            s.i32_const(b'P' as i32);
            s.end();
        } else {
            s.i32_const(b'P' as i32);
        }
        s.i32_store8(mem(0));
        s.local_get(4).i32_const(1).i32_add().local_set(13);
    }
    emit_write_stdout(&mut f, &layout, 13, 15, 1);
    f.instructions().end();
    let custom = vec![(
        "gall.subject",
        serde_json::to_vec(&section).expect("section json"),
    )];
    finish_module(&layout, None, f, &custom)
}

// ---------------------------------------------------------------------------
// Shared WASI command scaffolding
// ---------------------------------------------------------------------------

struct Layout {
    iov: u32,
    nread: u32,
    in_base: u32,
    out_base: u32,
    pages: u64,
}

impl Layout {
    fn after(data_end: u32) -> Self {
        let iov = (data_end + 7) & !7;
        let nread = iov + 8;
        let in_base = (nread + 4 + 15) & !15;
        let out_base = in_base + IN_CAP;
        let end = out_base + OUT_CAP;
        Self {
            iov,
            nread,
            in_base,
            out_base,
            pages: end.div_ceil(PAGE) as u64,
        }
    }
}

fn mem(align: u32) -> MemArg {
    mem_at(0, align)
}

fn mem_at(offset: u64, align: u32) -> MemArg {
    MemArg {
        offset,
        align,
        memory_index: 0,
    }
}

/// Read all of stdin into `[in_base, in_base+len)`; trap on errno, and on
/// input that fills the whole buffer (never silently truncate).
fn emit_read_stdin(f: &mut Function, l: &Layout, len: u32, n: u32) {
    let mut s = f.instructions();
    s.i32_const(0).local_set(len);
    s.block(BlockType::Empty).loop_(BlockType::Empty);
    s.local_get(len)
        .i32_const(IN_CAP as i32)
        .i32_ge_u()
        .br_if(1);
    s.i32_const(l.iov as i32)
        .i32_const(l.in_base as i32)
        .local_get(len)
        .i32_add()
        .i32_store(mem(2));
    s.i32_const(l.iov as i32)
        .i32_const(IN_CAP as i32)
        .local_get(len)
        .i32_sub()
        .i32_store(mem_at(4, 2));
    s.i32_const(0)
        .i32_const(l.iov as i32)
        .i32_const(1)
        .i32_const(l.nread as i32)
        .call(0);
    s.if_(BlockType::Empty).unreachable().end();
    s.i32_const(l.nread as i32)
        .i32_load(mem(2))
        .local_tee(n)
        .i32_eqz()
        .br_if(1);
    s.local_get(len).local_get(n).i32_add().local_set(len);
    s.br(0);
    s.end().end();
    s.local_get(len)
        .i32_const(IN_CAP as i32)
        .i32_ge_u()
        .if_(BlockType::Empty)
        .unreachable()
        .end();
}

/// Write `[out_base, out_base+o)` to stdout, looping on partial writes.
fn emit_write_stdout(f: &mut Function, l: &Layout, o: u32, w: u32, n: u32) {
    let mut s = f.instructions();
    s.i32_const(0).local_set(w);
    s.block(BlockType::Empty).loop_(BlockType::Empty);
    s.local_get(w).local_get(o).i32_ge_u().br_if(1);
    s.i32_const(l.iov as i32)
        .i32_const(l.out_base as i32)
        .local_get(w)
        .i32_add()
        .i32_store(mem(2));
    s.i32_const(l.iov as i32)
        .local_get(o)
        .local_get(w)
        .i32_sub()
        .i32_store(mem_at(4, 2));
    s.i32_const(1)
        .i32_const(l.iov as i32)
        .i32_const(1)
        .i32_const(l.nread as i32)
        .call(1);
    s.if_(BlockType::Empty).unreachable().end();
    s.i32_const(l.nread as i32)
        .i32_load(mem(2))
        .local_tee(n)
        .i32_eqz()
        .if_(BlockType::Empty)
        .unreachable()
        .end();
    s.local_get(w).local_get(n).i32_add().local_set(w);
    s.br(0);
    s.end().end();
}

fn finish_module(
    layout: &Layout,
    data: Option<&[u8]>,
    start: Function,
    custom: &[(&str, Vec<u8>)],
) -> Result<PortableModule, PortabilityRefusal> {
    let mut types = TypeSection::new();
    types.ty().function(
        [ValType::I32, ValType::I32, ValType::I32, ValType::I32],
        [ValType::I32],
    );
    types.ty().function([], []);
    let mut imports = ImportSection::new();
    imports.import("wasi_snapshot_preview1", "fd_read", EntityType::Function(0));
    imports.import(
        "wasi_snapshot_preview1",
        "fd_write",
        EntityType::Function(0),
    );
    let mut functions = FunctionSection::new();
    functions.function(1);
    let mut memories = MemorySection::new();
    memories.memory(MemoryType {
        minimum: layout.pages,
        maximum: Some(layout.pages),
        memory64: false,
        shared: false,
        page_size_log2: None,
    });
    let mut exports = ExportSection::new();
    exports.export("memory", ExportKind::Memory, 0);
    exports.export("_start", ExportKind::Func, 2);
    let mut code = CodeSection::new();
    code.function(&start);

    let mut module = Module::new();
    module
        .section(&types)
        .section(&imports)
        .section(&functions)
        .section(&memories)
        .section(&exports)
        .section(&code);
    if let Some(bytes) = data {
        let mut ds = DataSection::new();
        ds.active(0, &ConstExpr::i32_const(0), bytes.iter().copied());
        module.section(&ds);
    }
    for (name, payload) in custom {
        module.section(&CustomSection {
            name: (*name).into(),
            data: payload.as_slice().into(),
        });
    }
    let portable = PortableModule::from_bytes(module.finish());
    wasmparser::Validator::new()
        .validate_all(portable.bytes())
        .map_err(|e| PortabilityRefusal::InvalidModule(format!("compiler emitted: {e}")))?;
    Ok(portable)
}
