/**
 * S3 Artifact Storage
 *
 * Uploads process mining results to Amazon S3 for long-term storage and sharing.
 * Automatically compresses results before upload.
 */

export interface S3Config {
  bucket: string;
  region: string;
  prefix?: string;
  /**
   * Custom S3 client (for testing/reuse)
   */
  s3Client?: any;
}

export interface S3UploadOptions {
  key: string;
  body: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * S3 Artifact Storage — uploads results to AWS S3
 */
export class S3ArtifactStorage {
  private config: S3Config;
  private s3Client: any;
  private initialized: boolean = false;

  constructor(config: S3Config) {
    this.config = config;
    this.s3Client = config.s3Client;
  }

  /**
   * Initialize the S3 client
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.s3Client) {
      // Lazy-load AWS SDK (optional dependency)
      try {
        // @ts-ignore - AWS SDK is optional
        const module = await import('@aws-sdk/client-s3').catch(() => null);
        if (module && 'S3Client' in module) {
          this.s3Client = new (module as any).S3Client({
            region: this.config.region,
          });
        } else {
          throw new Error('AWS SDK not installed. Install @aws-sdk/client-s3 to use S3 storage.');
        }
      } catch (error) {
        throw new Error(
          `Failed to initialize S3 client: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.initialized = true;
  }

  /**
   * Upload an artifact to S3
   */
  async upload(options: S3UploadOptions): Promise<string> {
    await this.initialize();

    const key = this.buildKey(options.key);
    const contentType = options.contentType || 'application/json';

    try {
      // Lazily load PutObjectCommand if needed
      let PutObjectCommand: any;
      try {
        // @ts-ignore - AWS SDK is optional
        const module = await import('@aws-sdk/client-s3');
        PutObjectCommand = module.PutObjectCommand;
      } catch {
        // AWS SDK not available; continue with mock or throw during send
        PutObjectCommand = class PutObjectCommand {
          constructor(public input: any) {}
        };
      }

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: options.body,
        ContentType: contentType,
        Metadata: options.metadata,
      });

      await this.s3Client.send(command);
      return this.getS3Url(key);
    } catch (error) {
      throw new Error(
        `Failed to upload to S3: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upload a JSON result to S3 (with gzip compression)
   */
  async uploadResult(
    runId: string,
    data: any,
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
      key: `results/${timestamp}/${runId}.json.gz`,
      body,
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
   * Build the full S3 key with optional prefix
   */
  private buildKey(key: string): string {
    if (this.config.prefix) {
      return `${this.config.prefix}/${key}`;
    }
    return key;
  }

  /**
   * Get the S3 URL for a key
   */
  private getS3Url(key: string): string {
    return `s3://${this.config.bucket}/${key}`;
  }

  /**
   * Validate the configuration
   */
  static validateConfig(config: S3Config): string[] {
    const errors: string[] = [];

    if (!config.bucket || config.bucket.trim().length === 0) {
      errors.push('S3 bucket name is required');
    }
    if (!config.region || config.region.trim().length === 0) {
      errors.push('AWS region is required');
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
 * Get AWS credentials from environment variables
 */
export function getAwsCredentials(): {
  accessKeyId?: string;
  secretAccessKey?: string;
} {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}
