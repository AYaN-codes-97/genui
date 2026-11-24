import type { FinishReason, TokenUsage } from '@genui/shared';

export type LlmTurn = {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly providerSteps?: unknown;
};

export type LlmFailureCode = 'provider_rate_limited' | 'provider_unavailable' | 'content_blocked' | 'internal';

export type LlmEvent =
  | { readonly type: 'text'; readonly delta: string }
  | {
      readonly type: 'completed';
      readonly finishReason: FinishReason;
      readonly usage?: TokenUsage;
      readonly providerSteps?: unknown;
    }
  | { readonly type: 'failed'; readonly code: LlmFailureCode; readonly message: string };

export interface LlmProvider {
  readonly model: string;
  streamReply(input: { readonly history: readonly LlmTurn[]; readonly signal: AbortSignal }): AsyncIterable<LlmEvent>;
}
