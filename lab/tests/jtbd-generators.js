/**
 * Synthetic Test Data Generators for JTBD Tests
 *
 * All generators use seeded RNG for determinism but produce large,
 * complex input spaces that are impossible for LLMs to reason about.
 *
 * Key principle: The ground truth is HIDDEN in the data.
 * To pass the test, you must actually run the algorithms.
 */
/**
 * Seeded random number generator for deterministic but unpredictable output.
 */
export class SeededRNG {
    constructor(seed) {
        this.seed = seed;
    }
    /** Returns random float in [0, 1) */
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    /** Returns random int in [min, max] (inclusive) */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    /** Returns random item from array */
    nextItem(array) {
        return array[this.nextInt(0, array.length - 1)];
    }
    /** Returns true with given probability */
    nextBool(probability) {
        return this.next() < probability;
    }
    /** Returns random float with variance around base */
    nextVariance(base, variance) {
        return base * (1 + (this.next() - 0.5) * variance);
    }
}
/**
 * Generate event log with temporal drift.
 *
 * Business scenario: A process gradually slows down over time.
 * Hidden truth: Which activity slowed, when did it start.
 *
 * @returns events + hidden ground truth (driftStartMonth, bottleneckActivity)
 */
export function generateDriftedLog(config) {
    const rng = new SeededRNG(config.seed || 42);
    const events = [];
    const { activities, bottleneckActivity, baselineDuration, degradedDuration, driftStartMonth, totalMonths, eventsPerMonth, variance } = config;
    for (let month = 0; month < totalMonths; month++) {
        // Calculate duration multiplier based on drift
        let durationMultiplier = 1;
        if (month >= driftStartMonth) {
            // Gradual increase from baseline to degraded
            const progress = (month - driftStartMonth) / (totalMonths - driftStartMonth);
            durationMultiplier = 1 + progress * (degradedDuration / baselineDuration - 1);
        }
        const currentDuration = baselineDuration * durationMultiplier;
        for (let i = 0; i < eventsPerMonth; i++) {
            const activity = rng.nextItem(activities);
            const isBottleneck = activity === bottleneckActivity;
            const baseDur = isBottleneck ? currentDuration : baselineDuration / 2;
            const duration = rng.nextVariance(baseDur, variance);
            const day = Math.floor(month * 30 + i * 30 / eventsPerMonth);
            events.push({
                case_id: `case_${month}_${i}`,
                activity,
                timestamp: new Date(2026, month, day + 1, rng.nextInt(0, 23), rng.nextInt(0, 59)).toISOString(),
                'lifecycle:transition': 'complete',
                duration_ms: Math.floor(duration)
            });
        }
    }
    return { events, driftStartMonth, bottleneckActivity };
}
/**
 * Generate event log with hidden rework loops.
 *
 * Business scenario: A manufacturing line with invisible rework.
 * Hidden truth: Which loops exist, their frequencies.
 *
 * @returns events + hidden ground truth (reworkLoops with actual frequencies)
 */
export function generateReworkLog(config) {
    const rng = new SeededRNG(config.seed || 123);
    const events = [];
    const { process, reworkLoops, reworkCost, caseCount } = config;
    // Track actual rework frequencies
    const reworkCounts = new Map();
    for (const loop of reworkLoops) {
        reworkCounts.set(`${loop.from}->${loop.to}`, 0);
    }
    let totalEvents = 0;
    for (let caseIdx = 0; caseIdx < caseCount; caseIdx++) {
        let sequence = [...process];
        let eventIdx = 0;
        for (let activityIdx = 0; activityIdx < sequence.length; activityIdx++) {
            const activity = sequence[activityIdx];
            events.push({
                case_id: `case_${caseIdx}`,
                activity,
                timestamp: new Date(2026, 0, 1, 0, 0, totalEvents * 1000).toISOString(),
                'lifecycle:transition': 'complete'
            });
            totalEvents++;
            eventIdx++;
            // Check for rework loops
            for (const loop of reworkLoops) {
                if (activity === loop.from && rng.nextBool(loop.probability)) {
                    // Record rework
                    const key = `${loop.from}->${loop.to}`;
                    reworkCounts.set(key, (reworkCounts.get(key) || 0) + 1);
                    // Insert rework activity with cost
                    events.push({
                        case_id: `case_${caseIdx}`,
                        activity: loop.to,
                        timestamp: new Date(2026, 0, 1, 0, 0, totalEvents * 1000).toISOString(),
                        'lifecycle:transition': 'complete',
                        duration_ms: reworkCost,
                        rework: true
                    });
                    totalEvents++;
                    eventIdx++;
                    // Repeat current activity after rework
                    activityIdx--; // Will repeat in next iteration
                    break;
                }
            }
        }
    }
    // Calculate actual frequencies
    const actualLoops = reworkLoops.map(loop => ({
        from: loop.from,
        to: loop.to,
        frequency: (reworkCounts.get(`${loop.from}->${loop.to}`) || 0) / caseCount
    }));
    return { events, reworkLoops: actualLoops };
}
/**
 * Generate diverse event logs for RL training.
 *
 * Business scenario: Different process types and sizes for agent selection.
 * Hidden truth: None (this is training data, not a test).
 *
 * @returns array of event logs
 */
