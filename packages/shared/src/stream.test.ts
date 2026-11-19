import { describe, expect, it } from 'vitest';
import { ChatStreamEventSchema, type ChatStreamEvent } from './stream.ts';

const conversationId = '0b7c6d5e-1f2a-4b3c-9d4e-5f6a7b8c9d0e';
const userMessageId = '3c2b1a09-8f7e-4d6c-a5b4-c3d2e1f0a9b8';
const messageId = '7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

const validEvents: ChatStreamEvent[] = [
  {
    type: 'message.started',
    conversationId,
    userMessageId,
    messageId,
    model: 'gemini-4-hydrogen',
    createdAt: '2026-11-16T10:00:00.000Z',
  },
  { type: 'text.delta', messageId, delta: 'Hel' },
  { type: 'message.completed', messageId, finishReason: 'stop' },
  { type: 'error', code: 'provider_unavailable', message: 'Upstream down', retryable: true, requestId: 'req_1' },
];

describe('ChatStreamEventSchema', () => {
  it.each(validEvents)('round-trips a $type event through JSON', (event) => {
    expect(ChatStreamEventSchema.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });

  it('rejects event types outside the contract', () => {
    expect(ChatStreamEventSchema.safeParse({ type: 'tool.call', messageId }).success).toBe(false);
  });

  it('requires error events to say whether they are retryable', () => {
    const event = { type: 'error', code: 'internal', message: 'boom', requestId: 'req_1' };
    expect(ChatStreamEventSchema.safeParse(event).success).toBe(false);
  });
});
