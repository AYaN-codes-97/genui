import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'validation_failed',
  'not_found',
  'conflict',
  'rate_limited',
  'provider_rate_limited',
  'provider_unavailable',
  'content_blocked',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
