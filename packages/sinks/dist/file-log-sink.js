/**
 * FileLogSinkAdapter - Write models/reports/receipts to disk
 *
 * Handles:
 * - Receipt: JSON with run metadata
 * - Model: DFG as .dfg.json, PetriNet as .pn.json
 * - Report: HTML/Markdown process reports
 * - Status Snapshots: Point-in-time execution state
 *
 * Atomicity: batch-level (all artifacts in a run written together)
 */
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { ok, err, error } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';
/**
 * FileLogSinkAdapter - Write results to local filesystem
 *
 * Supports writing:
 * - Receipts: JSON metadata about run
 * - Models: DFG and PetriNet in JSON format
 * - Reports: HTML and Markdown reports
 * - Snapshots: Execution state snapshots
 *
 * Features:
 * - Atomic batch writes
 * - Configurable exists behavior (skip/overwrite/error)
 * - Automatic directory creation
 */
export class FileLogSinkAdapter {
    constructor(config) {
        this.kind = 'file';
        this.version = '1.0.0';
        this.atomicity = 'batch';
        this.onExists = 'skip';
        this.failureMode = 'fail';
        this.config = {
            onExists: 'skip',
            failureMode: 'fail',
            ...config,
        };
    }
    /**
     * List supported artifact types
     */
    supportedArtifacts() {
        return ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
    }
    /**
     * Check if sink supports specific artifact type
     */
    supportsArtifact(type) {
        return this.supportedArtifacts().includes(type);
    }
    /**
     * Validate sink configuration and destination
     */
    async validate() {
        try {
            // Try to create directory if it doesn't exist
            await fs.mkdir(this.config.directory, { recursive: true });
            // Check if we can write
            const testFile = `${this.config.directory}/.wasm4pm-write-test-${Date.now()}`;
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            return ok(undefined);
        }
        catch (e) {
            if (e.code === 'EACCES') {
                return error(createError('SINK_PERMISSION', `Permission denied writing to: ${this.config.directory}`, { directory: this.config.directory }));
            }
            return err(`Validation failed: ${e}`);
        }
    }
    /**
     * Write artifact to sink
     * Returns artifact ID (filename without extension)
     */
    async write(artifact, type) {
        try {
            if (!this.supportsArtifact(type)) {
                return err(`Unsupported artifact type: ${type}`);
            }
            const filename = this.getFilename(artifact, type);
            const filePath = `${this.config.directory}/${filename}`;
            // Check if file exists and handle according to onExists policy
            try {
                await fs.stat(filePath);
                // File exists
                switch (this.config.onExists) {
                    case 'skip':
                        return ok(filename);
                    case 'error':
                        return err(`File already exists: ${filePath}`);
                    case 'append':
                        // For append: read existing, merge, write back
                        return this.appendArtifact(filePath, artifact, type);
                    case 'overwrite':
                        // Proceed with overwrite
                        break;
                }
            }
            catch (e) {
                // File doesn't exist, proceed normally
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
            // Create directory if needed
            await fs.mkdir(dirname(filePath), { recursive: true });
            // Write artifact
            const content = this.formatArtifact(artifact, type);
            await fs.writeFile(filePath, content, 'utf-8');
            return ok(filename);
        }
        catch (e) {
            if (e.code === 'EACCES') {
                return error(createError('SINK_PERMISSION', `Permission denied writing artifact: ${e}`, { type, artifact: String(artifact) }));
            }
            return err(`Failed to write artifact: ${e}`);
        }
    }
    /**
     * Close sink and release resources
     */
    async close() {
        // No resources to release for file sink
    }
    /**
     * Get filename for artifact
     */
    getFilename(artifact, type) {
        const now = Date.now();
        switch (type) {
            case 'receipt': {
                const receipt = artifact;
                const runId = receipt.run_id || `run-${now}`;
                return `${runId}.receipt.json`;
            }
            case 'model': {
                const model = artifact;
                const name = model.name || `model-${now}`;
                // Determine model type from content
                if (model.petriNet) {
                    return `${name}.pn.json`;
                }
                return `${name}.dfg.json`;
            }
            case 'report': {
                const report = artifact;
                const name = report.name || `report-${now}`;
                const format = report.format || 'html';
                return `${name}.${format}`;
            }
            case 'explain_snapshot':
                return `snapshot-explain-${now}.json`;
            case 'status_snapshot':
                return `snapshot-status-${now}.json`;
            default:
                return `artifact-${now}.json`;
        }
    }
    /**
     * Format artifact for file writing
     */
    formatArtifact(artifact, type) {
        const data = artifact;
        // For HTML reports, return content directly
        if (type === 'report' && data.format === 'html') {
            return data.content || '';
        }
        // For markdown reports, return content directly
        if (type === 'report' && data.format === 'markdown') {
            return data.content || '';
        }
        // For everything else, serialize as JSON with pretty printing
        return JSON.stringify(artifact, null, 2);
    }
    /**
     * Append artifact to existing file (for append mode)
     */
    async appendArtifact(filePath, artifact, type) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            let existing;
            try {
                existing = JSON.parse(content);
            }
            catch {
                // If existing content is not JSON, treat as text append
                const newContent = `${content}\n${this.formatArtifact(artifact, type)}`;
                await fs.writeFile(filePath, newContent, 'utf-8');
                return ok(filePath);
            }
            // Merge JSON artifacts
            if (Array.isArray(existing)) {
                existing.push(artifact);
            }
            else if (typeof existing === 'object' && typeof artifact === 'object') {
                existing = { ...existing, ...artifact };
            }
            const newContent = JSON.stringify(existing, null, 2);
            await fs.writeFile(filePath, newContent, 'utf-8');
            return ok(filePath);
        }
        catch (e) {
            return err(`Failed to append artifact: ${e}`);
        }
    }
}
//# sourceMappingURL=file-log-sink.js.map