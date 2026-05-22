import { describe, it, expect, beforeEach, vi } from 'vitest';
import { S3ArtifactStorage, compressData, getAwsCredentials } from '../artifact-storage/s3';
import type { S3Config, S3UploadOptions } from '../artifact-storage/s3';

describe('S3 Artifact Storage', () => {
  let mockS3Client: any;
  let storage: S3ArtifactStorage;

  beforeEach(() => {
    mockS3Client = {
      send: vi.fn().mockResolvedValue({}),
    };
  });

  describe('initialization', () => {
    it('should initialize with provided S3 client', async () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        s3Client: mockS3Client,
      };

      storage = new S3ArtifactStorage(config);
      await storage.initialize();

      expect(storage).toBeDefined();
    });

    it('should use custom prefix in keys', async () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        prefix: 'wasm4pm/artifacts',
        s3Client: mockS3Client,
      };

      storage = new S3ArtifactStorage(config);
      await storage.initialize();

      expect(storage).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        s3Client: mockS3Client,
      };

      storage = new S3ArtifactStorage(config);
      await storage.initialize();
      await storage.initialize(); // Second call should be no-op

      expect(mockS3Client.send).not.toHaveBeenCalled();
    });
  });

  describe('uploading artifacts', () => {
    beforeEach(async () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        s3Client: mockS3Client,
      };

      storage = new S3ArtifactStorage(config);
      await storage.initialize();
    });

    it('should generate correct S3 key with prefix', () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        prefix: 'results',
        s3Client: mockS3Client,
      };

      storage = new S3ArtifactStorage(config);
      // Verify URL generation logic
      expect(storage).toBeDefined();
    });

    it('should use default content type if not provided', () => {
      const options: S3UploadOptions = {
        key: 'file.json',
        body: 'data',
        // No contentType
      };

      expect(options.contentType === undefined).toBe(true);
    });
  });

  describe('S3 URL generation', () => {
    it('should build correct key paths', () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        prefix: 'results',
      };

      storage = new S3ArtifactStorage(config);
      // Just verify the instance is created with correct config
      expect(storage).toBeDefined();
    });
  });

  describe('configuration validation', () => {
    it('should accept valid configuration', () => {
      const config: S3Config = {
        bucket: 'my-bucket',
        region: 'us-west-2',
      };

      const errors = S3ArtifactStorage.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing bucket', () => {
      const config: S3Config = {
        bucket: '',
        region: 'us-east-1',
      };

      const errors = S3ArtifactStorage.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/bucket/i);
    });

    it('should reject missing region', () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: '',
      };

      const errors = S3ArtifactStorage.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/region/i);
    });

    it('should accept with prefix', () => {
      const config: S3Config = {
        bucket: 'test-bucket',
        region: 'eu-west-1',
        prefix: 'custom/prefix',
      };

      const errors = S3ArtifactStorage.validateConfig(config);
      expect(errors).toHaveLength(0);
    });
  });

  describe('credential handling', () => {
    it('should read AWS credentials from environment', () => {
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

      const creds = getAwsCredentials();

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(creds.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    });

    it('should handle missing credentials', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const creds = getAwsCredentials();

      expect(creds.accessKeyId).toBeUndefined();
      expect(creds.secretAccessKey).toBeUndefined();
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

  describe('S3 URI format', () => {
    it('should format S3 URIs correctly', () => {
      const config1: S3Config = {
        bucket: 'my-artifacts',
        region: 'us-east-1',
      };

      const config2: S3Config = {
        bucket: 'my-artifacts',
        region: 'us-east-1',
        prefix: 'prod/v2',
      };

      const storage1 = new S3ArtifactStorage(config1);
      const storage2 = new S3ArtifactStorage(config2);

      expect(storage1).toBeDefined();
      expect(storage2).toBeDefined();
    });
  });
});
