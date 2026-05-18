import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GcsArtifactStorage, compressData, getGcsCredentials } from '../artifact-storage/gcs';
import type { GcsConfig, GcsUploadOptions } from '../artifact-storage/gcs';

describe('GCS Artifact Storage', () => {
  let mockStorage: any;
  let storage: GcsArtifactStorage;

  beforeEach(() => {
    mockStorage = {
      bucket: vi.fn(),
    };

    const mockBucket = {
      file: vi.fn((name: string) => ({
        createWriteStream: vi.fn(() => {
          const stream = {
            write: vi.fn(),
            end: vi.fn(),
            on: vi.fn((event: string, callback: any) => {
              if (event === 'finish') {
                setTimeout(() => callback(), 0);
              }
              return stream;
            }),
          };
          return stream;
        }),
      })),
    };

    mockStorage.bucket.mockReturnValue(mockBucket);
  });

  describe('initialization', () => {
    it('should initialize with provided storage client', async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      expect(storage).toBeDefined();
    });

    it('should use project ID from config', async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        projectId: 'my-project',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      expect(storage).toBeDefined();
    });

    it('should use custom prefix', async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        prefix: 'wasm4pm/artifacts',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      expect(storage).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();
      await storage.initialize(); // Second call should be no-op

      expect(mockStorage.bucket).not.toHaveBeenCalled();
    });
  });

  describe('uploading artifacts', () => {
    beforeEach(async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();
    });

    it('should upload file to GCS', async () => {
      const options: GcsUploadOptions = {
        name: 'test-file.json',
        data: 'test content',
        contentType: 'application/json',
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://test-bucket/test-file.json');
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
    });

    it('should include metadata in GCS request', async () => {
      const metadata = { 'run-id': 'test-run', 'version': '1.0' };
      const options: GcsUploadOptions = {
        name: 'artifact.json',
        data: Buffer.from('data'),
        contentType: 'application/json',
        metadata,
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://test-bucket/artifact.json');
    });

    it('should apply prefix to names', async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        prefix: 'results',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      const options: GcsUploadOptions = {
        name: 'test.json',
        data: 'data',
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://test-bucket/results/test.json');
    });

    it('should use default content type if not provided', async () => {
      const options: GcsUploadOptions = {
        name: 'file.json',
        data: 'data',
        // No contentType
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://test-bucket/file.json');
    });

    it('should handle Buffer data', async () => {
      const buffer = Buffer.from('binary data');
      const options: GcsUploadOptions = {
        name: 'binary.bin',
        data: buffer,
        contentType: 'application/octet-stream',
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://test-bucket/binary.bin');
    });

    it('should handle string data', async () => {
      const options: GcsUploadOptions = {
        name: 'text.txt',
        data: 'text content',
        contentType: 'text/plain',
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://test-bucket/text.txt');
    });

    it('should fail on stream write error', async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        storage: mockStorage,
      };

      const mockBucket = {
        file: vi.fn(() => ({
          createWriteStream: vi.fn(() => {
            const stream = {
              write: vi.fn(),
              end: vi.fn(),
              on: vi.fn((event: string, callback: any) => {
                if (event === 'error') {
                  setTimeout(() => callback(new Error('Write failed')), 0);
                }
                return stream;
              }),
            };
            return stream;
          }),
        })),
      };

      mockStorage.bucket.mockReturnValue(mockBucket);

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      const options: GcsUploadOptions = {
        name: 'test.json',
        data: 'data',
      };

      await expect(storage.upload(options)).rejects.toThrow('Failed to upload');
    });
  });

  describe('uploading results', () => {
    beforeEach(async () => {
      const config: GcsConfig = {
        bucket: 'test-bucket',
        prefix: 'results',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();
    });

    it('should upload JSON result as gzipped file', async () => {
      const data = { algorithm: 'dfg', fitness: 0.95 };
      const runId = 'run-12345';
      const timestamp = '2026-05-17T10:00:00Z';

      const url = await storage.uploadResult(runId, data, timestamp);

      expect(url).toContain('gs://');
      expect(url).toContain('run-12345.json.gz');
    });

    it('should organize results by timestamp', async () => {
      const runId = 'run-123';
      const timestamp = '2026-05-17T10:30:45Z';

      const url = await storage.uploadResult(runId, {}, timestamp);

      expect(url).toContain('results/2026-05-17T10:30:45Z/');
    });

    it('should compress large results', async () => {
      const largeData = { data: 'x'.repeat(10000) };
      const runId = 'run-large';
      const timestamp = new Date().toISOString();

      const url = await storage.uploadResult(runId, largeData, timestamp);

      expect(url).toContain('.json.gz');
      expect(url).toContain('gs://');
    });

    it('should include result metadata', async () => {
      const data = { test: 'data' };
      const runId = 'run-001';
      const timestamp = '2026-05-17T10:00:00Z';

      const url = await storage.uploadResult(runId, data, timestamp);

      expect(url).toContain('gs://test-bucket/results/');
    });
  });

  describe('configuration validation', () => {
    it('should accept valid configuration', () => {
      const config: GcsConfig = {
        bucket: 'my-bucket',
      };

      const errors = GcsArtifactStorage.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing bucket', () => {
      const config: GcsConfig = {
        bucket: '',
      };

      const errors = GcsArtifactStorage.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/bucket/i);
    });

    it('should accept with project ID', () => {
      const config: GcsConfig = {
        bucket: 'my-bucket',
        projectId: 'my-project',
      };

      const errors = GcsArtifactStorage.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should accept with prefix', () => {
      const config: GcsConfig = {
        bucket: 'my-bucket',
        prefix: 'custom/prefix',
      };

      const errors = GcsArtifactStorage.validateConfig(config);
      expect(errors).toHaveLength(0);
    });
  });

  describe('credential handling', () => {
    it('should read GCS credentials from environment', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS =
        '/path/to/credentials.json';

      const creds = getGcsCredentials();

      expect(creds).toBe('/path/to/credentials.json');

      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    });

    it('should handle missing credentials', () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      const creds = getGcsCredentials();

      expect(creds).toBeUndefined();
    });
  });

  describe('data compression', () => {
    it('should compress data with gzip', async () => {
      const data = 'x'.repeat(1000);

      const compressed = await compressData(data);

      expect(compressed).toBeInstanceOf(Buffer);
      expect(compressed.length).toBeLessThan(data.length);
    });

    it('should handle empty string', async () => {
      const compressed = await compressData('');

      expect(compressed).toBeInstanceOf(Buffer);
    });

    it('should be decompressible', async () => {
      const original = 'test data for compression';
      const compressed = await compressData(original);

      // Verify it's valid gzip by checking magic number
      expect(compressed[0]).toBe(0x1f);
      expect(compressed[1]).toBe(0x8b);
    });
  });

  describe('GCS URL generation', () => {
    it('should generate correct GCS URI', async () => {
      const config: GcsConfig = {
        bucket: 'my-artifacts',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      const options: GcsUploadOptions = {
        name: 'path/to/file.json',
        data: 'data',
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://my-artifacts/path/to/file.json');
    });

    it('should generate GCS URI with prefix', async () => {
      const config: GcsConfig = {
        bucket: 'my-artifacts',
        prefix: 'prod/v2',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();

      const options: GcsUploadOptions = {
        name: 'results.json',
        data: 'data',
      };

      const url = await storage.upload(options);

      expect(url).toBe('gs://my-artifacts/prod/v2/results.json');
    });
  });

  describe('result file organization', () => {
    beforeEach(async () => {
      const config: GcsConfig = {
        bucket: 'results',
        storage: mockStorage,
      };

      storage = new GcsArtifactStorage(config);
      await storage.initialize();
    });

    it('should organize by timestamp and run ID', async () => {
      const url = await storage.uploadResult(
        'run-abc123',
        { data: 'test' },
        '2026-05-17T14:30:00Z'
      );

      expect(url).toContain('results/2026-05-17T14:30:00Z/run-abc123');
    });

    it('should use gzip extension', async () => {
      const url = await storage.uploadResult(
        'my-run',
        {},
        '2026-05-17T10:00:00Z'
      );

      expect(url).toContain('.json.gz');
    });
  });
});
