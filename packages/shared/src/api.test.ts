import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS, SendMessageRequestSchema } from './api.ts';

const clientMessageId = '7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

describe('SendMessageRequestSchema', () => {
  it('trims surrounding whitespace from text', () => {
    const parsed = SendMessageRequestSchema.parse({ clientMessageId, text: '  hello  ' });
    expect(parsed.text).toBe('hello');
  });

  it.each(['', '   ', '\n\t'])('rejects blank text %j', (text) => {
    expect(SendMessageRequestSchema.safeParse({ clientMessageId, text }).success).toBe(false);
  });

  it('accepts text at the length limit and rejects one character over', () => {
    const atLimit = 'a'.repeat(MAX_MESSAGE_CHARS);
    expect(SendMessageRequestSchema.safeParse({ clientMessageId, text: atLimit }).success).toBe(true);
    expect(SendMessageRequestSchema.safeParse({ clientMessageId, text: `${atLimit}a` }).success).toBe(false);
  });

  it('requires clientMessageId to be a UUID', () => {
    expect(SendMessageRequestSchema.safeParse({ clientMessageId: 'msg-1', text: 'hi' }).success).toBe(false);
  });
});
