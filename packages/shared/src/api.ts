import { z } from 'zod';
import { ConversationSchema, IdSchema } from './chat.ts';
import { ErrorCodeSchema } from './errors.ts';

export const MAX_MESSAGE_CHARS = 8_000;

export const SendMessageRequestSchema = z.object({
  clientMessageId: IdSchema,
  text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

// Responses are wrapped in an envelope so fields can be added without breaking clients.
export const ConversationResponseSchema = z.object({
  conversation: ConversationSchema,
});
export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
