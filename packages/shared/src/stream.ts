import { z } from 'zod';
import { FinishReasonSchema, IdSchema, TimestampSchema, TokenUsageSchema } from './chat.ts';
import { ErrorCodeSchema } from './errors.ts';

export const MessageStartedEventSchema = z.object({
  type: z.literal('message.started'),
  conversationId: IdSchema,
  userMessageId: IdSchema,
  messageId: IdSchema,
  model: z.string(),
  createdAt: TimestampSchema,
});

export const TextDeltaEventSchema = z.object({
  type: z.literal('text.delta'),
  messageId: IdSchema,
  delta: z.string(),
});

export const MessageCompletedEventSchema = z.object({
  type: z.literal('message.completed'),
  messageId: IdSchema,
  finishReason: FinishReasonSchema,
  usage: TokenUsageSchema.optional(),
});

export const StreamErrorEventSchema = z.object({
  type: z.literal('error'),
  messageId: IdSchema.optional(),
  code: ErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  requestId: z.string(),
});

// Wire format: one SSE frame per event, `event: <type>` and `data: <JSON of the whole event>`.
export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  MessageStartedEventSchema,
  TextDeltaEventSchema,
  MessageCompletedEventSchema,
  StreamErrorEventSchema,
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
export type ChatStreamEventType = ChatStreamEvent['type'];
export type ChatStreamEventOf<T extends ChatStreamEventType> = Extract<ChatStreamEvent, { type: T }>;
