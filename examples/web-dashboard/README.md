# wasm4pm — Browser Dashboard (Client-Side Receipted Process Intelligence)

A runnable Vite dashboard that proves wasm4pm's cognition kernel performs
**provable process intelligence entirely in the browser tab** — no data leaves
the page, and every displayed number carries the BLAKE3 receipt that proves it.

What it does:

1. **Loads the cognition WASM in-browser** — the `--target web` build
   (`crates/wasm4pm-cognition/pkg-web`) via its function-typed `init()` default
   export, fetching the `_bg.wasm` asset. No Node, no server-side compute.
2. **Renders the breed catalog** (55 cognitive breeds) from the TypeScript breed
   pack (`packages/cognition/src/breed-ids.ts`) as selectable cards.
3. **Runs a breed on click and displays the receipt**: `status`, `run_id`,
   `output_hash`, `replay_pointer`.
4. **Makes every KPI traceable** — each value (e.g. MYCIN streptococcus
   `CF=0.700`, Bayesian `P(Burglary|Alarm)=0.3735…`) is shown next to the
   `output_hash` and `run_id` that produced it.

Two paper fixtures ship bundled: `mycin` (Shortliffe & Buchanan 1975) and
`bayesian_network` (Pearl's burglary/alarm network).

## Prerequisites

The browser WASM build must exist. If `crates/wasm4pm-cognition/pkg-web/` is
missing, build it first:

```bash
cd ../../crates/wasm4pm-cognition
wasm-pack build --target web --out-dir pkg-web -- --features wasm
```

## Run the dashboard

```bash
npm install
npm run dev          # open the printed http://localhost:5173 URL
```

Then click a breed card (cards with a bundled fixture are enabled) and press
**Run breed**. The receipt panel renders with the hashes.

Production build / preview:

```bash
npm run build        # emits dist/ with the WASM as a hashed asset
npm run preview      # serves dist/ on http://localhost:4173
```

## Headless-browser proof

The strongest evidence that the WASM truly runs in a browser is the Playwright
test: it builds the app, serves it, opens it in headless Chromium, waits for
WASM init, clicks Run, and asserts a 64-hex `output_hash` and `status==="ok"`
appear in the DOM.

```bash
npx playwright install chromium   # one-time
npm run test:e2e
```

Observed result (real headless Chromium):

```
BROWSER PROOF output_hash = e91b7e60322ff4fcea522638d466416e1f5fd7b92e340033cddbfedeca718723
  ✓ loads cognition WASM in-browser, runs MYCIN, shows a receipt
  ✓ running bayesian_network shows P(Burglary|Alarm) = 0.3735…
  2 passed
```

The product is CodeManufactory; RevOps is merely proof that CodeManufactory
works. Here the cognition kernel is the product, and the receipt is the proof.

## Notes

- `node_modules/`, `dist/`, and the upstream `pkg-web/` are gitignored.
- `cognition_run` (web target) returns a JSON **string** (`to_js_str`); the app
  parses it. Output fields follow the `ContractResult` contract:
  `status / breed / run_id / output_hash / replay_pointer`.
