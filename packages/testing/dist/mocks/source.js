/**
 * Mock SourceAdapter for testing without real file/network I/O.
 */
function ok(value) {
    return { type: 'ok', value };
}
function err(error) {
    return { type: 'err', error };
}
export class MockSourceAdapter {
    constructor(options = {}) {
        this.version = '1.0.0-mock';
        this.auth = undefined;
        this._opened = false;
        this._closed = false;
        /** Track calls for assertion */
        this.calls = [];
        this.kind = options.kind ?? 'mock';
        this._data = options.data ?? '{"traces":[]}';
        this._fingerprint = options.fingerprint ?? 'mock-fingerprint-abc123';
        this._shouldFailValidate = options.shouldFailValidate ?? false;
        this._shouldFailOpen = options.shouldFailOpen ?? false;
        this._validateDelay = options.validateDelay ?? 0;
        this._openDelay = options.openDelay ?? 0;
        this._capabilities = {
            streaming: false,
            random_access: false,
            watch: false,
            formats: ['json', 'xes'],
            ...options.capabilities,
        };
    }
    capabilities() {
        this.calls.push({ method: 'capabilities', timestamp: Date.now() });
        return this._capabilities;
    }
    async fingerprint() {
        this.calls.push({ method: 'fingerprint', timestamp: Date.now() });
        return this._fingerprint;
    }
    async validate() {
        this.calls.push({ method: 'validate', timestamp: Date.now() });
        if (this._validateDelay > 0) {
            await delay(this._validateDelay);
        }
        if (this._shouldFailValidate) {
            return err('Mock validation failure');
        }
        return ok(undefined);
    }
    async open() {
        this.calls.push({ method: 'open', timestamp: Date.now() });
        if (this._openDelay > 0) {
            await delay(this._openDelay);
        }
        if (this._shouldFailOpen) {
            return err('Mock open failure');
        }
        this._opened = true;
        return ok({ data: this._data });
    }
    async close() {
        this.calls.push({ method: 'close', timestamp: Date.now() });
        this._closed = true;
    }
    /** Assert that methods were called in expected order */
    assertCallOrder(expectedOrder) {
        const actual = this.calls.map(c => c.method);
        for (let i = 0; i < expectedOrder.length; i++) {
            if (actual[i] !== expectedOrder[i]) {
                throw new Error(`Call order mismatch at index ${i}: expected '${expectedOrder[i]}', got '${actual[i] ?? 'undefined'}'. Full order: [${actual.join(', ')}]`);
            }
        }
    }
    get isOpened() { return this._opened; }
    get isClosed() { return this._closed; }
    reset() {
        this.calls.length = 0;
        this._opened = false;
        this._closed = false;
    }
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function createMockSource(options) {
    return new MockSourceAdapter(options);
}
//# sourceMappingURL=source.js.map