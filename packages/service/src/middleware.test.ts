/**
 * middleware.test.ts
 * Tests for request validation, logging, and CORS middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  requestIdMiddleware,
  corsMiddleware,
  loggingMiddleware,
  sendValidationError,
  sendError,
  sendSuccess,
} from './middleware';

/**
 * Mock Express request
 */
function createMockRequest(overrides?: Partial<Request>): Request & { id?: string; startTime?: number } {
  return {
    method: 'GET',
    path: '/test',
    headers: {},
    on: vi.fn(),
    ...overrides,
  } as any;
}

/**
 * Mock Express response
 */
function createMockResponse(): Response & { _data?: any; _status?: number; _headers?: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    status: vi.fn(function (code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (data: any) {
      this._data = data;
      return this;
    }),
    send: vi.fn(function (data: any) {
      this._data = data;
      return this;
    }),
    set: vi.fn(function (key: string, value: string) {
      headers[key.toLowerCase()] = value;
      return this;
    }),
    end: vi.fn(function () {
      return this;
    }),
    _headers: headers,
  } as any;
}

describe('Middleware', () => {
  describe('requestIdMiddleware', () => {
    it('should add unique request ID', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req, res, next);

      expect(req.id).toBeDefined();
      expect(req.id).toMatch(/^[0-9a-f-]+$/i); // UUID format
      expect(next).toHaveBeenCalled();
    });

    it('should set request ID in response headers', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      requestIdMiddleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
    });

    it('should generate different IDs for different requests', () => {
      const req1 = createMockRequest();
      const req2 = createMockRequest();
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      requestIdMiddleware(req1, res1, vi.fn());
      requestIdMiddleware(req2, res2, vi.fn());

      expect(req1.id).not.toBe(req2.id);
    });
  });

  describe('corsMiddleware', () => {
    it('should set CORS headers', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      corsMiddleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(res.set).toHaveBeenCalledWith('Access-Control-Allow-Methods', expect.any(String));
      expect(res.set).toHaveBeenCalledWith('Access-Control-Allow-Headers', expect.any(String));
    });

    it('should handle OPTIONS requests', () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const res = createMockResponse();
      const next = vi.fn();

      corsMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next for non-OPTIONS requests', () => {
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const next = vi.fn();

      corsMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should set max-age header', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      corsMiddleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
    });
  });

  describe('loggingMiddleware', () => {
    it('should record start time', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      loggingMiddleware(req, res, next);

      expect(req.startTime).toBeDefined();
      expect(typeof req.startTime).toBe('number');
      expect(next).toHaveBeenCalled();
    });

    it('should wrap response send method', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      loggingMiddleware(req, res, next);

      const originalSend = res.send;
      expect(res.send).toBeDefined();
      expect(res.send).not.toBe(originalSend);
    });

    it('should log request with timing', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const req = createMockRequest({ method: 'GET', path: '/test' });
      const res = createMockResponse();
      const next = vi.fn();

      loggingMiddleware(req, res, next);

      // Simulate response being sent
      if (res.send && typeof res.send === 'function') {
        (res.send as any)({ data: 'test' });
      }

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('GET'));
      logSpy.mockRestore();
    });
  });

  describe('sendValidationError', () => {
    it('should send 400 status', () => {
      const res = createMockResponse();
      const errors = { config: ['config is required'] };

      sendValidationError(res, errors);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should include validation errors', () => {
      const res = createMockResponse();
      const errors = {
        config: ['config is required'],
        input_file: ['input_file must be a string'],
      };

      sendValidationError(res, errors);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: errors,
        })
      );
    });

    it('should set error message', () => {
      const res = createMockResponse();
      const errors = { config: ['config is required'] };

      sendValidationError(res, errors);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
        })
      );
    });
  });

  describe('sendError', () => {
    it('should send specified status code', () => {
      const res = createMockResponse();

      sendError(res, 404, 'NOT_FOUND', 'Resource not found');

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should include error code and message', () => {
      const res = createMockResponse();

      sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_ERROR',
          error: 'Something went wrong',
        })
      );
    });

    it('should include timestamp', () => {
      const res = createMockResponse();

      sendError(res, 400, 'BAD_REQUEST', 'Invalid request');

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
        })
      );
    });

    it('should optionally include details', () => {
      const res = createMockResponse();
      const details = { field: 'value', count: 123 };

      sendError(res, 400, 'BAD_REQUEST', 'Invalid request', details);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details,
        })
      );
    });
  });

  describe('sendSuccess', () => {
    it('should send specified status code', () => {
      const res = createMockResponse();
      const data = { key: 'value' };

      sendSuccess(res, 200, data);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should send JSON response', () => {
      const res = createMockResponse();
      const data = { id: 1, name: 'test' };

      sendSuccess(res, 201, data);

      expect(res.json).toHaveBeenCalledWith(data);
    });

    it('should handle different status codes', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const res3 = createMockResponse();

      sendSuccess(res1, 200, {});
      sendSuccess(res2, 201, {});
      sendSuccess(res3, 202, {});

      expect(res1.status).toHaveBeenCalledWith(200);
      expect(res2.status).toHaveBeenCalledWith(201);
      expect(res3.status).toHaveBeenCalledWith(202);
    });
  });
});
