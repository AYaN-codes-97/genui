import type { LlmEvent, LlmProvider, LlmTurn } from './provider.ts';

type ScriptedEvent = LlmEvent & { readonly delayMs?: number };

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

async function* playScript(script: readonly ScriptedEvent[], signal: AbortSignal): AsyncIterable<LlmEvent> {
  for (const { delayMs, ...event } of script) {
    if (signal.aborted) return;
    if (delayMs !== undefined && delayMs > 0) await waitForDelay(delayMs, signal);
    if (signal.aborted) return;
    yield event;
  }
}

export function createFakeProvider(
  script: readonly ScriptedEvent[],
  options?: { readonly model?: string },
): LlmProvider & { readonly histories: readonly (readonly LlmTurn[])[] } {
  const histories: LlmTurn[][] = [];
  return {
    model: options?.model ?? 'fake',
    histories,
    streamReply({ history, signal }) {
      histories.push(history.map((turn) => ({ ...turn })));
      return playScript(script, signal);
    },
  };
}

export function createEchoProvider(): LlmProvider {
  return {
    model: 'fake',
    streamReply({ history, signal }) {
      const lastUser = history.findLast((turn) => turn.role === 'user');
      return playScript([
        { type: 'text', delta: `echo: ${lastUser?.text ?? ''}` },
        { type: 'completed', finishReason: 'stop' },
      ], signal);
    },
  };
}
