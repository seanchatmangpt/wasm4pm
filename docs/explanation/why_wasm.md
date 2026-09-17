<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/explanation/why_wasm.md; source-sha256: 6be55d5dc28bef012d1fd2f49cc5c19a7afb4d0b4a8f87366afc7da2cace5348; reason: tooling or agent control surface -->

# Explanation: Why WASM for Process Mining?

Process mining algorithms—especially alignment and state-space exploration—are notoriously CPU and memory intensive. Traditional platforms use Java or Python, resulting in slow execution, high memory overhead, and complex deployment requirements.

## The WebAssembly Advantage

### 1. Near-Native Speed in the Browser
By compiling Rust to WASM, we achieve execution speeds within 10-20% of native C code directly inside the browser. This eliminates the need for expensive backend compute clusters for standard mining tasks.

### 2. Memory Safety without Garbage Collection
Rust's ownership model guarantees memory safety without the unpredictable pauses of a Garbage Collector. This allows us to offer nanosecond-level latency guarantees.

### 3. Portability (The Compute Continuum)
The exact same `.wasm` binary runs in Chrome, Node.js, Cloudflare Workers, and Raspberry Pis. This write-once, run-everywhere architecture means your mining algorithms execute identically regardless of the hardware.
