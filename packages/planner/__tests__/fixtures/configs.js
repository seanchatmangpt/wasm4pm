export const fastConfig = {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
};
export const balancedConfig = {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'balanced' },
};
export const qualityConfig = {
    version: '1.0',
    source: { format: 'csv' },
    execution: { profile: 'quality' },
};
export const researchConfig = {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'research' },
};
export const streamConfig = {
    version: '1.0',
    source: { format: 'json' },
    execution: { profile: 'stream' },
};
export const fullConfig = {
    version: '1.0',
    source: { format: 'xes', content: '<xml>sample</xml>' },
    execution: {
        profile: 'balanced',
        mode: 'sync',
        maxEvents: 50000,
        maxMemoryMB: 512,
        timeoutMs: 30000,
        parameters: { threshold: 0.5, minSupport: 0.1 },
    },
    output: {
        generateReports: true,
        includeMetrics: true,
        format: 'json',
    },
    metadata: {
        name: 'Test Pipeline',
        description: 'Integration test configuration',
        tags: ['test', 'ci'],
    },
};
export const configWithSink = {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
    output: { format: 'parquet', generateReports: false },
};
export const invalidConfigs = {
    nullConfig: null,
    noVersion: { source: { format: 'xes' }, execution: { profile: 'fast' } },
    badVersion: { version: '2.0', source: { format: 'xes' }, execution: { profile: 'fast' } },
    noSource: { version: '1.0', execution: { profile: 'fast' } },
    noProfile: { version: '1.0', source: { format: 'xes' } },
};
//# sourceMappingURL=configs.js.map