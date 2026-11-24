import { ChatStreamEventSchema, type ChatStreamEvent } from '@genui/shared';
import type { Response } from 'express';

export interface EventStream {
  send(event: ChatStreamEvent): boolean;
  close(): void;
  readonly closed: boolean;
}

export function openEventStream(
  res: Response,
  options?: { heartbeatMs?: number },
): EventStream {
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('x-accel-buffering', 'no');
  res.flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, options?.heartbeatMs ?? 15000);

  function stop() {
    closed = true;
    clearInterval(heartbeat);
    res.off('close', stop);
  }

  res.once('close', stop);

  return {
    send(event) {
      if (closed) return false;
      const parsed = ChatStreamEventSchema.parse(event);
      res.write(`event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`);
      return true;
    },
    close() {
      if (closed) return;
      stop();
      res.end();
    },
    get closed() {
      return closed;
    },
  };
}
