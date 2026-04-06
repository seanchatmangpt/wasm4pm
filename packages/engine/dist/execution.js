/**
 * execution.ts
 * Plan execution engine with topological sort and step dispatch
 * Handles step execution, dependency tracking, and progress updates
 */
/**
 * Default step handler that always succeeds
 */
function defaultStepHandler(step) {
    return {
        stepId: step.id,
        success: true,
        output: {},
    };
}
/**
 * Validates plan structure before execution
 * Checks for:
 * - All steps have IDs
 * - All dependencies are satisfied
 * - No circular dependencies
 * - Topological sort is possible
 *
 * @param plan - The execution plan to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validatePlan(plan) {
    const errors = [];
    const stepIds = new Set(plan.steps.map((s) => s.id));
    // Check all steps have IDs
    for (let i = 0; i < plan.steps.length; i++) {
        if (!plan.steps[i].id) {
            errors.push(`Step at index ${i} has no ID`);
        }
    }
    // Check all dependencies exist
    for (const step of plan.steps) {
        if (step.dependencies) {
            for (const dep of step.dependencies) {
                if (!stepIds.has(dep)) {
                    errors.push(`Step ${step.id} depends on non-existent step: ${dep}`);
                }
            }
        }
    }
    // Check for cycles using DFS
    const hasCycleDFS = () => {
        const visited = new Set();
        const recursionStack = new Set();
        const dfs = (stepId) => {
            visited.add(stepId);
            recursionStack.add(stepId);
            const step = plan.steps.find((s) => s.id === stepId);
            if (step?.dependencies) {
                for (const dep of step.dependencies) {
                    if (!visited.has(dep)) {
                        if (dfs(dep)) {
                            return true;
                        }
                    }
                    else if (recursionStack.has(dep)) {
                        return true; // Back edge found
                    }
                }
            }
            recursionStack.delete(stepId);
            return false;
        };
        for (const step of plan.steps) {
            if (!visited.has(step.id)) {
                if (dfs(step.id)) {
                    return true;
                }
            }
        }
        return false;
    };
    if (hasCycleDFS()) {
        errors.push('Execution plan contains circular dependencies');
    }
    return errors;
}
/**
 * Topologically sorts steps in execution order
 * Uses Kahn's algorithm to compute the order
 *
 * @param plan - The execution plan
 * @returns Array of step IDs in execution order
 * @throws Error if the plan contains cycles
 */
export function topologicalSortPlan(plan) {
    const validationErrors = validatePlan(plan);
    if (validationErrors.length > 0) {
        throw new Error(`Invalid plan: ${validationErrors.join('; ')}`);
    }
    // Build in-degree map and adjacency list
    const inDegree = new Map();
    const adjacencyList = new Map();
    for (const step of plan.steps) {
        inDegree.set(step.id, 0);
        adjacencyList.set(step.id, []);
    }
    // Build reverse graph (edges point from dependency to dependent)
    for (const step of plan.steps) {
        if (step.dependencies) {
            for (const dep of step.dependencies) {
                const neighbors = adjacencyList.get(dep);
                if (neighbors) {
                    neighbors.push(step.id);
                }
                inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
            }
        }
    }
    // Find nodes with in-degree 0
    const queue = [];
    for (const step of plan.steps) {
        if (inDegree.get(step.id) === 0) {
            queue.push(step.id);
        }
    }
    // Process nodes in order
    const result = [];
    while (queue.length > 0) {
        const stepId = queue.shift();
        result.push(stepId);
        const dependents = adjacencyList.get(stepId) || [];
        for (const dependent of dependents) {
            inDegree.set(dependent, inDegree.get(dependent) - 1);
            if (inDegree.get(dependent) === 0) {
                queue.push(dependent);
            }
        }
    }
    // Check if all steps were processed (no cycles)
    if (result.length !== plan.steps.length) {
        throw new Error('Execution plan contains cycles');
    }
    return result;
}
/**
 * Executes a plan step by step
 * Respects dependencies and updates progress
 *
 * @param plan - The execution plan
 * @param dispatcher - Step handler dispatcher
 * @param runId - Unique run identifier
 * @param onProgress - Progress callback
 * @returns ExecutionReceipt with results
 */
