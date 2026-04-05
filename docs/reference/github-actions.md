# Reference: GitHub Actions Workflow

## Complete Workflow

```yaml
name: wasm4pm Process Mining

on:
  push:
    paths:
      - 'data/**.xes'
      - 'config.toml'
  pull_request:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install wasm4pm
        run: npm install -g @wasm4pm/pmctl
      
      - name: Validate Configuration
        run: pmctl init --validate config.toml
      
      - name: Run Process Mining
        run: pmctl run --config config.toml --profile balanced
      
      - name: Generate Report
        run: pmctl explain --config config.toml > analysis.md
      
      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: process-mining-results
          path: output/
          retention-days: 30
      
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('analysis.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '## Process Mining Analysis\n' + report
            });
```

## Testing Workflow

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install
        run: npm install -g @wasm4pm/pmctl
      
      - name: Run Tests
        run: npm test
      
      - name: Check Determinism
        run: |
          pmctl run --config config.toml
          HASH1=$(jq -r '.combined_hash' output/receipt.json)
          pmctl run --config config.toml
          HASH2=$(jq -r '.combined_hash' output/receipt.json)
          [[ "$HASH1" == "$HASH2" ]] || exit 1
```

## Release Workflow

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run All Tests
        run: npm test
      
      - name: Build Release
        run: npm run build:all
      
      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false
```

## See Also

- [How-To: CI/CD Setup](../how-to/cicd-setup.md)
- [How-To: Docker Deployment](../how-to/docker-deploy.md)
