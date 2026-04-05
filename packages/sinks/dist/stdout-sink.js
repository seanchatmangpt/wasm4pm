/**
 * StdoutSinkAdapter - Write artifacts to stdout / a writable stream
 *
 * Useful for piping output to other tools or viewing results in the terminal.
 * Outputs JSON for structured artifacts, raw text for reports.
 */
import { ok, err } from '@wasm4pm/contracts';
/**
 * StdoutSinkAdapter - Writes artifacts to stdout or a writable stream
 *
 * Supports all artifact types. Formats:
 * - Receipts, models, snapshots: JSON
 * - Reports (HTML/Markdown): raw content
 *
 * Atomicity: none (streams are append-only, no rollback)
 */
export class StdoutSinkAdapter {
    constructor(config = {}) {
        this.kind = 'custom';
        this.version = '1.0.0';
        this.atomicity = 'none';
        this.onExists = 'append';
        this.failureMode = 'fail';
        this.artifactCount = 0;
        this.config = {
            stream: config.stream ?? process.stdout,
            pretty: config.pretty ?? true,
            separator: config.separator ?? '\n',
        };
    }
    supportedArtifacts() {
        return ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
    }
    supportsArtifact(type) {
        return this.supportedArtifacts().includes(type);
    }
    async validate() {
        if (!this.config.stream || typeof this.config.stream.write !== 'function') {
            return err('No writable stream available');
        }
        if (this.config.stream.destroyed) {
            return err('Output stream is already destroyed');
        }
        return ok(undefined);
    }
    async write(artifact, type) {
        if (!this.supportsArtifact(type)) {
            return err(`Unsupported artifact type: ${type}`);
        }
        try {
            const output = this.formatArtifact(artifact, type);
            const prefix = this.artifactCount > 0 ? this.config.separator : '';
            await this.writeToStream(`${prefix}${output}`);
            this.artifactCount++;
            const id = `stdout-${type}-${this.artifactCount}`;
            return ok(id);
        }
        catch (e) {
            return err(`Failed to write to stdout: ${e.message}`);
        }
    }
    async close() {
        // Don't close stdout/stderr — only close custom streams
        if (this.config.stream !== process.stdout &&
            this.config.stream !== process.stderr) {
            this.config.stream.end();
        }
    }
    formatArtifact(artifact, type) {
        const data = artifact;
        // Reports with raw content
        if (type === 'report') {
            if (data.format === 'html' || data.format === 'markdown') {
                return data.content ?? '';
            }
        }
        // Everything else: JSON
        if (this.config.pretty) {
            return JSON.stringify(artifact, null, 2);
        }
        return JSON.stringify(artifact);
    }
    writeToStream(data) {
        return new Promise((resolve, reject) => {
            const canContinue = this.config.stream.write(data, 'utf-8');
            if (canContinue) {
                resolve();
            }
            else {
                this.config.stream.once('drain', resolve);
                this.config.stream.once('error', reject);
            }
        });
    }
}
//# sourceMappingURL=stdout-sink.js.map