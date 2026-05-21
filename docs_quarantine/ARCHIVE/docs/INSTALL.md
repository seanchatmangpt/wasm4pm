# Installation Guide

Complete installation instructions for wasm4pm on all supported platforms.

## Prerequisites

### Node.js & pnpm (Required)

- **Node.js 18+** — Download from [nodejs.org](https://nodejs.org/)
- **pnpm 8+** — Install globally: `npm install -g pnpm`

Verify:
```bash
node --version    # v18.0.0 or higher
pnpm --version    # 8.0.0 or higher
```

### Rust (Only for Contributing to WASM Kernel)

If you plan to modify the WASM algorithms or cognition layer:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup update stable
```

Verify:
```bash
rustc --version   # rustc 1.70.0 or higher
cargo --version
```

**Not needed if:** You're only using the published `@wasm4pm/cli` package.

## Installation Methods

### Method 1: npm Global Install (Recommended)

```bash
npm install -g @wasm4pm/cli
wpm --version
```

This installs the latest published version of the `@wasm4pm/cli` package globally.

**Uninstall:**
```bash
npm uninstall -g @wasm4pm/cli
```

### Method 2: Local Dev Install (for Contributors)

```bash
git clone https://github.com/sac/wasm4pm.git
cd wasm4pm

# Install TypeScript packages
pnpm install

# Build the WASM core
cd wasm4pm && npm run build

# Build the CLI app
cd ../apps/wasm4pm && npm run build

# Link the CLI for local testing
cd ../.. && npm link apps/wasm4pm

# Verify
wpm --version
```

### Method 3: Docker

```bash
docker pull wasm4pm/cli:latest
docker run --rm -v $(pwd):/data wasm4pm/cli:latest \
  wpm run /data/sample.xes
```

See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for detailed Docker setup.

## Post-Installation Verification

### 1. Check installation

```bash
which wpm
wpm --version
```

Expected output:
```
/usr/local/bin/wpm
v26.4.X
```

### 2. Run a quick test

```bash
# Download a sample log
wget https://raw.githubusercontent.com/sac/wasm4pm/main/bench_data/sepsis.xes

# Run discovery
wpm run sepsis.xes --format human

# Expected: JSON output with process model + receipt hash
```

### 3. Verify WASM is working

```bash
wpm status
```

Expected: `Status: OK`, WASM runtime info, version details.

## Platform-Specific Notes

### macOS

```bash
# Install via Homebrew (if available)
brew tap sac/wasm4pm
brew install wasm4pm

# Or use npm
npm install -g @wasm4pm/cli
```

**Apple Silicon (M1/M2/M3):**
- Fully supported (native ARM64 builds)
- No special setup needed

### Linux (Ubuntu/Debian)

```bash
# Install Node.js via apt
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install wasm4pm
npm install -g @wasm4pm/cli
```

### Windows (WSL2)

```bash
# Inside WSL2 terminal (Ubuntu 20.04 or later)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

npm install -g pnpm
npm install -g @wasm4pm/cli
```

**Note:** Windows native (cmd.exe) is not officially supported. Use WSL2 or Git Bash.

## Troubleshooting

### "wpm: command not found"

**Cause:** npm global packages not on PATH.

**Fix:**
```bash
# Find where npm installs global packages
npm config get prefix

# Add to PATH (macOS/Linux ~/.bashrc or ~/.zshrc)
export PATH="$(npm config get prefix)/bin:$PATH"

# Reload shell
source ~/.bashrc  # or ~/.zshrc
```

### "Error: Cannot find module '@wasm4pm/cli'"

**Cause:** Incomplete installation.

**Fix:**
```bash
# Verify npm installation
npm list -g @wasm4pm/cli

# Reinstall if needed
npm uninstall -g @wasm4pm/cli
npm install -g @wasm4pm/cli
```

### "WASM module not found"

**Cause:** WASM binary not compiled.

**For npm install:** Should not occur. File a bug at https://github.com/sac/wasm4pm/issues.

**For dev install:**
```bash
cd wasm4pm
npm run build        # Rebuild WASM
npm run build:all    # Build all deployment profiles
```

### "Error: libc++.so.1: cannot open shared object file" (Linux)

**Cause:** Missing libc++ runtime.

**Fix:**
```bash
# Ubuntu/Debian
sudo apt install -y libc++-13-dev

# Fedora/RHEL
sudo dnf install -y libc++-devel
```

## Environment Setup (Optional)

Create a `.env` file in your project root for common configurations:

```bash
# .env
WASM4PM_PROFILE=balanced
WASM4PM_OUTPUT_FORMAT=json
WASM4PM_LOG_LEVEL=info
WASM4PM_OTEL_ENABLED=false
```

Then:
```bash
wpm run sample.xes
# Uses configuration from .env
```

See [docs/CONFIG.md](CONFIG.md) for all available variables.

## Next Steps

1. **Quick Start:** [docs/QUICK_START.md](QUICK_START.md) — Run your first algorithm in 3 minutes
2. **Configuration:** [docs/CONFIG.md](CONFIG.md) — Learn the configuration system
3. **CLI Reference:** [docs/reference/cli-commands.md](reference/cli-commands.md) — All available commands
4. **Examples:** [docs/TUTORIAL.md](TUTORIAL.md) — Step-by-step workflows

## Getting Help

- **Bug reports:** https://github.com/sac/wasm4pm/issues
- **Discussions:** https://github.com/sac/wasm4pm/discussions
- **Email:** support@wasm4pm.dev (if applicable)
