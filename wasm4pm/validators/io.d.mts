#!/usr/bin/env node
export function validateIO(): Promise<{
    surface: string;
    timestamp: string;
    tests: {
        name: string;
        pass: boolean;
    }[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=io.d.mts.map