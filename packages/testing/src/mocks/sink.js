/**
 * Mock SinkAdapter for testing without real file/network I/O.
 */
function ok(value) {
    return { type: 'ok', value };
}
function err(error) {
    return { type: 'err', error };
}
export class MockSinkAdapter {
    constructor(options = {}) {
        this.version = '1.0.0-mock';
        this._closed = false;
        /** All artifacts written — inspect for assertions */
        this.written = [];
        /** Track calls for assertion */
        this.calls = [];
        this.kind = options.kind ?? 'mock';
        this._supportedArtifacts = options.supportedArtifacts ?? ['receipt', 'model', 'report', 'snapshot', 'log'];
        this.atomicity = options.atomicity ?? 'batch';
        this.onExists = options.onExists ?? 'overwrite';
        this.failureMode = options.failureMode ?? 'fail_fast';
        this._shouldFailValidate = options.shouldFailValidate ?? false;
        this._shouldFailWrite = options.shouldFailWrite ?? false;
        this._failOnArtifactType = options.failOnArtifactType;
        this._writeDelay = options.writeDelay ?? 0;
    }
    supportedArtifacts() {
        this.calls.push({ method: 'supportedArtifacts', timestamp: Date.now() });
        return [...this._supportedArtifacts];
    }
    supportsArtifact(type) {
        this.calls.push({ method: 'supportsArtifact', timestamp: Date.now(), args: [type] });
        return this._supportedArtifacts.includes(type);
    }
    async validate() {
        this.calls.push({ method: 'validate', timestamp: Date.now() });
        if (this._shouldFailValidate) {
            return err('Mock sink validation failure');
        }
        return ok(undefined);
    }
    async write(artifact, type) {
        this.calls.push({ method: 'write', timestamp: Date.now(), args: [artifact, type] });
        if (this._writeDelay > 0) {
            await new Promise(r => setTimeout(r, this._writeDelay));
        }
        if (this._shouldFailWrite) {
            return err('Mock write failure');
        }
        if (this._failOnArtifactType && type === this._failOnArtifactType) {
            return err(`Mock write failure for artifact type: ${type}`);
        }
        const path = `/mock/${type}/${Date.now()}.json`;
        this.written.push({ artifact, type, timestamp: Date.now(), path });
        return ok(path);
    }
    async close() {
        this.calls.push({ method: 'close', timestamp: Date.now() });
        this._closed = true;
    }
    get isClosed() { return this._closed; }
    get writeCount() { return this.written.length; }
    getWrittenByType(type) {
        return this.written.filter(w => w.type === type);
    }
    assertWritten(type, count) {
        const matching = this.getWrittenByType(type);
        if (count !== undefined && matching.length !== count) {
            throw new Error(`Expected ${count} ${type} writes, got ${matching.length}`);
        }
        if (matching.length === 0) {
            throw new Error(`Expected at least one ${type} write, got none`);
        }
    }
    reset() {
        this.calls.length = 0;
        this.written.length = 0;
        this._closed = false;
    }
}
export function createMockSink(options) {
    return new MockSinkAdapter(options);
}
//# sourceMappingURL=sink.js.map