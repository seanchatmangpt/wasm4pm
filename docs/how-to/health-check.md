# How-To: Diagnose pmctl Environment Issues

**Time required**: 2 minutes
**Difficulty**: Beginner

## Problem

pmctl commands are failing and you do not know why. Maybe the WASM binary is missing, Node.js is too old, or your config file cannot be found. `pmctl doctor` runs six health checks in parallel and tells you exactly what is wrong and how to fix it.

---

## 1. Run the health check

```bash
pmctl doctor
```

This runs all six checks and prints a badge for each:

```
pmctl doctor — system health check
──────────────────────────────────────────────────────────
[  ok  ]  Node.js version
         v20.11.0 (>= 18 required)

[  ok  ]  WASM binary
         wasm4pm_bg.wasm found (2.3 MB)

[  ok  ]  WASM loads
         Loaded OK — module version 0.1.0

[  ok  ]  Config file
         Found wasm4pm.toml

[  ok  ]  XES event logs
         3 file(s): orders.xes, incidents.xes, claims.xes

[  ok  ]  System memory
         8192 MB free of 16384 MB total (50% free)

──────────────────────────────────────────────────────────
Result: 6 ok  0 warn  0 fail

All required checks passed. pmctl is ready to use.
```

Exit code `0` means everything is fine. Exit code `1` means at least one required check failed.

---

## 2. Get machine-readable output for CI

```bash
pmctl doctor --format json
```

What you should see:

```json
{
  "status": "success",
  "message": "pmctl environment is healthy",
  "data": {
    "checks": [
      { "name": "Node.js version", "status": "ok", "message": "v20.11.0 (>= 18 required)" },
      { "name": "WASM binary", "status": "ok", "message": "wasm4pm_bg.wasm found (2.3 MB)" },
      { "name": "WASM loads", "status": "ok", "message": "Loaded OK — module version 0.1.0" },
      { "name": "Config file", "status": "ok", "message": "Found wasm4pm.toml" },
      { "name": "XES event logs", "status": "ok", "message": "3 file(s): orders.xes, incidents.xes, claims.xes" },
      { "name": "System memory", "status": "ok", "message": "8192 MB free of 16384 MB total (50% free)" }
    ],
    "ok": 6,
    "warn": 0,
    "fail": 0,
    "healthy": true
  }
}
```

Use this in CI pipelines to gate on environment readiness:

```bash
pmctl doctor --format json | jq -e '.data.healthy == true'
```

---

## 3. Understand the six checks

| # | Check | Status when bad | Blocking? |
|---|-------|----------------|-----------|
| 1 | **Node.js version** | `[ FAIL ]` if major < 18 | Yes |
| 2 | **WASM binary** | `[ FAIL ]` if `wasm4pm_bg.wasm` missing or empty | Yes |
| 3 | **WASM loads** | `[ FAIL ]` if module fails to import or `get_version()` errors | Yes |
| 4 | **Config file** | `[ warn ]` if no `wasm4pm.toml`/`.json` found in cwd or up to 3 parent dirs | No |
| 5 | **XES event logs** | `[ warn ]` if no `.xes` files found within depth 2 of cwd | No |
| 6 | **System memory** | `[ warn ]` if free memory < 128 MB | No |

Only `[ FAIL ]` items produce exit code 1. `[ warn ]` items are advisory -- pmctl works without a config file or XES logs in the current tree (you can pass paths explicitly).

---

## 4. Read the output badges

| Badge | Meaning |
|-------|---------|
| `[  ok  ]` | Check passed. No action needed. |
| `[ warn ]` | Advisory. pmctl will work, but you may want to fix this for a better experience. |
| `[ FAIL ]` | Required. pmctl will not work until this is resolved. |

Each failed or warned check includes a `Fix:` line with the exact command to resolve it.

---

## 5. Fix common failure scenarios

### WASM binary not found

```
[ FAIL ]  WASM binary
         WASM binary not built — .../wasm4pm/pkg/wasm4pm_bg.wasm not found
         Fix: Build the WASM module: cd wasm4pm && npm run build
```

Run the fix command:

```bash
cd wasm4pm && npm run build
```

Then re-run `pmctl doctor` to confirm.

### Node.js too old

```
[ FAIL ]  Node.js version
         v16.20.0 is too old — Node.js >= 18 is required
         Fix: Install Node.js 18+ from https://nodejs.org or use a version manager: nvm install 20
```

Upgrade Node.js using your preferred method:

```bash
# Using nvm
nvm install 20
nvm use 20
```

### No config file found

```
[ warn ]  Config file
         No wasm4pm.toml / wasm4pm.json found in current directory or parents
         Fix: Create a config with: pmctl init    (defaults work fine without one)
```

This is a warning, not a failure. You can either create a config file or ignore it (defaults work):

```bash
pmctl init
```

### Low system memory

```
[ warn ]  System memory
         Low free memory: 96 MB free of 8192 MB total (1%)
         Fix: Close other applications; process mining on large logs requires >= 256 MB free
```

Close memory-intensive applications before running discovery on large event logs.

---

## See Also

- [How-To: Error Recovery](./error-recovery.md) -- troubleshooting specific pmctl command failures
- [How-To: Debug Configuration Errors](./debug-config.md) -- diagnosing config validation issues
- [Reference: Error Codes](../reference/error-codes.md) -- full list of pmctl exit codes
