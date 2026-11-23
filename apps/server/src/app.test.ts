import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { ApiErrorBodySchema } from '@genui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

describe('createApp', () => {
  const app = createApp((app) => {
    app.get('/throw', () => {
      throw new Error('private error message');
    });
  });
  const server = app.listen(0, '127.0.0.1');
  let baseUrl: string;

  beforeAll(async () => {
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('returns health and generates a request ID', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('preserves a supplied request ID', async () => {
    const response = await fetch(`${baseUrl}/health`, { headers: { 'x-request-id': 'client-id' } });
    expect(response.headers.get('x-request-id')).toBe('client-id');
  });

  it('returns the shared not-found envelope with the same request ID', async () => {
    const response = await fetch(`${baseUrl}/missing`, { headers: { 'x-request-id': 'missing-id' } });
    const body = ApiErrorBodySchema.parse(await response.json());
    expect(response.status).toBe(404);
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('hides unexpected error messages and stacks', async () => {
    const response = await fetch(`${baseUrl}/throw`);
    const text = await response.text();
    const body = ApiErrorBodySchema.parse(JSON.parse(text));
    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal');
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
    expect(text).not.toContain('private error message');
    expect(text).not.toContain('Error:');
    expect(text).not.toContain('app.test.ts');
  });
});
