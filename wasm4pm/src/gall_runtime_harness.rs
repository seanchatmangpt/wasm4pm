//! GALL-021 multi-runtime qualification harness (native hosts only).
//!
//! Executes an exact WASM module on independent engines installed on the
//! host and records [`RuntimeWitness`] observations:
//!
//! | engine            | host binary | override env   |
//! |-------------------|-------------|----------------|
//! | Cranelift         | `wasmtime`  | `GALL_WASMTIME`|
//! | V8                | `node`      | `GALL_NODE`    |
//! | JavaScriptCore    | `bun`       | `GALL_BUN`     |
//!
//! The JS engines run the module through a restricted host shim that provides
//! only `wasi_snapshot_preview1.fd_read` (stdin) and `fd_write` (stdout);
//! any other import fails instantiation. Before any engine runs, the module's
//! derived host fence is checked against the subject's explicit bindings, so
//! an unbound clock/random/fs/network import is refused, not executed.
//!
//! A missing engine is `RuntimeUnavailable` (UNSUPPORTED on this host), never
//! a silent substitute.

use crate::gall_process_portability::{sha256, PortabilityRefusal, RuntimeEngine, RuntimeWitness};
use crate::gall_wasm_lowering::{
    canonical_powl_output, decode_gall017_output, inspect_module, Gall017Ocel, Gall017Query,
    LanguageProbe, PortableModule,
};
use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Per-execution wall-clock ceiling.
pub const EXECUTION_TIMEOUT: Duration = Duration::from_secs(120);

const SHIM: &str = r#"import { readFileSync } from 'node:fs';
const bytes = readFileSync(process.argv[2]);
const input = readFileSync(0);
let inOff = 0;
const out = [];
let memory;
const view = () => new DataView(memory.buffer);
const wasi = {
  fd_read(fd, iovs, iovsLen, nreadPtr) {
    if (fd !== 0) return 8;
    const dv = view();
    let n = 0;
    for (let i = 0; i < iovsLen; i++) {
      const p = dv.getUint32(iovs + 8 * i, true);
      const l = dv.getUint32(iovs + 8 * i + 4, true);
      const take = Math.min(l, input.length - inOff);
      new Uint8Array(memory.buffer, p, take).set(input.subarray(inOff, inOff + take));
      inOff += take;
      n += take;
      if (take < l) break;
    }
    dv.setUint32(nreadPtr, n, true);
    return 0;
  },
  fd_write(fd, iovs, iovsLen, nwrittenPtr) {
    if (fd !== 1) return 8;
    const dv = view();
    let n = 0;
    for (let i = 0; i < iovsLen; i++) {
      const p = dv.getUint32(iovs + 8 * i, true);
      const l = dv.getUint32(iovs + 8 * i + 4, true);
      out.push(Buffer.from(new Uint8Array(memory.buffer, p, l)));
      n += l;
    }
    dv.setUint32(nwrittenPtr, n, true);
    return 0;
  },
};
const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi });
memory = instance.exports.memory;
instance.exports._start();
process.stdout.write(Buffer.concat(out));
"#;

/// An installed engine host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeHost {
    pub engine: RuntimeEngine,
    pub program: PathBuf,
    pub version: String,
}

fn program_name(engine: RuntimeEngine) -> (&'static str, &'static str) {
    match engine {
        RuntimeEngine::Cranelift => ("wasmtime", "GALL_WASMTIME"),
        RuntimeEngine::V8 => ("node", "GALL_NODE"),
        RuntimeEngine::JavaScriptCore => ("bun", "GALL_BUN"),
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|p| p.is_file())
}

/// Locate one engine host and read its version from the binary itself.
pub fn locate(engine: RuntimeEngine) -> Result<RuntimeHost, PortabilityRefusal> {
    let (name, env) = program_name(engine);
    let program = std::env::var_os(env)
        .map(PathBuf::from)
        .or_else(|| find_on_path(name))
        .ok_or_else(|| PortabilityRefusal::RuntimeUnavailable(name.into()))?;
    let output = Command::new(&program)
        .arg("--version")
        .output()
        .map_err(|e| PortabilityRefusal::RuntimeUnavailable(format!("{name}: {e}")))?;
    if !output.status.success() {
        return Err(PortabilityRefusal::RuntimeUnavailable(format!(
            "{name} --version exited {}",
            output.status
        )));
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(RuntimeHost {
        engine,
        program,
        version: format!("{name} {version}"),
    })
}

/// All engine hosts available here, in engine order.
pub fn discover_runtimes() -> Vec<RuntimeHost> {
    RuntimeEngine::ALL
        .iter()
        .filter_map(|&e| locate(e).ok())
        .collect()
}

/// Raw result of one execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawExecution {
    pub stdout: Vec<u8>,
    pub wall_nanos: u128,
}

struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Distinguishes concurrent executions of the same bytes within one process
/// (each execution owns and deletes its own files).
static NEXT_TEMP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn temp_file(stem: &str, ext: &str, bytes: &[u8]) -> Result<TempFile, PortabilityRefusal> {
    let unique = sha256(bytes);
    let serial = NEXT_TEMP.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "gall-{stem}-{}-{serial}-{}.{ext}",
        std::process::id(),
        &unique[7..23]
    ));
    std::fs::write(&path, bytes)
        .map_err(|e| PortabilityRefusal::RuntimeFailure(format!("temp file: {e}")))?;
    Ok(TempFile(path))
}

fn command_for(host: &RuntimeHost, module: &Path, shim: Option<&Path>) -> Command {
    let mut cmd = Command::new(&host.program);
    match host.engine {
        RuntimeEngine::Cranelift => {
            cmd.arg("run").arg(module);
        }
        RuntimeEngine::V8 | RuntimeEngine::JavaScriptCore => {
            cmd.arg(shim.expect("shim for JS engines")).arg(module);
        }
    }
    cmd
}

/// Execute `module` on `host` with `input` on stdin. The module's derived
/// host fence must be covered by `explicitly_bound` before it may run.
pub fn execute(
    host: &RuntimeHost,
    module: &PortableModule,
    input: &[u8],
    explicitly_bound: &BTreeSet<String>,
) -> Result<RawExecution, PortabilityRefusal> {
    inspect_module(module)?
        .host_fence
        .validate(explicitly_bound)?;
    let wasm = temp_file("module", "wasm", module.bytes())?;
    let shim = match host.engine {
        RuntimeEngine::Cranelift => None,
        _ => Some(temp_file("shim", "mjs", SHIM.as_bytes())?),
    };
    let started = Instant::now();
    let mut child = command_for(host, &wasm.0, shim.as_ref().map(|s| s.0.as_path()))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| PortabilityRefusal::RuntimeFailure(format!("{}: {e}", host.version)))?;

    let mut stdin = child.stdin.take().expect("piped stdin");
    let payload = input.to_vec();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(&payload);
    });
    let mut stdout = child.stdout.take().expect("piped stdout");
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let mut stderr = child.stderr.take().expect("piped stderr");
    let err_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        buf
    });

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() > EXECUTION_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(PortabilityRefusal::RuntimeFailure(format!(
                    "{}: timeout after {EXECUTION_TIMEOUT:?}",
                    host.version
                )));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(2)),
            Err(e) => return Err(PortabilityRefusal::RuntimeFailure(e.to_string())),
        }
    };
    let wall_nanos = started.elapsed().as_nanos();
    let _ = writer.join();
    let stdout = reader.join().unwrap_or_default();
    let stderr = err_reader.join().unwrap_or_default();
    if !status.success() {
        let tail = String::from_utf8_lossy(&stderr);
        let tail: String = tail
            .chars()
            .rev()
            .take(400)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        return Err(PortabilityRefusal::RuntimeFailure(format!(
            "{} exited {status}: {tail}",
            host.version
        )));
    }
    Ok(RawExecution { stdout, wall_nanos })
}

/// Execute a POWL acceptor over a language probe and witness its verdicts.
pub fn witness_powl_probe(
    host: &RuntimeHost,
    module: &PortableModule,
    probe: &LanguageProbe,
) -> Result<RuntimeWitness, PortabilityRefusal> {
    let raw = execute(host, module, probe.input(), &BTreeSet::new())?;
    let canonical = canonical_powl_output(probe, &raw.stdout)?;
    Ok(RuntimeWitness::observed(
        host.engine,
        host.version.clone(),
        module.digest().into(),
        sha256(probe.input()),
        canonical,
        raw.wall_nanos,
    ))
}

/// Execute a lowered GALL-017 query over an encoded OCEL and witness the
/// canonical result (bindings sorted, independent of event input order).
pub fn witness_gall017(
    host: &RuntimeHost,
    module: &PortableModule,
    query: &Gall017Query,
    ocel: &Gall017Ocel,
    input: &[u8],
) -> Result<RuntimeWitness, PortabilityRefusal> {
    let raw = execute(host, module, input, &BTreeSet::new())?;
    let result = decode_gall017_output(query, ocel, &raw.stdout)?;
    Ok(RuntimeWitness::observed(
        host.engine,
        host.version.clone(),
        module.digest().into(),
        sha256(input),
        result.canonical_bytes(),
        raw.wall_nanos,
    ))
}

