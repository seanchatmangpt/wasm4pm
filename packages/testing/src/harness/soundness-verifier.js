/**
 * Agent 4: Soundness Verifier
 *
 * Verifies van der Aalst soundness properties:
 * 1. Deadlock-free: No circular waits
 * 2. Liveness: All activities eventually complete
 * 3. Boundedness: Resource consumption is bounded
 */
export class SoundnessVerifier {
    async verify(ocel) {
        const deadlockCheck = this.checkDeadlockFree(ocel);
        const livenessCheck = this.checkLiveness(ocel);
        const boundednessCheck = this.checkBoundedness(ocel);
        const verdict = deadlockCheck.deadlockFree && livenessCheck.liveness && boundednessCheck.bounded
            ? 'SOUND'
            : 'UNSOUND';
        return {
            verdict,
            deadlockFree: deadlockCheck.deadlockFree,
            deadlockCycles: deadlockCheck.cycles,
            liveness: livenessCheck.liveness,
            incompleteTasks: livenessCheck.incomplete,
            bounded: boundednessCheck.bounded,
            maxQueueDepth: boundednessCheck.maxQueueDepth,
            maxMemoryMb: boundednessCheck.maxMemoryMb,
        };
    }
    checkDeadlockFree(ocel) {
        // Build wait-for graph from events
        const waitGraph = new Map();
        for (const event of ocel.events) {
            const waitingFor = event.attributes?.['waiting_for'];
            const resource = event.attributes?.['resource'];
            if (waitingFor && resource) {
                const processId = event.objects[0];
                if (!waitGraph.has(processId)) {
                    waitGraph.set(processId, new Set());
                }
                waitGraph.get(processId).add(String(waitingFor));
            }
        }
        // Detect cycles in wait-for graph (simplified)
        const cycles = [];
        const visited = new Set();
        for (const [process] of waitGraph) {
            if (visited.has(process))
                continue;
            const path = [process];
            const inPath = new Set([process]);
            let current = process;
            while (waitGraph.has(current)) {
                const waiting = Array.from(waitGraph.get(current))[0];
                if (inPath.has(waiting)) {
                    // Cycle detected
                    const cycleStart = path.indexOf(waiting);
                    cycles.push(path.slice(cycleStart).concat([waiting]));
                    break;
                }
                path.push(waiting);
                inPath.add(waiting);
                current = waiting;
            }
            visited.add(process);
        }
        return {
            deadlockFree: cycles.length === 0,
            cycles,
        };
    }
    checkLiveness(ocel) {
        // Liveness: all objects must reach terminal state
        const incomplete = [];
        for (const obj of ocel.objects) {
            if (obj.state !== 'completed' && obj.state !== 'failed') {
                incomplete.push(obj.id);
            }
        }
        // Also check for loops (same activity repeating without progress)
        const activitySequence = ocel.events.map((e) => e.activity);
        const maxLoopSize = Math.min(activitySequence.length, 100);
        for (let loopSize = 2; loopSize <= maxLoopSize; loopSize++) {
            for (let i = 0; i < activitySequence.length - loopSize * 2; i++) {
                const loop = activitySequence.slice(i, i + loopSize);
                const next = activitySequence.slice(i + loopSize, i + loopSize * 2);
                if (JSON.stringify(loop) === JSON.stringify(next)) {
                    // Detected repeating pattern with no completion
                    if (incomplete.length === 0) {
                        incomplete.push('detected_loop');
                    }
                    break;
                }
            }
        }
        return {
            liveness: incomplete.length === 0,
            incomplete,
        };
    }
    checkBoundedness(ocel) {
        // Boundedness: check for unbounded growth
        let maxQueueDepth = 0;
        const queueGrowth = [];
        for (const event of ocel.events) {
            const depth = event.attributes?.['queue_depth'];
            if (depth !== undefined) {
                queueGrowth.push(depth);
                maxQueueDepth = Math.max(maxQueueDepth, depth);
            }
        }
        // If we have queue depth tracking, check for linear growth (unbounded)
        let isBounded = true;
        if (queueGrowth.length > 10) {
            const growthRate = (queueGrowth[queueGrowth.length - 1] - queueGrowth[0]) / (queueGrowth.length - 1);
            if (growthRate > 0.5) {
                isBounded = false; // Linear growth indicates unboundedness
            }
        }
        // Estimate memory usage (rough)
        const maxMemoryMb = (ocel.events.length * 2 + ocel.objects.length * 5) / 1000; // Very rough estimate
        return {
            bounded: isBounded,
            maxQueueDepth: Math.max(maxQueueDepth, ocel.events.length),
            maxMemoryMb,
        };
    }
}
//# sourceMappingURL=soundness-verifier.js.map