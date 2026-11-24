import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEchoProvider, createFakeProvider } from './fake-provider.ts';
import type { LlmEvent, LlmTurn } from './provider.ts';

afterEach(() => {
  vi.useRealTimers();
});

async function collect(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const result: LlmEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe('createFakeProvider', () => {
  it('yields the script in order and records each history', async () => {
    const script = [
      { type: 'text', delta: 'one' },
      { type: 'text', delta: 'two' },
      { type: 'completed', finishReason: 'stop', providerSteps: { opaque: true } },
    ] as const;
    const provider = createFakeProvider(script, { model: 'test-model' });
    const first: LlmTurn[] = [{ role: 'user', text: 'first' }];
    const second: LlmTurn[] = [{ role: 'assistant', text: 'second', providerSteps: ['step'] }];
    const signal = new AbortController().signal;

    expect(provider.model).toBe('test-model');
    expect(await collect(provider.streamReply({ history: first, signal }))).toEqual(script);
    first.push({ role: 'user', text: 'later mutation' });
    expect(await collect(provider.streamReply({ history: second, signal }))).toEqual(script);
    expect(provider.histories).toEqual([[{ role: 'user', text: 'first' }], second]);
  });

  it('waits for each delay without exposing delayMs in events', async () => {
    vi.useFakeTimers();
    const provider = createFakeProvider([
      { type: 'text', delta: 'first', delayMs: 100 },
      { type: 'completed', finishReason: 'stop', delayMs: 200 },
    ]);
    const iterator = provider.streamReply({ history: [], signal: new AbortController().signal })[Symbol.asyncIterator]();

    expect(provider.model).toBe('fake');
    const first = iterator.next();
    await vi.advanceTimersByTimeAsync(99);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toEqual({ value: { type: 'text', delta: 'first' }, done: false });
    const second = iterator.next();
    await vi.advanceTimersByTimeAsync(199);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toEqual({ value: { type: 'completed', finishReason: 'stop' }, done: false });
    expect((await iterator.next()).done).toBe(true);
  });

  it('stops promptly when aborted during a delay', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const provider = createFakeProvider([
      { type: 'text', delta: 'first' },
      { type: 'text', delta: 'never', delayMs: 1000 },
      { type: 'completed', finishReason: 'stop' },
    ]);
    const iterator = provider.streamReply({ history: [], signal: controller.signal })[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: { type: 'text', delta: 'first' }, done: false });
    const pending = iterator.next();
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    expect((await pending).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect((await iterator.next()).done).toBe(true);
  });

  it('does not yield when already aborted or aborted between events', async () => {
    const controller = new AbortController();
    const provider = createFakeProvider([
      { type: 'text', delta: 'first' },
      { type: 'failed', code: 'internal', message: 'failure' },
    ]);
    const iterator = provider.streamReply({ history: [], signal: controller.signal })[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: 'text', delta: 'first' });
    controller.abort();
    expect((await iterator.next()).done).toBe(true);
    expect(await collect(provider.streamReply({ history: [], signal: controller.signal }))).toEqual([]);
  });

  it('records calls before iteration and yields scripted failures', async () => {
    const provider = createFakeProvider([{ type: 'failed', code: 'provider_unavailable', message: 'unavailable' }]);
    const history: LlmTurn[] = [{ role: 'user', text: 'hello' }];
    const events = provider.streamReply({ history, signal: new AbortController().signal });
    expect(provider.histories).toEqual([history]);
    expect(await collect(events)).toEqual([{ type: 'failed', code: 'provider_unavailable', message: 'unavailable' }]);
  });
});

describe('createEchoProvider', () => {
  it('echoes the last user turn followed by completion', async () => {
    const provider = createEchoProvider();
    const history: LlmTurn[] = [
      { role: 'user', text: 'old' },
      { role: 'user', text: 'latest' },
      { role: 'assistant', text: 'not the user' },
    ];
    expect(await collect(provider.streamReply({ history, signal: new AbortController().signal }))).toEqual([
      { type: 'text', delta: 'echo: latest' },
      { type: 'completed', finishReason: 'stop' },
    ]);
  });

  it('stops between echo events when aborted', async () => {
    const controller = new AbortController();
    const iterator = createEchoProvider().streamReply({
      history: [{ role: 'user', text: 'hello' }],
      signal: controller.signal,
    })[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: 'text', delta: 'echo: hello' });
    controller.abort();
    expect((await iterator.next()).done).toBe(true);
  });
});
