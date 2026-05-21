# How-To: Build a Custom Sink

**Time required**: 20 minutes  
**Difficulty**: Advanced  

## Sink Interface

```typescript
interface SinkAdapter {
  write(
    artifactType: 'receipt' | 'model' | 'report',
    content: string | object
  ): Promise<void>;
  
  validate(): Promise<void>;
  close(): Promise<void>;
}
```

## Example: Database Sink

```typescript
import { SinkAdapter } from '@wasm4pm/types';
import { MongoClient } from 'mongodb';

class MongoSink implements SinkAdapter {
  private client: MongoClient;
  private db: any;

  constructor(url: string) {
    this.client = new MongoClient(url);
  }

  async validate(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db('wasm4pm');
  }

  async write(
    artifactType: 'receipt' | 'model' | 'report',
    content: string | object
  ): Promise<void> {
    const collection = this.db.collection(artifactType);
    const doc = typeof content === 'string' 
      ? JSON.parse(content) 
      : content;
    await collection.insertOne(doc);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export default MongoSink;
```

## Usage

```typescript
const sink = new MongoSink('mongodb://localhost:27017');
await sink.validate();

// Register with wasm4pm
const pm = new Wasm4pm();
pm.registerSink('mongo', sink);

// Use in config
const result = await pm.run({
  config: {
    sink: { type: 'mongo' }
  }
});
```

## S3 Sink Example

```typescript
import { SinkAdapter } from '@wasm4pm/types';
import AWS from 'aws-sdk';

class S3Sink implements SinkAdapter {
  private s3: AWS.S3;
  private bucket: string;

  constructor(bucket: string) {
    this.s3 = new AWS.S3();
    this.bucket = bucket;
  }

  async validate(): Promise<void> {
    await this.s3.headBucket({ Bucket: this.bucket }).promise();
  }

  async write(
    artifactType: string,
    content: string | object
  ): Promise<void> {
    const key = `results/${artifactType}/${Date.now()}.json`;
    const body = typeof content === 'string' ? content : JSON.stringify(content);
    
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: key,
      Body: body
    }).promise();
  }

  async close(): Promise<void> {
    // No-op for S3
  }
}

export default S3Sink;
```

## Custom Sink in Config

```toml
[sink]
type = "custom"
implementation = "mongo"  # Custom sink identifier
```

## See Also

- [Reference: Sink API](../reference/http-api.md)
- [Tutorial: Service Mode](../tutorials/service-mode.md)