/// Execute a module on every host and return raw witnesses whose canonical
/// result is the raw stdout (for process kinds without a decoder).
pub fn witness_raw(
    hosts: &[RuntimeHost],
    module: &PortableModule,
    input: &[u8],
    explicitly_bound: &BTreeSet<String>,
) -> Result<Vec<RuntimeWitness>, PortabilityRefusal> {
    hosts
        .iter()
        .map(|host| {
            let raw = execute(host, module, input, explicitly_bound)?;
            Ok(RuntimeWitness::observed(
                host.engine,
                host.version.clone(),
                module.digest().into(),
                sha256(input),
                raw.stdout,
                raw.wall_nanos,
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    //! Executed mutation falsifiers: forged modules built from real compiler
    //! parts, run on the installed engines, must be refused by the court.
    use super::*;
    use crate::gall_process_portability::verify_powl_preservation;
    use crate::gall_wasm_lowering::{emit_powl_module, lower_powl, powl_dfa, PowlSubject};

    fn hosts() -> Option<Vec<RuntimeHost>> {
        let hosts = discover_runtimes();
        if hosts.len() < 2 {
            eprintln!("SKIP executed mutation falsifiers: fewer than 2 WASM engines installed");
            return None;
        }
        Some(hosts)
    }

    fn run(
        hosts: &[RuntimeHost],
        module: &PortableModule,
        probe: &LanguageProbe,
    ) -> Vec<RuntimeWitness> {
        hosts
            .iter()
            .map(|h| witness_powl_probe(h, module, probe).expect("execute"))
            .collect()
    }

    #[test]
    fn executed_partial_order_flattening_mutant_fails_preservation() {
        let Some(hosts) = hosts() else { return };
        let source = PowlSubject::from_gall016_json(
            br#"{"type":"partial_order","children":["a","b","c"],"order":[["a","c"]]}"#,
        )
        .unwrap();
        let flat =
            PowlSubject::from_gall016_json(br#"{"type":"sequence","children":["a","b","c"]}"#)
                .unwrap();
        let probe = LanguageProbe::for_subject(&source);
        let honest = lower_powl(&source).unwrap();
        assert!(
            verify_powl_preservation(&source, &honest, &probe, &run(&hosts, &honest, &probe))
                .is_ok()
        );

        let section = inspect_module(&honest).unwrap().subject;
        let mutant =
            emit_powl_module(&section, source.skeleton(), &powl_dfa(&flat).unwrap()).unwrap();
        let witnesses = run(&hosts, &mutant, &probe);
        // Engines agree with each other on the mutant: cross-engine equality
        // alone would admit it; the reference-language probe does not.
        assert!(witnesses
            .windows(2)
            .all(|w| w[0].canonical_result() == w[1].canonical_result()));
        assert_eq!(
            verify_powl_preservation(&source, &mutant, &probe, &witnesses),
            Err(PortabilityRefusal::SemanticProbeDivergence)
        );
    }

    #[test]
    fn executed_hierarchy_flattening_mutant_fails_preservation() {
        let Some(hosts) = hosts() else { return };
        // x -> h where h = (a || b): flattening the boundary to (x || a || b)
        // with x before a only admits "a x b"-style traces h forbids.
        let source = PowlSubject::from_gall016_json(
            br#"{"type":"partial_order","children":["x",{"type":"hierarchy","id":"h","child":{"type":"partial_order","children":["a","b"],"order":[]}}],"order":[["x","h"]]}"#,
        )
        .unwrap();
        let flat = PowlSubject::from_gall016_json(
            br#"{"type":"partial_order","children":["x","a","b"],"order":[["x","a"]]}"#,
        )
        .unwrap();
        let probe = LanguageProbe::for_subject(&source);
        let section = inspect_module(&lower_powl(&source).unwrap())
            .unwrap()
            .subject;
        let honest_skeleton_mutant =
            emit_powl_module(&section, source.skeleton(), &powl_dfa(&flat).unwrap()).unwrap();
        assert_eq!(
            verify_powl_preservation(
                &source,
                &honest_skeleton_mutant,
                &probe,
                &run(&hosts, &honest_skeleton_mutant, &probe)
            ),
            Err(PortabilityRefusal::SemanticProbeDivergence)
        );
        let flat_skeleton_mutant =
            emit_powl_module(&section, flat.skeleton(), &powl_dfa(&flat).unwrap()).unwrap();
        assert_eq!(
            verify_powl_preservation(
                &source,
                &flat_skeleton_mutant,
                &probe,
                &run(&hosts, &flat_skeleton_mutant, &probe)
            ),
            Err(PortabilityRefusal::PowlPreservationMismatch)
        );
    }

    #[test]
    fn missing_engine_binary_is_typed_runtime_failure() {
        let host = RuntimeHost {
            engine: RuntimeEngine::V8,
            program: PathBuf::from("/nonexistent/gall-no-such-engine"),
            version: "none".into(),
        };
        let subject = PowlSubject::from_gall016_json(br#"{"type":"task","id":"a"}"#).unwrap();
        let module = lower_powl(&subject).unwrap();
        assert!(matches!(
            execute(&host, &module, b"", &BTreeSet::new()),
            Err(PortabilityRefusal::RuntimeFailure(_))
        ));
    }
}
