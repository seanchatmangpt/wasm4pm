/**
 * Grafana Sink
 *
 * Exports process mining results as Grafana annotations.
 * Allows visualization of discovery runs and quality metrics in Grafana dashboards.
 */

import type { Receipt, ExecutionSummary } from '@wasm4pm/contracts';

export interface GrafanaConfig {
  url: string;
  apiToken: string;
  dashboardId?: number;
  /**
   * Custom HTTP client for testing (allows mocking)
   */
  httpClient?: any;
}

export interface GrafanaAnnotation {
  dashboardId?: number;
  time: number;
  text: string;
  tags: string[];
  [key: string]: any;
}

/**
 * Grafana Sink — pushes annotations to Grafana
 */
export class GrafanaSink {
  private config: GrafanaConfig;
  private httpClient: any;

  constructor(config: GrafanaConfig) {
    this.config = config;
    // Use provided mock client or lazy-load fetch
    this.httpClient = config.httpClient;
  }

  /**
   * Create an annotation in Grafana
   */
  async write(annotation: GrafanaAnnotation): Promise<void> {
    const client = this.httpClient || (await this.getHttpClient());

    const payload = {
      dashboardId: annotation.dashboardId || this.config.dashboardId || null,
      time: annotation.time,
      timeEnd: annotation.time,
      text: annotation.text,
      tags: annotation.tags || [],
    };

    try {
      const response = await client.post(
        `${this.config.url}/api/annotations`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Grafana API returned ${response.status}: ${response.statusText}`
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to create Grafana annotation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create an annotation from a receipt/execution result
   */
  async annotateResult(result: Partial<Receipt> & { summary?: ExecutionSummary; algorithm?: { name: string } }, runId: string): Promise<void> {
    const annotation: GrafanaAnnotation = {
      dashboardId: this.config.dashboardId,
      time: Date.now(),
      text: `wasm4pm run: ${result.algorithm?.name || 'unknown'} (${runId.slice(0, 8)})`,
      tags: [
        'wasm4pm',
        result.algorithm?.name || 'unknown',
        (result.summary as any)?.status || 'unknown',
      ],
    };

    await this.write(annotation);
  }

  /**
   * Validate the configuration
   */
  static validateConfig(config: GrafanaConfig): string[] {
    const errors: string[] = [];

    if (!config.url || config.url.trim().length === 0) {
      errors.push('Grafana URL is required');
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push('Grafana URL must be a valid absolute URL');
      }
    }

    if (!config.apiToken || config.apiToken.trim().length === 0) {
      errors.push('Grafana API token is required');
    }

    return errors;
  }

  /**
   * Get or create an HTTP client (lazy-loaded)
   */
  private async getHttpClient(): Promise<any> {
    // Return a simple fetch-based client
    return {
      post: async (url: string, data: any, options: any) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: options.headers || {},
          body: JSON.stringify(data),
        });
        return {
          status: response.status,
          statusText: response.statusText,
          data: await response.json().catch(() => null),
        };
      },
    };
  }
}

/**
 * Create a Grafana annotation from a receipt/execution result
 */
export function createAnnotationFromResult(
  result: Partial<Receipt> & { summary?: ExecutionSummary; algorithm?: { name: string } },
  runId: string
): GrafanaAnnotation {
  const summary = result.summary as any;
  const tags = [
    'wasm4pm',
    result.algorithm?.name || 'unknown',
    summary?.status || 'unknown',
  ];

  if (summary?.fitness !== undefined) {
    tags.push(`fitness:${(summary.fitness * 100).toFixed(1)}%`);
  }
  if (summary?.precision !== undefined) {
    tags.push(`precision:${(summary.precision * 100).toFixed(1)}%`);
  }

  return {
    dashboardId: undefined,
    time: Date.now(),
    text: `[${result.algorithm?.name || 'unknown'}] ${runId.slice(0, 8)}\nFitness: ${summary?.fitness ? (summary.fitness * 100).toFixed(1) : 'N/A'}%`,
    tags,
  };
}
