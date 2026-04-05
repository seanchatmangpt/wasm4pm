# How-To: Set Up CI/CD Pipeline

**Time required**: 15 minutes  
**Difficulty**: Intermediate  

## GitHub Actions

Create `.github/workflows/process-mining.yml`:

```yaml
name: Process Mining Analysis

on:
  push:
    paths:
      - 'data/**.xes'
      - 'config.toml'
  pull_request:

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install wasm4pm
        run: npm install -g @wasm4pm/pmctl
      
      - name: Validate config
        run: pmctl init --validate config.toml
      
      - name: Run analysis
        run: pmctl run --config config.toml --profile balanced
      
      - name: Generate report
        run: pmctl explain --config config.toml > analysis.md
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: analysis-results
          path: output/
      
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

## GitLab CI

Create `.gitlab-ci.yml`:

```yaml
image: node:20

stages:
  - validate
  - analyze
  - report

validate_config:
  stage: validate
  script:
    - npm install -g @wasm4pm/pmctl
    - pmctl init --validate config.toml

run_analysis:
  stage: analyze
  script:
    - pmctl run --config config.toml --profile balanced
  artifacts:
    paths:
      - output/
    expire_in: 1 week

generate_report:
  stage: report
  script:
    - pmctl explain --config config.toml > report.md
  artifacts:
    paths:
      - report.md
```

## Jenkins

Create `Jenkinsfile`:

```groovy
pipeline {
  agent any
  
  stages {
    stage('Install') {
      steps {
        sh 'npm install -g @wasm4pm/pmctl'
      }
    }
    
    stage('Validate') {
      steps {
        sh 'pmctl init --validate config.toml'
      }
    }
    
    stage('Analyze') {
      steps {
        sh 'pmctl run --config config.toml --profile balanced'
      }
    }
    
    stage('Archive') {
      steps {
        archiveArtifacts artifacts: 'output/**', allowEmptyArchive: false
      }
    }
  }
  
  post {
    always {
      junit 'output/receipt.json'
    }
  }
}
```

## Pre-commit Hook

Create `.githooks/pre-commit`:

```bash
#!/bin/bash

echo "Validating wasm4pm config..."
pmctl init --validate config.toml

if [ $? -ne 0 ]; then
  echo "Config validation failed!"
  exit 1
fi

echo "✓ Config valid"
```

Install:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

## Testing

Create `tests/mining.test.js`:

```javascript
const Wasm4pm = require('@wasm4pm/wasm4pm');
const assert = require('assert');

describe('Process Mining', () => {
  it('should analyze event log', async () => {
    const pm = new Wasm4pm();
    const result = await pm.run({
      config: {
        discovery: { algorithm: 'dfg' },
        source: { type: 'file', path: 'data/sample.xes' }
      }
    });
    
    assert(result.model.nodes.length > 0);
    assert(result.status === 'success');
  });
});
```

Run:

```bash
npm test
```

## See Also

- [How-To: Docker Deployment](./docker-deploy.md)
- [How-To: Kubernetes Deployment](./kubernetes-deploy.md)
