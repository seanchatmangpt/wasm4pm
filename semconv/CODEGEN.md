# Semconv Codegen

## Status

`packages/observability/src/semconv.gen.ts` is **hand-maintained** until a Weaver
template is added to `semconv/templates/`.

## Validate the registry

```bash
make codegen-semconv        # via Makefile
pnpm semconv:check          # via pnpm
```

Requires Weaver v0.22.1+: `cargo install weaver-forge`
Binary location: `~/.cargo/bin/weaver`

## Regenerate semconv.gen.ts (manual until templates exist)

1. Edit `semconv/registry/` YAML files as needed.
2. Run `make codegen-semconv` to confirm the registry is valid.
3. Manually update `packages/observability/src/semconv.gen.ts` to match.

## Future: automated codegen

Once `semconv/templates/` contains a Weaver Jinja2 template:

```bash
weaver registry generate --registry semconv/registry \
  --templates semconv/templates \
  --output packages/observability/src/
```