export function generateDiverseLogs(config) {
    const rng = new SeededRNG(config.seed || 456);
    const logs = [];
    for (let i = 0; i < config.count; i++) {
        const size = rng.nextInt(config.sizeRange[0], config.sizeRange[1]);
        const complexity = rng.next() * (config.complexityRange[1] - config.complexityRange[0]) + config.complexityRange[0];
        const numActivities = Math.max(3, Math.floor(config.activities.length * complexity));
        const log = [];
        for (let j = 0; j < size; j++) {
            log.push({
                case_id: `case_${i}_${j % Math.ceil(size / 10)}`, // Group into cases
                activity: rng.nextItem(config.activities.slice(0, numActivities)),
                timestamp: new Date(2026, 0, 1, 0, 0, j * 100).toISOString(),
                'lifecycle:transition': 'complete'
            });
        }
        logs.push(log);
    }
    return logs;
}
/**
 * Generate event log with deviations from expected model.
 *
 * Business scenario: Process should follow model but has hidden deviations.
 * Hidden truth: Which deviations occurred, how many times.
 *
 * @returns events + hidden ground truth
 */
export function generateDeviatingLog(config) {
    const rng = new SeededRNG(config.seed || 789);
    const events = [];
    const { model, deviations, caseCount } = config;
    // Track actual deviation counts
    const deviationCounts = new Map();
    for (const dev of deviations) {
        deviationCounts.set(dev.type, 0);
    }
    for (let caseIdx = 0; caseIdx < caseCount; caseIdx++) {
        let sequence = [...model];
        // Apply deviations (may apply multiple)
        for (const dev of deviations) {
            if (rng.nextBool(dev.probability)) {
                if (dev.type === 'skip' && dev.from && dev.to) {
                    const idx = sequence.indexOf(dev.from);
                    if (idx !== -1 && idx + 1 < sequence.length && sequence[idx + 1] === dev.to) {
                        sequence.splice(idx, 1); // Skip 'from'
                        deviationCounts.set('skip', (deviationCounts.get('skip') || 0) + 1);
                    }
                }
                else if (dev.type === 'repeat' && dev.activity) {
                    const idx = sequence.indexOf(dev.activity);
                    if (idx !== -1) {
                        sequence.splice(idx, 0, dev.activity); // Add duplicate before
                        deviationCounts.set('repeat', (deviationCounts.get('repeat') || 0) + 1);
                    }
                }
                else if (dev.type === 'insert' && dev.from && dev.insert && dev.to) {
                    const idx = sequence.indexOf(dev.from);
                    if (idx !== -1 && idx + 1 < sequence.length && sequence[idx + 1] === dev.to) {
                        sequence.splice(idx + 1, 0, dev.insert); // Insert between
                        deviationCounts.set('insert', (deviationCounts.get('insert') || 0) + 1);
                    }
                }
            }
        }
        // Generate events from final sequence
        for (let activityIdx = 0; activityIdx < sequence.length; activityIdx++) {
            events.push({
                case_id: `case_${caseIdx}`,
                activity: sequence[activityIdx],
                timestamp: new Date(2026, 0, 1, 0, 0, activityIdx * 1000).toISOString(),
                'lifecycle:transition': 'complete'
            });
        }
    }
    // Return actual deviation counts
    const actualDeviations = Array.from(deviationCounts.entries()).map(([type, count]) => ({
        type,
        count
    }));
    return { events, deviations: actualDeviations };
}
/**
 * Generate seasonal retail log with hidden anomalies.
 *
 * Business scenario: Normal seasonal patterns with rare anomalies.
 * Hidden truth: Which case IDs are anomalous, why.
 *
 * @returns events + hidden anomalous case IDs
 */
