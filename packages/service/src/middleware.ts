/**
 * middleware.ts
 * Request validation, logging, and CORS middleware
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { RequestLog } from './types';

/**
 * Request ID middleware - adds unique request ID
 */
export function requestIdMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction
): void {
  req.id = uuidv4();
  res.set('X-Request-ID', req.id);
  next();
}

/**
 * CORS middleware
 */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');
  res.set('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
  } else {
    next();
  }
}

/**
 * Request logging middleware
 */
export function loggingMiddleware(
  req: Request & { id?: string; startTime?: number },
  res: Response,
  next: NextFunction
): void {
  req.startTime = Date.now();

  const originalSend = res.send;
  res.send = function (data: unknown): Response {
    const duration = Date.now() - (req.startTime || Date.now());
    const log: RequestLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      request_id: req.id || 'unknown',
    };

    console.log(JSON.stringify(log));

    return originalSend.call(this, data);
  };

  next();
}

/**
 * JSON body parsing with size limit
 */
export function jsonBodyLimit(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction): void => {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk.toString();

      // Check size
      if (Buffer.byteLength(rawBody, 'utf8') > 10 * 1024 * 1024) {
        res.status(413).json({
          error: 'Payload too large',
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }
    });

    req.on('end', () => {
      try {
        if (rawBody) {
          (req as any).body = JSON.parse(rawBody);
        }
        next();
      } catch (err) {
        res.status(400).json({
          error: 'Invalid JSON',
          code: 'INVALID_JSON',
        });
      }
    });
  };
}

/**
 * Validation result error response
 */
export interface ValidationError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * Sends validation error response
 */
export function sendValidationError(
  res: Response,
  errors: Record<string, string[]>
): void {
  res.status(400).json({
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: errors,
  } as ValidationError);
}

/**
 * Sends error response with status code
 */
export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  res.status(statusCode).json({
    error: message,
    code,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Sends success response
 */
export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  data: T
): void {
  res.status(statusCode).json(data);
}
