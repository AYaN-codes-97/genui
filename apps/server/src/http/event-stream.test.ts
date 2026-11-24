import { once } from 'node:events';
import type { Server } from 'node:http';
import type { ChatStreamEvent } from '@genui/shared';
import express, { type Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { openEventStream, type EventStream } from './event-stream.ts';

const messageId = '7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const delta: ChatStreamEvent = { type: 'text.delta', messageId, delta: 'Hello\n"world"\r\n' };

describe('openEventStream', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    })));
    vi.restoreAllMocks();
  });

  async function connect(
    options?: { heartbeatMs?: number },
    onOpen?: (stream: EventStream) => void,
  ) {
    let stream: EventStream | undefined;
    let res: Response | undefined;
    const app = express();
    app.get('/', (_req, response) => {
      res = response;
      stream = openEventStream(response, options);
      onOpen?.(stream);
    });
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    if (!stream || !res) throw new Error('Expected an open stream');
    return { response, stream, res };
  }

  it('flushes SSE headers before sending any frames and defaults to 15-second heartbeats', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { response, stream, res } = await connect();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(res.headersSent).toBe(true);
    expect(stream.closed).toBe(false);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 15000);

    stream.close();
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0]?.value);
    expect(await response.text()).toBe('');
  });

  it('writes exact frames for every event type, keeping newlines and quotes on one data line', async () => {
    const events: ChatStreamEvent[] = [
      {
        type: 'message.started',
        conversationId: '0b7c6d5e-1f2a-4b3c-9d4e-5f6a7b8c9d0e',
        userMessageId: '3c2b1a09-8f7e-4d6c-a5b4-c3d2e1f0a9b8',
        messageId,
        model: 'fake',
        createdAt: '2026-11-24T09:00:00.000Z',
      },
      delta,
      {
        type: 'message.completed',
        messageId,
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, thoughtTokens: 0, cachedTokens: 0, totalTokens: 3 },
      },
      { type: 'error', code: 'internal', message: 'Internal error', retryable: false, requestId: 'req_1' },
    ];
    const sent: boolean[] = [];
    const { response } = await connect(undefined, (stream) => {
      for (const event of events) sent.push(stream.send(event));
      stream.close();
    });

    expect(sent).toEqual([true, true, true, true]);
    const text = await response.text();
    expect(text).toBe(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
    expect(text).toContain('data: {"type":"text.delta","messageId":"' + messageId + '","delta":"Hello\\n\\"world\\"\\r\\n"}\n\n');
    expect(text.split('\n').filter((line) => line.startsWith('data:'))).toHaveLength(4);
  });

  it.each([
    { type: 'unknown\ninjected' },
    { type: 'text.delta', messageId: 'not-a-uuid', delta: 'text' },
    { type: 'text.delta', messageId, delta: 42 },
  ])('throws on an invalid event without writing a frame: %j', async (invalid) => {
    const { response, stream, res } = await connect();
    const write = vi.spyOn(res, 'write');

    expect(() => Reflect.apply(stream.send.bind(stream), stream, [invalid])).toThrow(ZodError);
    expect(write).not.toHaveBeenCalled();
    expect(stream.closed).toBe(false);
    expect(stream.send(delta)).toBe(true);
    stream.close();
    expect(await response.text()).toBe(`event: text.delta\ndata: ${JSON.stringify(delta)}\n\n`);
  });

  it('closes idempotently and rejects further sends without validating or writing', async () => {
    const { response, stream, res } = await connect();
    const write = vi.spyOn(res, 'write');
    const end = vi.spyOn(res, 'end');

    stream.close();
    stream.close();
    expect(stream.closed).toBe(true);
    expect(stream.send(delta)).toBe(false);
    expect(Reflect.apply(stream.send.bind(stream), stream, [{ type: 'invalid' }])).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('');
  });

  it('writes repeating heartbeat comments and stops the timer on close', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { response, stream } = await connect({ heartbeatMs: 10 });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (text.length < ': ping\n\n'.length * 2) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      text += decoder.decode(value);
    }

    expect(text).toMatch(/^(?:: ping\n\n){2,}$/);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 10);
    stream.close();
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0]?.value);
    while (!(await reader.read()).done) { /* Drain frames buffered before close. */ }
    expect(stream.closed).toBe(true);
  });

  it('stops the timer and writes nothing after the client disconnects', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { response, stream, res } = await connect({ heartbeatMs: 10 });
    const write = vi.spyOn(res, 'write');
    const end = vi.spyOn(res, 'end');
    const disconnected = once(res, 'close');
    await response.body!.cancel();
    await disconnected;
    write.mockClear();

    expect(stream.closed).toBe(true);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0]?.value);
    expect(stream.send(delta)).toBe(false);
    expect(Reflect.apply(stream.send.bind(stream), stream, [{ type: 'invalid' }])).toBe(false);
    stream.close();
    expect(write).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
