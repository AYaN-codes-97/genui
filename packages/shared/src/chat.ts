import { z } from 'zod';
import { ErrorCodeSchema } from './errors.ts';

export const IdSchema = z.uuid();
export const TimestampSchema = z.iso.datetime();

export const RoleSchema = z.enum(['user', 'assistant']);
export type Role = z.infer<typeof RoleSchema>;

export const MessageStatusSchema = z.enum(['pending', 'streaming', 'complete', 'error', 'aborted']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextPart = z.infer<typeof TextPartSchema>;

// Future part kinds (tool calls, UI components, citations) become new members of this union.
export const MessagePartSchema = z.discriminatedUnion('type', [TextPartSchema]);
export type MessagePart = z.infer<typeof MessagePartSchema>;

const TokenCount = z.int().nonnegative();

export const TokenUsageSchema = z.object({
  inputTokens: TokenCount,
  outputTokens: TokenCount,
  thoughtTokens: TokenCount,
  cachedTokens: TokenCount,
  totalTokens: TokenCount,
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const FinishReasonSchema = z.enum(['stop', 'max_tokens', 'content_filter', 'other']);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const MessageMetadataSchema = z.object({
  model: z.string(),
  finishReason: FinishReasonSchema.optional(),
  usage: TokenUsageSchema.optional(),
  ttftMs: z.number().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
});
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

export const MessageErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
});
export type MessageError = z.infer<typeof MessageErrorSchema>;

export const MessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  role: RoleSchema,
  parts: z.array(MessagePartSchema),
  status: MessageStatusSchema,
  createdAt: TimestampSchema,
  metadata: MessageMetadataSchema.optional(),
  error: MessageErrorSchema.optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  messages: z.array(MessageSchema),
});
export type Conversation = z.infer<typeof ConversationSchema>;
