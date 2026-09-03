import { z } from 'zod';

const configurationSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  APP_INVITE_SECRET: z.string().min(8),
  LIVEKIT_URL: z.string().url().refine((value) => value.startsWith('wss://'), 'LIVEKIT_URL must use wss://'),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
});

export type ServerConfiguration = z.infer<typeof configurationSchema>;

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): ServerConfiguration {
  return configurationSchema.parse(environment);
}
