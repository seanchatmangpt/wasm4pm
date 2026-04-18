/**
 * 4D Quality Report Generator — Human & Machine Formats
 *
 * Generates reports from audit results in multiple formats:
 * - Human: Markdown with tables and color indicators
 * - Machine: JSON (already saved by audit-runner)
 */
import { AlgorithmResult } from './quality-pipeline';
import { TierClassification, TierSummary } from './tier-classifier';
export interface ReportConfig {
    title: string;
    timestamp: string;
    logFile: string;
    format: 'markdown' | 'json' | 'html';
}
/**
 * Generate markdown report (human-readable).
 */
export declare function generateMarkdownReport(config: ReportConfig, results: AlgorithmResult[], classifications: TierClassification[], summary: TierSummary): string;
/**
 * Generate HTML report (for web viewing).
 */
export declare function generateHtmlReport(config: ReportConfig, results: AlgorithmResult[], classifications: TierClassification[], summary: TierSummary): string;
//# sourceMappingURL=report.d.ts.map