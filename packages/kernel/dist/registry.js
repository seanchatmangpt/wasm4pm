/**
 * registry.ts
 * Algorithm registry for wasm4pm process mining algorithms
 * Maintains metadata, profiles, and execution configuration for all 15+ discovery algorithms
 */
/**
 * Algorithm registry - manages all known algorithms
 */
export class AlgorithmRegistry {
    constructor() {
        this.algorithms = new Map();
        this.profileMap = new Map();
        this.registerAllAlgorithms();
        this.buildProfileMap();
    }
    /**
     * Register all wasm4pm algorithms
     */
    registerAllAlgorithms() {
        // Basic discovery - Directly Follows Graph
        this.register({
            id: 'dfg',
            name: 'DFG (Directly Follows Graph)',
            description: 'Discovers a directly-follows graph from an event log. Fastest algorithm with minimal memory overhead.',
            outputType: 'dfg',
            complexity: 'O(n)',
            speedTier: 5,
            qualityTier: 30,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
            ],
            supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
            estimatedDurationMs: 0.5,
            estimatedMemoryMB: 20,
            robustToNoise: true,
            scalesWell: true,
        });
        // Process Skeleton
        this.register({
            id: 'process_skeleton',
            name: 'Process Skeleton',
            description: 'Discovers a minimal process skeleton with start and end activities. Very fast.',
            outputType: 'dfg',
            complexity: 'O(n)',
            speedTier: 3,
            qualityTier: 25,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
            ],
            supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
            estimatedDurationMs: 0.3,
            estimatedMemoryMB: 10,
            robustToNoise: true,
            scalesWell: true,
        });
        // Alpha++ (improved Alpha algorithm)
        this.register({
            id: 'alpha_plus_plus',
            name: 'Alpha++ (Improved Alpha)',
            description: 'Enhanced version of classic Alpha algorithm. Discovers place-transition Petri nets with better noise handling.',
            outputType: 'petrinet',
            complexity: 'O(n²)',
            speedTier: 20,
            qualityTier: 45,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 5,
            estimatedMemoryMB: 100,
            robustToNoise: false,
            scalesWell: false,
        });
        // Heuristic Miner
        this.register({
            id: 'heuristic_miner',
            name: 'Heuristic Miner',
            description: 'Discovers models from real-world logs with noise. Uses dependency threshold to filter weak dependencies.',
            outputType: 'dfg',
            complexity: 'O(n²)',
            speedTier: 25,
            qualityTier: 50,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'dependency_threshold',
                    type: 'number',
                    description: 'Threshold for dependency ratio (0-1)',
                    required: false,
                    default: 0.5,
                    min: 0,
                    max: 1,
                },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 10,
            estimatedMemoryMB: 150,
            robustToNoise: true,
            scalesWell: true,
        });
        // Inductive Miner
        this.register({
            id: 'inductive_miner',
            name: 'Inductive Miner',
            description: 'Recursively partitions event log to discover process trees. Handles noise well.',
            outputType: 'tree',
            complexity: 'O(n log n)',
            speedTier: 30,
            qualityTier: 55,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'noise_threshold',
                    type: 'number',
                    description: 'Infrequent behavior threshold (0-1)',
                    required: false,
                    default: 0.2,
                    min: 0,
                    max: 1,
                },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 15,
            estimatedMemoryMB: 180,
            robustToNoise: true,
            scalesWell: true,
        });
        // Genetic Algorithm
        this.register({
            id: 'genetic_algorithm',
            name: 'Genetic Algorithm',
            description: 'Uses evolutionary computation to discover high-quality models. Best quality for complex processes.',
            outputType: 'petrinet',
            complexity: 'Exponential',
            speedTier: 75,
            qualityTier: 80,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'population_size',
                    type: 'number',
                    description: 'Population size for genetic algorithm',
                    required: false,
                    default: 50,
                    min: 10,
                    max: 500,
                },
                {
                    name: 'generations',
                    type: 'number',
                    description: 'Number of generations to evolve',
                    required: false,
                    default: 100,
                    min: 10,
                    max: 1000,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 40,
            estimatedMemoryMB: 250,
            robustToNoise: true,
            scalesWell: false,
        });
        // PSO (Particle Swarm Optimization)
        this.register({
            id: 'pso',
            name: 'Particle Swarm Optimization (PSO)',
            description: 'Swarm-based algorithm for discovering Petri nets. Balances exploration and exploitation.',
            outputType: 'petrinet',
            complexity: 'Exponential',
            speedTier: 70,
            qualityTier: 75,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'swarm_size',
                    type: 'number',
                    description: 'Number of particles',
                    required: false,
                    default: 30,
                    min: 10,
                    max: 300,
                },
                {
                    name: 'iterations',
                    type: 'number',
                    description: 'Number of iterations',
                    required: false,
                    default: 50,
                    min: 10,
                    max: 500,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 35,
            estimatedMemoryMB: 220,
            robustToNoise: true,
            scalesWell: false,
        });
        // A* Search
        this.register({
            id: 'a_star',
            name: 'A* Search',
            description: 'Heuristic search algorithm for discovering optimal or near-optimal Petri nets.',
            outputType: 'petrinet',
            complexity: 'Exponential',
            speedTier: 60,
            qualityTier: 70,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'max_iterations',
                    type: 'number',
                    description: 'Maximum search iterations',
                    required: false,
                    default: 10000,
                    min: 1000,
                    max: 100000,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 50,
            estimatedMemoryMB: 200,
            robustToNoise: false,
            scalesWell: false,
        });
        // Hill Climbing
        this.register({
            id: 'hill_climbing',
            name: 'Hill Climbing',
            description: 'Greedy local search for Petri net discovery. Fast with reasonable quality.',
            outputType: 'petrinet',
            complexity: 'O(n²)',
            speedTier: 40,
            qualityTier: 55,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'max_iterations',
                    type: 'number',
                    description: 'Maximum iterations for hill climbing',
                    required: false,
                    default: 100,
                    min: 10,
                    max: 1000,
                },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 20,
            estimatedMemoryMB: 150,
            robustToNoise: true,
            scalesWell: true,
        });
        // ILP (Integer Linear Programming)
        this.register({
            id: 'ilp',
            name: 'ILP (Integer Linear Programming)',
            description: 'Optimal model discovery using integer programming. Best theoretical quality, slower.',
            outputType: 'petrinet',
            complexity: 'NP-Hard',
            speedTier: 80,
            qualityTier: 90,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'timeout_seconds',
                    type: 'number',
                    description: 'Timeout for solver in seconds',
                    required: false,
                    default: 30,
                    min: 1,
                    max: 300,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 20,
            estimatedMemoryMB: 300,
            robustToNoise: false,
            scalesWell: false,
        });
        // Ant Colony Optimization (ACO)
        this.register({
            id: 'aco',
            name: 'Ant Colony Optimization (ACO)',
            description: 'Swarm intelligence algorithm inspired by ant pheromones. Discovers high-quality Petri nets.',
            outputType: 'petrinet',
            complexity: 'Exponential',
            speedTier: 65,
            qualityTier: 75,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'colony_size',
                    type: 'number',
                    description: 'Number of ants',
                    required: false,
                    default: 40,
                    min: 10,
                    max: 500,
                },
                {
                    name: 'iterations',
                    type: 'number',
                    description: 'Number of iterations',
                    required: false,
                    default: 100,
                    min: 10,
                    max: 1000,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 45,
            estimatedMemoryMB: 200,
            robustToNoise: true,
            scalesWell: false,
        });
        // Simulated Annealing
        this.register({
            id: 'simulated_annealing',
            name: 'Simulated Annealing',
            description: 'Probabilistic technique for finding near-optimal Petri net models.',
            outputType: 'petrinet',
            complexity: 'Exponential',
            speedTier: 55,
            qualityTier: 65,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'initial_temperature',
                    type: 'number',
                    description: 'Initial temperature',
                    required: false,
                    default: 100,
                    min: 1,
                    max: 1000,
                },
                {
                    name: 'cooling_rate',
                    type: 'number',
                    description: 'Temperature cooling rate',
                    required: false,
                    default: 0.95,
                    min: 0.8,
                    max: 0.99,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 30,
            estimatedMemoryMB: 180,
            robustToNoise: true,
            scalesWell: false,
        });
        // Declare (constraint-based)
        this.register({
            id: 'declare',
            name: 'Declare (Constraints)',
            description: 'Discovers declarative (constraint-based) process models. Good for flexible processes.',
            outputType: 'declare',
            complexity: 'O(n²)',
            speedTier: 35,
            qualityTier: 50,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'support_threshold',
                    type: 'number',
                    description: 'Minimum support for constraints (0-1)',
                    required: false,
                    default: 0.8,
                    min: 0,
                    max: 1,
                },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 12,
            estimatedMemoryMB: 120,
            robustToNoise: true,
            scalesWell: true,
        });
        // Optimized DFG (ILP variant)
        this.register({
            id: 'optimized_dfg',
            name: 'Optimized DFG (ILP)',
            description: 'ILP-based DFG optimization. Minimal model with best fitness.',
            outputType: 'dfg',
            complexity: 'NP-Hard',
            speedTier: 70,
            qualityTier: 85,
            parameters: [
                {
                    name: 'activity_key',
                    type: 'string',
                    description: 'Event attribute key for activity names',
                    required: true,
                    default: 'concept:name',
                },
                {
                    name: 'timeout_seconds',
                    type: 'number',
                    description: 'Solver timeout in seconds',
                    required: false,
                    default: 15,
                    min: 1,
                    max: 300,
                },
            ],
            supportedProfiles: ['quality'],
            estimatedDurationMs: 15,
            estimatedMemoryMB: 250,
            robustToNoise: false,
            scalesWell: false,
        });
        // ── ML Analysis ──────────────────────────────────────────
        this.register({
            id: 'ml_classify',
            name: 'ML Trace Classification',
            description: 'Classify traces by outcome using k-NN, logistic regression, decision tree, or naive Bayes.',
            outputType: 'ml_result',
            complexity: 'O(n²)',
            speedTier: 40,
            qualityTier: 60,
            parameters: [
                { name: 'activity_key', type: 'string', description: 'Event attribute key for activity names', required: true, default: 'concept:name' },
                { name: 'method', type: 'select', description: 'Classification method', required: false, default: 'knn', options: ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'] },
                { name: 'k', type: 'number', description: 'Number of neighbors for k-NN', required: false, default: 5, min: 1, max: 50 },
                { name: 'target_key', type: 'string', description: 'Target variable key for classification', required: false, default: 'outcome' },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 25,
            estimatedMemoryMB: 50,
            robustToNoise: true,
            scalesWell: true,
        });
        this.register({
            id: 'ml_cluster',
            name: 'ML Trace Clustering',
            description: 'Cluster traces by similarity using k-means or DBSCAN.',
            outputType: 'ml_result',
            complexity: 'O(n²)',
            speedTier: 35,
            qualityTier: 55,
            parameters: [
                { name: 'activity_key', type: 'string', description: 'Activity key', required: true, default: 'concept:name' },
                { name: 'method', type: 'select', description: 'Clustering method', required: false, default: 'kmeans', options: ['kmeans', 'dbscan'] },
                { name: 'k', type: 'number', description: 'Number of clusters', required: false, default: 3, min: 2, max: 20 },
                { name: 'eps', type: 'number', description: 'DBSCAN epsilon', required: false, default: 1.0, min: 0.01, max: 100 },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 20,
            estimatedMemoryMB: 60,
            robustToNoise: true,
            scalesWell: true,
        });
        this.register({
            id: 'ml_forecast',
            name: 'ML Throughput Forecasting',
            description: 'Forecast future process throughput with trend analysis and seasonal decomposition.',
            outputType: 'ml_result',
            complexity: 'O(n log n)',
            speedTier: 30,
            qualityTier: 50,
            parameters: [
                { name: 'activity_key', type: 'string', description: 'Activity key', required: true, default: 'concept:name' },
                { name: 'forecast_periods', type: 'number', description: 'Future periods to forecast', required: false, default: 5, min: 1, max: 50 },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 15,
            estimatedMemoryMB: 30,
            robustToNoise: false,
            scalesWell: true,
        });
        this.register({
            id: 'ml_anomaly',
            name: 'ML Anomaly Detection',
            description: 'Detect anomalous process windows using peak finding and seasonal decomposition on drift distances.',
            outputType: 'ml_result',
            complexity: 'O(n log n)',
            speedTier: 30,
            qualityTier: 55,
            parameters: [
                { name: 'activity_key', type: 'string', description: 'Activity key', required: true, default: 'concept:name' },
                { name: 'smoothing_method', type: 'select', description: 'Smoothing algorithm', required: false, default: 'sma', options: ['sma', 'ema'] },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 15,
            estimatedMemoryMB: 30,
            robustToNoise: true,
            scalesWell: true,
        });
        this.register({
            id: 'ml_regress',
            name: 'ML Remaining Time Regression',
            description: 'Predict remaining case time using linear, polynomial, or exponential regression.',
            outputType: 'ml_result',
            complexity: 'O(n)',
            speedTier: 25,
            qualityTier: 50,
            parameters: [
                { name: 'activity_key', type: 'string', description: 'Activity key', required: true, default: 'concept:name' },
                { name: 'method', type: 'select', description: 'Regression method', required: false, default: 'linear_regression', options: ['linear_regression', 'polynomial_regression', 'exponential_regression'] },
                { name: 'target_key', type: 'string', description: 'Target variable', required: false, default: 'remaining_time' },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 10,
            estimatedMemoryMB: 40,
            robustToNoise: false,
            scalesWell: true,
        });
        this.register({
            id: 'ml_pca',
            name: 'ML PCA Feature Reduction',
            description: 'Reduce high-dimensional trace features using Principal Component Analysis.',
            outputType: 'ml_result',
            complexity: 'O(n * d²)',
            speedTier: 35,
            qualityTier: 50,
            parameters: [
                { name: 'activity_key', type: 'string', description: 'Activity key', required: true, default: 'concept:name' },
                { name: 'n_components', type: 'number', description: 'Number of PCA components', required: false, default: 2, min: 1, max: 50 },
            ],
            supportedProfiles: ['balanced', 'quality'],
            estimatedDurationMs: 20,
            estimatedMemoryMB: 50,
            robustToNoise: false,
            scalesWell: true,
        });
    }
    /**
     * Register a single algorithm
     */
    register(metadata) {
        this.algorithms.set(metadata.id, metadata);
    }
    /**
     * Get algorithm by ID
     */
    get(algorithmId) {
        return this.algorithms.get(algorithmId);
    }
    /**
     * List all algorithms
     */
    list() {
        return Array.from(this.algorithms.values());
    }
    /**
     * Get algorithms for a profile
     */
    getForProfile(profile) {
        const ids = this.profileMap.get(profile) || [];
        return ids.map((id) => this.algorithms.get(id)).filter((a) => a !== undefined);
    }
    /**
     * Build profile map from algorithm registrations
     */
    buildProfileMap() {
        const profileMap = new Map();
        const profiles = ['fast', 'balanced', 'quality', 'stream'];
        for (const profile of profiles) {
            profileMap.set(profile, new Set());
        }
        for (const [id, metadata] of this.algorithms) {
            for (const profile of metadata.supportedProfiles) {
                const set = profileMap.get(profile);
                if (set) {
                    set.add(id);
                }
            }
        }
        // Convert sets to arrays
        for (const [profile, set] of profileMap) {
            this.profileMap.set(profile, Array.from(set));
        }
    }
    /**
     * Suggest best algorithm for a profile and log size
     */
    suggestForProfile(profile, logSize) {
        const algorithms = this.getForProfile(profile);
        if (algorithms.length === 0) {
            return undefined;
        }
        // For very small logs, prefer speed
        // For medium logs, balance speed and quality
        // For large logs, prefer algorithms that scale well
        const isSmallLog = logSize < 1000;
        const isLargeLog = logSize > 100000;
        let candidates = algorithms;
        if (isLargeLog) {
            candidates = candidates.filter((a) => a.scalesWell);
        }
        if (candidates.length === 0) {
            candidates = algorithms;
        }
        // Sort by: quality tier (desc) and speed tier (asc)
        candidates.sort((a, b) => {
            if (b.qualityTier !== a.qualityTier) {
                return b.qualityTier - a.qualityTier; // higher quality first
            }
            return a.speedTier - b.speedTier; // lower speed (faster) first
        });
        return candidates[0];
    }
}
/**
 * Create a singleton registry instance
 */
let registryInstance = null;
/**
 * Get or create the global algorithm registry
 */
export function getRegistry() {
    if (!registryInstance) {
        registryInstance = new AlgorithmRegistry();
    }
    return registryInstance;
}
//# sourceMappingURL=registry.js.map