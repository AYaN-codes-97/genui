import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function readEnv(env: NodeJS.ProcessEnv = process.env): z.infer<typeof EnvSchema> {
  return EnvSchema.parse(env);
}