export async function executePlan(plan, dispatcher, runId, onProgress) {
    const startedAt = new Date();
    const errors = [];
    const previousResults = new Map();
    let stepsCompleted = 0;
    let hasFatalError = false;
    try {
        // Validate plan before execution
        const validationErrors = validatePlan(plan);
        if (validationErrors.length > 0) {
            throw new Error(`Plan validation failed: ${validationErrors.join('; ')}`);
        }
        // Get execution order
        const executionOrder = topologicalSortPlan(plan);
        // Execute steps in order
        for (let i = 0; i < executionOrder.length; i++) {
            const stepId = executionOrder[i];
            const step = plan.steps.find((s) => s.id === stepId);
            // Update progress
            const progress = Math.round(((i + 1) / executionOrder.length) * 100);
            onProgress?.({
                state: 'running',
                progress,
                message: `Executing step ${i + 1}/${executionOrder.length}: ${step.name || step.id}`,
            });
            try {
                // Execute the step
                const context = {
                    planId: plan.planId,
                    runId,
                    stepIndex: i,
                    totalSteps: executionOrder.length,
                    previousResults: new Map(previousResults), // Provide snapshot
                };
                const result = await dispatcher.dispatch(step, context);
                previousResults.set(stepId, result);
                // Check if step failed
                if (!result.success) {
                    const error = result.error || {
                        code: 'STEP_FAILED',
                        message: `Step ${stepId} failed`,
                        severity: 'error',
                        recoverable: false,
                    };
                    errors.push(error);
                    onProgress?.({ error });
                    // Stop execution if required step failed
                    if (step.optional !== true) {
                        hasFatalError = true;
                        throw new Error(`Step ${stepId} failed: ${error.message}`);
                    }
                    // Continue if optional step failed
                }
                else {
                    stepsCompleted++;
                }
            }
            catch (err) {
                // Only handle errors from dispatch itself, not from result failures
                if (!hasFatalError) {
                    const error = {
                        code: 'STEP_EXECUTION_FAILED',
                        message: `Step ${stepId} failed: ${err instanceof Error ? err.message : String(err)}`,
                        severity: step.optional ? 'warning' : 'error',
                        recoverable: step.optional || false,
                        context: { stepId, stepName: step.name },
                    };
                    errors.push(error);
                    onProgress?.({ error });
                }
                // Stop execution if required step failed
                if (step.optional !== true) {
                    hasFatalError = true;
                    throw err;
                }
                // Continue if optional step failed
            }
        }
        // --- Prediction phase ---
        // After discovery steps, run prediction tasks if configured
        const predictionResults = {};
        if (plan.prediction && plan.prediction.tasks.length > 0) {
            const { tasks, activityKey, ngramOrder, driftWindowSize } = plan.prediction;
            onProgress?.({
                state: 'running',
                progress: 100,
                message: `Running prediction phase (${tasks.length} tasks)`,
            });
            // Step 1: Build n-gram predictor model
            const ngramStep = {
                id: 'prediction:build_ngram',
                name: 'build_ngram_predictor',
                inputs: { activityKey, ngramOrder },
                optional: true,
            };
            const ngramContext = {
                planId: plan.planId,
                runId,
                stepIndex: executionOrder.length,
                totalSteps: executionOrder.length + tasks.length + 1,
                previousResults: new Map(previousResults),
            };
            try {
                const ngramResult = await dispatcher.dispatch(ngramStep, ngramContext);
                previousResults.set(ngramStep.id, ngramResult);
                if (ngramResult.success) {
                    predictionResults['ngram_model'] = ngramResult.output;
                }
            }
            catch {
                // n-gram build is optional; continue with individual tasks
            }
            // Step 2: Run each requested prediction task
            for (let t = 0; t < tasks.length; t++) {
                const task = tasks[t];
                const predStep = {
                    id: `prediction:${task}`,
                    name: taskToKernelCall(task),
                    inputs: { activityKey, ngramOrder, driftWindowSize },
                    optional: true,
                };
                const predContext = {
                    planId: plan.planId,
                    runId,
                    stepIndex: executionOrder.length + 1 + t,
                    totalSteps: executionOrder.length + tasks.length + 1,
                    previousResults: new Map(previousResults),
                };
                try {
                    const result = await dispatcher.dispatch(predStep, predContext);
                    previousResults.set(predStep.id, result);
                    if (result.success) {
                        predictionResults[task] = result.output;
                    }
                    else if (result.error) {
                        errors.push(result.error);
                    }
                }
                catch (err) {
                    errors.push({
                        code: 'PREDICTION_TASK_FAILED',
                        message: `Prediction task '${task}' failed: ${err instanceof Error ? err.message : String(err)}`,
                        severity: 'warning',
                        recoverable: true,
                        context: { task },
                    });
                }
            }
        }
        const finishedAt = new Date();
        return {
            runId,
            planId: plan.planId,
            state: errors.length > 0 && !errors.every((e) => e.severity === 'warning') ? 'degraded' : 'ready',
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            progress: 100,
            errors,
            ...(Object.keys(predictionResults).length > 0 && { predictionResults }),
        };
    }
    catch (err) {
        const finishedAt = new Date();
        const fatalError = {
            code: 'PLAN_EXECUTION_FAILED',
            message: err instanceof Error ? err.message : String(err),
            severity: 'error',
            recoverable: false,
        };
        if (hasFatalError) {
            errors.push(fatalError);
        }
        else {
            errors.unshift(fatalError);
        }
        onProgress?.({ state: 'failed', error: fatalError });
        return {
            runId,
            planId: plan.planId,
            state: 'failed',
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            progress: Math.round((stepsCompleted / plan.totalSteps) * 100),
            errors,
        };
    }
}
/**
 * Maps a prediction task name to the corresponding kernel call name
 */
function taskToKernelCall(task) {
    switch (task) {
        case 'next_activity': return 'predict_next_activity';
        case 'remaining_time': return 'predict_case_duration';
        case 'outcome': return 'score_anomaly';
        case 'drift': return 'detect_drift';
        case 'features': return 'build_transition_probabilities';
        case 'resource': return 'estimate_queue_delay';
        default: return task;
    }
}
/**
 * Creates a step dispatcher that routes steps to handlers
 * Provides a default no-op handler for unknown step types
 */
export function createStepDispatcher(handlers) {
    return {
        async dispatch(step, context) {
            const handler = handlers.get(step.name || step.id) || defaultStepHandler;
            try {
                const startTime = Date.now();
                const result = await handler(step, context);
                const durationMs = Date.now() - startTime;
                return {
                    ...result,
                    durationMs,
                };
            }
            catch (err) {
                return {
                    stepId: step.id,
                    success: false,
                    error: {
                        code: 'STEP_HANDLER_ERROR',
                        message: err instanceof Error ? err.message : String(err),
                        severity: 'error',
                        recoverable: false,
                    },
                };
            }
        },
    };
}
