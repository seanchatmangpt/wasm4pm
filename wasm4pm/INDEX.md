# process_mining_wasm - Complete Documentation Index

Welcome to the process_mining_wasm module! This index helps you navigate all available documentation and resources.

## Quick Navigation

### Getting Started
- **New to WASM bindings?** Start with [GETTING_STARTED.md](./GETTING_STARTED.md)
- **Quick setup?** Run `./QUICKSTART.sh` or follow [Installation Guide](./GETTING_STARTED.md#installation)
- **Want examples?** See [examples/](./examples/) directory

### API & Reference
- **Looking for functions?** Check [API.md](./API.md) - Complete function reference
- **Need TypeScript types?** Generated automatically in `pkg/process_mining_wasm.d.ts`
- **Want to understand the design?** See [ARCHITECTURE.md](./ARCHITECTURE.md)

### Development
- **Contributing code?** Read [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Development workflow?** Check [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Building locally?** See [build.sh](./build.sh) or `npm run build`
- **Running tests?** Use [test.sh](./test.sh) or `npm test`

### Automation & Deployment
- **Publishing to npm?** Use [publish.sh](./publish.sh)
- **CI/CD pipeline?** See [.github/workflows/wasm-build.yml](../.github/workflows/wasm-build.yml)
- **Build configuration?** Check [package.json](./package.json)

## Documentation by Purpose

### For Users
| Document | Purpose |
|----------|---------|
| [README.md](./README.md) | Project overview and quick links |
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Installation and usage guide |
| [API.md](./API.md) | Complete API reference |
| [examples/](./examples/) | Real-world usage examples |

### For Developers
| Document | Purpose |
|----------|---------|
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Quick reference for development |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Design and architecture guide |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guidelines |

### For DevOps/Release
| Document | Purpose |
|----------|---------|
| [publish.sh](./publish.sh) | Automated publishing script |
| [.github/workflows/wasm-build.yml](../.github/workflows/wasm-build.yml) | CI/CD pipeline |
| [package.json](./package.json) | NPM package configuration |

### Configuration Files
| File | Purpose |
|------|---------|
| [tsconfig.json](./tsconfig.json) | TypeScript configuration |
| [vitest.config.ts](./vitest.config.ts) | Test runner configuration |
| [.prettierrc](./.prettierrc) | Code formatting rules |
| [.gitignore](./.gitignore) | Git exclusions |
| [.npmignore](./.npmignore) | NPM package exclusions |

### Build & Test Scripts
| Script | Purpose |
|--------|---------|
| [QUICKSTART.sh](./QUICKSTART.sh) | Complete setup automation |
| [build.sh](./build.sh) | Build orchestration script |
| [test.sh](./test.sh) | Test runner with options |
| [publish.sh](./publish.sh) | Publishing automation |

## Common Tasks

### Install the Package
```bash
npm install process_mining_wasm
```

### Use in Your Project
```javascript
const pm = require('process_mining_wasm');
pm.init();
const logHandle = pm.load_eventlog_from_xes(xesContent);
```

See [GETTING_STARTED.md](./GETTING_STARTED.md) for detailed examples.

### Set Up Development Environment
```bash
./QUICKSTART.sh
```

Or manually:
```bash
npm install
npm run build:all
npm test
```

### Build the WASM Module
```bash
./build.sh
# or
npm run build:all
```

### Run Tests
```bash
./test.sh              # All tests
./test.sh --unit-only  # Unit tests only
./test.sh --watch      # Watch mode
```

### Check Code Quality
```bash
npm run lint           # Check formatting and types
npm run format         # Auto-format code
npm run type:check     # TypeScript type checking
```

### Generate Documentation
```bash
npm run docs           # Generate API documentation
```

### Publish to npm
```bash
./publish.sh patch     # Patch release
./publish.sh minor     # Minor release
./publish.sh major     # Major release
```

## File Structure Overview

```
process_mining_wasm/
├── Documentation
│   ├── README.md                 # Project overview
│   ├── INDEX.md                  # This file
│   ├── GETTING_STARTED.md        # Quick start guide
│   ├── API.md                    # Complete API reference
│   ├── ARCHITECTURE.md           # Design documentation
│   ├── CONTRIBUTING.md           # Contribution guidelines
│   └── DEVELOPMENT.md            # Development reference
│
├── Configuration
│   ├── package.json              # NPM configuration
│   ├── Cargo.toml                # Rust configuration
│   ├── tsconfig.json             # TypeScript configuration
│   ├── vitest.config.ts          # Test configuration
│   ├── .prettierrc                # Formatting rules
│   ├── .gitignore                # Git exclusions
│   └── .npmignore                # NPM exclusions
│
├── Scripts
│   ├── QUICKSTART.sh             # Automated setup
│   ├── build.sh                  # Build script
│   ├── test.sh                   # Test runner
│   └── publish.sh                # Publishing automation
│
├── Source Code
│   ├── src/lib.rs                # Rust WASM bindings
│   └── pkg/                      # Built WASM (generated)
│
├── Tests
│   ├── __tests__/
│   │   ├── basic.test.ts         # Unit tests
│   │   ├── integration.test.js   # Integration tests
│   │   └── data/                 # Test data
│   └── examples/
│       ├── nodejs.js             # Node.js example
│       └── browser.html          # Browser example
```

## Development Workflow

### 1. Setup
```bash
./QUICKSTART.sh
```

### 2. Make Changes
Edit code in `src/lib.rs` or add tests

### 3. Build & Test
```bash
npm run build:all
npm test
npm run lint
```

### 4. Commit
```bash
git add .
git commit -m "feat: description"
```

### 5. Submit PR
Push and create pull request

## Key Features

- **Multi-Target Builds:** Bundler, Node.js, browser
- **Type Safety:** Full TypeScript support
- **Testing:** Unit and integration tests
- **CI/CD:** Automated builds and deployment
- **Documentation:** Comprehensive guides
- **Developer Experience:** Quick scripts and clear commands

## Getting Help

### Documentation
- [README.md](./README.md) - Overview
- [GETTING_STARTED.md](./GETTING_STARTED.md) - Usage guide
- [API.md](./API.md) - Function reference
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Design details
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Dev guide

### Issues & Discussions
- GitHub Issues: https://github.com/aarkue/rust4pm/issues
- GitHub Discussions: https://github.com/aarkue/rust4pm/discussions

### Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines

## Quick Links by Role

### For Package Users
1. Read [GETTING_STARTED.md](./GETTING_STARTED.md)
2. Check [API.md](./API.md) for functions
3. Look at [examples/](./examples/) for code samples
4. Review [README.md](./README.md) for overview

### For Contributors
1. Fork the repository
2. Follow [CONTRIBUTING.md](./CONTRIBUTING.md)
3. Read [DEVELOPMENT.md](./DEVELOPMENT.md)
4. Check [ARCHITECTURE.md](./ARCHITECTURE.md)
5. Run `npm test` before submitting PR

### For Maintainers
1. Review CI/CD at [.github/workflows/wasm-build.yml](../.github/workflows/wasm-build.yml)
2. Use [publish.sh](./publish.sh) for releases
3. Check [package.json](./package.json) for dependencies
4. Monitor GitHub Actions for build results

## Version Information

- **WASM Binding Version:** 0.5.4
- **Rust process_mining:** 0.5.4
- **Node.js Support:** 14.0.0+
- **Browser Support:** Chrome 57+, Firefox 52+, Safari 11+, Edge 79+

## License

MIT OR Apache-2.0

See [../LICENSE-MIT](../LICENSE-MIT) and [../LICENSE-APACHE](../LICENSE-APACHE)

---

**Last Updated:** April 4, 2026
**Status:** Production Ready

For the latest information, visit: https://github.com/aarkue/rust4pm
