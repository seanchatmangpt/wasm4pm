# Original User Request

## 2026-06-08T04:08:45Z

Implement all 13 Quality-of-Life (QoL) and Developer Experience (DX) gaps identified in the audit report `wasm4pm-qol-audit-2026-05-18.json` inside the `wasm4pm` repository.

Working directory: `/Users/sac/wasm4pm`
Integrity mode: benchmark

## Requirements

### R1. Implement QoL Gaps QoL-001 through QoL-013
Ensure that the CLI outputs, error messages, and parameters are enhanced to resolve all 13 audited issues:
- **QoL-001 (Algorithm rationale)**: Add per-tier rationale in `wpm algorithms` output, and a `--recommend-for <size|time>` flag.
- **QoL-002 (Fitness thresholds)**: Provide clear explanations of default (0.80) vs. academic (0.85) thresholds in conformance outputs, plus a `--explain-fitness` option.
- **QoL-003 (Next step hints)**: Automatically emit contextual next steps (e.g. suggesting conformance commands) after successful runs, add a `--guide-next-steps` flag, and implement the `wpm workflow` command.
- **QoL-004 (CLI aliases & error clarity)**: Show exact naming suggestion (e.g. underscores vs. dashes) and CLI aliases in case of unknown algorithms.
- **QoL-005 (Confidence Intervals explanation)**: Output diagnostic interpretation lines for statistical confidence intervals and add `--explain-ci`.
- **QoL-006 (Parameters CLI help)**: Integrate parameter ranges and defaults help into the `wpm run` command and validate parameters.
- **QoL-007 (Output format differences)**: Add help text comparing `json` and `human` formats, and implement `csv` export.
- **QoL-008 (Van der Aalst quality tradeoffs)**: Highlight relative metric importance and tradeoffs, plus add `--explain-quality-dims`.
- **QoL-009 (Conformance deviations diagnostics)**: Provide remediation/diagnosis hints when deviations are detected, plus add `--diagnose-deviations`.
- **QoL-010 (Algorithm time budgets)**: Check timeout configurations against estimated time requirements based on log size and warn users.
- **QoL-011 (Algorithm recommendation wizard)**: Implement `wpm select-algorithm` interactive command and `--auto-select` flag.
- **QoL-012 (Exit code 4 explanation)**: Cleanly output failure summaries and success status when exit code 4 (partial success) occurs in batch comparisons.
- **QoL-013 (Color/emoji flags)**: Expose `--no-color` and `--no-emoji` flags, and automatically disable color/emoji when running in CI environments.

### R2. Core CLI & App Command Integration
Ensure all improvements are fully wired into the target CLI commands (`wpm run`, `wpm algorithms`, `wpm conformance`, `wpm quality`, `wpm compare`, `wpm predict`, `wpm ml`, `wpm doctor`).

### R3. Test Coverage & CI Checks
Add robust test cases for all QoL improvements to verify outputs, parameters validation, and new CLI flags. Ensure all workspace checks and tests pass.

## Acceptance Criteria

### In-CLI Quality and Behavior
- [ ] Every implemented QoL command option (`--recommend-for`, `--explain-fitness`, `--guide-next-steps`, `--explain-ci`, `--explain-quality-dims`, `--diagnose-deviations`, `wpm select-algorithm`, `wpm workflow`, `--no-color`, `--no-emoji`) outputs clear, helpful, and correct guidance text.
- [ ] The CLI validates algorithm parameters before calling WASM libraries, preventing cryptic errors.
- [ ] No hardcoded bypasses, placeholders, or unimplemented stubs are present.

### Verification and CI Compliance
- [ ] Running `npm run build:cli` compiles the CLI app successfully with zero errors.
- [ ] Running `npm test` (or the workspace test suite) executes and passes all new and existing tests cleanly.
- [ ] Running `npm run lint` and `npm run check` results in zero style or syntax warnings.
