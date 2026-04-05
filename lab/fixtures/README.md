# lab/fixtures - Test Data and Baselines

This directory contains sample event logs and expected result baselines used by the post-publication validation harness.

## Files

### Event Logs

**sample-100-events.json**
- Format: JSON event log
- Size: 100 events across 25 traces
- Traces: 25 sequential process traces
- Activities: Receive Request, Check Eligibility, Approve/Reject, Send Notification
- Use case: Standard conformance testing, performance benchmarking
- Expected log stats:
  - Total events: 100
  - Unique traces: 25
  - Unique activities: 4
  - Approval rate: 70% (17.5 approvals per trace)

**sample-xes-1.0.xes**
- Format: XES 1.0 (ISO/IEC 20877:2017)
- Size: 12 events across 3 traces
- Activities: Simple approval workflow
- Use case: XES format parsing and import validation
- Expected log stats:
  - Total events: 12
  - Unique traces: 3
  - Unique activities: 4

**sample-ocel.json**
- Format: OCEL 2.0 (Object-Centric Event Logs)
- Size: 7 events, 3 objects (2 orders, 1 invoice)
- Objects:
  - order_1 (completed, $1000)
  - order_2 (rejected, $500)
  - invoice_1 (paid, $1000)
- Use case: Object-centric conformance testing
- Expected log stats:
  - Total events: 7
  - Unique activities: 4
  - Objects: 3 (2 orders + 1 invoice)

## Baselines

**expected-results.json**
- Contains expected behavior assertions
- Baseline for regression detection
- Captures:
  - Algorithm availability (all 14 should be present)
  - Import/export format support
  - Analytics function count (minimum 20)
  - Conformance metrics availability
  - Performance targets per algorithm

### Performance Baselines

| Algorithm | Target | Claim | Notes |
|-----------|--------|-------|-------|
| DFG | 1.0ms | 0.5ms per 100 events | Fast, linear time |
| Alpha++ | 5.0ms | 5ms per 100 events | Moderate complexity |
| Genetic | 50.0ms | 40ms per 100 events | Evolutionary approach |
| ILP | 25.0ms | 20ms per 100 events | Optimization with timeout |
| Process Skeleton | 1.0ms | 0.3ms per 100 events | Very fast |

Targets are inclusive of measurement overhead and allow for platform variance.

## Using Fixtures in Tests

```typescript
import fs from "fs";
import path from "path";

// Load JSON log
const logPath = path.join(__dirname, "fixtures", "sample-100-events.json");
const logData = JSON.parse(fs.readFileSync(logPath, "utf-8"));

// Load XES log
const xesPath = path.join(__dirname, "fixtures", "sample-xes-1.0.xes");
const xesContent = fs.readFileSync(xesPath, "utf-8");

// Load OCEL log
const ocelPath = path.join(__dirname, "fixtures", "sample-ocel.json");
const ocelData = JSON.parse(fs.readFileSync(ocelPath, "utf-8"));

// Load expected results baseline
const baselinePath = path.join(__dirname, "fixtures", "expected-results.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
```

## Adding New Fixtures

When adding new test logs:

1. **Name** fixtures descriptively: `sample-{description}-{event_count}-events.{format}`
2. **Document** the fixture in this README
3. **Include** expected statistics (event count, trace count, activities, etc.)
4. **Add** to baseline if testing a new scenario
5. **Test** that the fixture loads correctly before using in validation

## Fixture Lifecycle

- **sample-100-events.json** - Core fixture for algorithm testing
- **sample-xes-1.0.xes** - Format validation (stable)
- **sample-ocel.json** - Object-centric testing (stable)
- **expected-results.json** - Baseline for regression detection (updated per release)

---

**Last Updated**: April 2026
**Status**: Ready for use
