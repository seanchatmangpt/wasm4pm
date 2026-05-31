/**
 * Grafana Sink
 *
 * Exports process mining results as Grafana annotations.
 * Allows visualization of discovery runs and quality metrics in Grafana dashboards.
 */

import type { Receipt, ExecutionSummary } from '@wasm4pm/contracts';

/**
 * Extended summary shape used at runtime — has optional quality fields not in the
 * base ExecutionSummary contract.
 */
interface RuntimeSummary extends ExecutionSummary {
  status?: string;
  fitness?: number;
  precision?: number;
}

/** Minimal HTTP client interface used by GrafanaSink (injectable for testing). */
export interface GrafanaHttpClient {
  post(
    url: string,
    data: unknown,
    options: { headers: Record<string, string> }
  ): Promise<{ status: number; statusText: string; data?: unknown }>;
}

export interface GrafanaConfig {
  url: string;
  apiToken: string;
  dashboardId?: number;
  /**
   * Custom HTTP client for testing (allows mocking).
   * Defaults to a fetch-based client when omitted.
   */
  httpClient?: GrafanaHttpClient;
}

export interface GrafanaAnnotation {
  dashboardId?: number;
  time: number;
  text: string;
  tags: string[];
  // Allow pass-through of extra Grafana annotation fields (e.g. timeEnd, panelId).
  [key: string]: string | number | string[] | undefined;
}

/**
 * Grafana Sink — pushes annotations to Grafana
 */
export class GrafanaSink {
  private config: GrafanaConfig;
  private httpClient: GrafanaHttpClient | undefined;

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
        (result.summary as RuntimeSummary | undefined)?.status || 'unknown',
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
   * Get or create an HTTP client (lazy-loaded fetch-based implementation)
   */
  private async getHttpClient(): Promise<GrafanaHttpClient> {
    // Return a simple fetch-based client that satisfies GrafanaHttpClient
    return {
      post: async (url: string, data: unknown, options: { headers: Record<string, string> }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: options.headers || {},
          body: JSON.stringify(data),
        });
        return {
          status: response.status,
          statusText: response.statusText,
          data: await response.json().catch(() => null) as unknown,
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
  const summary = result.summary as RuntimeSummary | undefined;
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
