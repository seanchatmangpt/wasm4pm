/**
 * Agent 3: Conformance Checker
 *
 * Validates observed behavior against the discovered model.
 * Traces through OCEL log using the discovered DFG, flags deviations.
 */
export class ConformanceChecker {
    /**
     * Discover a simple DFG-based model from the log
     */
    discoverModel(ocel) {
        const activities = new Set();
        const directlyFollows = new Map();
        const startActivities = new Set();
        const endActivities = new Set();
        // Group events by trace (using first object in each event as trace identifier)
        const traces = new Map();
        for (const event of ocel.events) {
            const traceKey = event.objects[0] ?? 'unknown';
            if (!traces.has(traceKey)) {
                traces.set(traceKey, []);
            }
            traces.get(traceKey).push(event);
        }
        // Process each trace to extract control flow
        for (const [_, traceEvents] of traces) {
            const sorted = [...traceEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            for (let i = 0; i < sorted.length; i++) {
                const activity = sorted[i].activity;
                activities.add(activity);
                if (i === 0) {
                    startActivities.add(activity);
                }
                if (i === sorted.length - 1) {
                    endActivities.add(activity);
                }
                if (i > 0) {
                    const prevActivity = sorted[i - 1].activity;
                    if (!directlyFollows.has(prevActivity)) {
                        directlyFollows.set(prevActivity, new Set());
                    }
                    directlyFollows.get(prevActivity).add(activity);
                }
            }
        }
        return {
            activities,
            directlyFollows,
            startActivities,
            endActivities,
        };
    }
    /**
     * Check conformance of each trace against the discovered model
     */
    async checkConformance(ocel, model) {
        const discoveredModel = model ?? this.discoverModel(ocel);
        const violations = [];
        let conformingEvents = 0;
        let violatingEvents = 0;
        let pathsDivergent = 0;
        // Group events by trace
        const traces = new Map();
        for (const event of ocel.events) {
            const traceKey = event.objects[0] ?? 'unknown';
            if (!traces.has(traceKey)) {
                traces.set(traceKey, []);
            }
            traces.get(traceKey).push(event);
        }
        // Check each trace
        for (const [traceId, traceEvents] of traces) {
            const sorted = [...traceEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            let traceConformant = true;
            for (let i = 0; i < sorted.length; i++) {
                const event = sorted[i];
                const activity = event.activity;
                // Check if first activity is in startActivities
                if (i === 0 && !discoveredModel.startActivities.has(activity)) {
                    violations.push({
                        traceId,
                        eventIndex: i,
                        activity,
                        expectedActivities: Array.from(discoveredModel.startActivities),
                        severity: 'high',
                        description: `Activity '${activity}' not in discovered start activities`,
                    });
                    violatingEvents++;
                    traceConformant = false;
                    continue;
                }
                // Check directly-follows relation
                if (i > 0) {
                    const prevActivity = sorted[i - 1].activity;
                    const allowedFollowers = discoveredModel.directlyFollows.get(prevActivity) ?? new Set();
                    if (!allowedFollowers.has(activity)) {
                        violations.push({
                            traceId,
                            eventIndex: i,
                            activity,
                            expectedActivities: Array.from(allowedFollowers),
                            severity: 'medium',
                            description: `Activity '${activity}' does not follow '${prevActivity}' in discovered model`,
                        });
                        violatingEvents++;
                        traceConformant = false;
                        continue;
                    }
                }
                conformingEvents++;
            }
            if (!traceConformant) {
                pathsDivergent++;
            }
        }
        const totalEvents = ocel.events.length;
        const fitness = totalEvents > 0 ? conformingEvents / totalEvents : 0;
        // Precision: how much of the model is actually used in the log
        // Simple metric: (edges observed in log) / (edges possible in model)
        const possibleEdges = Array.from(discoveredModel.directlyFollows.values()).reduce((sum, followers) => sum + followers.size, 0);
        const observedEdges = new Set();
        for (const traceEvents of traces.values()) {
            const sorted = [...traceEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            for (let i = 1; i < sorted.length; i++) {
                observedEdges.add(`${sorted[i - 1].activity}->${sorted[i].activity}`);
            }
        }
        const precision = possibleEdges > 0 ? observedEdges.size / possibleEdges : 1;
        return {
            conformant: violations.length === 0,
            fitness: Math.min(1, fitness),
            precision: Math.min(1, precision),
            violations,
            totalEvents,
            conformingEvents,
            violatingEvents,
            pathsDivergent,
        };
    }
}
//# sourceMappingURL=conformance-checker.js.map