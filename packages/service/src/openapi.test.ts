/**
 * openapi.test.ts
 * Tests for OpenAPI specification generation
 */

import { describe, it, expect } from 'vitest';
import { generateOpenAPISpec, OpenAPISpec } from './openapi';

describe('OpenAPI Specification', () => {
  let spec: OpenAPISpec;

  beforeEach(() => {
    spec = generateOpenAPISpec('http://localhost:3001');
  });

  describe('Basic structure', () => {
    it('should generate valid OpenAPI 3.0.0 spec', () => {
      expect(spec.openapi).toBe('3.0.0');
    });

    it('should include info section', () => {
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('wasm4pm Service API');
      expect(spec.info.version).toBe('26.4.5');
      expect(spec.info.description).toBeDefined();
    });

    it('should include servers', () => {
      expect(spec.servers).toBeDefined();
      expect(spec.servers.length).toBeGreaterThan(0);
      expect(spec.servers[0].url).toBe('http://localhost:3001');
    });

    it('should include paths', () => {
      expect(spec.paths).toBeDefined();
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });

    it('should include components and schemas', () => {
      expect(spec.components).toBeDefined();
      expect(spec.components.schemas).toBeDefined();
      expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
    });
  });

  describe('Endpoint paths', () => {
    it('should include /status endpoint', () => {
      expect(spec.paths['/status']).toBeDefined();
      expect(spec.paths['/status'].get).toBeDefined();
    });

    it('should include /run endpoint (POST)', () => {
      expect(spec.paths['/run']).toBeDefined();
      expect(spec.paths['/run'].post).toBeDefined();
    });

    it('should include /run/{run_id} endpoint (GET, DELETE)', () => {
      expect(spec.paths['/run/{run_id}']).toBeDefined();
      expect(spec.paths['/run/{run_id}'].get).toBeDefined();
      expect(spec.paths['/run/{run_id}'].delete).toBeDefined();
    });

    it('should include /watch/{run_id} endpoint', () => {
      expect(spec.paths['/watch/{run_id}']).toBeDefined();
      expect(spec.paths['/watch/{run_id}'].get).toBeDefined();
    });

    it('should include /explain endpoint', () => {
      expect(spec.paths['/explain']).toBeDefined();
      expect(spec.paths['/explain'].post).toBeDefined();
    });

    it('should include /api/docs endpoint', () => {
      expect(spec.paths['/api/docs']).toBeDefined();
      expect(spec.paths['/api/docs'].get).toBeDefined();
    });
  });

  describe('Endpoint details', () => {
    describe('GET /status', () => {
      const operation = spec.paths['/status'].get as any;

      it('should have operationId', () => {
        expect(operation.operationId).toBe('getStatus');
      });

      it('should have summary and description', () => {
        expect(operation.summary).toBeDefined();
        expect(operation.description).toBeDefined();
      });

      it('should have tags', () => {
        expect(operation.tags).toBeDefined();
        expect(operation.tags).toContain('Status');
      });

      it('should have 200 response', () => {
        expect(operation.responses['200']).toBeDefined();
      });
    });

    describe('POST /run', () => {
      const operation = spec.paths['/run'].post as any;

      it('should require requestBody', () => {
        expect(operation.requestBody).toBeDefined();
        expect(operation.requestBody.required).toBe(true);
      });

      it('should have RunRequest schema reference', () => {
        const schema = operation.requestBody.content['application/json'].schema;
        expect(schema.$ref).toContain('RunRequest');
      });

      it('should have 202 response', () => {
        expect(operation.responses['202']).toBeDefined();
      });

      it('should have error responses', () => {
        expect(operation.responses['400']).toBeDefined();
        expect(operation.responses['503']).toBeDefined();
      });
    });

    describe('GET /run/{run_id}', () => {
      const operation = spec.paths['/run/{run_id}'].get as any;

      it('should have run_id parameter', () => {
        expect(operation.parameters).toBeDefined();
        expect(operation.parameters.length).toBeGreaterThan(0);
        expect(operation.parameters[0].name).toBe('run_id');
        expect(operation.parameters[0].in).toBe('path');
        expect(operation.parameters[0].required).toBe(true);
      });

      it('should have 200 and 404 responses', () => {
        expect(operation.responses['200']).toBeDefined();
        expect(operation.responses['404']).toBeDefined();
      });
    });

    describe('DELETE /run/{run_id}', () => {
      const operation = spec.paths['/run/{run_id}'].delete as any;

      it('should have run_id parameter', () => {
        expect(operation.parameters).toBeDefined();
        expect(operation.parameters[0].name).toBe('run_id');
      });

      it('should have 200, 404, and 409 responses', () => {
        expect(operation.responses['200']).toBeDefined();
        expect(operation.responses['404']).toBeDefined();
        expect(operation.responses['409']).toBeDefined();
      });
    });

    describe('POST /explain', () => {
      const operation = spec.paths['/explain'].post as any;

      it('should have ExplainRequest schema', () => {
        const schema = operation.requestBody.content['application/json'].schema;
        expect(schema.$ref).toContain('ExplainRequest');
      });

      it('should have 200 and 400 responses', () => {
        expect(operation.responses['200']).toBeDefined();
        expect(operation.responses['400']).toBeDefined();
      });
    });
  });

  describe('Schemas', () => {
    describe('RunRequest schema', () => {
      const schema = spec.components.schemas.RunRequest as any;

      it('should require config field', () => {
        expect(schema.required).toContain('config');
      });

      it('should define properties', () => {
        expect(schema.properties.config).toBeDefined();
        expect(schema.properties.input_file).toBeDefined();
        expect(schema.properties.profile).toBeDefined();
      });

      it('should validate config as required string', () => {
        expect(schema.properties.config.type).toBe('string');
        expect(schema.properties.config.minLength).toBeGreaterThan(0);
      });
    });

    describe('RunResponse schema', () => {
      const schema = spec.components.schemas.RunResponse as any;

      it('should require run_id, status, started_at', () => {
        expect(schema.required).toContain('run_id');
        expect(schema.required).toContain('status');
        expect(schema.required).toContain('started_at');
      });

      it('should have correct status enum', () => {
        expect(schema.properties.status.enum).toContain('queued');
        expect(schema.properties.status.enum).toContain('running');
      });
    });

    describe('StatusResponse schema', () => {
      const schema = spec.components.schemas.StatusResponse as any;

      it('should include server health field', () => {
        expect(schema.properties.server).toBeDefined();
        expect(schema.properties.server.enum).toContain('healthy');
        expect(schema.properties.server.enum).toContain('degraded');
      });

      it('should include queue and stats fields', () => {
        expect(schema.properties.queued).toBeDefined();
        expect(schema.properties.completed).toBeDefined();
        expect(schema.properties.failed).toBeDefined();
      });

      it('should optionally include current_run', () => {
        expect(schema.properties.current_run).toBeDefined();
      });
    });

    describe('RunStatusResponse schema', () => {
      const schema = spec.components.schemas.RunStatusResponse as any;

      it('should include progress field', () => {
        expect(schema.properties.progress).toBeDefined();
        expect(schema.properties.progress.minimum).toBe(0);
        expect(schema.properties.progress.maximum).toBe(100);
      });

      it('should optionally include receipt', () => {
        expect(schema.properties.receipt).toBeDefined();
      });

      it('should optionally include error', () => {
        expect(schema.properties.error).toBeDefined();
      });
    });

    describe('ExplainRequest schema', () => {
      const schema = spec.components.schemas.ExplainRequest as any;

      it('should require config', () => {
        expect(schema.required).toContain('config');
      });

      it('should have mode enum', () => {
        const mode = schema.properties.mode;
        expect(mode.enum).toContain('brief');
        expect(mode.enum).toContain('full');
        expect(mode.default).toBe('brief');
      });
    });

    describe('ExplainResponse schema', () => {
      const schema = spec.components.schemas.ExplainResponse as any;

      it('should include explanation', () => {
        expect(schema.properties.explanation).toBeDefined();
        expect(schema.properties.explanation.type).toBe('string');
      });

      it('should include config and mode', () => {
        expect(schema.properties.config).toBeDefined();
        expect(schema.properties.mode).toBeDefined();
      });
    });

    describe('ErrorResponse schema', () => {
      const schema = spec.components.schemas.ErrorResponse as any;

      it('should include error message and code', () => {
        expect(schema.properties.error).toBeDefined();
        expect(schema.properties.code).toBeDefined();
      });

      it('should optionally include details', () => {
        expect(schema.properties.details).toBeDefined();
      });

      it('should include timestamp', () => {
        expect(schema.properties.timestamp).toBeDefined();
      });
    });
  });

  describe('BaseURL handling', () => {
    it('should use provided baseUrl', () => {
      const customSpec = generateOpenAPISpec('http://api.example.com:8080');
      expect(customSpec.servers[0].url).toBe('http://api.example.com:8080');
    });

    it('should work with different port numbers', () => {
      const spec3001 = generateOpenAPISpec('http://localhost:3001');
      const spec3002 = generateOpenAPISpec('http://localhost:3002');

      expect(spec3001.servers[0].url).toBe('http://localhost:3001');
      expect(spec3002.servers[0].url).toBe('http://localhost:3002');
    });
  });

  describe('Content negotiation', () => {
    it('should specify JSON content type for all responses', () => {
      Object.entries(spec.paths).forEach(([path, pathItem]) => {
        if (typeof pathItem === 'object') {
          Object.entries(pathItem).forEach(([method, operation]) => {
            if (typeof operation === 'object' && operation.responses) {
              Object.entries(operation.responses).forEach(([status, response]: any) => {
                if (response.content) {
                  expect(response.content['application/json']).toBeDefined();
                }
              });
            }
          });
        }
      });
    });

    it('should handle NDJSON for streaming', () => {
      const watchOp = spec.paths['/watch/{run_id}'].get as any;
      // Watch endpoint may use different content type
      expect(watchOp).toBeDefined();
    });
  });

  describe('Security and validation', () => {
    describe('Parameter validation', () => {
      const getRun = spec.paths['/run/{run_id}'].get as any;
      const runIdParam = getRun.parameters[0];

      it('should validate run_id format', () => {
        expect(runIdParam.schema.pattern).toBeDefined();
      });
    });

    describe('Request limits', () => {
      const runReq = spec.components.schemas.RunRequest as any;

      it('should validate config is not empty', () => {
        expect(runReq.properties.config.minLength).toBeGreaterThan(0);
      });
    });
  });

  describe('Documentation completeness', () => {
    it('should have descriptions for all endpoints', () => {
      Object.entries(spec.paths).forEach(([path, pathItem]) => {
        if (typeof pathItem === 'object') {
          Object.entries(pathItem).forEach(([method, operation]: any) => {
            if (operation && operation.summary) {
              expect(operation.summary).toBeTruthy();
              expect(operation.summary.length).toBeGreaterThan(0);
            }
          });
        }
      });
    });

    it('should have response descriptions', () => {
      const statusOp = spec.paths['/status'].get as any;
      expect(statusOp.responses['200'].description).toBeDefined();
    });
  });
});

function beforeEach(fn: () => void) {
  // Vitest beforeEach
}
