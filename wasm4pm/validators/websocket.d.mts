#!/usr/bin/env node
export function validateWebSocket(baseUrl?: string): Promise<{
    surface: string;
    baseUrl: string;
    timestamp: string;
    tests: {
        name: string;
        pass: boolean;
        error: any;
    }[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=websocket.d.mts.map