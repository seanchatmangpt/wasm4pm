# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (v26.x) | Active support |
| Previous minor | Critical fixes only |
| Older | No support |

## Reporting a Vulnerability

Do NOT use public GitHub issues for security reports.

Email: xpointsh@gmail.com
Subject: [SECURITY] wasm4pm — brief description

Include: description, reproduction steps, potential impact, affected versions, suggested fix.

## Response SLA

| Severity | First Response | Fix Target |
|----------|---------------|------------|
| Critical | 24 hours | 7 days |
| High | 48 hours | 14 days |
| Medium | 5 business days | 30 days |
| Low | 10 business days | Next release |

## Security Notes

- wasm4pm makes no outbound network calls except OTLP telemetry when explicitly configured
- No credentials stored or transmitted
- WASM sandboxing provides memory isolation
- Event log data never leaves the process unless explicitly exported

## Automated Scanning

We run cargo audit, npm audit, and cargo deny on every PR and weekly via CI.
