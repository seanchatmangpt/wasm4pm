<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/SUPPORT.md; source-sha256: d751abc30a35e0fa506d83ab0c694126c3e74109f60cb36d256865ab0b3ec443; reason: tooling or agent control surface -->

# Support

## Node.js Versions

| Node Version | Support |
|-------------|---------|
| 22.x (LTS) | Full support |
| 20.x (LTS) | Full support |
| 18.x | Best effort |
| < 18 | Not supported |

## Getting Help

- **GitHub Issues**: Bug reports and feature requests
- **SECURITY.md**: For vulnerability reports
- **Commercial support**: xpointsh@gmail.com

## API Stability

| Layer | Stability |
|-------|-----------|
| WASM exports (discover_*, load_*) | Stable |
| @wasm4pm/* TypeScript packages | Stable |
| wpm CLI commands | Stable |
| Internal Rust crates | Unstable |

## Deprecation Policy

Deprecated features are marked with @deprecated tags and removed after 1 release minimum notice.
