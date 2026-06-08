# PyO3 macOS Linking Configuration

## The Issue
When running `cargo test -p pm4py-lsp` on macOS, PyO3 may encounter a dynamic linking issue complaining that the Python library cannot be loaded:

```text
dyld[...]: Library not loaded: @rpath/Python3.framework/Versions/3.9/Python3
```

This is caused by macOS System Python (or multiple local Python environments like `pyenv`/`conda`) confusing the `pyo3-build-config` during cargo's build phase. The build script attempts to bind against an environment that it cannot dynamically link to at test runtime.

## The Solution

To resolve this issue and guarantee that `pm4py-lsp` binds against Python 3.12, we must explicitly declare the Python interpreter for PyO3 at the workspace level.

We achieved this by appending the following to the workspace `.cargo/config.toml`:

```toml
[env]
PYO3_PYTHON = "python3.12"
```

## Why this works
Setting `PYO3_PYTHON` explicitly tells the `pyo3` build script to locate the library path, `LDLIBRARY`, and include directories associated specifically with `python3.12`. It bypasses the flaky auto-discovery logic that tends to find the macOS system-level Python 3.9 framework (which lacks the proper `LC_RPATH` for dynamic linkage).

## Verification
With this configuration in place, you can simply run:

```bash
cargo test -p pm4py-lsp
```

And all tests will pass cleanly, invoking the correct Python 3.12 C-API.