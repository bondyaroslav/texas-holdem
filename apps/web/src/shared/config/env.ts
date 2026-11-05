import { z } from 'zod';

const envSchema = z.object({
  MODE: z.enum(['development', 'production', 'test']),
  DEV: z.boolean(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  MODE: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
});
