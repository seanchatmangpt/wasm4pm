/**
 * Google Cloud Storage Artifact Storage
 *
 * Uploads process mining results to Google Cloud Storage for long-term storage and sharing.
 * Automatically compresses results before upload.
 */

/** Minimal interface that GcsArtifactStorage needs from the GCS Storage instance. */
export interface GcsStorageLike {
  bucket(name: string): {
    file(name: string): {
      createWriteStream(options: {
        metadata: { contentType: string; metadata?: Record<string, string> };
      }): NodeJS.WritableStream;
    };
  };
}

export interface GcsConfig {
  bucket: string;
  projectId?: string;
  prefix?: string;
  /**
   * Custom GCS storage instance for testing/reuse.
   * Accepts any object that satisfies GcsStorageLike.
   */
  storage?: GcsStorageLike;
}

export interface GcsUploadOptions {
  name: string;
  data: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * Google Cloud Storage Artifact Storage — uploads results to GCS
 */
export class GcsArtifactStorage {
  private config: GcsConfig;
  private storage: GcsStorageLike | undefined;
  private initialized: boolean = false;

  constructor(config: GcsConfig) {
    this.config = config;
    this.storage = config.storage;
  }

  /**
   * Initialize the GCS client
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.storage) {
      // Lazy-load Google Cloud Storage SDK (optional dependency)
      try {
        // @ts-expect-error — @google-cloud/storage is an optional peer dep not in package.json
        const module = await import('@google-cloud/storage').catch(() => null) as { Storage: new (cfg: Record<string, unknown>) => GcsStorageLike } | null;
        if (module && 'Storage' in module) {
          this.storage = new module.Storage({
            projectId: this.config.projectId,
          });
        } else {
          throw new Error('Google Cloud Storage not installed. Install @google-cloud/storage to use GCS storage.');
        }
      } catch (error) {
        throw new Error(
          `Failed to initialize GCS client: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.initialized = true;
  }

  /**
   * Upload an artifact to GCS
   */
  async upload(options: GcsUploadOptions): Promise<string> {
    await this.initialize();

    const name = this.buildName(options.name);

    try {
      const bucket = this.storage!.bucket(this.config.bucket);
      const file = bucket.file(name);

      // Create write stream with metadata
      const writeStream = file.createWriteStream({
        metadata: {
          contentType: options.contentType || 'application/json',
          metadata: options.metadata,
        },
      });

      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          resolve(this.getGcsUrl(name));
        });

        writeStream.on('error', (error: Error) => {
          reject(
            new Error(
              `Failed to upload to GCS: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        });

        if (typeof options.data === 'string') {
          writeStream.write(options.data);
        } else {
          writeStream.write(options.data);
        }
        writeStream.end();
      });
    } catch (error) {
      throw new Error(
        `Failed to upload to GCS: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upload a JSON result to GCS (with gzip compression)
   */
  async uploadResult(
    runId: string,
    data: unknown,
    timestamp: string
  ): Promise<string> {
    const json = JSON.stringify(data);

    // Compress with gzip (lazy-loaded)
    let body: Buffer | string = json;
    try {
      const zlib = await import('zlib');
      const { promisify } = await import('util');
      const gzip = promisify(zlib.gzip);
      body = (await gzip(json)) as Buffer;
    } catch {
      // If gzip not available, use uncompressed
    }

    return this.upload({
      name: `results/${timestamp}/${runId}.json.gz`,
      data: body,
      contentType: 'application/gzip',
      metadata: {
        'run-id': runId,
        'timestamp': timestamp,
        'original-size': String(json.length),
        'compressed-size': String(typeof body === 'string' ? body.length : body.byteLength),
      },
    });
  }

  /**
   * Build the full GCS name with optional prefix
   */
  private buildName(name: string): string {
    if (this.config.prefix) {
      return `${this.config.prefix}/${name}`;
    }
    return name;
  }

  /**
   * Get the GCS URL for a name
   */
  private getGcsUrl(name: string): string {
    return `gs://${this.config.bucket}/${name}`;
  }

  /**
   * Validate the configuration
   */
  static validateConfig(config: GcsConfig): string[] {
    const errors: string[] = [];

    if (!config.bucket || config.bucket.trim().length === 0) {
      errors.push('GCS bucket name is required');
    }

    return errors;
  }
}

/**
 * Compress data with gzip
 */
export async function compressData(data: string): Promise<Buffer> {
  const zlib = await import('zlib');
  const { promisify } = await import('util');
  const gzip = promisify(zlib.gzip);
  return (await gzip(data)) as Buffer;
}

/**
 * Get GCS credentials from environment
 */
export function getGcsCredentials(): string | undefined {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS;
}
