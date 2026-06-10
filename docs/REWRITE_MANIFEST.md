# Documentation Rewrite — 2026-06-09

## Motivation
5 confirmed discrepancies between docs and validated behavior (v26.6.9 release evidence).

## Discrepancies Fixed
D1: npm install -g — package not yet on npmjs.org; replaced with monorepo instructions
D2: Programmatic API .output field — actual return is { handle, metadata }
D3: Breed count — 13 breeds (9 Old AI + 4 Autoinstinct), not 9
D4: Deployment profile sizes — actual ~5–8 MB, not 500KB–3.4MB
D5: Default algorithm — simd_streaming_dfg, not heuristic_miner

## Files Rewritten
- README.md
- docs/reference/algorithms.md
- docs/reference/deployment_profiles.md
- docs/tutorials/cognition_contracts.md
- docs/tutorials/getting_started.md
- docs/explanation/old_ai_vs_llms.md

## Validation
playground/scenarios/33-readme-capabilities.ts: 50/50 passing
RELEASE_CERTIFICATE.v26.6.9.json: all 60 algorithms admitted