export function generateSeasonalLog(config) {
    const rng = new SeededRNG(config.seed || 101112);
    const events = [];
    const anomalousCaseIds = new Set();
    const { baseline, seasonal, anomalies, days, activities } = config;
    let caseIdx = 0;
    const cycleTimeAnomaly = anomalies.find(a => a.type === 'cycle_time');
    const sequenceAnomaly = anomalies.find(a => a.type === 'sequence');
    for (let day = 0; day < days; day++) {
        const isSeasonal = day === seasonal.day;
        const ordersPerDay = isSeasonal ? baseline.ordersPerDay * seasonal.multiplier : baseline.ordersPerDay;
        for (let order = 0; order < ordersPerDay; order++) {
            const caseId = `case_${caseIdx}`;
            let currentActivities = [...activities];
            // Check for cycle time anomaly
            let cycleTimeMultiplier = 1;
            if (cycleTimeAnomaly && anomalousCaseIds.size < (cycleTimeAnomaly.count || 0)) {
                if (rng.nextBool(cycleTimeAnomaly.probability || 0.05)) {
                    cycleTimeMultiplier = (cycleTimeAnomaly.threshold || 0) / baseline.cycleTime;
                    anomalousCaseIds.add(caseId);
                }
            }
            // Check for sequence anomaly
            if (sequenceAnomaly && anomalousCaseIds.size < (cycleTimeAnomaly?.count || 0) + (sequenceAnomaly.count || 0)) {
                if (rng.nextBool(sequenceAnomaly.probability || 0.05)) {
                    currentActivities.push('ERROR');
                    anomalousCaseIds.add(caseId);
                }
            }
            // Generate events
            for (let activityIdx = 0; activityIdx < currentActivities.length; activityIdx++) {
                const activity = currentActivities[activityIdx];
                const cycleTime = baseline.cycleTime * cycleTimeMultiplier;
                events.push({
                    case_id: caseId,
                    activity,
                    timestamp: new Date(2026, 0, day + 1, rng.nextInt(0, 23), rng.nextInt(0, 59)).toISOString(),
                    'lifecycle:transition': 'complete',
                    duration_ms: Math.floor(cycleTime * (1 + (rng.next() - 0.5) * 0.2))
                });
            }
            caseIdx++;
        }
    }
    return { events, anomalousCaseIds };
}
/**
 * Count deviations manually from exported log.
 *
 * This is a VERIFICATION function — it proves the conformance result
 * by mining the event log yourself rather than trusting the algorithm output.
 */
export function countManualDeviations(log, expectedModel) {
    const cases = new Map();
    // Group events by case
    for (const event of log) {
        const caseId = event.case_id;
        if (!cases.has(caseId)) {
            cases.set(caseId, []);
        }
        cases.get(caseId).push(event);
    }
    let deviationCount = 0;
    // Check each case for deviations
    for (const [caseId, events] of cases) {
        const sequence = events.map((e) => e.activity);
        const sequenceStr = JSON.stringify(sequence);
        const modelStr = JSON.stringify(expectedModel);
        if (sequenceStr !== modelStr) {
            deviationCount++;
        }
    }
    return deviationCount;
}
/**
 * Verify that a flagged anomaly is actually anomalous.
 *
 * This is a VERIFICATION function — it proves the ML anomaly detection
 * by checking the actual case data.
 */
export function verifyAnomaly(log, caseId, expectedCycleTimeThreshold, expectedValidSequences) {
    // Find all events for this case
    const caseEvents = log.filter(e => e.case_id === caseId);
    if (caseEvents.length === 0) {
        return { isAnomalous: false, reason: 'Case not found' };
    }
    // Check cycle time
    if (expectedCycleTimeThreshold) {
        const totalDuration = caseEvents.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
        if (totalDuration > expectedCycleTimeThreshold) {
            return { isAnomalous: true, reason: `Cycle time ${totalDuration}ms exceeds threshold ${expectedCycleTimeThreshold}ms` };
        }
    }
    // Check sequence
    if (expectedValidSequences) {
        const sequence = caseEvents.map(e => e.activity);
        const sequenceStr = JSON.stringify(sequence);
        const isValid = expectedValidSequences.some(seq => JSON.stringify(seq) === sequenceStr);
        if (!isValid) {
            return { isAnomalous: true, reason: `Invalid sequence: ${sequence.join(' → ')}` };
        }
    }
    return { isAnomalous: false, reason: 'No anomaly detected' };
}
//# sourceMappingURL=jtbd-generators.js.map