# Tutorial: Real-Time Process Monitoring

**Time to complete**: 30 minutes  
**Level**: Advanced  
**Audience**: DevOps, monitoring specialists  

## What You'll Learn

- Ingest live event streams
- Detect process drifts and anomalies
- Set up alerts on model changes
- Build real-time dashboards
- Integrate with monitoring systems

## Prerequisites

- wasm4pm service running
- Docker for optional stack (Prometheus, Grafana)
- Understanding of process mining basics

## Step 1: Stream Live Events

Configure live event streaming:

```toml
[source]
type = "stream"
path = "kafka://localhost:9092/events"
format = "jsonl"
watch = true
checkpoint_dir = "/var/cache/wasm4pm"

[discovery]
algorithm = "dfg"
profile = "fast"
streaming = true
```

Start streaming:

```bash
pmctl watch --config config.toml --format json > events.jsonl
```

## Step 2: Detect Drifts

Add drift detection configuration:

```toml
[monitoring]
drift_detection = true
drift_threshold = 0.15
check_interval_events = 100

[[monitoring.drift_rules]]
type = "new_activity"
action = "alert"
severity = "warning"

[[monitoring.drift_rules]]
type = "missing_edge"
action = "alert"
severity = "info"

[[monitoring.drift_rules]]
type = "model_change_ratio"
threshold = 0.2
action = "alert"
severity = "warning"
```

## Step 3: Set Up Alerts

Create alert rules:

```toml
[alerting]
enabled = true
backend = "prometheus"

[[alerting.rules]]
name = "model_drift"
condition = "drift_detected"
threshold = 0.15
window = 300
action = "webhook"
webhook_url = "${ALERT_WEBHOOK}"

[[alerting.rules]]
name = "high_memory"
condition = "memory_used > 1000"
action = "email"
email_to = "ops@company.com"

[[alerting.rules]]
name = "algorithm_timeout"
condition = "execution_time > timeout"
action = "log_error"
```

## Step 4: Create Dashboard

Create Grafana dashboard definition:

```json
{
  "dashboard": {
    "title": "wasm4pm Real-Time Monitoring",
    "panels": [
      {
        "title": "Model Nodes",
        "targets": [
          {
            "expr": "wasm4pm_model_nodes"
          }
        ]
      },
      {
        "title": "Model Edges",
        "targets": [
          {
            "expr": "wasm4pm_model_edges"
          }
        ]
      },
      {
        "title": "Drift Score",
        "targets": [
          {
            "expr": "wasm4pm_drift_score"
          }
        ]
      },
      {
        "title": "Events/sec",
        "targets": [
          {
            "expr": "rate(wasm4pm_events_total[1m])"
          }
        ]
      }
    ]
  }
}
```

## Step 5: Expose Metrics

Enable Prometheus endpoint:

```bash
# Service automatically exposes /metrics
curl http://localhost:3001/metrics
```

Output:

```
# HELP wasm4pm_model_nodes Current number of nodes
# TYPE wasm4pm_model_nodes gauge
wasm4pm_model_nodes 23

# HELP wasm4pm_model_edges Current number of edges
# TYPE wasm4pm_model_edges gauge
wasm4pm_model_edges 18

# HELP wasm4pm_drift_score Current drift score
# TYPE wasm4pm_drift_score gauge
wasm4pm_drift_score 0.12

# HELP wasm4pm_events_total Total events processed
# TYPE wasm4pm_events_total counter
wasm4pm_events_total 1234
```

## Step 6: Integrate with Prometheus

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'wasm4pm'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

Run Prometheus:

```bash
docker run -d \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

Access at: http://localhost:9090

## Step 7: Query Metrics

Write PromQL queries:

```promql
# Current model complexity
wasm4pm_model_nodes + wasm4pm_model_edges

# Drift trends
rate(wasm4pm_drift_score[5m])

# Events per second
rate(wasm4pm_events_total[1m])

# Memory usage
wasm4pm_memory_bytes / 1024 / 1024
```

## Step 8: Build Grafana Dashboard

Create dashboard:

```bash
# Start Grafana
docker run -d \
  -p 3000:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD=admin \
  grafana/grafana

# Add Prometheus data source
# Create dashboard with queries above
```

Dashboard panels:

| Panel | Query | Type |
|-------|-------|------|
| Nodes | `wasm4pm_model_nodes` | Gauge |
| Edges | `wasm4pm_model_edges` | Gauge |
| Drift | `wasm4pm_drift_score` | Time series |
| Throughput | `rate(wasm4pm_events_total[1m])` | Graph |

## Step 9: Webhook Alerts

Create webhook receiver:

```python
from flask import Flask, request
import json

app = Flask(__name__)

@app.route('/alert', methods=['POST'])
def handle_alert():
    data = request.json
    print(f"Alert: {data['rule_name']}")
    print(f"Severity: {data['severity']}")
    print(f"Message: {data['message']}")
    
    # Send to Slack, PagerDuty, etc.
    send_to_slack(data)
    
    return {'status': 'received'}

def send_to_slack(alert):
    # Slack webhook logic
    pass

if __name__ == '__main__':
    app.run(port=8080)
```

Configure in wasm4pm:

```toml
[alerting]
webhook_url = "http://localhost:8080/alert"
```

## Step 10: Event Integration

Connect to event systems:

```toml
[source.integrations]
kafka = { brokers = "localhost:9092", topic = "events" }
rabbitmq = { url = "amqp://localhost", queue = "events" }
http = { endpoint = "http://event-source:8080/events" }
file = { path = "/var/log/events.jsonl", watch = true }
```

## Understanding Real-Time Monitoring

### Detection Pipeline

```
Events → Streaming Discovery → Model Updates → Drift Detection
           ↓                        ↓                ↓
         Incremental            Checkpoint        Metrics
         Discovery              Storage          Emission
```

### Drift Types

| Type | Detection | Action |
|------|-----------|--------|
| New Activity | Activity not seen before | Alert/log |
| Missing Edge | Expected edge absent | Alert |
| Model Change | >20% nodes/edges changed | Alert |
| Timeout | Algorithm exceeds limit | Error alert |
| Memory | Usage >threshold | Error alert |

## Next Steps

1. **Advanced observability**: [Tutorial: Observability Setup](./observability-setup.md)
2. **Performance tuning**: [How-To: Performance Tuning](../how-to/performance-tuning.md)
3. **Reference**: [Environment Variables](../reference/environment-variables.md)

---

## Related Documentation

- **[Explanation: Streaming](../explanation/streaming.md)** — Streaming design
- **[Reference: Config Schema](../reference/config-schema.md)** — Monitoring config
