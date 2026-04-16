#!/usr/bin/env node
export function runAllValidators(config?: {}): Promise<{
    metadata: {
        timestamp: string;
        platform: NodeJS.Platform;
        nodeVersion: string;
        version: string;
    };
    validators: {};
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=index.d.mts.map