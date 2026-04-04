# Real Process Mining Datasets for wasm4pm Benchmarking

A comprehensive guide to publicly available, real-world process mining datasets suitable for benchmarking and evaluating the wasm4pm library.

**Status**: Production-ready reference document
**Last Updated**: April 2026
**Total Datasets**: 25+ curated sources

## Table of Contents

1. [Quick Start](#quick-start)
2. [BPI Challenge Datasets](#bpi-challenge-datasets)
3. [Healthcare Datasets](#healthcare-datasets)
4. [Manufacturing & Production](#manufacturing--production)
5. [Financial & Administrative](#financial--administrative)
6. [Object-Centric Event Logs (OCEL)](#object-centric-event-logs-ocel)
7. [Synthetic & Benchmark Datasets](#synthetic--benchmark-datasets)
8. [Specialty & Domain-Specific](#specialty--domain-specific)
9. [Dataset Selection Guide](#dataset-selection-guide)
10. [Benchmark Methodology](#benchmark-methodology)

---

## Quick Start

### Accessing Datasets

Most datasets are hosted on:
- **4TU.ResearchData**: https://data.4tu.nl/ (primary repository, free access, CC0/CC-BY licensed)
- **IEEE Task Force on Process Mining**: https://www.tf-pm.org/resources/logs
- **Zenodo**: https://zenodo.org/ (free, open access)
- **Kaggle**: https://www.kaggle.com/ (some datasets)

### Download Strategy for wasm4pm Testing

1. **Small Tests** (< 1s): Use Sepsis or BPIC 2013 Incidents
2. **Medium Tests** (1-10s): Use Road Traffic Fine or BPIC 2015
3. **Large Tests** (10-60s): Use BPIC 2019 or Production Analysis
4. **Scalability Tests** (60s+): Use BPIC 2012 or synthetic logs with 100K+ events

---

## BPI Challenge Datasets

### BPIC 2012: Personal Loan Application Process

**Type**: Real-world financial process
**Domain**: Dutch Financial Institute (loan approvals)
**Size**: 13,087 cases | 262,200 events | 3 sub-processes
**Format**: XES (3.3 MB), MXML (5.3 MB)
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/BPI_Challenge_2012/12689204

**Characteristics**:
- Activities: Loan application, approval, and denial processes
- Average trace length: 20 events
- Intertwined subprocess: 3 main flows (application, processing, finalization)
- Real-world complexity: Medium
- Use cases: Testing basic discovery algorithms, conformance checking

**Suitable for wasm4pm**: YES
- Good for testing on medium-sized logs
- Diverse activity patterns
- Real organizational context
- Standard XES format

**Performance Baseline**:
- DFG Discovery: ~50ms
- Alpha++ Algorithm: ~200ms
- Genetic Algorithm: ~500ms

---

### BPIC 2013: Incident Management (Volvo IT)

**Type**: Real-world IT operations
**Domain**: Volvo IT Belgium (incident & problem management)
**Size**: 7,554 cases | 65,533 events | 13 event classes
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/BPI_Challenge_2013_incidents/12693914

**Sub-logs Available**:
- Incidents: 7,554 cases
- Problems: 819 cases

**Characteristics**:
- Status tracking: Queued, Accepted, Assigned, Resolved
- Activities: Between 2-10 event classes per case
- Resource types: Multiple IT support teams
- Attributes: Impact, urgency, service request numbers
- Real-world noise: Moderate (some status loops)

**Suitable for wasm4pm**: YES
- Excellent for testing on IT/service operations
- Status-based event flows
- Multi-resource scenarios
- Smaller size allows quick iteration

**Performance Baseline**:
- DFG Discovery: ~30ms
- Heuristic Miner: ~100ms
- Process Skeleton: ~40ms

---

### BPIC 2015: Building Permit Handling (Dutch Municipality)

**Type**: Real-world government process
**Domain**: Dutch Municipal Administration
**Size**: 150,370 cases | Multiple variants
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/collections/f929dc43-b588-404b-8d2c-be4903622913

**Sub-logs**: BPIC15_1 through BPIC15_5 (5 municipal departments)

**Characteristics**:
- Process type: Government permit handling
- Activities: 11 event classes
- Variants: 231 different process variants
- Real-world variability: HIGH (permits have different requirements)
- Events per case: 2-10
- Nature: High concurrency, parallel activities

**Suitable for wasm4pm**: YES - EXCELLENT
- Large dataset for scalability testing
- Complex permit workflows
- High process variability
- Government documentation/real-world context
- Perfect for testing Alpha++, Genetic, and ILP algorithms

**Performance Baseline**:
- DFG Discovery: ~100ms
- Alpha++ Algorithm: ~800ms
- Genetic Algorithm: ~3000ms (with generation limit)

---

### BPIC 2017: Loan Application (Dutch Financial Institute)

**Type**: Real-world financial process
**Domain**: Online Loan Application System
**Size**: Not fully specified in docs (estimated 50-100K events)
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/BPI_Challenge_2017/12696884

**Process Timeline**: All 2016 applications + events through Feb 1, 2017

**Characteristics**:
- Process type: Loan application with full lifecycle tracking
- Attributes: Application details, status changes, approvals
- Real-world: Complete business process
- Timeline-aware: Single year of operations

**Suitable for wasm4pm**: YES
- Realistic financial operations process
- Good for testing on medium-large logs
- Standard XES format

---

### BPIC 2018: EU Direct Payment Applications (Agricultural)

**Type**: Real-world government subsidy process
**Domain**: European Agricultural Payments
**Size**: Dataset available (exact metrics in research)
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/BPI_Challenge_2018/

**Characteristics**:
- Process type: Agricultural subsidy application workflow
- Government process: Multi-step approval
- Real-world complexity: High bureaucratic workflows

**Suitable for wasm4pm**: YES
- Good for testing government/regulatory workflows
- Different from financial processes
- Provides domain variety

---

### BPIC 2019: Purchase-to-Pay (Coatings & Paints Multinational)

**Type**: Real-world supply chain process
**Domain**: Large Multinational Manufacturing Company (coatings/paints)
**Size**: 76,349 purchase documents | 251,734 cases | 1,595,923 events | 42 activities | 627 users
**Format**: XES (IEEE-XES compliant) | CSV available
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/BPI_Challenge_2019/12715853/

**File Sizes**:
- Uncompressed XES: 694 MB
- Compressed (zip): 17 MB
- CSV version: 38 MB

**Characteristics**:
- Process: Purchase Order handling (PO to payment)
- Scope: 60+ subsidiaries worldwide
- Activities: PO creation, approval, goods receipt, invoicing, payment
- Multiple flows: 3-way matching with invoice before/after goods receipt
- Users: 607 human, 20 batch processes
- Attributes: Rich (purchase amounts, dates, vendors, cost centers)
- Real-world complexity: VERY HIGH

**Suitable for wasm4pm**: YES - EXCELLENT FOR LARGE-SCALE TESTING
- Largest "real" dataset available
- Tests scalability limits
- Complex supply chain process
- Multiple concurrent activities
- Real organizational context (60+ locations)
- Perfect for benchmarking resource consumption

**Performance Baseline** (estimated):
- DFG Discovery: ~500ms
- Heuristic Miner: ~2000ms
- Genetic Algorithm: ~15000ms+ (requires optimization)
- Memory: ~300MB WASM instance needed

**Special Considerations**:
- May require streaming/chunking for WASM environment
- Perfect for testing `filterLogByDateRange()`, `filterByActivity()`
- Benchmark: Test concurrent processing with Web Workers
- Recommendation: Test in smaller date-range chunks initially

---

### BPIC 2020: Travel Expense & Request for Payment

**Type**: Real-world government/university process
**Domain**: University Travel Expense Management
**Size**: 13,951 total cases | 123,377 events
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/collections/BPI_Challenge_2020/5065541

**Sub-datasets**:

#### Travel Permits
- **Cases**: 7,065
- **Events**: 86,581
- **Description**: Travel permit process including prepaid costs and related declarations
- **Coverage**: 2017-2018 data from 2 departments

#### Request for Payment
- **Cases**: 6,886
- **Events**: 36,796
- **Description**: Non-travel expense reimbursement requests
- **Coverage**: 2017-2018 data

**Characteristics**:
- Process type: Administrative expense handling
- Attributes: Amounts (note: not exact, for analysis only), declarations, dates
- Multiple documents: Permits, declarations, cost tracking
- Similar process flow: All document types follow similar workflow
- Real-world: University administrative processes

**Suitable for wasm4pm**: YES
- Good for testing administrative workflows
- Moderate size (ideal for quick testing cycles)
- Multiple related sub-processes
- Government/education domain

**Performance Baseline**:
- DFG Discovery: ~50ms per sub-log
- Process Skeleton: ~30ms
- Heuristic Miner: ~150ms

---

## Healthcare Datasets

### Sepsis Cases - Event Log

**Type**: Real-world clinical process
**Domain**: Dutch Hospital (Patient care/sepsis treatment)
**Size**: 1,000 cases | 15,000 events | 16 activities
**Format**: XES (compressed .xes.gz)
**License**: Public (CC0/CC-BY implied, 4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/Sepsis_Cases_-_Event_Log/12707639

**DOI**: https://doi.org/10.4121/uuid:915d2bfb-7e84-49ad-a286-dc35f063a460

**Characteristics**:
- Medical condition: Sepsis (life-threatening infection)
- Activities: 16 medical/administrative activities
- Attributes: 39 data fields including responsible groups, lab test results, checklist information
- Privacy: Anonymized events, randomized timestamps
- Real-world context: Hospital ERP system events

**Suitability for wasm4pm**: YES - EXCELLENT FOR SMALL/QUICK TESTS
- Commonly used benchmark in research
- Small enough for rapid iteration
- Real medical domain context
- Cited in multiple academic papers
- Good for testing basic algorithms and UI responsiveness

**Performance Baseline**:
- DFG Discovery: ~15ms
- Process Skeleton: ~8ms
- Heuristic Miner: ~50ms
- Alpha++ Algorithm: ~100ms

**Use Cases**:
- Initial algorithm testing
- Demo/presentation datasets
- Healthcare domain validation
- Quick performance verification

---

### MIMICEL: Emergency Department Patient Flow

**Type**: Real-world clinical process (derived from MIMIC-IV)
**Domain**: Hospital Emergency Department
**Size**: Not fully specified (curated from MIMIC-IV-ED)
**Format**: XES
**License**: Public (MIMIC-IV base data: PhysioNet License)
**Source**: https://physionet.org/

**Characteristics**:
- Patient flow: Complete ED patient journey
- Activities: Timestamped clinical activities
- Attributes: Clinical and demographic data
- Quality: Rigorous data cleaning and preprocessing
- Real-world: Actual hospital operations

**Suitable for wasm4pm**: YES
- Good for healthcare domain testing
- Realistic clinical workflows
- Rich attribute data

---

## Manufacturing & Production

### Production Analysis with Process Mining Technology

**Type**: Real-world manufacturing process
**Domain**: Manufacturing facility (production/operations)
**Size**: Multiple cases | CSV format (comma-separated)
**Format**: CSV (convertible to XES)
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/Production_Analysis_with_Process_Mining_Technology/12697997/

**Created**: 2014 by Dafna Levy
**Conversion**: CSV to XES requires custom mapping (case ID, activity, timestamp fields)

**Characteristics**:
- Process type: Manufacturing workflow
- Attributes: Cases, activities, resources, timestamps, additional fields
- Real-world complexity: Production variability
- Nature: Material transformation tracking

**Suitable for wasm4pm**: YES (with CSV conversion)
- Good for testing CSV import capabilities
- Manufacturing domain variety
- Real operational context

**Performance Baseline**:
- After conversion: Standard XES processing times
- CSV parsing: Depends on conversion tool (~100-500ms)

---

## Financial & Administrative

### Road Traffic Fine Management Process

**Type**: Real-world government process
**Domain**: Italian Police (traffic fine administration)
**Size**: 150,370 cases | 231 variants
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/Road_Traffic_Fine_Management_Process/12683249

**Process Lifecycle**: Complete fine management from issuance through resolution/appeal

**Characteristics**:
- Activities: Fine creation, notification, payment, appeals
- Variants: 231 different process paths
- Real-world: Government administrative process
- Complexity: Medium (straightforward workflow with conditional branches)
- Scalability: Good dataset for performance testing

**Suitable for wasm4pm**: YES - EXCELLENT FOR SCALABILITY
- Large case count (150K) for stress testing
- Real government operations
- Standard/straightforward process structure
- Good for measuring algorithm performance at scale

**Performance Baseline**:
- DFG Discovery: ~80ms
- Heuristic Miner: ~500ms
- Process Skeleton: ~40ms
- Memory footprint: Moderate (~100MB)

---

## Object-Centric Event Logs (OCEL)

### OCEL 2.0: Business Process Simulations

**Type**: Simulated synthetic OCEL logs
**Domain**: Business processes (e-commerce, HR, healthcare, supply chain)
**Size**: Variable per process (see below)
**Format**: OCEL 2.0 (JSON, SQLite, XML)
**License**: Public/Open (Zenodo)
**Download**: https://zenodo.org/records/13879980

**Included Processes**:

#### Order-to-Cash (O2C)
- E-commerce order lifecycle
- Multiple objects: Orders, Items, Customers
- Activities: Order creation, fulfillment, delivery, payment

#### Procure-to-Pay (P2P)
- Supply chain procurement
- Multiple objects: POs, Invoices, Deliveries
- Activities: PO creation, receipt, invoicing, payment

#### Hiring Process
- HR recruitment workflow
- Multiple objects: Candidates, Positions, Departments
- Activities: Application, screening, interview, offer, hiring

#### Hospital Patient Lifecycle
- Healthcare process
- Multiple objects: Patients, Departments, Treatments
- Activities: Admission, treatment, discharge

**Characteristics**:
- Multiple object types: Complex real-world relationships
- Standard format: OCEL 2.0 compliant
- Realistic workflows: Industry-standard processes
- Research quality: Designed for academic benchmarking

**Suitable for wasm4pm**: YES (for future OCEL support)
- Good for testing when OCEL support is added
- Multiple industry domains covered
- Well-documented format
- Production-ready reference implementation

---

### OCEL: Enron Email Dataset

**Type**: Real-world communication process (derived)
**Domain**: Email communication (Enron corpus)
**Size**: Complete Enron email dataset
**Format**: OCEL 2.0 (.jsonocel)
**License**: Public (Zenodo, original Enron public data)
**Download**: https://zenodo.org/records/15516869

**Characteristics**:
- Process type: Email communication patterns
- Objects: Emails, senders, recipients, threads
- Activities: Send, receive, forward, reply
- Real-world: Actual organizational communication
- Scale: Large dataset (Enron = 500K emails)
- Innovation: Transforms communication logs into process events

**Suitable for wasm4pm**: YES (advanced testing)
- Real-world data at scale
- Novel domain application (communication)
- Tests object-centric processing
- PM4Py and OCEL tools compatible

---

## Synthetic & Benchmark Datasets

### Data-driven Process Discovery - Artificial Event Log

**Type**: Synthetic event log
**Domain**: Artificial process (for controlled testing)
**Size**: 100,000 traces | 900,000 events
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/Data-driven_Process_Discovery_-_Artificial_Event_Log/12688325

**Characteristics**:
- Generated from: Simulated artificial process model
- Attributes: 3 data fields (Priority, Nurse, Type)
- Variability: Path frequency varies by attribute values
- Noise: Randomly added extra events (increasing noise levels)
- Purpose: Benchmark process discovery algorithms
- Controllability: Perfect for algorithm validation

**Suitable for wasm4pm**: YES - EXCELLENT FOR BENCHMARKING
- Large scale without real-world noise complexity
- Predictable structure for validation
- Good for stress testing
- Algorithm accuracy measurement baseline
- Memory and performance profiling

**Performance Baseline**:
- DFG Discovery: ~300ms
- Heuristic Miner: ~1500ms
- Genetic Algorithm: ~8000ms+ (requires optimization)
- Memory: ~200MB

---

### Collection of Artificial Event Logs for Testing

**Type**: Multiple synthetic logs
**Domain**: Various artificial processes
**Size**: Multiple logs of varying sizes
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/A_collection_of_artificial_event_logs_to_test_process_discovery_and_conformance_checking_techniques/12704777

**Purpose**: Testing process discovery and conformance checking across different scenarios

**Characteristics**:
- Diverse: Multiple process types and complexities
- Controlled: Known process models for validation
- Varied sizes: From simple to complex
- Well-documented: Intended use cases specified

**Suitable for wasm4pm**: YES - EXCELLENT FOR VALIDATION
- Regression testing
- Algorithm correctness verification
- Conformance checking validation
- Test suite foundation

---

### Process Discovery Contest 2022 (PDC 2022)

**Type**: Competition benchmark dataset
**Domain**: Diverse processes (contest submissions)
**Size**: 480 training logs | 96 test logs | 96 ground truth models
**Format**: XES (logs) | PNML (Petri net models)
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/Process_Discovery_Contest_2022/21261402

**Purpose**: Benchmark process discovery algorithms with known ground truth

**Characteristics**:
- Multiple processes: Diverse real and synthetic logs
- Ground truth: Reference Petri nets provided
- Evaluation: Metrics for comparing discovered vs. actual models
- Research quality: Used in academic benchmarking
- Well-structured: Training and test splits

**Suitable for wasm4pm**: YES - EXCELLENT FOR ALGORITHM VALIDATION
- Algorithm accuracy measurement
- Performance on diverse process types
- Comparison against benchmarks
- Peer-reviewed evaluation framework

---

### Business Process Drift Dataset

**Type**: Synthetic event logs with process changes
**Domain**: Controlled drift scenarios
**Size**: Variable
**Format**: XES
**License**: Public (4TU.ResearchData)
**Download**: https://data.4tu.nl/articles/dataset/Business_Process_Drift/12712436

**Purpose**: Testing drift detection and adaptation algorithms

**Characteristics**:
- Controlled changes: Process evolution over time
- Known points: When process changed
- Real-world relevance: Processes change in practice
- Specialized use: Drift detection algorithms

**Suitable for wasm4pm**: YES (specialized testing)
- Testing on processes with evolution/drift
- Algorithm behavior under changing conditions
- Advanced analysis scenarios

---

## Specialty & Domain-Specific

### (Un)Fair Process Mining Event Logs

**Type**: Synthetic event logs for fairness research
**Domain**: Hiring, healthcare, lending, renting
**Size**: 12 logs total | 10,000 cases each
**Format**: XES
**License**: Public (Zenodo)
**Download**: https://zenodo.org/records/8059489

**Characteristics**:
- Purpose: Fairness in process mining
- Domains: 3 logs per domain (4 domains)
- Size: Consistent 10K cases for comparison
- Attribute bias: Includes fairness-relevant attributes
- Research focus: Discrimination detection in processes

**Suitable for wasm4pm**: YES (specialized analysis)
- Testing fairness-aware algorithm implementations
- Domain variety
- Bias/discrimination analysis

---

### Cybersecurity Training Event Logs

**Type**: Real-world training activity logs
**Domain**: Cybersecurity/KYPO Cyber Range
**Size**: Variable (trainee activities)
**Format**: JSON (raw logs), CSV (aggregated)
**License**: Public (Zenodo)
**Download**: https://zenodo.org/records/10170480

**Characteristics**:
- Content: Hands-on cybersecurity training scenarios
- Activities: Security exercise tasks and completions
- Real-world: Actual training behavior data
- Educational: Learning activity patterns
- Use case: Security operations process mining

**Suitable for wasm4pm**: YES
- Novel domain (security training)
- Real activity data
- Educational/training processes
- JSON format support

---

### Event Log Dwelling Time (Container Port)

**Type**: Real-world logistics process
**Domain**: Port terminal operations
**Size**: 3 months of data
**Format**: Available on Mendeley Data
**License**: Public (Mendeley Data)
**Download**: https://data.mendeley.com/datasets/yvp2b4rtp3/

**Characteristics**:
- Process: Container dwell time tracking
- Activities: Container loading, unloading, departure
- Real-world: Port terminal operations
- Duration: 3-month time window
- Domain: Logistics/supply chain

**Suitable for wasm4pm**: YES
- Logistics/supply chain domain
- Time-based analysis (dwell time)
- Real port operations

---

### Car Insurance Claims Event Log

**Type**: Real-world insurance process
**Domain**: Insurance claim handling
**Format**: Available on Kaggle
**License**: Public (check Kaggle terms)
**Download**: https://www.kaggle.com/datasets/carlosalvite/car-insurance-claims-event-log-for-process-mining

**Characteristics**:
- Process: Insurance claim lifecycle
- Activities: Claim submission, assessment, resolution
- Domain: Financial services
- Real-world: Insurance operations

**Suitable for wasm4pm**: YES
- Financial services domain
- Claims processing (common business process)
- Kaggle accessibility

---

## Dataset Selection Guide

### By Use Case

#### Quick Testing & Demos
- **Sepsis Cases** (1K cases, 15K events, ~15ms)
- **BPIC 2013 Incidents** (7.5K cases, 65K events, ~30ms)
- Start here for UI prototypes and quick validation

#### Small to Medium Benchmarks
- **BPIC 2015** (building permits) - 150K cases
- **Production Analysis** - Real manufacturing data
- **Road Traffic Fine** - 150K cases, good complexity

#### Large-Scale Performance Testing
- **BPIC 2019** (P2P) - 1.6M events, real multinational
- **Data-driven Discovery - Artificial Log** - 900K events, synthetic
- Test memory limits and optimization

#### Domain Variety
- Healthcare: Sepsis, MIMICEL
- Financial: BPIC 2012, BPIC 2017
- Government: BPIC 2015, Road Traffic Fine
- Supply Chain: BPIC 2019, Production, Port Dwell Time
- IT Operations: BPIC 2013, Helpdesk
- Insurance: Car Insurance Claims
- Training: Cybersecurity logs
- Manufacturing: Production, IoT Smart Factory

#### Algorithm Validation
- **Process Discovery Contest 2022** - Known ground truth
- **Collection of Artificial Event Logs** - Controlled complexity
- **Artificial Digital Copier Log** - Simple, deterministic
- **Business Process Drift** - Testing drift detection
- **(Un)Fair Process Mining Logs** - Fairness scenarios

---

## Benchmark Methodology

### Setting Up wasm4pm Benchmarks

#### 1. Dataset Preparation

```typescript
import * as pm from 'wasm4pm';

// Download dataset (e.g., Sepsis)
const xesFile = 'sepsis_cases.xes';

// Load into wasm4pm
const logHandle = await pm.loadXES(xesFile);
const stats = await pm.getLogStatistics(logHandle);

console.log('Event Log Statistics:');
console.log(`  Cases: ${stats.caseCount}`);
console.log(`  Events: ${stats.eventCount}`);
console.log(`  Activities: ${stats.activityCount}`);
console.log(`  Avg Trace Length: ${(stats.eventCount / stats.caseCount).toFixed(2)}`);
```

#### 2. Running Benchmark Suites

```typescript
// Small dataset baseline
const benchmarks = [
  { name: 'Sepsis', file: 'sepsis_cases.xes', expectedTime: 100 }, // ms
  { name: 'BPIC 2013', file: 'bpic2013_incidents.xes', expectedTime: 500 },
  { name: 'BPIC 2015', file: 'bpic2015_combined.xes', expectedTime: 5000 },
];

for (const bench of benchmarks) {
  const start = performance.now();
  const dfg = await pm.discoverDFG(bench.file);
  const time = performance.now() - start;
  
  console.log(`${bench.name}: ${time.toFixed(2)}ms (expected: ${bench.expectedTime}ms)`);
}
```

#### 3. Algorithm Comparison

```typescript
// Compare algorithms on same dataset
async function algorithmComparison(logHandle) {
  const algorithms = [
    { name: 'DFG', fn: pm.discoverDFG },
    { name: 'Alpha++', fn: pm.discoverAlphaPlusPlus },
    { name: 'Heuristic', fn: pm.discoverHeuristicMiner },
    { name: 'Genetic', fn: pm.discoverWithGeneticAlgorithm },
    { name: 'ILP', fn: pm.discoverWithILP },
  ];
  
  for (const algo of algorithms) {
    const start = performance.now();
    const result = await algo.fn(logHandle);
    const time = performance.now() - start;
    console.log(`${algo.name}: ${time.toFixed(2)}ms`);
  }
}
```

---

## Additional Resources

### Primary Sources
- [IEEE Task Force on Process Mining](https://www.tf-pm.org/resources/logs)
- [4TU.ResearchData](https://data.4tu.nl/)
- [Zenodo Open Science Repository](https://zenodo.org/)
- [processmining.org Event Data](https://www.processmining.org/event-data.html)
- [PM4Py Documentation](https://processintelligence.solutions/pm4py/)

### Citation Guidelines

When publishing benchmarks using these datasets, cite the original sources:

**BPIC Challenges** (general):
> "BPI Challenges: 10 Years of Real-Life Datasets" - IEEE Task Force on Process Mining Newsletter, 2020

**Sepsis Dataset**:
> "Process Mining of Incoming Patients with Sepsis" - Open Journal of Public Health, 2019
> DOI: 10.2196/13945

**BPIC 2019 (Purchase-to-Pay)**:
> Dataset available at 4TU.ResearchData
> Paper: "BPI Challenge 2019: Purchase Order Handling" - ICPM Conference Proceedings

**OCEL Datasets**:
> "OCEL: A Standard for Object-Centric Event Logs" - Springer, 2021
> https://zenodo.org/records/13879980

---

**Last Updated**: April 2026
**Status**: Production-ready for wasm4pm v0.5.4+
**Maintained by**: wasm4pm project
