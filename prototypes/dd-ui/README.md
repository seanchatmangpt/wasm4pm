# wasm4pm Deterministic Dynamic UI

This directory is the executable DDUI prototype/specification.

Start from `index.html` for the browser surface. The canonical runtime laws are in `grammar.mjs` and `dd-ui.mjs`; `render.mjs` is a deterministic HTML projection, `demo-data.mjs` is the bounded process-world fixture, `dd-ui.test.mjs` is the falsifier suite, and `uiux.mmd` is the Mermaid-first human topology projection.

The contract is `UI_t = P(G_t, α, κ, ρ, Γ)`. Runtime AI has no render authority. Rendering has no actuation authority. Presentation selection is reversible; business actions remain unselected intents. DO remains behind BRCE.

Run:

```bash
node --check prototypes/dd-ui/grammar.mjs
node --check prototypes/dd-ui/dd-ui.mjs
node --check prototypes/dd-ui/render.mjs
node --check prototypes/dd-ui/demo-data.mjs
node --check prototypes/dd-ui/app.mjs
node --test prototypes/dd-ui/dd-ui.test.mjs
```

See `docs/deterministic-dynamic-ui.md` for the full DfCM doctrine and `ontology/dd-ui.ttl` for the public semantic model.
