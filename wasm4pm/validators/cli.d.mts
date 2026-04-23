#!/usr/bin/env node
export function validateCLI(): Promise<{
    surface: string;
    timestamp: string;
    tests: {
        name: string;
        pass: any;
        code: any;
    }[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=cli.d.mts.map