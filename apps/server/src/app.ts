import { randomUUID } from 'node:crypto';
import type { ApiErrorBody } from '@genui/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { z } from 'zod';

const RequestIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const body: ApiErrorBody = {
    error: { code: 'internal', message: 'Internal server error', requestId: res.locals.requestId },
  };
  res.status(500).json(body);
};

export function createApp(registerRoutes?: (app: Express) => void): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const parsed = RequestIdSchema.safeParse(req.get('x-request-id'));
    const requestId = parsed.success ? parsed.data : randomUUID();
    res.setHeader('x-request-id', requestId);
    res.locals.requestId = requestId;
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  registerRoutes?.(app);

  app.use((_req, res) => {
    const body: ApiErrorBody = {
      error: { code: 'not_found', message: 'Not found', requestId: res.locals.requestId },
    };
    res.status(404).json(body);
  });

  app.use(errorHandler);

  return app;
}
